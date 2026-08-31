import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Browser-side Supabase client.
 *
 * Deliberately the plain `supabase-js` client rather than `@supabase/ssr`:
 * every page in this app is a client component ('use client'), so there is no
 * server-rendered session to hydrate. Sessions live in localStorage and are
 * refreshed by the SDK. The trade-off is that route protection is client-side
 * only - see AuthGate. That is fine here because Row Level Security, not the
 * login screen, is what actually keeps one user's panels away from another.
 *
 * Supabase is mid-migration between two key formats. Projects created recently
 * hand you a publishable key (sb_publishable_...); older ones hand you an anon
 * key (a JWT). Both work and both are safe to ship in a browser bundle - RLS is
 * what gates access, not secrecy. Either env var name is accepted below, so it
 * doesn't matter which one your dashboard gave you.
 *
 * The client is built lazily rather than at module scope. Next.js prerenders
 * even 'use client' pages during `next build`, so a throw at import time would
 * fail the build on any machine without .env.local configured - including CI.
 * Deferring means the error arrives when Supabase is actually used, names the
 * missing variable, and does not take the build down with it.
 */

let client: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
     process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
}

export function getSupabase(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      'Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and ' +
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) ' +
      'to frontend/.env.local, then restart `npm run dev` - Next.js only reads ' +
      'env files at startup, so editing one while the server runs changes nothing.'
    );
  }

  client = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true, // needed for magic-link and OAuth redirects
    },
  });
  return client;
}

/**
 * Proxy so callers keep writing `supabase.from(...)` while construction stays
 * deferred to first use.
 */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getSupabase() as object, prop, receiver);
  },
});
