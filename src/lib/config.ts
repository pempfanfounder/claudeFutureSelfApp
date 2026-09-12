import { Platform } from "react-native";
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
  EXPO_PUBLIC_APP_ENV: z
    .enum(["development", "staging", "production"])
    .optional(),
  EXPO_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  EXPO_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20).optional(),
  EXPO_PUBLIC_REVENUECAT_IOS_KEY: z.string().min(1).optional(),
  EXPO_PUBLIC_REVENUECAT_ANDROID_KEY: z.string().min(1).optional(),
  EXPO_PUBLIC_POSTHOG_API_KEY: z.string().min(1).optional(),
  EXPO_PUBLIC_POSTHOG_HOST: z.string().url().optional(),
  EXPO_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: z.string().min(1).optional(),
  EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: z.string().min(1).optional(),
  /**
   * Sends a Cloudflare Turnstile token with the first-launch anonymous
   * sign-in. Off by default: turn it on only together with Supabase
   * Auth → Attack Protection → CAPTCHA (Turnstile) and the site key below,
   * otherwise every fresh install fails to sign in (see
   * docs/SETUP_REQUIRED.md § Anonymous sign-in CAPTCHA).
   */
  EXPO_PUBLIC_AUTH_CAPTCHA_ENABLED: z.enum(["true", "false"]).optional(),
  /** Turnstile *site* key (public). The secret key lives only in Supabase. */
  EXPO_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1).optional(),
  /**
   * Origin the Turnstile widget is rendered under inside the WebView; it
   * must be one of the widget's allowed hostnames in Cloudflare. Defaults
   * to the app's public website.
   */
  EXPO_PUBLIC_TURNSTILE_BASE_URL: z.string().url().optional(),
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
   * Shows email (OTP) sign-in in the auth sheets. Off by default:
   * with Supabase's built-in SMTP, OTP mail only reaches project team
   * members, so the flow would silently fail for real users until
   * custom SMTP is configured.
   */
  EXPO_PUBLIC_EMAIL_AUTH_ENABLED: z.enum(["true", "false"]).optional(),
});

const parsed = envSchema.safeParse({
  EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
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
  EXPO_PUBLIC_AUTH_CAPTCHA_ENABLED:
    process.env.EXPO_PUBLIC_AUTH_CAPTCHA_ENABLED,
  EXPO_PUBLIC_TURNSTILE_SITE_KEY: process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY,
  EXPO_PUBLIC_TURNSTILE_BASE_URL: process.env.EXPO_PUBLIC_TURNSTILE_BASE_URL,
  EXPO_PUBLIC_ONBOARDING_VARIANT_OVERRIDE:
    process.env.EXPO_PUBLIC_ONBOARDING_VARIANT_OVERRIDE,
  EXPO_PUBLIC_DEV_MOCK_PURCHASES: process.env.EXPO_PUBLIC_DEV_MOCK_PURCHASES,
  EXPO_PUBLIC_RC_ENTITLEMENT_ID: process.env.EXPO_PUBLIC_RC_ENTITLEMENT_ID,
  EXPO_PUBLIC_USE_RC_PAYWALL_GATE: process.env.EXPO_PUBLIC_USE_RC_PAYWALL_GATE,
  EXPO_PUBLIC_EMAIL_AUTH_ENABLED: process.env.EXPO_PUBLIC_EMAIL_AUTH_ENABLED,
});

if (!parsed.success) {
  // Invalid values are a configuration bug worth failing loudly over in
  // development, but production should never crash on config parsing.
  console.error("[config] Invalid environment configuration.");
}

const env = parsed.success ? parsed.data : ({} as z.infer<typeof envSchema>);

/** Staging Simulator builds may mock the store; production never can. */
export function resolveDevMockPurchases(options: {
  enabled?: string;
  appEnvironment?: string;
  isDev: boolean;
}): boolean {
  if (options.enabled !== "true") return false;
  if (options.appEnvironment === "production") return false;
  if (
    options.appEnvironment === "staging" ||
    options.appEnvironment === "development"
  )
    return true;
  return options.isDev;
}

/**
 * The CAPTCHA is only armed when the flag is on AND a site key exists; a
 * flag without a key would otherwise break every first launch.
 */
export function resolveAuthCaptcha(options: {
  enabled?: string;
  siteKey?: string;
  baseUrl?: string;
}): { enabled: boolean; siteKey?: string; baseUrl: string } {
  const enabled = options.enabled === "true" && Boolean(options.siteKey);
  if (options.enabled === "true" && !options.siteKey)
    console.error(
      "[config] EXPO_PUBLIC_AUTH_CAPTCHA_ENABLED is true but EXPO_PUBLIC_TURNSTILE_SITE_KEY is missing; captcha stays off.",
    );
  return {
    enabled,
    siteKey: enabled ? options.siteKey : undefined,
    baseUrl: options.baseUrl ?? "https://joinfutureself.com",
  };
}

const authCaptcha = resolveAuthCaptcha({
  enabled: env.EXPO_PUBLIC_AUTH_CAPTCHA_ENABLED,
  siteKey: env.EXPO_PUBLIC_TURNSTILE_SITE_KEY,
  baseUrl: env.EXPO_PUBLIC_TURNSTILE_BASE_URL,
});

export const config = {
  appEnvironment:
    env.EXPO_PUBLIC_APP_ENV ?? (__DEV__ ? "development" : "production"),
  supabaseUrl: env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  revenueCatIosKey: env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  revenueCatAndroidKey: env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
  posthogApiKey: env.EXPO_PUBLIC_POSTHOG_API_KEY,
  posthogHost: env.EXPO_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com",
  sentryDsn: env.EXPO_PUBLIC_SENTRY_DSN,
  googleWebClientId: env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  googleIosClientId: env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  authCaptchaEnabled: authCaptcha.enabled,
  turnstileSiteKey: authCaptcha.siteKey,
  turnstileBaseUrl: authCaptcha.baseUrl,
  onboardingVariantOverride: env.EXPO_PUBLIC_ONBOARDING_VARIANT_OVERRIDE,
  devMockPurchases: resolveDevMockPurchases({
    enabled: env.EXPO_PUBLIC_DEV_MOCK_PURCHASES,
    appEnvironment: env.EXPO_PUBLIC_APP_ENV,
    isDev: __DEV__,
  }),
  rcEntitlementId: env.EXPO_PUBLIC_RC_ENTITLEMENT_ID ?? "premium",
  useRcPaywallGate: env.EXPO_PUBLIC_USE_RC_PAYWALL_GATE === "true",
  emailAuthEnabled: env.EXPO_PUBLIC_EMAIL_AUTH_ENABLED === "true",
  hasSupabase: Boolean(
    env.EXPO_PUBLIC_SUPABASE_URL && env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  ),
  hasPosthog: Boolean(env.EXPO_PUBLIC_POSTHOG_API_KEY),
  hasSentry: Boolean(env.EXPO_PUBLIC_SENTRY_DSN),
  hasGoogleAuth: Boolean(
    env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID &&
    (Platform.OS !== "ios" || env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID),
  ),
} as const;

export type AppConfig = typeof config;
