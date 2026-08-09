import { localFallbackVariant, ONBOARDING_VARIANTS } from "@/lib/experiments";

describe("localFallbackVariant", () => {
  it("is deterministic for the same install id", () => {
    expect(localFallbackVariant("abc-123")).toBe(
      localFallbackVariant("abc-123"),
    );
  });

  it("always returns a valid variant", () => {
    for (let i = 0; i < 200; i++) {
      const variant = localFallbackVariant(`install-${i}`);
      expect(ONBOARDING_VARIANTS).toContain(variant);
    }
  });

  it("distributes across all four variants", () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 400; i++) {
      const variant = localFallbackVariant(`id-${i}-${i * 7}`);
      counts.set(variant, (counts.get(variant) ?? 0) + 1);
    }
    for (const variant of ONBOARDING_VARIANTS) {
      // Roughly uniform: each variant should get a meaningful share.
      expect(counts.get(variant) ?? 0).toBeGreaterThan(40);
    }
  });
});
