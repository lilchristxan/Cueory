import { expect, it, vi } from 'vitest';
import { bindRecoveryClient } from '../../src/islands/recoveryclient';
import type { RecoveryAuth } from '../../src/islands/recovery';

function setup(canWrite: () => boolean = () => true) {
  const tokens = { access_token: 'fake-access-a', refresh_token: 'fake-refresh-a' };
  const shared: RecoveryAuth = {
    exchangeCodeForSession: vi.fn(async () => ({ data: { session: { ...tokens, user: { id: 'fake-a' } } }, error: null })),
    getSession: vi.fn(async () => ({ data: { session: { user: { id: 'fake-b' } } }, error: null })),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    updateUser: vi.fn(),
  };
  const privateAuth = {
    setSession: vi.fn(async () => ({ data: { user: { id: 'fake-a' } }, error: null as unknown })),
    updateUser: vi.fn(async () => ({ error: null })),
  };
  return { tokens, shared, privateAuth, auth: bindRecoveryClient(shared, async () => privateAuth, canWrite) };
}

it('writes with the recovery tokens even when the shared client is now B', async () => {
  const { auth, shared, tokens, privateAuth } = setup();
  await auth.exchangeCodeForSession('fake-code');
  expect((await auth.getSession()).data.session?.user.id).toBe('fake-b');
  await auth.updateUser({ password: 'fake-new-password' });
  expect(privateAuth.setSession).toHaveBeenCalledExactlyOnceWith(tokens);
  expect(privateAuth.updateUser).toHaveBeenCalledExactlyOnceWith({ password: 'fake-new-password' });
  expect(shared.updateUser).not.toHaveBeenCalled();
});

it('never writes without an exchanged session', async () => {
  const { auth, privateAuth } = setup();
  expect((await auth.updateUser({ password: 'fake-new-password' })).error).not.toBeNull();
  expect(privateAuth.updateUser).not.toHaveBeenCalled();
});

it.each(['wrong-user', 'error'])('refuses private session establishment: %s', async kind => {
  const { auth, privateAuth } = setup();
  await auth.exchangeCodeForSession('fake-code');
  privateAuth.setSession.mockResolvedValue({ data: { user: { id: kind === 'wrong-user' ? 'fake-b' : 'fake-a' } }, error: kind === 'error' ? {} : null });
  expect((await auth.updateUser({ password: 'fake-new-password' })).error).not.toBeNull();
  expect(privateAuth.updateUser).not.toHaveBeenCalled();
});

it('cancels when the account changes while the private session is being established', async () => {
  let current = true;
  const { auth, privateAuth } = setup(() => current);
  await auth.exchangeCodeForSession('fake-code');
  privateAuth.setSession.mockImplementation(async () => {
    current = false;
    return { data: { user: { id: 'fake-a' } }, error: null };
  });
  expect((await auth.updateUser({ password: 'fake-new-password' })).error).not.toBeNull();
  expect(privateAuth.updateUser).not.toHaveBeenCalled();
});
