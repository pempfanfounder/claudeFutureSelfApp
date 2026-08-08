import { useEffect, useState } from "react";

import { analytics } from "@/lib/analytics";
import { useAppState } from "@/lib/appState";
import { getOnboardingVariant } from "@/lib/experiments";

import { OnboardingFlow } from "@/features/onboarding/engine/OnboardingFlow";
import { useOnboardingStore } from "@/features/onboarding/engine/store";

/**
 * Resolves the experiment variant (persisted > override > PostHog >
 * local fallback), records it, and mounts the shared engine.
 */
export default function OnboardingRoute() {
  const [ready, setReady] = useState(false);
  const setVariantInStore = useOnboardingStore((s) => s.setVariant);
  const setVariantInApp = useAppState((s) => s.setVariant);

  useEffect(() => {
    (async () => {
      const assignment = await getOnboardingVariant();
      setVariantInStore(assignment.variant);
      setVariantInApp(assignment.variant);
      analytics.capture("onboarding_started", {
        variant: assignment.variant,
        assignment_source: assignment.source,
      });
      setReady(true);
    })();
  }, [setVariantInStore, setVariantInApp]);

  if (!ready) return null;
  return <OnboardingFlow />;
}
