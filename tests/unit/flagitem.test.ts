import { afterEach, describe, expect, it } from 'vitest';
import {
  currentFlagItem,
  onFlagItem,
  setFlagItem,
  type FlagItem,
} from '../../src/islands/flagitem';

const ITEM_ID = '00000000-0000-0000-0000-000000000001';
const VERSION_ID = '00000000-0000-0000-0000-000000000002';
const OTHER_ITEM_ID = '00000000-0000-0000-0000-000000000003';

const validItem: FlagItem = { itemId: ITEM_ID, itemVersionId: VERSION_ID };
const cleanups: Array<() => void> = [];

function subscribe(listener: (item: FlagItem | undefined) => void): () => void {
  const unsubscribe = onFlagItem(listener);
  cleanups.push(unsubscribe);
  return unsubscribe;
}

afterEach(() => {
  for (const unsubscribe of cleanups.splice(0)) unsubscribe();
  setFlagItem(undefined);
});

describe('current flag item', () => {
  it('starts empty and returns defensive copies of the current item', () => {
    expect(currentFlagItem()).toBeUndefined();

    const input = { ...validItem };
    setFlagItem(input);
    input.itemId = OTHER_ITEM_ID;

    expect(currentFlagItem()).toEqual(validItem);
    const snapshot = currentFlagItem();
    if (!snapshot) throw new Error('expected a current flag item');
    snapshot.itemVersionId = OTHER_ITEM_ID;
    expect(currentFlagItem()).toEqual(validItem);
  });

  it('accepts uppercase UUID characters without rewriting the supplied IDs', () => {
    const uppercase: FlagItem = {
      itemId: 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA',
      itemVersionId: 'BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB',
    };

    setFlagItem(uppercase);

    expect(currentFlagItem()).toEqual(uppercase);
  });

  it('clears the current item when a sample item slug is supplied', () => {
    const changes: Array<FlagItem | undefined> = [];
    subscribe(item => changes.push(item));

    setFlagItem(validItem);
    setFlagItem({ itemId: 'sample-item', itemVersionId: VERSION_ID });

    expect(currentFlagItem()).toBeUndefined();
    expect(changes).toEqual([validItem, undefined]);
  });

  it('clears the current item when the item version is not a UUID', () => {
    const changes: Array<FlagItem | undefined> = [];
    subscribe(item => changes.push(item));

    setFlagItem(validItem);
    setFlagItem({ itemId: ITEM_ID, itemVersionId: 'not-a-uuid' });

    expect(currentFlagItem()).toBeUndefined();
    expect(changes).toEqual([validItem, undefined]);
  });

  it('notifies only when the item pair changes', () => {
    const changes: Array<FlagItem | undefined> = [];
    subscribe(item => changes.push(item));

    setFlagItem(validItem);
    setFlagItem({ ...validItem });
    setFlagItem(undefined);
    setFlagItem(undefined);

    expect(changes).toEqual([validItem, undefined]);
  });

  it('isolates listener errors and gives callbacks copies they cannot mutate', () => {
    let receivedId: string | undefined;
    let observedItem: FlagItem | undefined;
    subscribe(() => {
      throw new Error('subscriber failure');
    });
    subscribe(item => {
      receivedId = item?.itemId;
      if (item) item.itemId = OTHER_ITEM_ID;
    });
    subscribe(item => {
      observedItem = item;
    });

    expect(() => setFlagItem(validItem)).not.toThrow();
    expect(receivedId).toBe(ITEM_ID);
    expect(observedItem).toEqual(validItem);
    expect(currentFlagItem()).toEqual(validItem);
  });

  it('stops notifying a listener after it unsubscribes', () => {
    const changes: Array<FlagItem | undefined> = [];
    const unsubscribe = subscribe(item => changes.push(item));

    setFlagItem(validItem);
    unsubscribe();
    unsubscribe();
    setFlagItem({ itemId: OTHER_ITEM_ID, itemVersionId: VERSION_ID });

    expect(changes).toEqual([validItem]);
  });

  it('uses a stable listener snapshot for an in-flight notification', () => {
    const calls: string[] = [];
    let unsubscribeSecond = () => {};
    let subscribedLate = false;

    subscribe(() => {
      calls.push('first');
      unsubscribeSecond();
      if (!subscribedLate) {
        subscribedLate = true;
        subscribe(() => calls.push('late'));
      }
    });
    unsubscribeSecond = subscribe(() => calls.push('second'));

    setFlagItem(validItem);
    expect(calls).toEqual(['first', 'second']);

    calls.length = 0;
    setFlagItem({ itemId: OTHER_ITEM_ID, itemVersionId: VERSION_ID });
    expect(calls).toEqual(['first', 'late']);
  });
});
