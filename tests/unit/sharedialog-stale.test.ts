import { describe, expect, it } from 'vitest';
import { stickersFor, type ShareSticker } from '../../src/islands/sharedialogmodel';

// The dialog enables share, save and copy only when stickersFor(...) gives a file. A sticker drawn for the signed-in
// stats must never be reachable once the key (which holds those stats) has changed.

const signedIn = JSON.stringify({ stats: ['0:42', '93%', '6'] });
const signedOut = JSON.stringify({ stats: ['0:42'] });
const first: ShareSticker = {
  id: 'portrait',
  label: 'portrait sticker',
  width: 1,
  height: 1,
  canvas: {} as HTMLCanvasElement,
  file: { name: 'signed-in.png' } as File,
};
const drawn = { key: signedIn, list: [first] };
const fileFor = (key: string) => stickersFor(drawn, key)[0]?.file ?? null;

describe('a drawing is only usable for the key it was made for', () => {
  it('is available for its own key', () => {
    expect(fileFor(signedIn)).toBe(first.file);
  });

  it('is gone the moment the key changes, while the second draw is still pending', () => {
    expect(fileFor(signedOut)).toBeNull();
    expect(stickersFor(drawn, signedOut)).toEqual([]);
  });

  it('stays gone when the second draw rejects (nothing replaces it, so the old file is never shown)', () => {
    // On a rejected draw the dialog records the failure for the new key and leaves `drawn` as it was.
    expect(fileFor(signedOut)).toBeNull();
  });

  it('is replaced by the new drawing once it resolves, and nothing is available before the first draw', () => {
    const second = { key: signedOut, list: [{ ...first, file: { name: 'signed-out.png' } as File }] };
    expect(stickersFor(second, signedOut)[0]?.file?.name).toBe('signed-out.png');
    expect(stickersFor(undefined, signedOut)).toEqual([]);
  });
});
