import { z } from "zod";

/**
 * Typed, validated app configuration.
 *
 * All external services are optional at runtime — the app degrades
 * gracefully when a credential is absent (analytics/monitoring no-op,
 * auth providers hide, purchases fall back to the RevenueCat Test Store
 * key only in development). Supabase is required for the app to be
 * useful, but a missing key produces a clear console error rather than
 * a crash so the project still boots in a fresh checkout.
 */
const envSchema = z.object({
  EXPO_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  EXPO_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20).optional(),
  EXPO_PUBLIC_REVENUECAT_IOS_KEY: z.string().min(1).optional(),
  EXPO_PUBLIC_REVENUECAT_ANDROID_KEY: z.string().min(1).optional(),
  EXPO_PUBLIC_POSTHOG_API_KEY: z.string().min(1).optional(),
  EXPO_PUBLIC_POSTHOG_HOST: z.string().url().optional(),
  EXPO_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: z.string().min(1).optional(),
  EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: z.string().min(1).optional(),
  /** Deterministic onboarding variant override for development/testing. */
  EXPO_PUBLIC_ONBOARDING_VARIANT_OVERRIDE: z
    .enum(["iam-founder", "iam-claude", "stella-founder", "stella-claude"])
    .optional(),
  /** Explicit opt-in for the development-only purchases mock. */
  EXPO_PUBLIC_DEV_MOCK_PURCHASES: z.enum(["true", "false"]).optional(),
});

const parsed = envSchema.safeParse({
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  EXPO_PUBLIC_REVENUECAT_IOS_KEY: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  EXPO_PUBLIC_REVENUECAT_ANDROID_KEY:
    process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
  EXPO_PUBLIC_POSTHOG_API_KEY: process.env.EXPO_PUBLIC_POSTHOG_API_KEY,
  EXPO_PUBLIC_POSTHOG_HOST: process.env.EXPO_PUBLIC_POSTHOG_HOST,
  EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID:
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID:
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  EXPO_PUBLIC_ONBOARDING_VARIANT_OVERRIDE:
    process.env.EXPO_PUBLIC_ONBOARDING_VARIANT_OVERRIDE,
  EXPO_PUBLIC_DEV_MOCK_PURCHASES: process.env.EXPO_PUBLIC_DEV_MOCK_PURCHASES,
});

if (!parsed.success) {
  // Invalid values are a configuration bug worth failing loudly over in
  // development, but production should never crash on config parsing.
  console.error(
    "[config] Invalid environment configuration:",
    parsed.error.flatten().fieldErrors,
  );
}

const env = parsed.success ? parsed.data : ({} as z.infer<typeof envSchema>);

export const config = {
  supabaseUrl: env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  revenueCatIosKey: env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  revenueCatAndroidKey: env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
  posthogApiKey: env.EXPO_PUBLIC_POSTHOG_API_KEY,
  posthogHost: env.EXPO_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com",
  sentryDsn: env.EXPO_PUBLIC_SENTRY_DSN,
  googleWebClientId: env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  googleIosClientId: env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  onboardingVariantOverride: env.EXPO_PUBLIC_ONBOARDING_VARIANT_OVERRIDE,
  devMockPurchases: __DEV__ && env.EXPO_PUBLIC_DEV_MOCK_PURCHASES === "true",
  hasSupabase: Boolean(
    env.EXPO_PUBLIC_SUPABASE_URL && env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  ),
  hasPosthog: Boolean(env.EXPO_PUBLIC_POSTHOG_API_KEY),
  hasSentry: Boolean(env.EXPO_PUBLIC_SENTRY_DSN),
  hasGoogleAuth: Boolean(env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID),
} as const;

export type AppConfig = typeof config;
