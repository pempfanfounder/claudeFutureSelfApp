import PostHog from "posthog-react-native";

import { config } from "./config";

/**
 * Analytics abstraction over PostHog.
 *
 * - Safely no-ops when PostHog is not configured.
 * - Never send PII: no emails, tokens, life goals, custom affirmations,
 *   or raw free-text onboarding answers. Callers pass only enum-like
 *   values, counts, and ids.
 */
let posthog: PostHog | null = null;

export function initAnalytics(): PostHog | null {
  if (posthog) return posthog;
  if (!config.hasPosthog) return null;
  posthog = new PostHog(config.posthogApiKey!, {
    host: config.posthogHost,
    // Onboarding funnels depend on ordered events; flush reasonably often.
    flushAt: 10,
    flushInterval: 10_000,
  });
  return posthog;
}

export function getPosthog(): PostHog | null {
  return posthog;
}

type Properties = Record<string, string | number | boolean | null | undefined>;
type CleanProperties = Record<string, string | number | boolean | null>;

export const analytics = {
  /** Identify the user by their Supabase UUID only. Never email/name. */
  identify(userId: string, properties?: Properties) {
    posthog?.identify(userId, sanitize(properties));
  },
  capture(event: string, properties?: Properties) {
    posthog?.capture(event, sanitize(properties));
  },
  screen(name: string, properties?: Properties) {
    posthog?.screen(name, sanitize(properties));
  },
  reset() {
    posthog?.reset();
  },
  async flush() {
    await posthog?.flush().catch(() => {});
  },
};

const FORBIDDEN_KEY_PATTERN =
  /(email|token|password|goal|affirmation|answer|name|text)/i;

/**
 * Keys that match FORBIDDEN_KEY_PATTERN but carry enum-like option
 * slugs, not free text — the onboarding experiment is unreadable
 * without them. Values on these keys must still look like slugs.
 */
const SLUG_KEYS = new Set(["answer", "answered"]);

/** Option slugs and comma-joined multi-selects, e.g. `calm,focus`, `55+`. */
const SLUG_VALUE_PATTERN = /^[a-z0-9_+,-]+$/i;

/**
 * Defense in depth: strip properties whose keys suggest sensitive
 * content. The primary control is that call sites never pass free text,
 * but a misnamed property should fail closed, not leak.
 */
function sanitize(properties?: Properties): CleanProperties | undefined {
  if (!properties) return undefined;
  const out: CleanProperties = {};
  for (const [key, value] of Object.entries(properties)) {
    if (value === undefined) continue;
    if (FORBIDDEN_KEY_PATTERN.test(key)) {
      // Slug keys survive only while their value still looks like a slug,
      // so a future free-text step can never leak through them.
      if (!SLUG_KEYS.has(key)) continue;
      if (typeof value === "string" && !SLUG_VALUE_PATTERN.test(value))
        continue;
    }
    if (typeof value === "string" && value.length > 120) continue;
    out[key] = value;
  }
  return out;
}
