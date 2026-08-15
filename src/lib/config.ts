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
  /** RevenueCat entitlement identifier. Defaults to "premium". */
  EXPO_PUBLIC_RC_ENTITLEMENT_ID: z.string().min(1).optional(),
  /**
   * Opt-in to presenting RevenueCat's remote Paywall on the standalone
   * hard gate (`src/app/paywall.tsx`) instead of the custom gate paywall.
   * Never affects the in-onboarding variant paywalls.
   */
  EXPO_PUBLIC_USE_RC_PAYWALL_GATE: z.enum(["true", "false"]).optional(),
  /**
   * Deliberately permit a RevenueCat Test Store key (`test_…`) in a
   * release-configuration build. Off by default: Test Store keys have no
   * billing power and RevenueCat forbids shipping one to a store, so the
   * default is to refuse and keep the paywall closed.
   */
  EXPO_PUBLIC_ALLOW_TEST_STORE: z.enum(["true", "false"]).optional(),
  /**
   * Force RevenueCat's verbose SDK logging on in a release-configuration
   * build. Off by default so production never logs purchase internals;
   * turn it on for a preview/TestFlight build you are debugging.
   */
  EXPO_PUBLIC_RC_DEBUG_LOGS: z.enum(["true", "false"]).optional(),
  /**
   * Unlock the app without a purchase in a release-configuration build.
   *
   * This is a TESTING ESCAPE HATCH for internal builds only, so the rest
   * of the app can be exercised while the store catalogue is still being
   * configured. A build with this on grants premium to anyone who installs
   * it and must never be submitted to a store — `src/__tests__/buildConfig.test.ts`
   * fails if it ever appears in the `production` EAS profile.
   */
  EXPO_PUBLIC_BYPASS_PAYWALL: z.enum(["true", "false"]).optional(),
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
  EXPO_PUBLIC_RC_ENTITLEMENT_ID: process.env.EXPO_PUBLIC_RC_ENTITLEMENT_ID,
  EXPO_PUBLIC_USE_RC_PAYWALL_GATE: process.env.EXPO_PUBLIC_USE_RC_PAYWALL_GATE,
  EXPO_PUBLIC_ALLOW_TEST_STORE: process.env.EXPO_PUBLIC_ALLOW_TEST_STORE,
  EXPO_PUBLIC_RC_DEBUG_LOGS: process.env.EXPO_PUBLIC_RC_DEBUG_LOGS,
  EXPO_PUBLIC_BYPASS_PAYWALL: process.env.EXPO_PUBLIC_BYPASS_PAYWALL,
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

/** Release-build paywall bypass. See EXPO_PUBLIC_BYPASS_PAYWALL above. */
const bypassPaywall = env.EXPO_PUBLIC_BYPASS_PAYWALL === "true";

if (bypassPaywall) {
  console.error(
    "[config] PAYWALL BYPASS IS ACTIVE. Premium is granted without a purchase. " +
      "This build is for internal testing only and must never be submitted to a store.",
  );
}

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
  /**
   * Purchases are simulated: either the dev-only mock, or the explicit
   * release-build bypass. Nothing here talks to a real store.
   */
  mockPurchases:
    (__DEV__ && env.EXPO_PUBLIC_DEV_MOCK_PURCHASES === "true") || bypassPaywall,
  bypassPaywall,
  rcEntitlementId: env.EXPO_PUBLIC_RC_ENTITLEMENT_ID ?? "premium",
  useRcPaywallGate: env.EXPO_PUBLIC_USE_RC_PAYWALL_GATE === "true",
  allowTestStore: env.EXPO_PUBLIC_ALLOW_TEST_STORE === "true",
  rcDebugLogs: env.EXPO_PUBLIC_RC_DEBUG_LOGS === "true" || bypassPaywall,
  hasSupabase: Boolean(
    env.EXPO_PUBLIC_SUPABASE_URL && env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  ),
  hasPosthog: Boolean(env.EXPO_PUBLIC_POSTHOG_API_KEY),
  hasSentry: Boolean(env.EXPO_PUBLIC_SENTRY_DSN),
  hasGoogleAuth: Boolean(env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID),
} as const;

export type AppConfig = typeof config;
