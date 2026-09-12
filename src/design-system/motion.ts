import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";
export const CONTROLLED_SPRING = {
  mass: 1,
  stiffness: 320,
  damping: 30,
  overshootClamping: true,
} as const;
export const MOTION = {
  overlay: 36,
  secondary: 24,
  fade: 180,
  tabFade: 160,
  reducedFade: 120,
  pressScale: 0.985,
  favoriteScale: 0.92,
} as const;
let knownPreference: boolean | undefined;
/** Default to no travel until the current system preference is known. */
export function useMotionPreference() {
  const [reduced, setReduced] = useState(knownPreference ?? true);
  useEffect(() => {
    let alive = true;
    let changed = false;
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (value) => {
        changed = true;
        knownPreference = value;
        if (alive) setReduced(value);
      },
    );
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (alive && !changed) {
          knownPreference = value;
          setReduced(value);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduced;
}
