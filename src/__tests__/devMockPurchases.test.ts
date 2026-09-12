import { resolveDevMockPurchases } from "@/lib/config";

describe("resolveDevMockPurchases", () => {
  it("stays off unless the explicit flag is true", () => {
    expect(
      resolveDevMockPurchases({
        enabled: "false",
        appEnvironment: "staging",
        isDev: true,
      }),
    ).toBe(false);
    expect(
      resolveDevMockPurchases({
        appEnvironment: "staging",
        isDev: true,
      }),
    ).toBe(false);
  });

  it("never unlocks production, even with the flag", () => {
    expect(
      resolveDevMockPurchases({
        enabled: "true",
        appEnvironment: "production",
        isDev: true,
      }),
    ).toBe(false);
  });

  it("allows a staging Release to mock the store so Simulator onboarding can finish", () => {
    expect(
      resolveDevMockPurchases({
        enabled: "true",
        appEnvironment: "staging",
        isDev: false,
      }),
    ).toBe(true);
  });

  it("keeps the development-only path when no app environment is set", () => {
    expect(
      resolveDevMockPurchases({ enabled: "true", isDev: true }),
    ).toBe(true);
    expect(
      resolveDevMockPurchases({ enabled: "true", isDev: false }),
    ).toBe(false);
  });
});
