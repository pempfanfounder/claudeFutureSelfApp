import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { router, useIsFocused } from "expo-router";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import {
  CONTROLLED_SPRING,
  MOTION,
  useMotionPreference,
} from "@/design-system/motion";
const Context = createContext<(() => void) | null>(null);
export function useSecondaryBack() {
  return (
    useContext(Context) ??
    (() => {
      if (router.canGoBack()) router.back();
      else router.replace("/");
    })
  );
}
/** Native navigator still owns gestures and route identity. Explicit header
 * back reverses the 24dp layer; native gesture cancellation needs device QA. */
export function SecondaryMotion({ children }: { children: ReactNode }) {
  const reduced = useMotionPreference(),
    focused = useIsFocused();
  const travel = useSharedValue(reduced ? 0 : MOTION.secondary),
    opacity = useSharedValue(0);
  const closing = useRef(false);
  const finish = useCallback(() => {
    if (!closing.current) return;
    closing.current = false;
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, []);
  useEffect(() => {
    cancelAnimation(travel);
    cancelAnimation(opacity);
    if (closing.current) {
      travel.set(reduced ? 0 : withSpring(MOTION.secondary, CONTROLLED_SPRING));
      opacity.set(
        withTiming(
          0,
          { duration: reduced ? MOTION.reducedFade : MOTION.fade },
          (done) => {
            if (done) scheduleOnRN(finish);
          },
        ),
      );
    } else if (focused) {
      travel.set(reduced ? 0 : withSpring(0, CONTROLLED_SPRING));
      opacity.set(
        withTiming(1, { duration: reduced ? MOTION.reducedFade : MOTION.fade }),
      );
    }
    return () => {
      cancelAnimation(travel);
      cancelAnimation(opacity);
    };
  }, [reduced, focused, travel, opacity, finish]);
  const back = useCallback(() => {
    if (closing.current || !focused) return;
    closing.current = true;
    cancelAnimation(travel);
    cancelAnimation(opacity);
    if (reduced) {
      travel.set(0);
      opacity.set(
        withTiming(0, { duration: MOTION.reducedFade }, (done) => {
          if (done) scheduleOnRN(finish);
        }),
      );
    } else {
      opacity.set(withTiming(0, { duration: MOTION.fade }));
      travel.set(
        withSpring(MOTION.secondary, CONTROLLED_SPRING, (done) => {
          if (done) scheduleOnRN(finish);
        }),
      );
    }
  }, [reduced, focused, travel, opacity, finish]);
  const style = useAnimatedStyle(() => ({
    flex: 1,
    opacity: opacity.get(),
    transform: [{ translateX: reduced ? 0 : travel.get() }],
  }));
  return (
    <Context.Provider value={back}>
      <Animated.View style={style}>{children}</Animated.View>
    </Context.Provider>
  );
}
