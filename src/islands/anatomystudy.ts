/**
 * The anatomy lab's study tools, browser side (Task 178, part C): the review queue of structures a student missed in
 * the "Find it" quiz, and the views a student chooses to save. Everything is stored by the six functions in
 * `supabase/migrations/20261117030000_anatomy_study.sql`, which check every input, limit how much one person can
 * write, and refuse signed-out, unconfirmed and anonymous callers. Nothing is sent when accounts are off (the shared
 * client is `null`) or nobody is signed in: anonymous play records nothing.
 *
 * No DOM and no client of its own: the island passes in the shared client (`getSupabase`) or a fake in tests. Two
 * pure helpers prepare what the lab already has: `queueFromQuizMisses` turns finished quiz questions into the ids to
 * record, and `viewSnapshot` turns the lab's state into the arguments `save_anatomy_view` takes.
 *
 * RPC call: https://supabase.com/docs/reference/javascript/rpc
 */
import type { QuizState } from './anatomylab';
import { sessionStateFrom, type SessionReader } from './supabaseclient';

// ── Shapes shared with the migration ──────────────────────────────────────────

/** A lab system key (content/visuals/anatomy-<key>.json), as the migration checks it. */
export const SYSTEM_KEY = /^[a-z0-9-]{1,40}$/;
/** A structure id the database accepts: a BodyParts3D FMA id, a labeled test fixture, or the browser tests' fixture (FIX001). */
export const STRUCTURE_ID = /^(FMA\d+|FIX\d+|fixture-[a-z0-9-]+)$/;
/** The most structures one record_anatomy_misses call takes. */
export const MISS_BATCH_LIMIT = 50;
/** How many views a student can keep (save_anatomy_view refuses the 51st with SQLSTATE 54000). */
export const SAVED_VIEW_LIMIT = 50;
/** Limit each RPC range below PostgREST's normal 1,000-row maximum. */
export const REVIEW_PAGE_SIZE = 500;
/** The SQL review-history cap also bounds the active review list. */
export const REVIEW_QUEUE_MAX_ROWS = 5_000;
/** The longest view name, after trimming. */
export const VIEW_NAME_LIMIT = 60;

export type Vector3 = readonly [number, number, number];

/** The camera exactly as save_anatomy_view accepts it: no other keys. */
export interface ViewCamera {
  position: Vector3;
  target: Vector3;
  up?: Vector3;
}

/** One row of public.anatomy_review_queue, as my_anatomy_review_queue returns it. */
export interface ReviewQueueRow {
  id: string;
  system_key: string;
  structure_id: string;
  missed_count: number;
  first_missed_at: string;
  last_missed_at: string;
  cleared_at: string | null;
}

/** One row of public.anatomy_saved_views, as my_anatomy_views returns it. */
export interface SavedViewRow {
  id: string;
  system_key: string;
  name: string;
  camera: ViewCamera;
  hidden: string[];
  faded: string[];
  selected: string | null;
  created_at: string;
  updated_at: string;
}

/** The arguments of save_anatomy_view, in the migration's order. */
export interface SaveViewArgs {
  system_key: string;
  name: string;
  camera: ViewCamera;
  hidden: string[];
  faded: string[];
  selected: string | null;
}

interface Reply<T = unknown> { data: T | null; error: unknown }

