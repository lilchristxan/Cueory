/**
 * What the share card's buttons do (Christian's designs, 25 Nov 2026), as plain functions so they can be tested with a
 * stand-in navigator. Nothing here sends anything anywhere: every action starts from a press, and the only data that can
 * leave the page is the public result line, the public site link and the sticker picture the person chose to share.
 *
 * - share: the system share sheet with the sticker file (and the line and link where the browser accepts them beside a
 *   file). Where the browser cannot share files, the card shows a small menu instead (shareMenuItems).
 * - save to gallery: always a download of the PNG.
 * - copy sticker: the PNG on the clipboard where the browser supports it, else a download and a polite note.
 */
import { canShareFile, platformShareUrl, runShare, type ShareOutcome, type ShareTarget } from './share';

/** The text and link that travel with the picture, or alone in the web links. Public wording only. */
export interface SharePayload {
  title: string;
  text: string;
  url: string;
}

export type ShareFileOutcome = ShareOutcome | 'no-file';

/**
 * Opens the system share sheet with the sticker. Some browsers refuse to share a file together with text or a link, so
 * the full set is asked about first (navigator.canShare) and the file alone is the fallback. Never throws.
 */
export async function shareSticker(target: ShareTarget, file: File | null, payload: SharePayload): Promise<ShareFileOutcome> {
  if (!file) return 'no-file';
  const full: ShareData = { ...payload, files: [file] };
  let data: ShareData | undefined;
  try {
    if (target.canShare?.(full)) data = full;
    else if (target.canShare?.({ files: [file] })) data = { files: [file] };
  } catch {
    data = undefined;
  }
  if (!data) return 'unavailable';
  return runShare(target, data);
}

/** True when this browser's share sheet accepts a PNG file. */
export function canShareStickerFile(target: ShareTarget | undefined, file: File): boolean {
  return canShareFile(target, file);
}

/** Parts of the document a download needs, so a test can pass a stand-in. */
export interface DownloadEnvironment {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
  click(link: { href: string; download: string }): void;
}

/** A plain download of the PNG; the browser decides where it goes (on a phone: the share/preview step or Downloads). */
export function downloadSticker(file: File, env: DownloadEnvironment): void {
  const href = env.createObjectURL(file);
  env.click({ href, download: file.name });
  env.revokeObjectURL(href);
}

export function browserDownloadEnvironment(): DownloadEnvironment {
  return {
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => {
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    },
    click: ({ href, download }) => {
      const link = document.createElement('a');
      link.href = href;
      link.download = download;
      link.rel = 'noopener';
      link.hidden = true;
      document.body.append(link);
      link.click();
      link.remove();
    },
  };
}

export interface ClipboardTarget {
  write?: (items: ClipboardItem[]) => Promise<void>;
}

/** Whether the browser can put a PNG on the clipboard. */
export function canCopyImage(clipboard: ClipboardTarget | undefined, item: typeof ClipboardItem | undefined): boolean {
  if (typeof clipboard?.write !== 'function' || typeof item !== 'function') return false;
  const supports = (item as unknown as { supports?: (type: string) => boolean }).supports;
  return typeof supports === 'function' ? supports.call(item, 'image/png') : true;
}

export type CopyOutcome = 'copied' | 'unsupported' | 'failed';

export async function copySticker(clipboard: ClipboardTarget | undefined, item: typeof ClipboardItem | undefined, file: File): Promise<CopyOutcome> {
  if (!clipboard?.write || !canCopyImage(clipboard, item)) return 'unsupported';
  try {
    await clipboard.write([new item!({ 'image/png': file })]);
    return 'copied';
  } catch {
    return 'failed';
  }
}

export type MenuAction =
  | { id: 'x' | 'facebook'; label: string; kind: 'link'; href: string; name: string }
  | { id: 'message'; label: string; kind: 'sms'; href: string; name: string }
  | { id: 'save' | 'copy'; label: string; kind: 'button'; name: string };

/** A plain text message link. `sms:?&body=` is the form that both iOS and Android's messaging apps open. */
export function smsUrl(text: string): string {
  return `sms:?&body=${encodeURIComponent(text)}`;
}

/** Whether this looks like a phone or tablet, where a text-message link has an app to open. */
export function canSendMessage(env: { userAgent: string; maxTouchPoints: number; mobile?: boolean }): boolean {
  if (typeof env.mobile === 'boolean') return env.mobile;
  if (/android|iphone|ipad|ipod/i.test(env.userAgent)) return true;
  // iPadOS reports itself as a Mac with a touch screen.
  return /macintosh/i.test(env.userAgent) && env.maxTouchPoints > 1;
}

/**
 * The menu the share button opens where the browser cannot share a file. The web links carry the result line and the
 * site link only: a website cannot attach a picture to another site's post box. Save and copy repeat the two buttons.
 */
export function shareMenuItems(payload: SharePayload, canMessage: boolean): MenuAction[] {
  const items: MenuAction[] = [
    { id: 'x', label: 'share on x', kind: 'link', href: platformShareUrl('x', payload.text, payload.url), name: 'share on x (opens in a new tab)' },
    { id: 'facebook', label: 'share on facebook', kind: 'link', href: platformShareUrl('facebook', payload.text, payload.url), name: 'share on facebook (opens in a new tab)' },
  ];
  if (canMessage) items.push({ id: 'message', label: 'send a message', kind: 'sms', href: smsUrl(`${payload.text} ${payload.url}`), name: 'send a message' });
  items.push({ id: 'save', label: 'save', kind: 'button', name: 'save the sticker' }, { id: 'copy', label: 'copy', kind: 'button', name: 'copy the sticker' });
  return items;
}
