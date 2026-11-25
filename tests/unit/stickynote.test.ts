import { describe, expect, it } from 'vitest';
import {
  MESSAGE_EVERY_MINUTES,
  LAST_WELCOME_STORAGE_KEY,
  PHOTO_COUNT,
  VISIT_STORAGE_KEY,
  closeBreakNote,
  decideNote,
  emptyVisit,
  nextGlove,
  nextPhoto,
  messageTimeDue,
  pageKindFor,
  startVisit,
  nextWelcome,
  readLastWelcome,
  readVisit,
  recordShown,
  writeLastWelcome,
  writeVisit,
  type Busy,
  type NoteInput,
} from '../../src/islands/stickynote';
import { remainingMs, startBreaks, tick, turnOn, type BreakState } from '../../src/islands/breaks';
import type { KeyValueStorage } from '../../src/scripts/storage';

const T0 = 1_000_000;
const MIN = 60_000;

const idle: Busy = {
  typing: false,
  dragging: false,
  midQuestion: false,
  menuOpen: false,
  previewOpen: false,
  accountMenuOpen: false,
};

/** A marketing page, 10 seconds in, nothing shown yet: a welcome note is due. */
const marketing = (overrides: Partial<NoteInput> = {}): NoteInput => ({
  visit: emptyVisit(),
  remembered: true,
  page: 'marketing',
  secondsOnScreen: 10,
  scrollFraction: 0,
  secondsIdle: 0,
  atStepEnd: false,
  busy: idle,
  timerOn: false,
  timerBreakDue: false,
  noteOnScreen: null,
  joinedLaunchList: false,
  hasAccount: false,
  lastWelcome: null,
  random: () => 0,
  now: T0,
  gloveCount: 0,
  ...overrides,
});

/** A study page, break timer on and saying a break is due, at a pause: a break note is due. */
const study = (overrides: Partial<NoteInput> = {}): NoteInput =>
  marketing({ page: 'study', secondsOnScreen: 1800, secondsIdle: 4, timerOn: true, timerBreakDue: true, ...overrides });

/** 200 gloves, a visit that started at T0, 30 minutes later, at a pause: a message glove is due. */
const message = (overrides: Partial<NoteInput> = {}): NoteInput =>
  marketing({
    page: 'other',
    visit: { ...emptyVisit(), startedAt: T0 },
    now: T0 + 30 * MIN,
    gloveCount: 200,
    secondsIdle: 4,
    secondsOnScreen: 5,
    ...overrides,
  });

class MemoryStorage implements KeyValueStorage {
  readonly items = new Map<string, string>();
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.items.set(key, value);
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
}

const blocked: KeyValueStorage = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};

