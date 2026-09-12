/**
 * Which paywall the app shows — flip this ONE constant to compare designs
 * in a single build. Applies to the in-onboarding paywall step and the
 * standalone hard gate (`src/app/paywall.tsx`).
 *
 *  - "calai-1"  Cal AI structure: notification stack hero with a soft
 *               fade, headline, two stacked plan cards ("MOST POPULAR" tab),
 *               pill CTA.
 *  - "calai-2"  Stack bleeds behind the headline over a dark-to-surface
 *               gradient; same plan cards.
 *  - "calai-3"  Segmented Yearly / Monthly toggle, one price line, 65 pt CTA.
 *  - "legacy"   The pre-existing Timeline / Note paywalls per variant.
 */
export type PaywallVariant = "calai-1" | "calai-2" | "calai-3" | "legacy";

export const PAYWALL_VARIANT: PaywallVariant = "calai-1";

export type CalAiVersion = 1 | 2 | 3;

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
    default:
      return null;
  }
}
