import { describe, expect, it, vi } from 'vitest';
import {
  canCopyImage,
  canSendMessage,
  copySticker,
  downloadSticker,
  shareMenuItems,
  shareSticker,
  smsUrl,
  type SharePayload,
} from '../../src/islands/vialosharing';

const payload: SharePayload = { title: 'vialo', text: 'vialo · sun 1 nov · 4/6 · cueory.app', url: 'https://cueory.app/play/vialo' };
const png = new File([new Uint8Array(8)], 'vialo-portrait-2026-11-01.png', { type: 'image/png' });

describe('share', () => {
  it('opens the share sheet with the png, the line and the link when the browser accepts them together', async () => {
    const share = vi.fn(async () => {});
    const canShare = vi.fn(() => true);
    expect(await shareSticker({ share, canShare }, png, payload)).toBe('shared');
    expect(share).toHaveBeenCalledWith({ ...payload, files: [png] });
    expect((share.mock.calls[0] as unknown as [ShareData])[0].files![0]!.type).toBe('image/png');
  });

  it('shares the file alone when text and a link beside it make canShare false', async () => {
    const share = vi.fn(async () => {});
    const canShare = vi.fn((data?: ShareData) => !data?.text);
    expect(await shareSticker({ share, canShare }, png, payload)).toBe('shared');
    expect(share).toHaveBeenCalledWith({ files: [png] });
  });

  it('does not open anything when the browser cannot share the file', async () => {
    const share = vi.fn(async () => {});
    expect(await shareSticker({ share, canShare: () => false }, png, payload)).toBe('unavailable');
    expect(share).not.toHaveBeenCalled();
  });

  it('treats closing the sheet as cancelled and other errors as failed', async () => {
    const abort = Object.assign(new Error('x'), { name: 'AbortError' });
    expect(await shareSticker({ share: async () => { throw abort; }, canShare: () => true }, png, payload)).toBe('cancelled');
    expect(await shareSticker({ share: async () => { throw new Error('no'); }, canShare: () => true }, png, payload)).toBe('failed');
  });

  it('reports a missing file', async () => {
    expect(await shareSticker({ share: async () => {}, canShare: () => true }, null, payload)).toBe('no-file');
  });
});

describe('save', () => {
  it('downloads the file under its own name', () => {
    const click = vi.fn();
    const revoke = vi.fn();
    downloadSticker(png, { createObjectURL: () => 'blob:x', revokeObjectURL: revoke, click });
    expect(click).toHaveBeenCalledWith({ href: 'blob:x', download: 'vialo-portrait-2026-11-01.png' });
    expect(revoke).toHaveBeenCalledWith('blob:x');
  });
});

describe('copy', () => {
  class Item {
    constructor(public data: Record<string, Blob>) {}
  }

  it('puts an image/png on the clipboard', async () => {
    const write = vi.fn(async () => {});
    expect(await copySticker({ write }, Item as unknown as typeof ClipboardItem, png)).toBe('copied');
    const items = (write.mock.calls[0] as unknown as [Item[]])[0];
    expect(Object.keys(items[0]!.data)).toEqual(['image/png']);
  });

  it('says unsupported without a clipboard or a ClipboardItem', async () => {
    expect(await copySticker(undefined, Item as unknown as typeof ClipboardItem, png)).toBe('unsupported');
    expect(await copySticker({ write: async () => {} }, undefined, png)).toBe('unsupported');
    expect(canCopyImage({}, Item as unknown as typeof ClipboardItem)).toBe(false);
  });

  it('respects ClipboardItem.supports and reports a refused write', async () => {
    const No = Object.assign(class {}, { supports: () => false }) as unknown as typeof ClipboardItem;
    expect(canCopyImage({ write: async () => {} }, No)).toBe(false);
    expect(await copySticker({ write: async () => { throw new Error('denied'); } }, Item as unknown as typeof ClipboardItem, png)).toBe('failed');
  });
});

describe('the menu where files cannot be shared', () => {
  it('links x and facebook with the public line and link only, and no picture', () => {
    const items = shareMenuItems(payload, false);
    const x = items.find((i) => i.id === 'x')!;
    const facebook = items.find((i) => i.id === 'facebook')!;
    if (x.kind !== 'link' || facebook.kind !== 'link') throw new Error('expected links');
    const xUrl = new URL(x.href);
    expect(xUrl.origin + xUrl.pathname).toBe('https://x.com/intent/post');
    expect(xUrl.searchParams.get('text')).toBe(payload.text);
    expect(xUrl.searchParams.get('url')).toBe(payload.url);
    expect([...xUrl.searchParams.keys()].sort()).toEqual(['text', 'url']);
    const fbUrl = new URL(facebook.href);
    expect(fbUrl.origin + fbUrl.pathname).toBe('https://www.facebook.com/sharer/sharer.php');
    expect(fbUrl.searchParams.get('u')).toBe(payload.url);
    expect(x.name).toContain('(opens in a new tab)');
  });

  it('offers a message only where there is a messaging app', () => {
    expect(shareMenuItems(payload, false).map((i) => i.id)).toEqual(['x', 'facebook', 'save', 'copy']);
    const withMessage = shareMenuItems(payload, true);
    expect(withMessage.map((i) => i.id)).toEqual(['x', 'facebook', 'message', 'save', 'copy']);
    const message = withMessage.find((i) => i.id === 'message')!;
    if (message.kind !== 'sms') throw new Error('expected sms');
    expect(message.href).toBe(smsUrl(`${payload.text} ${payload.url}`));
    expect(message.href.startsWith('sms:?&body=')).toBe(true);
  });

  it('decides on messaging from the device, not the browser name', () => {
    expect(canSendMessage({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)', maxTouchPoints: 5 })).toBe(true);
    expect(canSendMessage({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7)', maxTouchPoints: 5 })).toBe(true);
    expect(canSendMessage({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5 })).toBe(true);
    expect(canSendMessage({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 0 })).toBe(false);
    expect(canSendMessage({ userAgent: 'Mozilla/5.0 (Windows NT 10.0)', maxTouchPoints: 0 })).toBe(false);
    expect(canSendMessage({ userAgent: 'x', maxTouchPoints: 0, mobile: true })).toBe(true);
    expect(canSendMessage({ userAgent: 'Android', maxTouchPoints: 5, mobile: false })).toBe(false);
  });
});
