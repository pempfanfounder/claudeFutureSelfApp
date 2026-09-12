import { nextGate } from "@/lib/appGate";

describe("nextGate", () => {
  it("sends an anonymous finisher to save-account, not the paywall", () => {
    expect(
      nextGate({
        booted: true,
        onboardingComplete: true,
        isAnonymous: true,
        isPremium: false,
      }),
    ).toBe("/save-account");
  });

  it("sends a linked unpaid user to the paywall", () => {
    expect(
      nextGate({
        booted: true,
        onboardingComplete: true,
        isAnonymous: false,
        isPremium: false,
      }),
    ).toBe("/paywall");
  });

  it("does not let an unpaid guest into the app", () => {
    expect(
      nextGate({
        booted: true,
        onboardingComplete: true,
        isAnonymous: true,
        isPremium: false,
      }),
    ).not.toBe("/(main)/feed");
  });
});
