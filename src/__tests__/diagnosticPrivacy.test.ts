import AsyncStorage from "@react-native-async-storage/async-storage";
import { initAnalytics, analytics } from "@/lib/analytics";
import { diagnosticProperties } from "@/lib/diagnosticPolicy";
import { initMonitoring, monitoring } from "@/lib/monitoring";
import * as Sentry from "@sentry/react-native";
import PostHog from "posthog-react-native";
jest.mock("@/lib/config", () => ({
  config: {
    hasPosthog: true,
    posthogApiKey: "synthetic-project-key",
    posthogHost: "http://synthetic.invalid",
    hasSentry: true,
    sentryDsn: "http://synthetic.invalid",
  },
}));
jest.mock("posthog-react-native", () =>
  jest.fn().mockImplementation(() => ({
    capture: jest.fn(),
    identify: jest.fn(),
    screen: jest.fn(),
    reset: jest.fn(),
  })),
);
jest.mock("@sentry/react-native", () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  setUser: jest.fn(),
  addBreadcrumb: jest.fn(),
  wrap: (x: unknown) => x,
}));
const canary = "CANARY_EMAIL_PERSONAL_WORDS_TOKEN";
describe.each(["constructor", "__proto__", "toString", "hasOwnProperty"])(
  "own prototype-named property %s",
  (key) => {
    const valid = {
      content_type: "quote",
      viewed_count: 3,
      premium: true,
      is_anonymous: false,
    };
    const properties = { ...valid, unknown: canary };
    Object.defineProperty(properties, key, { value: canary, enumerable: true });

    test("policy ignores the key and preserves finite values and output prototype", () => {
      expect(Object.prototype.hasOwnProperty.call(properties, key)).toBe(true);
      const result = diagnosticProperties(properties);
      expect(result).toEqual(valid);
      expect(Object.prototype.hasOwnProperty.call(result, key)).toBe(false);
      expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    });

    test("analytics wrapper ignores the key and forwards finite values", () => {
      expect(Object.prototype.hasOwnProperty.call(properties, key)).toBe(true);
      const instance = initAnalytics()!;
      const capture = instance.capture as jest.Mock;
      capture.mockClear();
      expect(() => analytics.capture("favorite_added", properties)).not.toThrow();
      expect(capture).toHaveBeenCalledTimes(1);
      expect(capture).toHaveBeenCalledWith("favorite_added", valid);
      const result = capture.mock.calls[0][1];
      expect(Object.prototype.hasOwnProperty.call(result, key)).toBe(false);
      expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    });
  },
);

test("unknown property names and string values cannot leak via analytics", () => {
  initAnalytics();
  analytics.capture("favorite_added", {
    misc: canary,
    content_id: canary,
    content_type: canary,
    answer: canary,
  });
  const instance = (PostHog as jest.Mock).mock.results[0].value;
  expect(JSON.stringify(instance.capture.mock.calls)).not.toContain(canary);
  analytics.capture(canary, { value: 1 });
  expect(JSON.stringify(instance.capture.mock.calls)).not.toContain(canary);
});
test("automatic crash event scrubs nested request, exception, breadcrumb, attachment and user data", () => {
  initMonitoring();
  const options = (Sentry.init as jest.Mock).mock.calls[0][0];
  const event = {
    message: canary,
    user: { id: canary, email: canary },
    request: { url: canary, headers: { Authorization: canary } },
    extra: { nested: { raw: canary } },
    exception: {
      values: [
        {
          type: canary,
          value: canary,
          stacktrace: { frames: [{ filename: canary, vars: { raw: canary } }] },
        },
      ],
    },
    breadcrumbs: [{ message: canary, data: { raw: canary } }],
    contexts: { custom: { raw: canary } },
    tags: { misc: canary },
    attachments: [{ filename: canary }],
  };
  const hint = { attachments: [{ filename: canary, data: canary }] };
  expect(JSON.stringify(options.beforeSend(event, hint))).not.toContain(canary);
  expect(hint.attachments).toEqual([]);
  monitoring.captureError(new Error(canary), {
    area: "feed.load",
    misc: canary,
  });
  expect(
    JSON.stringify((Sentry.captureException as jest.Mock).mock.calls),
  ).not.toContain(canary);
});

test("retired diagnostic storage is preserved without loading its queued payload", async () => {
  const storage = AsyncStorage;
  await storage.setItem("posthog-queue", canary);
  const options = (PostHog as jest.Mock).mock.calls[0][1];
  expect(await options.customStorage.getItem("posthog-queue")).toBeNull();
  expect(await storage.getItem("posthog-queue")).toBe(canary);
});