describe('glove note: welcome notes on marketing pages', () => {
  it('appears after 8 seconds on screen', () => {
    expect(decideNote(marketing({ secondsOnScreen: 7.9 }))).toEqual({ show: false });
    expect(decideNote(marketing({ secondsOnScreen: 8 }))).toMatchObject({ show: true, kind: 'welcome' });
  });

  it('appears halfway down the page, but never in the first 5 seconds', () => {
    expect(decideNote(marketing({ secondsOnScreen: 4.9, scrollFraction: 0.9 }))).toEqual({ show: false });
    expect(decideNote(marketing({ secondsOnScreen: 5, scrollFraction: 0.5 }))).toMatchObject({ kind: 'welcome' });
    expect(decideNote(marketing({ secondsOnScreen: 6, scrollFraction: 0.49 }))).toEqual({ show: false });
  });

  it('appears at most once per visit', () => {
    const once = decideNote(marketing());
    const visit = recordShown(emptyVisit(), once);
    expect(visit.shown).toEqual(['welcome']);
    expect(decideNote(marketing({ visit, secondsOnScreen: 600 }))).toEqual({ show: false });
  });

  it('never appears on study pages, and no break note appears on marketing pages', () => {
    expect(decideNote(marketing({ page: 'study' }))).toEqual({ show: false });
    expect(decideNote(study({ page: 'marketing', secondsOnScreen: 2 }))).toEqual({ show: false });
  });

  it('never appears on /start, the signup thank-you page, /admin or /privacy', () => {
    expect(decideNote(marketing({ page: 'never', secondsOnScreen: 600 }))).toEqual({ show: false });
    expect(decideNote(study({ page: 'never' }))).toEqual({ show: false });
  });

  it('waits while another note is on screen', () => {
    expect(decideNote(marketing({ noteOnScreen: 'welcome' }))).toEqual({ show: false });
    expect(decideNote(marketing({ noteOnScreen: 'break' }))).toEqual({ show: false });
  });

  describe('what it says rotates between visits', () => {
    it('starts with the launch list, then supporting our mission, then a break idea', () => {
      expect(nextWelcome(null, false, false)).toBe('launch-list');
      expect(nextWelcome('launch-list', false, false)).toBe('mission');
      expect(nextWelcome('mission', false, false)).toBe('break-idea');
      expect(nextWelcome('break-idea', false, false)).toBe('launch-list');
    });

    it('skips the launch list once the visitor has joined it or has an account', () => {
      expect(nextWelcome(null, true, false)).toBe('mission');
      expect(nextWelcome('break-idea', false, true)).toBe('mission');
      expect(nextWelcome('mission', true, true)).toBe('break-idea');
    });

    it('is never the same as last visit\'s', () => {
      for (const last of [null, 'launch-list', 'mission', 'break-idea'] as const) {
        for (const joined of [false, true]) {
          for (const account of [false, true]) expect(nextWelcome(last, joined, account)).not.toBe(last);
        }
      }
    });

    it('is part of the decision', () => {
      const decision = decideNote(marketing({ lastWelcome: 'mission' }));
      expect(decision).toMatchObject({ kind: 'welcome', content: 'break-idea' });
    });
  });
});

describe('glove note: break notes on study pages (break timer on)', () => {
  it('with the timer off there is no break note: the message glove took its place', () => {
    expect(decideNote(study({ timerOn: false, timerBreakDue: true, secondsOnScreen: 5000 }))).toEqual({ show: false });
  });

  it('waits for a pause: 3 seconds without interaction, or the end of a set or step', () => {
    expect(decideNote(study({ secondsIdle: 2.9 }))).toEqual({ show: false });
    expect(decideNote(study({ secondsIdle: 3 }))).toMatchObject({ kind: 'break' });
    expect(decideNote(study({ secondsIdle: 0, atStepEnd: true }))).toMatchObject({ kind: 'break' });
  });

  it('never appears mid-answer, even at a pause', () => {
    expect(decideNote(study({ busy: { ...idle, midQuestion: true }, secondsIdle: 60 }))).toEqual({ show: false });
  });

  it('follows the timer, which repeats, so an earlier break note does not stop the next one', () => {
    expect(decideNote(study({ timerBreakDue: false }))).toEqual({ show: false });
    const visit = { ...emptyVisit(), shown: ['break' as const], lastPhoto: 2 };
    expect(decideNote(study({ visit }))).toMatchObject({ kind: 'break' });
  });

  it('may replace a welcome note on screen, but never stacks on another break note', () => {
    expect(decideNote(study({ noteOnScreen: 'welcome' }))).toMatchObject({ kind: 'break' });
    expect(decideNote(study({ noteOnScreen: 'break' }))).toEqual({ show: false });
  });
});

