import * as Sentry from "@sentry/react-native";

import { config } from "./config";

/**
 * Monitoring abstraction over Sentry.
 *
 * - Safely no-ops when no DSN is configured.
 * - Scrubs request/user data so no emails, tokens, or user-entered text
 *   leave the device in crash reports.
 */
let initialized = false;

export function initMonitoring() {
  if (initialized || !config.hasSentry) return;
  initialized = true;
  Sentry.init({
    dsn: config.sentryDsn,
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
    beforeSend(event) {
      // Never attach user identifiers beyond the anonymous Sentry id.
      if (event.user) {
        event.user = { id: event.user.id };
      }
      return event;
    },
  });
}

export const monitoring = {
  /** Attach the Supabase UUID (only) so crashes can be correlated. */
  setUser(userId: string | null) {
    if (!initialized) return;
    Sentry.setUser(userId ? { id: userId } : null);
  },
  captureError(error: unknown, context?: Record<string, string | number | boolean>) {
    if (!initialized) {
      if (__DEV__) console.error("[monitoring]", error, context);
      return;
    }
    Sentry.captureException(error, context ? { extra: context } : undefined);
  },
  addBreadcrumb(message: string, category?: string) {
    if (!initialized) return;
    Sentry.addBreadcrumb({ message, category });
  },
};

/** Wraps the root component with Sentry instrumentation when enabled. */
export function withMonitoring<C extends React.ComponentType<Record<string, unknown>>>(
  component: C,
): C {
  if (!config.hasSentry) return component;
  initMonitoring();
  return Sentry.wrap(component) as C;
}
