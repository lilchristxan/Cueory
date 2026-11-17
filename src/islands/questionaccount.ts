import type { PublishedClient } from './publishedquestions';
import type { AnswerTransport } from './checkanswer';
import { supabaseSettings } from './supabaseenv';

export interface QuestionAccountClient extends PublishedClient {
  auth: {
    getSession(): Promise<{ data: { session: { access_token?: string; user: { id: string } } | null }; error: unknown }>;
    onAuthStateChange(callback: (event: string, session: { user?: { id?: string } } | null) => void): {
      data: { subscription: { unsubscribe(): void } };
    };
  };
}
export interface QuestionAccount {
  client: PublishedClient;
  isCurrent(): boolean;
  dispose(): void;
}

/** Watch before the first await, and never reactivate a player after A -> B -> A. */
export async function watchQuestionAccount(client: QuestionAccountClient, changed: () => void,
  makeTransport = boundTransport): Promise<QuestionAccount> {
  let active = true;
  let owner: string | null | undefined;
  const changes: (string | null)[] = [];
  const controller = new AbortController();
  const invalidate = () => {
    if (!active) return;
    active = false;
    controller.abort();
    changed();
  };
  const subscription = client.auth.onAuthStateChange((event, session) => {
    const id = session?.user?.id ?? null;
    if (owner === undefined) {
      if (event !== 'INITIAL_SESSION') changes.push(id);
    } else if (id !== owner) invalidate();
  }).data.subscription;
  try {
    const { data, error } = await client.auth.getSession();
    if (error) throw new Error('session unavailable');
    owner = data.session?.user.id ?? null;
    if (changes.some(id => id !== owner)) invalidate();
    const token = data.session?.access_token;
    // Public reads keep their existing client. Only the answer write gets a fixed authorization token.
    let transport: AnswerTransport | undefined;
    const scoped: PublishedClient = {
      auth: client.auth,
      from: table => client.from(table),
      async rpc(name, args) {
        if (!active || !token) throw new Error('account changed');
        transport ??= await makeTransport(token, controller.signal);
        if (!active) throw new Error('account changed');
        const result = await transport.rpc(name, args);
        if (!active) throw new Error('account changed');
        return result;
      },
    };
    return { client: scoped, isCurrent: () => active, dispose() { active = false; controller.abort(); subscription.unsubscribe(); } };
  } catch (error) {
    active = false;
    controller.abort();
    subscription.unsubscribe();
    throw error;
  }
}

async function boundTransport(token: string, signal: AbortSignal): Promise<AnswerTransport> {
  const settings = supabaseSettings({
    PUBLIC_SUPABASE_URL: import.meta.env.PUBLIC_SUPABASE_URL,
    PUBLIC_SUPABASE_PUBLISHABLE_KEY: import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  if (!settings.enabled) throw new Error('accounts unavailable');
  const { createClient } = await import('@supabase/supabase-js');
  // Explicit authorization prevents a later SDK session read from attributing A's answer to B.
  // https://supabase.com/docs/reference/javascript/initializing (global.headers)
  const scoped = createClient(settings.url, settings.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  return { rpc: (name, args) => scoped.rpc(name, args).abortSignal(signal) };
}