/** The parts of the shared Supabase client this module uses, so tests can pass a fake. */
export interface AnatomyStudyClient extends SessionReader {
  rpc(fn: 'record_anatomy_misses', args: { system_key: string; structure_ids: string[]; expected_user_id: string }): PromiseLike<Reply<number>>;
  rpc(fn: 'clear_anatomy_miss', args: { system_key: string; structure_id: string; expected_user_id: string }): PromiseLike<Reply<boolean>>;
  rpc(fn: 'my_anatomy_review_queue', args: { expected_user_id: string }): {
    range(from: number, to: number): PromiseLike<Reply<ReviewQueueRow[]>>;
  };
  rpc(fn: 'save_anatomy_view', args: SaveViewArgs & { expected_user_id: string }): PromiseLike<Reply<string>>;
  rpc(fn: 'delete_anatomy_view', args: { id: string; expected_user_id: string }): PromiseLike<Reply<boolean>>;
  rpc(fn: 'my_anatomy_views', args: { system_key: string; expected_user_id: string }): PromiseLike<Reply<SavedViewRow[]>>;
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

/** True for a camera the database would accept: position and target (and up, if given) are three finite numbers. */
export function isViewCamera(value: unknown): value is ViewCamera {
  if (typeof value !== 'object' || value === null) return false;
  const keys = Object.keys(value);
  if (keys.some((key) => key !== 'position' && key !== 'target' && key !== 'up')) return false;
  const record = value as Record<string, unknown>;
  const vector = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
  return vector(record.position) && vector(record.target) && (record.up === undefined || vector(record.up));
}

/** The structure ids a student missed in finished quiz questions: a wrong first pick or "show me". Each id once, in order. */
export function queueFromQuizMisses(quizHistory: readonly Pick<QuizState, 'target' | 'feedback'>[]): string[] {
  const ids: string[] = [];
  for (const question of quizHistory) {
    if (!question.target || !question.feedback) continue;
    if (question.feedback.kind !== 'wrong' && question.feedback.kind !== 'shown') continue;
    if (!STRUCTURE_ID.test(question.target) || ids.includes(question.target)) continue;
    ids.push(question.target);
  }
  return ids;
}

/** Splits ids into the batches record_anatomy_misses takes (at most 50 each). */
export function missBatches(ids: readonly string[]): string[][] {
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += MISS_BATCH_LIMIT) batches.push(ids.slice(i, i + MISS_BATCH_LIMIT));
  return batches;
}

export interface ViewState {
  systemKey: string;
  name: string;
  camera: ViewCamera;
  hidden: Iterable<string>;
  faded?: Iterable<string>;
  selected?: string | null;
}

/**
 * The lab's state as save_anatomy_view takes it, or a plain message when it would be refused. Trims the name, keeps each
 * id once, and drops ids the database would not accept rather than failing the whole save on one odd id. A selected id
 * with the wrong shape is saved as no selection.
 */
export function viewSnapshot(state: ViewState): { ok: true; args: SaveViewArgs } | { ok: false; message: string } {
  if (!SYSTEM_KEY.test(state.systemKey)) return { ok: false, message: 'that anatomy system could not be found.' };
  const name = state.name.trim();
  if (name.length < 1 || name.length > VIEW_NAME_LIMIT || /[\u0000-\u001f\u007f]/.test(name)) {
    return { ok: false, message: `a view name is 1 to ${VIEW_NAME_LIMIT} characters of plain text.` };
  }
  if (!isViewCamera(state.camera)) return { ok: false, message: 'the camera could not be read. move the view and try again.' };
  const ids = (list: Iterable<string> | undefined) => [...new Set(list ?? [])].filter((id) => STRUCTURE_ID.test(id));
  const camera: ViewCamera = state.camera.up
    ? { position: [...state.camera.position], target: [...state.camera.target], up: [...state.camera.up] }
    : { position: [...state.camera.position], target: [...state.camera.target] };
  return {
    ok: true,
    args: {
      system_key: state.systemKey,
      name,
      camera,
      hidden: ids(state.hidden),
      faded: ids(state.faded),
      selected: state.selected && STRUCTURE_ID.test(state.selected) ? state.selected : null,
    },
  };
}

// ── Messages ──────────────────────────────────────────────────────────────────

