import type { RecoveryAuth } from './recovery';
import { getSupabase } from './supabaseclient';
import { supabaseSettings } from './supabaseenv';

type Tokens = { access_token: string; refresh_token: string };
interface PrivateAuth {
  setSession(tokens: Tokens): Promise<{ data: { user: { id: string } | null }; error: unknown }>;
  updateUser(attributes: { password: string }): Promise<{ error: { status?: number } | null }>;
}

/** Keep the write bound to the exchanged session, even if the shared client's SDK queue waits across a switch. */
export function bindRecoveryClient(auth: RecoveryAuth, isolate: () => Promise<PrivateAuth>, canWrite: () => boolean = () => true): RecoveryAuth {
  let recovered: { tokens: Tokens; userId: string } | null = null;
  return {
    getSession: () => auth.getSession(),
    onAuthStateChange: callback => auth.onAuthStateChange(callback),
    async exchangeCodeForSession(code) {
      recovered = null;
      const result = await auth.exchangeCodeForSession(code);
      const session = (result.data as { session?: Partial<Tokens> & { user?: { id?: string } } } | null)?.session;
      if (!result.error && session?.access_token && session.refresh_token && session.user?.id) {
        recovered = { tokens: { access_token: session.access_token, refresh_token: session.refresh_token }, userId: session.user.id };
      }
      return result;
    },
    async updateUser(attributes) {
      const snapshot = recovered;
      if (!snapshot || !canWrite()) return { error: { status: 401 } };
      const privateAuth = await isolate();
      if (!canWrite()) return { error: { status: 401 } };
      const { data, error } = await privateAuth.setSession(snapshot.tokens);
      if (!canWrite() || error || data.user?.id !== snapshot.userId) return { error: { status: 401 } };
      // The private client never reads/writes cueory-auth or receives cross-tab account changes.
      return privateAuth.updateUser(attributes);
    },
  };
}

export async function getRecoveryAuth(canWrite: () => boolean): Promise<RecoveryAuth | null> {
  const client = await getSupabase();
  if (!client) return null;
  return bindRecoveryClient(client.auth, async () => {
    const settings = supabaseSettings({
      PUBLIC_SUPABASE_URL: import.meta.env.PUBLIC_SUPABASE_URL,
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    });
    if (!settings.enabled) throw new Error('accounts unavailable');
    const { AuthClient } = await import('@supabase/supabase-js');
    // https://supabase.com/docs/reference/javascript/initializing
    // https://supabase.com/docs/reference/javascript/auth-setsession
    return new AuthClient({
      url: `${settings.url}/auth/v1`,
      headers: { apikey: settings.key },
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    });
  }, canWrite);
}
