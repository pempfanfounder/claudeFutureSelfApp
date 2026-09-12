const eas = require("../../eas.json") as {
  build: Record<string, { env?: Record<string, string> }>;
};

const DEVICE_PROFILES = [
  "preview",
  "preview-iam-claude",
  "preview-stella-claude",
  "production",
] as const;

test("store and TestFlight profiles show email sign-in", () => {
  for (const name of DEVICE_PROFILES) {
    expect(eas.build[name]?.env?.EXPO_PUBLIC_EMAIL_AUTH_ENABLED).toBe("true");
  }
});
