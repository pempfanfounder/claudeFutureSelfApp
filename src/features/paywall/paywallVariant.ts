/**
 * Which paywall the app shows — flip this ONE constant to compare designs
 * in a single build. Applies to the in-onboarding paywall step and the
 * standalone hard gate (`src/app/paywall.tsx`).
 *
 *  - "calai-1"  Cal AI structure: outlined notification stack hero with a
 *               soft fade, headline, two stacked plan cards ("MOST POPULAR"
 *               tab), pill CTA.
 *  - "calai-2"  Fanned stack bleeding behind the headline over a
 *               near-black-to-surface gradient; same plan cards.
 *  - "calai-3"  Segmented Yearly / Weekly toggle, one price line, 65 pt CTA.
 *  - "calai-4"  Hybrid: calai-1's straight stack, plan cards and CTA over
 *               calai-2's gradient treatment in the warm ink brown.
 *  - "legacy"   The pre-existing Timeline / Note paywalls per variant.
 */
export type PaywallVariant =
  "calai-1" | "calai-2" | "calai-3" | "calai-4" | "legacy";

export const PAYWALL_VARIANT: PaywallVariant = "calai-1";

export type CalAiVersion = 1 | 2 | 3 | 4;

/** The Cal AI layout version for a variant, or null for the legacy paywalls. */
export function calAiVersion(
  variant: PaywallVariant = PAYWALL_VARIANT,
): CalAiVersion | null {
  switch (variant) {
    case "calai-1":
      return 1;
    case "calai-2":
      return 2;
    case "calai-3":
      return 3;
    case "calai-4":
      return 4;
    default:
      return null;
  }
}
