import { expect, it, vi } from 'vitest';
import { watchQuestionAccount, type QuestionAccountClient } from '../../src/islands/questionaccount';
import type { AnswerTransport } from '../../src/islands/checkanswer';

const args = { item_id: 'sample-item', version_id: 'sample-version', picked: ['a' as const] };
function setup() {
  let listener!: Parameters<QuestionAccountClient['auth']['onAuthStateChange']>[0];
  const unsubscribe = vi.fn();
  const changed = vi.fn();
  const rpc = vi.fn<AnswerTransport['rpc']>().mockResolvedValue({ data: 'sample feedback', error: null });
  const bind = vi.fn(async (_token: string, _signal: AbortSignal): Promise<AnswerTransport> => ({ rpc }));
  const client = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { access_token: 'fake-token-a', user: { id: 'fake-a' } } }, error: null })),
      onAuthStateChange: vi.fn((fn: typeof listener) => { listener = fn; return { data: { subscription: { unsubscribe } } }; }),
    },
    from: vi.fn(), rpc: vi.fn(),
  } satisfies QuestionAccountClient;
  const emit = (id: string | null, event = 'SIGNED_IN') => listener(event, id ? { user: { id } } : null);
  return { client, emit, changed, bind, rpc, unsubscribe };
}

it('pins writes to the captured token and keeps same-account refreshes active', async () => {
  const t = setup();
  const watched = await watchQuestionAccount(t.client, t.changed, t.bind);
  t.emit('fake-a', 'TOKEN_REFRESHED');
  await watched.client.rpc('check_answer', args);
  expect(t.bind).toHaveBeenCalledExactlyOnceWith('fake-token-a', expect.any(AbortSignal));
  expect(t.client.rpc).not.toHaveBeenCalled();
  expect(t.changed).not.toHaveBeenCalled();
  watched.dispose();
  expect(t.unsubscribe).toHaveBeenCalledOnce();
});

it.each(['fake-b', null])('blocks writes after switching to %s, including switching back', async id => {
  const t = setup();
  const watched = await watchQuestionAccount(t.client, t.changed, t.bind);
  t.emit(id); t.emit('fake-a');
  expect(watched.isCurrent()).toBe(false);
  await expect(watched.client.rpc('check_answer', args)).rejects.toThrow('account changed');
  expect(t.bind).not.toHaveBeenCalled();
  expect(t.changed).toHaveBeenCalledOnce();
  watched.dispose();
});

it('drops a late response and aborts its request on an account switch', async () => {
  const t = setup();
  let finish!: (value: { data: string; error: null }) => void;
  t.rpc.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const watched = await watchQuestionAccount(t.client, t.changed, t.bind);
  const pending = watched.client.rpc('check_answer', args);
  await vi.waitFor(() => expect(t.rpc).toHaveBeenCalledOnce());
  t.emit('fake-b');
  expect(t.bind.mock.calls[0]![1].aborted).toBe(true);
  finish({ data: 'sample feedback', error: null });
  await expect(pending).rejects.toThrow('account changed');
  watched.dispose();
});

it('observes an A -> B -> A switch during initial session loading', async () => {
  const t = setup();
  t.client.auth.getSession.mockImplementation(async () => {
    t.emit('fake-b'); t.emit('fake-a');
    return { data: { session: { access_token: 'fake-token-a', user: { id: 'fake-a' } } }, error: null };
  });
  const watched = await watchQuestionAccount(t.client, t.changed, t.bind);
  expect(watched.isCurrent()).toBe(false);
  expect(t.changed).toHaveBeenCalledOnce();
  watched.dispose();
});
