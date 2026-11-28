import { useEffect, useId, useRef, useState } from 'react';
import { cleanCallbackUrl } from './authcallback';
import { establishRecovery, type RecoveryAuth, type RecoveryResult } from './recovery';
import { AccountsUnavailable, authButton, PasswordField } from './SignIn.tsx';
import { changePassword, checkPassword, signInMessage } from './signin.ts';
import { getRecoveryAuth } from './recoveryclient';

export type { RecoveryAuth } from './recovery';

interface Props { auth?: RecoveryAuth | null }
type Recovery = RecoveryResult | { kind: 'checking' };

// Fail closed: the form opens only after this page exchanges a recovery code itself (recovery.ts).
// An omitted `auth` uses the shared client (Task 55); explicit null keeps accounts off.
export default function ResetPassword({ auth: suppliedAuth }: Props) {
  const id = useId();
  const [recovery, setRecovery] = useState<Recovery>(() => suppliedAuth === null ? { kind: 'unavailable' } : { kind: 'checking' });
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState<string>();
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(false);
  const started = useRef<Promise<RecoveryResult> | null>(null);
  const invalidated = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let active = true;
    // Strict Mode may run this twice: the single-use code is exchanged once per mounted island.
    if (!started.current) {
      const load = suppliedAuth !== undefined
        ? () => Promise.resolve(suppliedAuth)
        // Keep the auth object intact: its methods rely on their receiver.
        : () => getRecoveryAuth(() => !invalidated.current && mounted.current);
      started.current = establishRecovery(load, window.location.href).finally(() => {
        window.history.replaceState(window.history.state, '', cleanCallbackUrl(window.location.href));
      });
    }
    void started.current.then(result => { if (active) setRecovery(result); });
    return () => { active = false; };
  }, [suppliedAuth]);

  const auth = recovery.kind === 'ready' ? recovery.auth : null;
  useEffect(() => {
    if (recovery.kind !== 'ready' || done) return;
    const subscription = recovery.auth.onAuthStateChange((_event, session) => {
      if (session?.user?.id === recovery.userId) return;
      invalidated.current = true;
      setPassword('');
      setProblem(undefined);
      setMessage(signInMessage(busy.current ? 'recovery-interrupted' : 'recovery-changed'));
      setDone(false);
    }).data.subscription;
    return () => subscription.unsubscribe();
  }, [recovery, done]);

  const submit = async () => {
    if (!auth || busy.current || done || invalidated.current || recovery.kind !== 'ready') return;
    const error = checkPassword(password);
    setProblem(error ?? undefined);
    setMessage('');
    if (error) { form.current?.querySelector('input')?.focus(); return; }
    busy.current = true;
    setPending(true);
    const result = await changePassword(auth, recovery.userId, password, () => !invalidated.current && mounted.current);
    if (!mounted.current) return;
    setPassword('');
    if (!invalidated.current) {
      if (result.message === signInMessage('recovery-changed')) invalidated.current = true;
      setMessage(result.message);
      setDone(result.ok);
    }
    setPending(false);
    busy.current = false;
  };

  if (recovery.kind === 'checking') return <p role="status">checking your reset link…</p>;
  if (recovery.kind === 'unavailable') return <AccountsUnavailable />;
  if (recovery.kind === 'required') return <div>
    <p>{signInMessage('recovery-required')}</p>
    <a href="/signin?reset=1" className="mt-4 inline-flex min-h-12 items-center underline">request a reset link</a>
  </div>;
  return <div className="font-body leading-relaxed">
    <form ref={form} noValidate onSubmit={event => { event.preventDefault(); void submit(); }}>
      <PasswordField id={`${id}-password`} value={password} onChange={value => { setPassword(value); setProblem(undefined); }}
        fresh readOnly={pending || done || invalidated.current} problem={problem} />
      <button type="submit" aria-disabled={pending || done || invalidated.current}
        className={`${authButton} mt-6 bg-button text-on-button hover:bg-button-hover`}>
        {pending ? 'saving your password…' : done ? 'password changed' : 'save new password'}
      </button>
    </form>
    <p role="status" aria-atomic="true" className="mt-4">{message}</p>
    <a href={done ? '/progress' : '/signin?reset=1'} className="mt-4 inline-flex min-h-12 items-center underline">
      {done ? 'continue to your progress' : 'request a new reset link'}
    </a>
  </div>;
}