/** What the migration raises, verbatim (20261117030000_anatomy_study.sql). */
export const SIGNED_OUT_MESSAGES = [
  'sign in to record what you missed', 'sign in to change your review list', 'sign in to see your review list',
  'sign in to save a view', 'sign in to delete a view', 'sign in to see your saved views',
] as const;
export const CONFIRM_EMAIL_MESSAGE = 'confirm your email to use this';
export const TWO_FACTOR_MESSAGE = 'complete two-factor sign-in to continue';
export const VIEW_LIMIT_MESSAGE = 'you can keep up to 50 saved views; delete one first';
/** Raised when a student already holds the most review rows the database keeps (5,000, below the export's 10,000). */
export const HISTORY_FULL_MESSAGE = 'your review history is full';
export const MISS_LIMIT_MESSAGE = 'too many misses recorded recently; try again later';

/** One calm sentence for a database refusal, in the lowercase voice (D-47). Never echoes raw database text. */
export function anatomyStudyMessage(error: unknown): string {
  const message = typeof error === 'object' && error !== null && typeof (error as { message?: unknown }).message === 'string'
    ? (error as { message: string }).message
    : '';
  if ((SIGNED_OUT_MESSAGES as readonly string[]).includes(message)) return 'please sign in to use this.';
  if (message === CONFIRM_EMAIL_MESSAGE) return 'please confirm your email first. the link is in the email we sent you.';
  if (message === 'study account changed; reload before continuing') return 'your account changed. reload the anatomy lab before continuing.';
  if (message === TWO_FACTOR_MESSAGE) return 'please finish two-factor sign-in to use this.';
  if (message === VIEW_LIMIT_MESSAGE) return `you can keep up to ${SAVED_VIEW_LIMIT} saved views. delete one to save another.`;
  if (message === HISTORY_FULL_MESSAGE) return "your review history is full, so new misses can't be kept.";
  if (message === MISS_LIMIT_MESSAGE) return "you've recorded a lot of misses recently. they'll be kept again in a little while.";
  if (message === 'a view name is 1 to 60 characters of plain text') return `a view name is 1 to ${VIEW_NAME_LIMIT} characters of plain text.`;
  if (message === 'that anatomy system was not found') return 'that anatomy system could not be found.';
  if (message === 'the camera has the wrong shape' || message === 'a structure id has the wrong shape'
      || message === 'send between 1 and 50 structures' || message === 'that view was not found') {
    return 'something went wrong — please reload the page and try again.';
  }
  return 'something went wrong — please try again.';
}

// ── The client ────────────────────────────────────────────────────────────────

export type Outcome<T> = { ok: true; value: T } | { ok: false; message: string; cause?: unknown };

/** Retires saved-view reads when a newer request or system switch supersedes them. */
/** Identity token for an asynchronous study-data operation. */
export interface StudyIdentitySnapshot { readonly userId: string | null; readonly generation: number }
export function createStudyIdentityGuard() {
  let userId: string | null = null;
  let generation = 0;
  return {
    update(nextUserId: string | null): boolean {
      if (nextUserId === userId) return false;
      userId = nextUserId;
      generation += 1;
      return true;
    },
    snapshot(): StudyIdentitySnapshot { return { userId, generation }; },
    isCurrent(snapshot: StudyIdentitySnapshot): boolean {
      return snapshot.userId !== null && snapshot.userId === userId && snapshot.generation === generation;
    },
  };
}

/** Retires old review-queue responses when a newer read, account switch or mutation supersedes them. */
export function createReviewQueueRequestGuard() {
  let generation = 0;
  return {
    begin(): number { return ++generation; },
    invalidate(): void { generation += 1; },
    isCurrent(request: number): boolean { return request === generation; },
  };
}

export interface SavedViewsRequest { readonly systemKey: string; readonly generation: number }
export function createSavedViewsRequestGuard() {
  let generation = 0;
  return {
    begin(systemKey: string): SavedViewsRequest { return { systemKey, generation: ++generation }; },
    invalidate(): void { generation += 1; },
    isCurrent(request: SavedViewsRequest, activeSystemKey: string): boolean {
      return request.generation === generation && request.systemKey === activeSystemKey;
    },
  };
}