test("finite environment and SDK event identity survive scrubbing for verified routing", () => {
  const { scrubCrashEvent } = require("@/lib/diagnosticPolicy");
  expect(
    scrubCrashEvent({
      environment: "development",
      event_id: "a".repeat(32),
      timestamp: 1000,
    }),
  ).toMatchObject({
    environment: "development",
    event_id: "a".repeat(32),
    timestamp: 1000,
  });
  expect(
    JSON.stringify(
      scrubCrashEvent({
        environment: canary,
        event_id: canary,
        timestamp: canary,
      }),
    ),
  ).not.toContain(canary);
});

test.each([
  undefined,
  { $geoip_disable: false, $process_person_profile: true },
  { $geoip_disable: canary, $process_person_profile: canary },
])(
  "analytics hook forces privacy controls despite caller input %p",
  (controls) => {
    initAnalytics();
    const options = (PostHog as jest.Mock).mock.calls[0][1];
    const event = {
      event: "favorite_added",
      uuid: "a".repeat(32),
      timestamp: "2026-09-09T00:00:00Z",
      properties: {
        ...controls,
        content_type: "quote",
        viewed_count: 3,
        premium: true,
        token: "synthetic-project-key",
        email: canary,
        $set: { email: canary },
        $device_name: canary,
      },
    };
    expect(options.before_send(event)).toEqual({
      event: event.event,
      uuid: event.uuid,
      timestamp: event.timestamp,
      properties: {
        content_type: "quote",
        viewed_count: 3,
        premium: true,
        token: "synthetic-project-key",
        $geoip_disable: true,
        $process_person_profile: false,
      },
    });
    expect(options.before_send({ ...event, event: canary })).toBeNull();
    expect(options.before_send(null)).toBeNull();
    expect(options.before_send({ event: "signed_out" }).properties).toEqual({
      $geoip_disable: true,
      $process_person_profile: false,
    });
    expect(
      options.before_send({
        event: "signed_out",
        properties: { token: canary },
      }).properties,
    ).not.toHaveProperty("token");
  },
);

test("v2 diagnostics queues and identity are preserved but never loaded into v3", async () => {
  initAnalytics();
  const options = (PostHog as jest.Mock).mock.calls[0][1];
  const legacy = JSON.stringify({
    queue: [
      { message: { event: "favorite_added", properties: { email: canary } } },
    ],
    distinct_id: "synthetic-old-installation",
  });
  for (const key of [".posthog-rn.json", ".posthog-rn-logs.json"])
    await AsyncStorage.setItem(`fs.diagnostics.v2.${key}`, legacy);
  (AsyncStorage.getItem as jest.Mock).mockClear();
  for (const key of [".posthog-rn.json", ".posthog-rn-logs.json"])
    expect(await options.customStorage.getItem(key)).toBeNull();
  expect((AsyncStorage.getItem as jest.Mock).mock.calls).toEqual([
    ["fs.diagnostics.v3..posthog-rn.json"],
    ["fs.diagnostics.v3..posthog-rn-logs.json"],
  ]);
  for (const key of [".posthog-rn.json", ".posthog-rn-logs.json"])
    expect(await AsyncStorage.getItem(`fs.diagnostics.v2.${key}`)).toBe(legacy);
});

test("v3 diagnostic storage roundtrips without overwriting legacy payloads", async () => {
  initAnalytics();
  const options = (PostHog as jest.Mock).mock.calls[0][1];
  const key = ".posthog-rn-logs.json";
  await AsyncStorage.setItem(`fs.diagnostics.v2.${key}`, canary);
  const fresh = JSON.stringify({
    queue: [],
    distinct_id: "synthetic-new-installation",
  });
  await options.customStorage.setItem(key, fresh);
  expect(await AsyncStorage.getItem(`fs.diagnostics.v3.${key}`)).toBe(fresh);
  expect(await options.customStorage.getItem(key)).toBe(fresh);
  expect(await AsyncStorage.getItem(`fs.diagnostics.v2.${key}`)).toBe(canary);
});

test("identity reset cannot enable unused remote feature evaluation", () => {
  initAnalytics();
  const options = (PostHog as jest.Mock).mock.calls[0][1];
  expect(options.disableRemoteFeatureFlags).toBe(true);
  analytics.reset();
  const instance = (PostHog as jest.Mock).mock.results[0].value;
  expect(instance.reset).toHaveBeenCalled();
});
