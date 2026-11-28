/**
 * Pure logic for sharing achievements (Task 103, D-pending). Share text, links and card images carry nothing personal:
 * no name, email, puzzle answer or tracking value. Game names come only from src/config/games.ts (D-66, D-67).
 */
import { dailyGames, gameName, type DailyGame } from '../config/games';
import { gamePages } from '../config/game-pages';

export const SHARE_STYLES = ['scene', 'ivory', 'bronze-coin'] as const;
export type ShareStyle = (typeof SHARE_STYLES)[number];

export type GameId = DailyGame['id'];
export const GAME_IDS: readonly GameId[] = dailyGames.map((game) => game.id);
export type ShareToolId = GameId | 'study';

/** The name a student sees for each card style, like Spotify's share sheet (Christian, 2026-11-01). */
export const STYLE_LABELS: Record<ShareStyle, string> = {
  scene: 'scene',
  ivory: 'editorial',
  'bronze-coin': 'coin',
};

/** Where a share link lands: the exact tool it came from. Each game has its own page (2026-11-17). */
export const TOOL_PATHS: Record<ShareToolId, string> = {
  ...gamePages,
  study: '/learn/study-skills',
};

/** The name used in the share line: a game's visible name from the settings, or the study area. */
export function toolName(tool: ShareToolId): string {
  return tool === 'study' ? 'study skills' : gameName(tool);
}

/** Path to the static card image for a tool and style (built by scripts/build-share-cards.mjs). */
export function shareImagePath(tool: ShareToolId, style: ShareStyle): string {
  const group = tool === 'study' ? 'study' : 'games';
  return `/share/${group}-${style}.png`;
}

/**
 * Widths of the small WebP previews the share sheet shows (scripts/build-share-previews.mjs): enough for its card
 * (--container-share-card, at most 280 CSS px) on 1x and 2x screens, and on 3x screens.
 */
export const SHARE_PREVIEW_WIDTHS = [560, 840] as const;

/** A card's preview image at one of SHARE_PREVIEW_WIDTHS. The file that is shared stays the full PNG. */
export function sharePreviewPath(tool: ShareToolId, style: ShareStyle, width: (typeof SHARE_PREVIEW_WIDTHS)[number]): string {
  return shareImagePath(tool, style).replace(/^\/share\/(.+)\.png$/, `/share/previews/$1-${width}.webp`);
}

/** The file name a shared card image gets. */
export function shareFileName(tool: ShareToolId, style: ShareStyle): string {
  return `cueory-${shareImagePath(tool, style).slice('/share/'.length)}`;
}

/** Absolute link to the tool, with no tracking parameters. */
export function buildShareUrl(tool: ShareToolId, siteUrl: string): string {
  return `${siteUrl.replace(/\/$/, '')}${TOOL_PATHS[tool]}`;
}

/** The short share line, in the lowercase brand voice for social copy (D-47). Nothing personal. */
export function buildShareText(tool: ShareToolId): string {
  return `i'm studying with ${toolName(tool)} on cueory.`;
}

/** A plain X post link (no SDK, no script): the text and the link as separate parameters. */
export function xIntentUrl(text: string, url: string): string {
  return `https://x.com/intent/post?${new URLSearchParams({ text, url })}`;
}

/** The parts of `navigator` that sharing uses, so tests can pass a stand-in. */
export interface ShareTarget {
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data?: ShareData) => boolean;
}

/** Whether the Web Share API is there at all (text and link). */
export function canNativeShare(target: ShareTarget | undefined): boolean {
  return typeof target?.share === 'function';
}

