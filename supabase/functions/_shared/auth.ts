import { createClient, type User } from 'npm:@supabase/supabase-js@2';
import { json } from './http.ts';

/**
 * Gate for cron-invoked functions (push-dispatch, push-receipts).
 * pg_cron -> pg_net sends x-dispatch-secret, which must match the
 * DISPATCH_SECRET function secret. Returns a 401 Response to short-circuit
 * with, or null when the caller is authorized.
 */
export function requireDispatchSecret(req: Request): Response | null {
  const expected = Deno.env.get('DISPATCH_SECRET');
  const provided = req.headers.get('x-dispatch-secret');
  if (!expected || !provided || !timingSafeEqual(provided, expected)) {
    return json({ error: 'unauthorized' }, 401);
  }
  return null;
}

function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

/**
 * Resolves the calling user from the request's Authorization JWT using an
 * anon-key client, so the token is validated server-side rather than trusted.
 */
export async function getUserFromRequest(req: Request): Promise<User | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;

  const client = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const { data, error } = await client.auth.getUser();
  if (error || !data?.user) return null;
  return data.user;
}
