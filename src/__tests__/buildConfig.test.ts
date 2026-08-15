import easConfig from "../../eas.json";

/**
 * Guards on the EAS build profiles.
 *
 * The paywall bypass and the Test Store key both grant or simulate premium
 * without a real purchase. Either one reaching a shipped build is a revenue
 * hole, and neither is visible in a code review of `src/`. These assertions
 * are the backstop.
 */
const profiles = easConfig.build as Record<
  string,
  { env?: Record<string, string> }
>;

const SHIPPABLE = ["production"];

describe("EAS build profiles", () => {
  it.each(SHIPPABLE)("%s never bypasses the paywall", (name) => {
    expect(profiles[name]?.env?.EXPO_PUBLIC_BYPASS_PAYWALL).toBeUndefined();
  });

  it.each(SHIPPABLE)("%s never carries a Test Store key", (name) => {
    const env = profiles[name]?.env ?? {};
    expect(env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? "").not.toMatch(/^test_/);
    expect(env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? "").not.toMatch(/^test_/);
    expect(env.EXPO_PUBLIC_ALLOW_TEST_STORE).toBeUndefined();
  });

  it.each(SHIPPABLE)("%s does not force verbose purchase logging", (name) => {
    expect(profiles[name]?.env?.EXPO_PUBLIC_RC_DEBUG_LOGS).toBeUndefined();
  });

  it("names every bypass profile so it cannot be built by accident", () => {
    for (const [name, profile] of Object.entries(profiles)) {
      if (profile.env?.EXPO_PUBLIC_BYPASS_PAYWALL === "true") {
        expect(name).toMatch(/bypass/);
      }
    }
  });

  it("gives each iOS profile a platform-appropriate RevenueCat key", () => {
    for (const [name, profile] of Object.entries(profiles)) {
      const ios = profile.env?.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
      if (!ios) continue;
      expect(`${name}:${ios.split("_")[0]}_`).toMatch(/:(appl_|test_)$/);
    }
  });
});