describe('glove note: message gloves every 30 minutes', () => {
  it('is due after 30 minutes of the visit and not before', () => {
    expect(MESSAGE_EVERY_MINUTES).toBe(30);
    expect(decideNote(message({ now: T0 + 30 * MIN - 1 }))).toEqual({ show: false });
    expect(decideNote(message())).toMatchObject({ show: true, kind: 'message' });
    expect(decideNote(message({ now: T0 + 95 * MIN }))).toMatchObject({ kind: 'message' });
  });

  it('says when 30 minutes have passed, for loading the list only then', () => {
    const visit = startVisit(emptyVisit(), T0);
    expect(messageTimeDue(visit, T0 + 30 * MIN - 1)).toBe(false);
    expect(messageTimeDue(visit, T0 + 30 * MIN)).toBe(true);
    expect(messageTimeDue(emptyVisit(), T0 + 99 * MIN)).toBe(false);
  });

  it('is not due before the page script has set the start of the visit, or with no gloves loaded', () => {
    expect(decideNote(message({ visit: emptyVisit() }))).toEqual({ show: false });
    expect(decideNote(message({ gloveCount: 0 }))).toEqual({ show: false });
  });

  it('repeats every 30 minutes after the last one was shown', () => {
    const first = decideNote(message());
    const shownAt = T0 + 31 * MIN;
    const visit = recordShown(startVisit(emptyVisit(), T0), first, shownAt, 200);
    expect(visit.lastMessageAt).toBe(shownAt);
    expect(decideNote(message({ visit, now: shownAt + 30 * MIN - 1 }))).toEqual({ show: false });
    expect(decideNote(message({ visit, now: shownAt + 30 * MIN }))).toMatchObject({ kind: 'message' });
    const second = recordShown(visit, decideNote(message({ visit, now: shownAt + 30 * MIN })), shownAt + 30 * MIN, 200);
    expect(decideNote(message({ visit: second, now: shownAt + 59 * MIN }))).toEqual({ show: false });
    expect(decideNote(message({ visit: second, now: shownAt + 60 * MIN }))).toMatchObject({ kind: 'message' });
  });

  it('appears on every kind of page except game pages and the never pages', () => {
    for (const page of ['marketing', 'study', 'other'] as const) {
      expect(decideNote(message({ page })), page).toMatchObject({ kind: 'message' });
    }
    expect(decideNote(message({ page: 'game' }))).toEqual({ show: false });
    expect(decideNote(message({ page: 'never' }))).toEqual({ show: false });
  });

  it('classifies paths: games, never pages, study, marketing and the rest', () => {
    for (const path of ['/play', '/play/', '/play/vialo', '/play/vialo.html', '/play.html', '/play/sudoku/']) {
      expect(pageKindFor(path), path).toBe('game');
    }
    for (const path of ['/start', '/start.html', '/subscribed', '/subscribed/', '/admin', '/admin/flags', '/privacy', '/privacy.html', '/breaks', '/breaks.html']) {
      expect(pageKindFor(path), path).toBe('never');
    }
    expect(pageKindFor('/learn/some-lesson')).toBe('study');
    expect(pageKindFor('/')).toBe('marketing');
    expect(pageKindFor('/index.html')).toBe('marketing');
    expect(pageKindFor('/breakfast')).toBe('other');
    expect(pageKindFor('/playground')).toBe('other');
  });

  it('defers while busy or not at a pause, then shows when the pause comes', () => {
    const flags: (keyof Busy)[] = ['typing', 'dragging', 'midQuestion', 'menuOpen', 'previewOpen', 'accountMenuOpen'];
    for (const flag of flags) expect(decideNote(message({ busy: { ...idle, [flag]: true } })), flag).toEqual({ show: false });
    expect(decideNote(message({ secondsIdle: 2 }))).toEqual({ show: false });
    expect(decideNote(message({ secondsIdle: 0, atStepEnd: true }))).toMatchObject({ kind: 'message' });
    expect(decideNote(message({ noteOnScreen: 'message' }))).toEqual({ show: false });
    expect(decideNote(message({ noteOnScreen: 'welcome' }))).toEqual({ show: false });
  });

  it('a browser that cannot remember still gets a note every 30 minutes of the page load', () => {
    const first = decideNote(message({ remembered: false }));
    expect(first).toMatchObject({ kind: 'message' });
    const visit = recordShown(startVisit(emptyVisit(), T0), first, T0 + 30 * MIN, 200);
    expect(decideNote(message({ remembered: false, visit, now: T0 + 40 * MIN }))).toEqual({ show: false });
    expect(decideNote(message({ remembered: false, visit, now: T0 + 60 * MIN }))).toMatchObject({ kind: 'message' });
  });

  it('does not stop the welcome or break notes (they have their own rules)', () => {
    const visit = { ...emptyVisit(), shown: ['message' as const] };
    expect(decideNote(marketing({ visit }))).toMatchObject({ kind: 'welcome' });
  });
});