/** Whether this browser can share an image file through the Web Share API. */
export function canShareFile(target: ShareTarget | undefined, file: File): boolean {
  if (!canNativeShare(target) || typeof target?.canShare !== 'function') return false;
  try {
    return target.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export function canShareFiles(target: ShareTarget | undefined): boolean {
  return canShareFile(target, new File([new Uint8Array(1)], 'cueory.png', { type: 'image/png' }));
}

/** Fetches a card image and turns it into a File for sharing; null if anything goes wrong. */
export async function loadCardFile(fetcher: typeof fetch, path: string, name: string): Promise<File | null> {
  try {
    const response = await fetcher(path);
    if (!response.ok) return null;
    const blob = await response.blob();
    return new File([blob], name, { type: 'image/png' });
  } catch {
    return null;
  }
}

/**
 * What to hand to navigator.share: the selected card's image with the text and link when the browser can share that
 * file, otherwise just the text and link.
 */
export function buildShareData(
  target: ShareTarget,
  base: { title: string; text: string; url: string },
  file: File | null,
): ShareData {
  if (file && canShareFile(target, file)) return { ...base, files: [file] };
  return { ...base };
}

export type ShareOutcome = 'shared' | 'cancelled' | 'unavailable' | 'failed';
export type FileShareOutcome = ShareOutcome | 'copied';

/** Opens the system share sheet. Never throws: closing the sheet is 'cancelled', any other error is 'failed'. */
export async function runShare(target: ShareTarget, data: ShareData): Promise<ShareOutcome> {
  if (typeof target.share !== 'function') return 'unavailable';
  try {
    await target.share(data);
    return 'shared';
  } catch (error) {
    return (error as { name?: unknown } | null)?.name === 'AbortError' ? 'cancelled' : 'failed';
  }
}

/**
 * Shares the result only when this browser accepts the story image. Missing, false or throwing file capability copies
 * the exact approved line instead of opening a text-only system share sheet.
 */
export async function shareFileOrCopy(
  target: ShareTarget,
  base: { title: string; text: string; url: string },
  file: File | null,
  copy: (text: string) => Promise<unknown> | unknown,
): Promise<FileShareOutcome> {
  if (!file || !canShareFile(target, file)) {
    await copy(base.text);
    return 'copied';
  }
  const outcome = await runShare(target, { ...base, files: [file] });
  if (outcome === 'shared' || outcome === 'cancelled') return outcome;
  await copy(base.text);
  return 'copied';
}

/** Instant scrolling when the visitor asked for reduced motion, smooth otherwise. */
export function scrollBehavior(matchMediaFn: ((query: string) => { matches: boolean }) | undefined): ScrollBehavior {
  try {
    return matchMediaFn?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  } catch {
    return 'auto';
  }
}

/** How far to scroll a row so a card sits in its middle (the row must be the card's offset parent). */
export function centeredScrollLeft(row: { clientWidth: number }, card: { offsetLeft: number; offsetWidth: number }): number {
  return Math.max(0, card.offsetLeft - (row.clientWidth - card.offsetWidth) / 2);
}

/** Plain platform share-page links. No SDK, script, tracker or account token is loaded. */
export type SharePlatform = 'facebook' | 'x' | 'threads' | 'reddit' | 'whatsapp';

export function platformShareUrl(platform: SharePlatform, text: string, url: string): string {
  const combined = `${text} ${url}`;
  switch (platform) {
    case 'facebook':
      return `https://www.facebook.com/sharer/sharer.php?${new URLSearchParams({ u: url })}`;
    case 'x':
      return xIntentUrl(text, url);
    case 'threads':
      return `https://www.threads.com/intent/post?${new URLSearchParams({ text, url })}`;
    case 'reddit':
      return `https://www.reddit.com/submit?${new URLSearchParams({ url, title: text })}`;
    case 'whatsapp':
      return `https://wa.me/?${new URLSearchParams({ text: combined })}`;
  }
}

export interface StoryImageInput {
  name: string;
  date: string;
  result: string;
  /** Optional approved wordmark asset for a game. */
  wordmarkPath?: string;
}

export interface StoryTextLayout {
  lines: string[];
  fontSize: number;
  lineHeight: number;
}

export interface StoryTextFitOptions {
  maxWidth: number;
  maxLines: number;
  startSize: number;
  minSize: number;
  lineHeightRatio: number;
  measure: (text: string, fontSize: number) => number;
}

/** Fits complete story text without cropping or ellipsizing; null lets the caller use the copy fallback. */
export function fitStoryText(text: string, options: StoryTextFitOptions): StoryTextLayout | null {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean || options.maxWidth <= 0 || !Number.isInteger(options.maxLines) || options.maxLines < 1
    || options.minSize <= 0 || options.startSize < options.minSize || options.lineHeightRatio <= 0) return null;
  const words = clean.split(' ');
  for (let fontSize = options.startSize; fontSize >= options.minSize; fontSize -= 2) {
    const lines: string[] = [];
    let line = '';
    let failed = false;
    for (const word of words) {
      if (options.measure(word, fontSize) > options.maxWidth) {
        failed = true;
        break;
      }
      const next = line ? `${line} ${word}` : word;
      if (line && options.measure(next, fontSize) > options.maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (failed) continue;
    if (line) lines.push(line);
    if (lines.length <= options.maxLines) {
      return { lines, fontSize, lineHeight: fontSize * options.lineHeightRatio };
    }
  }
  return null;
}

/** Longest total wait for complete story-image preparation before the copy fallback runs. */
export const STORY_ASSET_TIMEOUT_MS = 4000;

/** Settles with the promise, or rejects once `ms` passes, so a stalled asset can never hang the share flow. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out')), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error: unknown) => { clearTimeout(timer); reject(error instanceof Error ? error : new Error(String(error))); },
    );
  });
}

/** Draws the story card after the visitor taps share, with one end-to-end preparation budget. */
export async function createStoryFile(input: StoryImageInput): Promise<File | null> {
  if (typeof document === 'undefined') return null;
  try {
    // The renderer is a separate chunk, fetched only here (when a visitor taps share), so pages that merely contain a
    // result dialog do not carry it. Loading it counts against the same end-to-end budget as the drawing itself.
    return await withTimeout(import('./storyimage').then((renderer) => renderer.renderStoryFile(input)), STORY_ASSET_TIMEOUT_MS);
  } catch {
    return null;
  }
}
