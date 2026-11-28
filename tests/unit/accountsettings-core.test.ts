import { describe, expect, it, vi } from 'vitest';

const fromSupabase = vi.fn(() => Promise.resolve({
  select: vi.fn(async () => ({ data: [], error: null })),
  async *selectPages() { yield { data: [], error: null }; },
  rpc: vi.fn(async () => ({ data: [], error: null })),
  user: vi.fn(async () => ({ data: { user: null }, error: null })),
}));

vi.mock('../../src/islands/exportload', () => ({ fromSupabase }));

import { adaptersFor, type AccountClient } from '../../src/islands/accountsettings-core';

function client(): AccountClient {
  return {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      signOut: async () => ({ error: null }),
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
    rpc: async () => ({ data: null, error: null }),
  } as unknown as AccountClient;
}

describe('account export reader loading', () => {
  it('does not import the export reader when adapters are created; it loads on first read', async () => {
    fromSupabase.mockClear();
    const adapters = adaptersFor(client());
    expect(fromSupabase).not.toHaveBeenCalled();
    await adapters.reader.user();
    expect(fromSupabase).toHaveBeenCalledOnce();
  });

  it('does not strand the reader after a failed action import', async () => {
    fromSupabase.mockReset();
    fromSupabase
      .mockRejectedValueOnce(new Error('chunk unavailable'))
      .mockResolvedValue({
        select: vi.fn(async () => ({ data: [], error: null })),
        async *selectPages() { yield { data: [], error: null }; },
        rpc: vi.fn(async () => ({ data: [], error: null })),
        user: vi.fn(async () => ({ data: { user: null }, error: null })),
      });
    const reader = adaptersFor(client()).reader;
    await expect(reader.user()).rejects.toThrow('chunk unavailable');
    await expect(reader.user()).resolves.toEqual({ data: { user: null }, error: null });
    expect(fromSupabase).toHaveBeenCalledTimes(2);
  });
});