describe('glove note: the message glove is random and never repeats back to back', () => {
  const fresh = { gloves: [] as number[], lastGlove: null as number | null };

  it('picks across the whole set and stays in range whatever random returns', () => {
    expect(nextGlove(fresh, 200, () => 0)).toBe(0);
    expect(nextGlove(fresh, 200, () => 0.999999)).toBe(199);
    for (const odd of [-1, 1, 2, Number.NaN, Number.POSITIVE_INFINITY]) {
      const index = nextGlove(fresh, 200, () => odd);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(200);
    }
  });

  it('never the same glove twice in a row, for any random value', () => {
    for (const value of [0, 0.001, 0.25, 0.5, 0.999999]) {
      expect(nextGlove({ gloves: [3], lastGlove: 3 }, 5, () => value)).not.toBe(3);
      expect(nextGlove({ gloves: [], lastGlove: 0 }, 5, () => value)).not.toBe(0);
    }
  });

  it('does not repeat until the set is used up, then starts a new round without the last one', () => {
    let visit = startVisit(emptyVisit(), T0);
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const count = 12;
    const order: number[] = [];
    for (let shown = 0; shown < count * 3; shown += 1) {
      const decision = decideNote(message({ visit, gloveCount: count, random, now: T0 + (shown + 1) * 30 * MIN }));
      expect(decision).toMatchObject({ kind: 'message' });
      if (!decision.show || decision.kind !== 'message') throw new Error('expected a message glove');
      order.push(decision.gloveIndex);
      visit = recordShown(visit, decision, T0 + (shown + 1) * 30 * MIN, count);
    }
    for (let round = 0; round < 3; round += 1) {
      expect(new Set(order.slice(round * count, (round + 1) * count)).size, `round ${round}`).toBe(count);
    }
    for (let index = 1; index < order.length; index += 1) expect(order[index]).not.toBe(order[index - 1]);
  });

  it('with a single glove it has to repeat', () => {
    expect(nextGlove({ gloves: [0], lastGlove: 0 }, 1, () => 0.5)).toBe(0);
  });

  it('is part of the decision', () => {
    expect(decideNote(message({ random: () => 0 }))).toEqual({ show: true, kind: 'message', gloveIndex: 0 });
    const visit = { ...emptyVisit(), startedAt: T0, lastGlove: 0, gloves: [0] };
    expect(decideNote(message({ visit, random: () => 0 }))).toEqual({ show: true, kind: 'message', gloveIndex: 1 });
  });
});

describe('glove note: never while the visitor is busy', () => {
  const flags: (keyof Busy)[] = ['typing', 'dragging', 'midQuestion', 'menuOpen', 'previewOpen', 'accountMenuOpen'];
  it.each(flags)('not while %s', (flag) => {
    const busy = { ...idle, [flag]: true };
    expect(decideNote(marketing({ busy, secondsOnScreen: 600 }))).toEqual({ show: false });
    expect(decideNote(study({ busy, secondsIdle: 600 }))).toEqual({ show: false });
  });
});

