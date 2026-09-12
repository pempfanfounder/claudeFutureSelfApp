import { router, useIsFocused, type Href } from "expo-router";
import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { AccessibilityInfo, BackHandler, StyleSheet, View } from "react-native";
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
import { useColors } from "@/design-system/ThemeProvider";
import { AppText } from "@/design-system/components/AppText";
export type MorphScreen = "profile" | "favorites" | "themes";
/** Public launcher API retained; geometry no longer drives selected C motion. */
export interface MorphRect {
  x: number;
  y: number;
  width: number;
  height: number;
  radius?: number;
  restoreFocus?: () => void;
}
export interface MorphScreenProps {
  embedded?: boolean;
  onClose?: () => void;
  onNavigate?: (href: string) => void;
}
export type MorphScreens = Record<MorphScreen, ComponentType<MorphScreenProps>>;
interface MorphApi {
  open: (rect: MorphRect, screen: MorphScreen) => void;
  close: () => void;
}
export const MORPH_SPRING = CONTROLLED_SPRING;
export const MORPH_CONTENT_FADE_MS = MOTION.fade;
export const MORPH_CONTENT_DELAY_MS = 0;
export const MORPH_CLOSE_FADE_MS = MOTION.fade;
export const MORPH_BACKDROP_OPACITY = 0.25;
const Context = createContext<MorphApi | null>(null);
export function useMorph() {
  const api = useContext(Context);
  if (!api) throw new Error("useMorph must be inside MorphProvider.");
  return api;
}
export function MorphProvider({
  children,
  screens,
}: {
  children: ReactNode;
  screens: MorphScreens;
}) {
  const colors = useColors(),
    reduced = useMotionPreference(),
    focused = useIsFocused();
  const [screen, setScreen] = useState<MorphScreen | null>(null);
  const phase = useRef<"idle" | "open" | "closing">("idle");
  const destinationPending = useRef(false);
  useEffect(() => {
    if (focused) destinationPending.current = false;
  }, [focused]);
  const restoreFocus = useRef<(() => void) | undefined>(undefined);
  const progress = useSharedValue(0),
    opacity = useSharedValue(0);
  const finish = useCallback(() => {
    if (phase.current !== "closing") return;
    phase.current = "idle";
    setScreen(null);
    restoreFocus.current?.();
  }, []);
  const animate = useCallback(
    (opening: boolean) => {
      cancelAnimation(progress);
      cancelAnimation(opacity);
      const target = opening ? 1 : 0;
      if (reduced) {
        progress.set(target);
        opacity.set(
          withTiming(target, { duration: MOTION.reducedFade }, (done) => {
            if (done && !opening) scheduleOnRN(finish);
          }),
        );
      } else {
        opacity.set(withTiming(target, { duration: MOTION.fade }));
        progress.set(
          withSpring(target, CONTROLLED_SPRING, (done) => {
            if (done && !opening) scheduleOnRN(finish);
          }),
        );
      }
    },
    [reduced, progress, opacity, finish],
  );
  const open = useCallback(
    (rect: MorphRect, next: MorphScreen) => {
      if (
        phase.current === "open" ||
        (phase.current === "closing" && screen !== next)
      )
        return;

      restoreFocus.current = rect.restoreFocus;
      phase.current = "open";
      setScreen(next);
      animate(true);
      AccessibilityInfo.announceForAccessibility(
        next === "profile"
          ? "Profile"
          : next === "favorites"
            ? "Saved Quotes"
            : "Themes",
      );
    },
    [screen, animate],
  );
  const close = useCallback(() => {
    if (phase.current !== "open") return;
    phase.current = "closing";
    animate(false);
  }, [animate]);
  // A runtime preference change cancels spatial motion at once and finishes
  // the current direction with the approved stationary fade.
  useEffect(() => {
    if (phase.current !== "idle") animate(phase.current === "open");
  }, [animate]);
  useEffect(
    () => () => {
      cancelAnimation(progress);
      cancelAnimation(opacity);
    },
    [progress, opacity],
  );
  useEffect(() => {
    if (!screen || !focused) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [screen, focused, close]);
  const navigate = useCallback(
    (href: string) => {
      if (phase.current === "open" && focused && !destinationPending.current) {
        destinationPending.current = true;
        router.push(href as Href);
      }
    },
    [focused],
  );
  const api = useMemo(() => ({ open, close }), [open, close]);
  const style = useAnimatedStyle(() => ({
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    opacity: opacity.get(),
    transform: [
      { translateY: reduced ? 0 : MOTION.overlay * (1 - progress.get()) },
    ],
  }));
  const Screen = screen ? screens[screen] : null;
  return (
    <Context.Provider value={api}>
      <View style={styles.host}>
        <View
          style={styles.host}
          importantForAccessibility={screen ? "no-hide-descendants" : "auto"}
          accessibilityElementsHidden={Boolean(screen)}
          pointerEvents={screen ? "none" : "auto"}
        >
          {children}
        </View>
        {Screen ? (
          <View
            style={styles.layer}
            accessibilityViewIsModal
            importantForAccessibility={focused ? "yes" : "no-hide-descendants"}
            testID="morph-overlay"
          >
            <Animated.View
              style={[styles.card, { backgroundColor: colors.bg }, style]}
              testID="morph-card"
            >
              <Suspense
                fallback={
                  <View style={styles.loading}>
                    <AppText accessibilityRole="alert">Loading…</AppText>
                  </View>
                }
              >
                <Screen embedded onClose={close} onNavigate={navigate} />
              </Suspense>
            </Animated.View>
          </View>
        ) : null}
      </View>
    </Context.Provider>
  );
}
const styles = StyleSheet.create({
  host: { flex: 1 },
  layer: { ...StyleSheet.absoluteFill, overflow: "hidden" },
  card: { position: "absolute" },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
});
