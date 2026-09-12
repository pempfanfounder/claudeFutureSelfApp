import * as Sentry from "@sentry/react-native";
import { config } from "./config";
import { diagnosticArea, scrubCrashEvent } from "./diagnosticPolicy";
let initialized = false;
export function initMonitoring() {
  if (initialized || !config.hasSentry) return;
  initialized = true;
  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.appEnvironment,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    enableNative: false,
    enableNativeCrashHandling: false,
    enableAutoSessionTracking: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    defaultIntegrations: false,
    beforeSend: (event, hint) => {
      hint.attachments = [];
      return scrubCrashEvent(event as unknown as Record<string, unknown>);
    },
    beforeBreadcrumb: () => null,
  });
}
export const monitoring = {
  setUser(_userId: string | null) {
    if (initialized) Sentry.setUser(null);
  },
  captureError(
    _error: unknown,
    context?: Record<string, string | number | boolean>,
  ) {
    const area = diagnosticArea(context?.area);
    if (!initialized) {
      if (__DEV__) console.error("[monitoring]", area);
      return;
    }
    Sentry.captureException(new Error("Application operation failed"), {
      tags: { area },
    });
  },
  addBreadcrumb(_message: string, _category?: string) {},
};
export function withMonitoring<
  C extends React.ComponentType<Record<string, unknown>>,
>(component: C): C {
  // Explicit sanitized diagnostics only; automatic render/native breadcrumbs
  // and tracing would bypass the finite event vocabulary.
  return component;
}