describe('glove note: the photo changes every time', () => {
  it('never uses the same photo twice in a row', () => {
    for (let last = 0; last < PHOTO_COUNT; last += 1) {
      for (const value of [0, 0.2, 0.5, 0.75, 0.999999]) expect(nextPhoto(last, () => value)).not.toBe(last);
    }
  });

  it('can reach every other photo', () => {
    const reached = new Set([0, 0.25, 0.5, 0.75].map((value) => nextPhoto(4, () => value)));
    expect([...reached].sort()).toEqual([0, 1, 2, 3]);
  });

  it('starts anywhere when nothing was shown, and stays in range whatever random returns', () => {
    expect(nextPhoto(null, () => 0)).toBe(0);
    expect(nextPhoto(null, () => 0.99)).toBe(4);
    for (const odd of [-1, 1, 2, Number.NaN, Number.POSITIVE_INFINITY]) {
      const index = nextPhoto(null, () => odd);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(PHOTO_COUNT);
    }
  });

  it('is part of the decision and remembered after it', () => {
    const visit = { ...emptyVisit(), lastPhoto: 0 };
    const decision = decideNote(marketing({ visit, random: () => 0 }));
    expect(decision).toMatchObject({ photoIndex: 1 });
    expect(recordShown(visit, decision).lastPhoto).toBe(1);
  });
});

describe('glove note: a browser that cannot remember', () => {
  it('gets at most one note per page load', () => {
    const first = decideNote(marketing({ remembered: false }));
    expect(first).toMatchObject({ show: true });
    const visit = recordShown(emptyVisit(), first);
    expect(decideNote(study({ remembered: false, visit }))).toEqual({ show: false });
  });
});

describe('glove note: the visit\'s memory', () => {
  it('round-trips through storage', () => {
    const storage = new MemoryStorage();
    const visit = { shown: ['welcome' as const, 'message' as const], lastPhoto: 3, startedAt: 5, lastMessageAt: 9, gloves: [4, 7], lastGlove: 7 };
    expect(writeVisit(storage, visit)).toBe(true);
    expect(readVisit(storage)).toEqual(visit);
    expect(JSON.parse(storage.items.get(VISIT_STORAGE_KEY)!)).toEqual(visit);
  });

  it('reads an older save (before message gloves) as a visit with no message fields', () => {
    const storage = new MemoryStorage();
    storage.setItem(VISIT_STORAGE_KEY, '{"shown":["welcome"],"lastPhoto":3}');
    expect(readVisit(storage)).toEqual({ ...emptyVisit(), shown: ['welcome'], lastPhoto: 3 });
    storage.setItem(VISIT_STORAGE_KEY, '{"shown":[],"lastPhoto":null,"startedAt":-4,"lastMessageAt":"x","gloves":[1,1,-2,"a",3],"lastGlove":1.5}');
    expect(readVisit(storage)).toEqual({ ...emptyVisit(), gloves: [1, 3] });
  });

  it('treats missing, blocked or malformed memory as a fresh visit', () => {
    const storage = new MemoryStorage();
    expect(readVisit(undefined)).toEqual(emptyVisit());
    expect(readVisit(blocked)).toEqual(emptyVisit());
    expect(readVisit(storage)).toEqual(emptyVisit());
    for (const bad of [
      'not json',
      '[]',
      'null',
      '{"shown":"welcome","lastPhoto":1}',
      '{"shown":["welcome","popup"],"lastPhoto":1}',
      '{"shown":[],"lastPhoto":5}',
      '{"shown":[],"lastPhoto":1.5}',
      '{"shown":[],"lastPhoto":"2"}',
    ]) {
      storage.setItem(VISIT_STORAGE_KEY, bad);
      expect(readVisit(storage), bad).toEqual(emptyVisit());
    }
  });

  it('drops repeated kinds', () => {
    const storage = new MemoryStorage();
    storage.setItem(VISIT_STORAGE_KEY, '{"shown":["break","break"],"lastPhoto":null}');
    expect(readVisit(storage)).toEqual({ ...emptyVisit(), shown: ['break'] });
  });

  it('says so when it cannot save', () => {
    expect(writeVisit(undefined, emptyVisit())).toBe(false);
    expect(writeVisit(blocked, emptyVisit())).toBe(false);
  });

  it('keeps what the last welcome note said, and nothing else', () => {
    const storage = new MemoryStorage();
    expect(readLastWelcome(storage)).toBeNull();
    expect(writeLastWelcome(storage, 'mission')).toBe(true);
    expect(storage.items.get(LAST_WELCOME_STORAGE_KEY)).toBe('mission');
    expect(readLastWelcome(storage)).toBe('mission');
    storage.setItem(LAST_WELCOME_STORAGE_KEY, 'something else');
    expect(readLastWelcome(storage)).toBeNull();
    expect(readLastWelcome(blocked)).toBeNull();
    expect(writeLastWelcome(blocked, 'mission')).toBe(false);
  });

  it('records nothing for a decision to show nothing', () => {
    const visit = { ...emptyVisit(), shown: ['welcome' as const], lastPhoto: 2 };
    expect(recordShown(visit, { show: false })).toBe(visit);
  });
});

