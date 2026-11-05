import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  currentFlagItem,
  onFlagItem,
  setFlagItem,
  type FlagItem,
} from '../../src/islands/flagitem';

const FIRST: FlagItem = {
  itemId: '00000000-0000-0000-0000-000000000001',
  itemVersionId: '00000000-0000-0000-0000-000000000002',
};
const SECOND: FlagItem = {
  itemId: '00000000-0000-0000-0000-000000000003',
  itemVersionId: '00000000-0000-0000-0000-000000000004',
};

const subscriptions: Array<() => void> = [];

function subscribe(listener: (item: FlagItem | undefined) => void): () => void {
  const unsubscribe = onFlagItem(listener);
  subscriptions.push(unsubscribe);
  return unsubscribe;
}

afterEach(() => {
  for (const unsubscribe of subscriptions.splice(0)) unsubscribe();
  setFlagItem(undefined);
});

describe('the current flag item', () => {
  it('keeps only a copy of the valid UUID pair and returns a fresh snapshot', () => {
    const input = { ...FIRST };
    setFlagItem(input);
    input.itemId = 'sample_1';

    const snapshot = currentFlagItem();
    expect(snapshot).toEqual(FIRST);
    snapshot!.itemVersionId = 'sample_2';
    expect(currentFlagItem()).toEqual(FIRST);
  });

  it('clears the current item when either id is not a UUID', () => {
    setFlagItem(FIRST);
    setFlagItem({ ...FIRST, itemId: 'sample_1' });
    expect(currentFlagItem()).toBeUndefined();

    setFlagItem(FIRST);
    setFlagItem({ ...FIRST, itemVersionId: 'not-a-version-id' });
    expect(currentFlagItem()).toBeUndefined();
  });

  it('accepts uppercase UUIDs', () => {
    const uppercase = {
      itemId: 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE',
      itemVersionId: 'FFFFFFFF-1111-2222-3333-444444444444',
    };
    setFlagItem(uppercase);
    expect(currentFlagItem()).toEqual(uppercase);
  });
});

describe('flag item subscriptions', () => {
  it('notifies only when the UUID pair changes', () => {
    const listener = vi.fn();
    subscribe(listener);

    setFlagItem(FIRST);
    setFlagItem({ ...FIRST });
    setFlagItem(SECOND);
    setFlagItem(undefined);
    setFlagItem(undefined);

    expect(listener.mock.calls).toEqual([[FIRST], [SECOND], [undefined]]);
  });

  it('does not call a listener at subscription time and stops after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);

    expect(listener).not.toHaveBeenCalled();
    setFlagItem(FIRST);
    unsubscribe();
    setFlagItem(SECOND);
    unsubscribe();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(FIRST);
  });

  it('sends listener copies and isolates a listener that throws', () => {
    const first = vi.fn((item: FlagItem | undefined) => {
      if (item) item.itemId = 'mutated-by-listener';
      throw new Error('listener failure');
    });
    const second = vi.fn();
    subscribe(first);
    subscribe(second);

    expect(() => setFlagItem(FIRST)).not.toThrow();
    expect(first).toHaveBeenCalledWith(FIRST);
    expect(second).toHaveBeenCalledWith(FIRST);
    expect(currentFlagItem()).toEqual(FIRST);
  });
});
