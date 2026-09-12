import AsyncStorage from "@react-native-async-storage/async-storage";
import PostHog from "posthog-react-native";
import { config } from "./config";
import { diagnosticProperties, isDiagnosticEvent } from "./diagnosticPolicy";
let posthog: PostHog | null = null;
export function initAnalytics(): PostHog | null {
  if (posthog) return posthog;
  if (!config.hasPosthog) return null;
  posthog = new PostHog(config.posthogApiKey!, {
    host: config.posthogHost,
    // Start a fresh anonymous identity and abandon pre-repair queued delivery.
    // Preserve old diagnostics storage without loading, copying or deleting it.
    customStorage: {
      getItem: (key) => AsyncStorage.getItem(`fs.diagnostics.v3.${key}`),
      setItem: (key, value) =>
        AsyncStorage.setItem(`fs.diagnostics.v3.${key}`, value),
    },
    flushAt: 10,
    flushInterval: 10000,
    captureAppLifecycleEvents: false,
    enableSessionReplay: false,
    disableGeoip: true,
    personProfiles: "never",
    preloadFeatureFlags: false,
    disableRemoteFeatureFlags: true,
    before_send: (event) => {
      if (!event || !isDiagnosticEvent(event.event)) return null;
      const properties: Record<string, string | number | boolean> =
        diagnosticProperties(event.properties);
      // SDK processing controls must survive scrubbing, regardless of caller input.
      properties.$geoip_disable = true;
      properties.$process_person_profile = false;
      // The SDK project token is transport metadata, never a caller property.
      if (
        config.posthogApiKey &&
        event.properties?.token === config.posthogApiKey
      )
        properties.token = config.posthogApiKey;
      return {
        event: event.event,
        uuid: event.uuid,
        timestamp: event.timestamp,
        properties,
      };
    },
  });
  return posthog;
}
export function getPosthog() {
  return posthog;
}
type Properties = Record<string, string | number | boolean | null | undefined>;
export const analytics = {
  // Keep anonymous installation analytics; do not create person profiles or
  // transfer arbitrary user properties into automatic SDK identity events.
  identify(_userId: string, _properties?: Properties) {},
  capture(event: string, properties?: Properties) {
    if (isDiagnosticEvent(event))
      posthog?.capture(event, diagnosticProperties(properties));
  },
  screen(_name: string, _properties?: Properties) {},
  reset() {
    posthog?.reset();
  },
  async flush() {
    await posthog?.flush().catch(() => {});
  },
};