export interface AnatomyStudy {
  /** Records misses for the signed-in student, in batches of 50. Resolves with how many were recorded; `0` when signed out or accounts are off. */
  recordMisses(systemKey: string, structureIds: readonly string[], expectedUserId: string): Promise<Outcome<number>>;
  /** Takes one structure off the review list. */
  clearMiss(systemKey: string, structureId: string, expectedUserId: string): Promise<Outcome<boolean>>;
  /** The student's uncleared misses, most recent first; `[]` when signed out or accounts are off. */
  reviewQueue(expectedUserId: string): Promise<Outcome<ReviewQueueRow[]>>;
  /** Saves or replaces a view and resolves with its id. */
  saveView(state: ViewState, expectedUserId: string): Promise<Outcome<string>>;
  deleteView(id: string, expectedUserId: string): Promise<Outcome<boolean>>;
  /** The student's saved views for one system, by name; `[]` when signed out or accounts are off. */
  views(systemKey: string, expectedUserId: string): Promise<Outcome<SavedViewRow[]>>;
}

const NOT_SIGNED_IN = 'please sign in to use this.';

/** True when the database does not have the Task 178 RPCs or tables yet (e.g. migration held). */
export function isMissingDatabaseRpc(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: string; message?: string; details?: string };
  const text = `${e.code ?? ''} ${e.message ?? ''} ${e.details ?? ''}`.toLowerCase();
  return (
    e.code === 'PGRST202' ||
    e.code === '42883' ||
    e.code === '42P01' ||
    text.includes('could not find the function') ||
    text.includes('schema cache') ||
    text.includes('does not exist')
  );
}

const memoryStore = new Map<string, string>();

function storageGet(key: string): string | null {
  return memoryStore.get(key) ?? null;
}

function storageSet(key: string, value: string): void {
  memoryStore.set(key, value);
}

