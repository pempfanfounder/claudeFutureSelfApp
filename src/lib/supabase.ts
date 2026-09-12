import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { config } from "./config";
import type { Database } from "./database.types";
import { assertCurrentIdentity, type Identity } from "./appState";

let client: SupabaseClient<Database> | null = null;

/**
 * Returns the shared Supabase client, or null when Supabase is not
 * configured (fresh checkout without .env). Callers must handle null —
 * user-facing features surface a friendly "not configured" state in
 * development builds.
 */
export function getSupabase(): SupabaseClient<Database> | null {
  if (client) return client;
  if (!config.hasSupabase) return null;
  client = createClient<Database>(
    config.supabaseUrl!,
    config.supabaseAnonKey!,
    {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    },
  );
  return client;
}

/** Like getSupabase, but throws for flows that cannot proceed without it. */
export function requireSupabase(): SupabaseClient<Database> {
  const c = getSupabase();
  if (!c) {
    throw new Error(
      "Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
  return c;
}

/** Bind each request to the captured session, even if shared auth changes
 * while the SDK is awaiting its token. Tokens stay in memory only. */
export async function getIdentitySupabase(
  identity: Identity,
): Promise<SupabaseClient<Database> | null> {
  assertCurrentIdentity(identity);
  const shared = getSupabase();
  if (!shared) return null;
  const { data, error } = await shared.auth.getSession();
  assertCurrentIdentity(identity);
  if (error || data.session?.user.id !== identity.userId)
    throw new Error("Sign in again to continue.");
  const token = data.session.access_token;
  return createClient<Database>(config.supabaseUrl!, config.supabaseAnonKey!, {
    accessToken: async () => {
      assertCurrentIdentity(identity);
      return token;
    },
    global: {
      fetch: async (input, init) => {
        assertCurrentIdentity(identity);
        const controller = new AbortController();
        const abort = () => controller.abort();
        if (init?.signal?.aborted) controller.abort();
        init?.signal?.addEventListener("abort", abort);
        const timer = setTimeout(abort, 10_000);
        try {
          return await fetch(input, { ...init, signal: controller.signal });
        } finally {
          clearTimeout(timer);
          init?.signal?.removeEventListener("abort", abort);
        }
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
