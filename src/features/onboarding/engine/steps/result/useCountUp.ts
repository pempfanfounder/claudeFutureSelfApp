import { useEffect, useState } from "react";

import { useMotionPreference } from "@/design-system/motion";

const DURATION_MS = 700;

/**
 * Counts from 0 to `target` with an ease-out over ~0.7 s, starting after
 * `delayMs`. Under reduce motion (or before the preference is known) it
 * simply shows the target, so nothing ever ticks that shouldn't.
 */
export function useCountUp(target: number, delayMs = 0): number {
  const reduced = useMotionPreference();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (reduced) return;
    let frame: number | null = null;
    let cancelled = false;
    const start = Date.now() + delayMs;
    const tick = () => {
      if (cancelled) return;
      const t = Math.min(1, Math.max(0, (Date.now() - start) / DURATION_MS));
      setProgress(1 - Math.pow(1 - t, 3));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [delayMs, reduced]);

  return reduced ? target : Math.round(progress * target);
}
