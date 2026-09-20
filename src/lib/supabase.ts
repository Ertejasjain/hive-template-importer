import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * All database access in this app happens on the server, so there is one client
 * and it is created lazily. If a service role key is configured it is used
 * (it bypasses RLS and never reaches the browser); otherwise the anon key is
 * used, which works because the schema ships with permissive anon policies.
 * See NOTES.md for why there is no per-user auth in this build.
 */
let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      'Supabase is not configured. Copy .env.example to .env.local and fill in NEXT_PUBLIC_SUPABASE_URL and a key (see README).',
    );
  }

  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}
