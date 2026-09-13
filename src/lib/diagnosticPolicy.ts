// Finite vocabularies only. A harmless-looking key cannot carry private text.
const EVENTS = new Set([
  "onboarding_started",
  "onboarding_answered",
  "onboarding_skipped",
  "onboarding_completed",
  "paywall_viewed",
  "paywall_dismissed",
  "restore_tapped",
  "purchase_completed",
  "restore_completed",
  "auth_linked",
  "auth_signed_in",
  "signed_out",
  "account_saved_from_settings",
  "favorite_added",
  "favorite_removed",
  "content_viewed",
  "content_shared",
  "streak_completed",
  "deep_link_opened",
  "notification_prefs_changed",
  "theme_changed",
  "app_icon_changed",
  "widget_pinned_updated",
]);
const ENUMS: Record<string, readonly string[]> = {
  variant: ["iam-founder", "iam-claude", "stella-founder", "stella-claude"],
  assignment_source: [
    "persisted",
    "override",
    "posthog",
    "local-fallback",
    "selected-default",
  ],
  provider: ["apple", "google", "email"],
  content_type: ["quote", "affirmation"],
  kind: ["quote", "affirmation", "unknown"],
  style: ["note", "timeline"],
  placement: ["onboarding", "gate", "paywall"],
  voice: ["founder", "claude"],
  theme: [
    "minimal_sand",
    "soft_bloom",
    "ocean_clarity",
    "midnight_focus",
    "ink_well",
    "sunrise_momentum",
    "golden_success",
    "evergreen",
    "terracotta",
    "arctic",
  ],
  icon: [
    "MinimalSand",
    "SoftBloom",
    "OceanClarity",
    "MidnightFocus",
    "InkWell",
    "SunriseMomentum",
    "GoldenSuccess",
    "Evergreen",
    "Terracotta",
    "Arctic",
  ],
};
const COUNTS = new Set([
  "quotes_per_day",
  "affirmations_per_day",
  "viewed_count",
  "streak",
]);
const BOOLEANS = new Set(["premium", "is_anonymous", "streak_reminder"]);
const AREAS = new Set([
  "app.render",
  "appIcon.apply",
  "feed.sync",
  "feed.load",
  "widgets.sync",
  "widgets.clear",
  "push.getToken",
  "auth.bootstrap",
  "auth.googleInit",
  "auth.apple",
  "auth.linkApple",
  "auth.linkGoogle",
  "auth.google",
  "auth.emailStart",
  "auth.signInApple",
  "auth.signInGoogle",
  "auth.signOut",
  "auth.deleteAccount",
  "auth.appleRevoke",
  "purchases.configure",
  "purchases.refresh",
  "purchases.sync",
  "purchases.transaction",
  "onboarding.complete",
  "onboarding.reconcile",
  "settings.notificationPrefs",
  "settings.customerCenter",
]);
export const isDiagnosticEvent = (value: string) => EVENTS.has(value);
export function diagnosticProperties(
  properties?: Record<string, unknown>,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(properties ?? {})) {
    if (
      typeof value === "string" &&
      Object.prototype.hasOwnProperty.call(ENUMS, key) &&
      ENUMS[key].includes(value)
    )
      out[key] = value;
    else if (
      typeof value === "number" &&
      Number.isInteger(value) &&
      value >= 0 &&
      value <= 10000 &&
      COUNTS.has(key)
    )
      out[key] = value;
    else if (typeof value === "boolean" && BOOLEANS.has(key)) out[key] = value;
  }
  return out;
}
export function diagnosticArea(value: unknown): string {
  return typeof value === "string" && AREAS.has(value) ? value : "app.unknown";
}
/** Reconstruct, never spread raw SDK errors, requests, contexts or stack vars. */
export function scrubCrashEvent(event: Record<string, unknown>) {
  const tags = event.tags as Record<string, unknown> | undefined;
  return {
    type: undefined,
    environment: ["development", "staging", "production"].includes(
      String(event.environment),
    )
      ? String(event.environment)
      : undefined,
    event_id:
      typeof event.event_id === "string" &&
      /^[a-f0-9]{32}$/i.test(event.event_id)
        ? event.event_id
        : undefined,
    timestamp:
      typeof event.timestamp === "number" &&
      Number.isFinite(event.timestamp) &&
      event.timestamp > 0 &&
      event.timestamp < 1e11
        ? event.timestamp
        : undefined,
    level: "error" as const,
    platform: "javascript",
    tags: { area: diagnosticArea(tags?.area) },
    exception: {
      values: [
        { type: "ApplicationError", value: "Application operation failed" },
      ],
    },
  };
}
