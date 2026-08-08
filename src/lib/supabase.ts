import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { config } from "./config";
import type { Database } from "./database.types";

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
  client = createClient<Database>(config.supabaseUrl!, config.supabaseAnonKey!, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
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