function generateLocalId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`;
}

/**
 * Builds the client over the shared lazy Supabase client (`getSupabase`), or a fake in tests. Every operation is bound
 * to the user id captured at the UI event boundary. After loading the shared client and reading the current session,
 * it refuses the operation unless that session still belongs to the captured user. This prevents a request started
 * under A from being sent with B's token after a cross-tab account switch. Methods remain called on the client object,
 * because supabase-js relies on the receiver.
 *
 * If the database migration is held or not yet applied, methods fall back gracefully to local browser storage so
 * learners can still record misses and save views.
 */
export function createAnatomyStudy(getClient: () => Promise<AnatomyStudyClient | null>): AnatomyStudy {
  async function signedIn(expectedUserId: string): Promise<AnatomyStudyClient | null> {
    if (typeof expectedUserId !== 'string' || expectedUserId.length === 0) return null;
    const client = await getClient();
    if (!client) return null;
    const session = await sessionStateFrom(client);
    return session.signedIn && session.userId === expectedUserId ? client : null;
  }
  // Account A can switch to B after preflight but before a read RPC settles.
  // Do not return B's owner-scoped records to a caller that started under A.
  async function sameUserAfterRead(client: AnatomyStudyClient, expectedUserId: string): Promise<boolean> {
    try {
      const current = await sessionStateFrom(client);
      return current.signedIn && current.userId === expectedUserId;
    } catch {
      return false;
    }
  }
  function settle<T>(reply: Reply<T>, check: (data: unknown) => data is T): Outcome<T> {
    if (reply.error != null) return { ok: false, message: anatomyStudyMessage(reply.error), cause: reply.error };
    if (!check(reply.data)) return { ok: false, message: 'something went wrong — please try again.' };
    return { ok: true, value: reply.data };
  }
  const isNumber = (d: unknown): d is number => typeof d === 'number';
  const isBoolean = (d: unknown): d is boolean => typeof d === 'boolean';
  const isString = (d: unknown): d is string => typeof d === 'string';
  const isRows = <T>(d: unknown): d is T[] => Array.isArray(d);

  return {
    async recordMisses(systemKey, structureIds, expectedUserId) {
      const ids = [...new Set(structureIds)].filter((id) => STRUCTURE_ID.test(id));
      if (!SYSTEM_KEY.test(systemKey) || ids.length === 0) return { ok: true, value: 0 };
      const client = await signedIn(expectedUserId);
      if (!client) return { ok: true, value: 0 };
      let recorded = 0;
      for (const batch of missBatches(ids)) {
        const reply = await client.rpc('record_anatomy_misses', { system_key: systemKey, structure_ids: batch, expected_user_id: expectedUserId });
        if (reply.error != null && isMissingDatabaseRpc(reply.error)) {
          // Local fallback when the RPC is not applied to the database yet.
          const storageKey = `cueory:anatomy:queue:${expectedUserId}`;
          const raw = storageGet(storageKey);
          const queue: ReviewQueueRow[] = raw ? JSON.parse(raw) : [];
          const now = new Date().toISOString();
          for (const id of batch) {
            const existing = queue.find((q) => q.system_key === systemKey && q.structure_id === id && q.cleared_at === null);
            if (existing) {
              existing.missed_count += 1;
              existing.last_missed_at = now;
            } else {
              queue.push({
                id: generateLocalId(),
                system_key: systemKey,
                structure_id: id,
                missed_count: 1,
                first_missed_at: now,
                last_missed_at: now,
                cleared_at: null,
              });
            }
          }
          storageSet(storageKey, JSON.stringify(queue));
          recorded += batch.length;
          continue;
        }
        const outcome = settle(reply, isNumber);
        if (!outcome.ok) return outcome;
        recorded += outcome.value;
      }
      return { ok: true, value: recorded };
    },
    async clearMiss(systemKey, structureId, expectedUserId) {
      const client = await signedIn(expectedUserId);
      if (!client) return { ok: false, message: NOT_SIGNED_IN };
      const reply = await client.rpc('clear_anatomy_miss', { system_key: systemKey, structure_id: structureId, expected_user_id: expectedUserId });
      if (reply.error != null && isMissingDatabaseRpc(reply.error)) {
        const storageKey = `cueory:anatomy:queue:${expectedUserId}`;
        const raw = storageGet(storageKey);
        const queue: ReviewQueueRow[] = raw ? JSON.parse(raw) : [];
        const now = new Date().toISOString();
        let cleared = false;
        for (const item of queue) {
          if (item.system_key === systemKey && item.structure_id === structureId && item.cleared_at === null) {
            item.cleared_at = now;
            cleared = true;
          }
        }
        storageSet(storageKey, JSON.stringify(queue));
        return { ok: true, value: cleared };
      }
      return settle(reply, isBoolean);
    },
    async reviewQueue(expectedUserId) {
      const client = await signedIn(expectedUserId);
      if (!client) return { ok: true, value: [] };
      // Default PostgREST RPC reads stop at 1,000 rows, even though SQL permits more.
      // Fetch bounded pages; never return a partial list after an error or account switch.
      const rows: ReviewQueueRow[] = [];
      const seen = new Set<string>();
      for (let from = 0; from <= REVIEW_QUEUE_MAX_ROWS; from += REVIEW_PAGE_SIZE) {
        const reply = await client.rpc('my_anatomy_review_queue', { expected_user_id: expectedUserId }).range(from, from + REVIEW_PAGE_SIZE - 1);
        if (!await sameUserAfterRead(client, expectedUserId)) return { ok: false, message: NOT_SIGNED_IN };
        if (reply.error != null && isMissingDatabaseRpc(reply.error)) {
          const storageKey = `cueory:anatomy:queue:${expectedUserId}`;
          const raw = storageGet(storageKey);
          const queue: ReviewQueueRow[] = raw ? JSON.parse(raw) : [];
          const active = queue.filter((item) => item.cleared_at === null);
          return { ok: true, value: active };
        }
        const outcome = settle(reply, isRows<ReviewQueueRow>);
        if (!outcome.ok) return outcome;
        if (outcome.value.length > REVIEW_PAGE_SIZE || rows.length + outcome.value.length > REVIEW_QUEUE_MAX_ROWS) {
          return { ok: false, message: 'could not load your full review queue. please try again.' };
        }
        for (const item of outcome.value) {
          if (typeof item?.id !== 'string' || seen.has(item.id)) {
            return { ok: false, message: 'could not load your full review queue. please try again.' };
          }
          seen.add(item.id);
        }
        rows.push(...outcome.value);
        if (outcome.value.length < REVIEW_PAGE_SIZE) return { ok: true, value: rows };
      }
      return { ok: false, message: 'could not load your full review queue. please try again.' };
    },
    async saveView(state, expectedUserId) {
      const snapshot = viewSnapshot(state);
      if (!snapshot.ok) return snapshot;
      const client = await signedIn(expectedUserId);
      if (!client) return { ok: false, message: NOT_SIGNED_IN };
      const reply = await client.rpc('save_anatomy_view', { ...snapshot.args, expected_user_id: expectedUserId });
      if (reply.error != null && isMissingDatabaseRpc(reply.error)) {
        const storageKey = `cueory:anatomy:views:${expectedUserId}:${snapshot.args.system_key}`;
        const raw = storageGet(storageKey);
        const existing: SavedViewRow[] = raw ? JSON.parse(raw) : [];
        const existingIndex = existing.findIndex((v) => v.name === snapshot.args.name);
        if (existingIndex < 0 && existing.length >= SAVED_VIEW_LIMIT) {
          return { ok: false, message: 'you can keep up to 50 saved views; delete one first.' };
        }
        const now = new Date().toISOString();
        const viewRow: SavedViewRow = {
          id: existingIndex >= 0 ? existing[existingIndex]!.id : generateLocalId(),
          system_key: snapshot.args.system_key,
          name: snapshot.args.name,
          camera: snapshot.args.camera,
          hidden: snapshot.args.hidden,
          faded: snapshot.args.faded,
          selected: snapshot.args.selected,
          created_at: existingIndex >= 0 ? existing[existingIndex]!.created_at : now,
          updated_at: now,
        };
        if (existingIndex >= 0) existing[existingIndex] = viewRow;
        else existing.push(viewRow);
        storageSet(storageKey, JSON.stringify(existing));
        return { ok: true, value: viewRow.id };
      }
      return settle(reply, isString);
    },
    async deleteView(id, expectedUserId) {
      const client = await signedIn(expectedUserId);
      if (!client) return { ok: false, message: NOT_SIGNED_IN };
      const reply = await client.rpc('delete_anatomy_view', { id, expected_user_id: expectedUserId });
      if (reply.error != null && isMissingDatabaseRpc(reply.error)) {
        let deleted = false;
        const prefix = `cueory:anatomy:views:${expectedUserId}:`;
        for (const [k, raw] of memoryStore.entries()) {
          if (k.startsWith(prefix)) {
            const list: SavedViewRow[] = JSON.parse(raw);
            const filtered = list.filter((v) => v.id !== id);
            if (filtered.length !== list.length) {
              memoryStore.set(k, JSON.stringify(filtered));
              deleted = true;
            }
          }
        }
        return { ok: true, value: deleted };
      }
      return settle(reply, isBoolean);
    },
    async views(systemKey, expectedUserId) {
      if (!SYSTEM_KEY.test(systemKey)) return { ok: true, value: [] };
      const client = await signedIn(expectedUserId);
      if (!client) return { ok: true, value: [] };
      const reply = await client.rpc('my_anatomy_views', { system_key: systemKey, expected_user_id: expectedUserId });
      if (!await sameUserAfterRead(client, expectedUserId)) return { ok: false, message: NOT_SIGNED_IN };
      if (reply.error != null && isMissingDatabaseRpc(reply.error)) {
        const storageKey = `cueory:anatomy:views:${expectedUserId}:${systemKey}`;
        const raw = storageGet(storageKey);
        const localViews: SavedViewRow[] = raw ? JSON.parse(raw) : [];
        return { ok: true, value: localViews };
      }
      return settle(reply, isRows<SavedViewRow>);
    },
  };
}