describe('closeBreakNote', () => {
  const MINUTE_MS = 60_000;
  const SNOOZE_MS = 5 * MINUTE_MS;

  /** A timer in 'break due' status. */
  function breakDueTimer(): BreakState {
    const t0 = 0;
    // turnOn starts focusing; advance past focus period so tick transitions to 'break due'
    const on = turnOn(startBreaks(), t0);
    const focusMs = on.settings.focusMinutes * MINUTE_MS;
    return tick(on, t0 + focusMs + 1);
  }

  it('snoozes a break-due timer: status becomes focusing and remainingMs is 5 minutes', () => {
    const now = 1000;
    const timer = breakDueTimer();
    expect(timer.status).toBe('break due');
    const after = closeBreakNote(timer, now);
    expect(after.status).toBe('focusing');
    expect(after.endsAt).toBe(now + SNOOZE_MS);
    expect(remainingMs(after, now)).toBe(SNOOZE_MS);
  });

  it('after snooze, decideNote shows no break note for 5 minutes then shows one again', () => {
    const now = 1000;
    const snoozed = closeBreakNote(breakDueTimer(), now);
    const baseInput = (secondsIdle: number, timerState: BreakState): NoteInput => ({
      visit: emptyVisit(),
      remembered: true,
      page: 'study',
      secondsOnScreen: 60,
      scrollFraction: 0,
      secondsIdle,
      atStepEnd: false,
      busy: { typing: false, dragging: false, midQuestion: false, menuOpen: false, previewOpen: false, accountMenuOpen: false },
      timerOn: true,
      timerBreakDue: timerState.status === 'break due',
      noteOnScreen: null,
      joinedLaunchList: false,
      hasAccount: false,
      lastWelcome: null,
      random: () => 0,
      now: 0,
      gloveCount: 0,
    });

    // At +1s and +4m59s the snoozed timer is still focusing — no break note
    const at1s = tick(snoozed, now + 1_000);
    expect(decideNote(baseInput(3, at1s))).toEqual({ show: false });

    const at4m59s = tick(snoozed, now + (SNOOZE_MS - 1_000));
    expect(decideNote(baseInput(3, at4m59s))).toEqual({ show: false });

    // At exactly +5 min the timer transitions to 'break due' — break note appears
    const at5m = tick(snoozed, now + SNOOZE_MS);
    expect(at5m.status).toBe('break due');
    expect(decideNote(baseInput(3, at5m))).toMatchObject({ show: true, kind: 'break' });
  });

  it('returns the same state unchanged for off, focusing, on-break and paused timers', () => {
    const now = 0;
    const off = startBreaks();
    const focusing = turnOn(startBreaks(), now);
    const onBreak: BreakState = { ...focusing, status: 'on break', endsAt: now + 5 * MINUTE_MS };
    const paused: BreakState = { ...focusing, status: 'paused', endsAt: null, pausedFrom: 'focusing', pausedRemainingMs: MINUTE_MS };
    expect(closeBreakNote(off, now)).toBe(off);
    expect(closeBreakNote(focusing, now)).toBe(focusing);
    expect(closeBreakNote(onBreak, now)).toBe(onBreak);
    expect(closeBreakNote(paused, now)).toBe(paused);
  });

  it('with the timer off, closing a break note changes nothing', () => {
    const off = startBreaks();
    expect(closeBreakNote(off, 0)).toBe(off);
  });
});
