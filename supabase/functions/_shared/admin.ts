import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

/**
 * Service-role client. Bypasses RLS — server-side use only, never expose
 * results to a caller without an explicit ownership check.
 */
export function createAdminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
