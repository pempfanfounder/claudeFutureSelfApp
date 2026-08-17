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
import {
  BackHandler,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from "react-native";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  type SharedValue,
  type WithSpringConfig,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { useColors } from "@/design-system/ThemeProvider";

/** The three home-screen launch destinations that morph out of their button. */
export type MorphScreen = "profile" | "favorites" | "themes";

/** Window-space rect of the launcher (from `measureInWindow`). */
export interface MorphRect {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Launcher corner radius; defaults to a circle (`width / 2`). */
  radius?: number;
}

/** Props every morph destination accepts when rendered inside the overlay. */
export interface MorphScreenProps {
  /** True when rendered inside the morph overlay rather than as a route. */
  embedded?: boolean;
  /** Reverse the morph. Falls back to `router.back()` on the route. */
  onClose?: () => void;
  /**
   * Leave the overlay for a deeper route: the morph closes first, then the
   * href is pushed once the container has settled back into its button.
   */
  onNavigate?: (href: string) => void;
}

export type MorphScreens = Record<MorphScreen, ComponentType<MorphScreenProps>>;

interface MorphApi {
  /** Expand `screen` out of the launcher `rect` (window coordinates). */
  open: (rect: MorphRect, screen: MorphScreen) => void;
  /** Reverse the morph back into the launcher. No-op when nothing is open. */
  close: () => void;
}

/**
 * Container-transform spring, tuned to the Motivation reference recording:
 * ζ ≈ 0.75 → ~2–3 % overshoot (clipped off-screen on open, hidden by the
 * matching surface colour on close), settles in ≈ 420 ms.
 */
export const MORPH_SPRING: WithSpringConfig = {
  damping: 26,
  stiffness: 300,
  mass: 1,
};
/** Destination content starts fading in this long after the container leads. */
export const MORPH_CONTENT_DELAY_MS = 90;
export const MORPH_CONTENT_FADE_MS = 160;
/** On close the content fades out first, then the container flies back. */
export const MORPH_CLOSE_FADE_MS = 120;
export const MORPH_BACKDROP_OPACITY = 0.25;
const BACKDROP_FADE_MS = 200;
const CONTENT_SCALE_FROM = 0.98;
/** Progress span over which the surface colour crossfades button → screen. */
const SURFACE_BLEND_END = 0.35;

type Phase = "idle" | "open" | "closing";

interface Size {
  width: number;
  height: number;
}

interface FromRect extends Size {
  x: number;
  y: number;
  radius: number;
}

interface MorphState {
  screen: MorphScreen;
  from: FromRect;
}

const MorphContext = createContext<MorphApi | null>(null);

/** Access the morph API. Must be used beneath a `MorphProvider`. */
export function useMorph(): MorphApi {
  const api = useContext(MorphContext);
  if (!api) {
    throw new Error("useMorph() must be used inside a <MorphProvider>.");
  }
  return api;
}

interface MorphProviderProps {
  children: ReactNode;
  /** Destination components, keyed by launcher. */
  screens: MorphScreens;
}

/**
 * Container-transform ("morph") navigation host. Wrap the home feed; the
 * three launchers call `useMorph().open(rect, screen)` and the destination
 * expands out of the button as a rounded card that grows to full screen,
 * with its content fading in just behind the container. `close()` (header
 * ✕, Android back, or `onNavigate`) reverses the morph back into the button.
 */
export function MorphProvider({ children, screens }: MorphProviderProps) {
  const window = useWindowDimensions();
  const [size, setSize] = useState<Size | null>(null);
  const [state, setState] = useState<MorphState | null>(null);
  const containerRef = useRef<View>(null);
  const originRef = useRef({ x: 0, y: 0 });
  const phaseRef = useRef<Phase>("idle");
  const pendingHrefRef = useRef<string | null>(null);

  const progress = useSharedValue(0);
  const contentOpacity = useSharedValue(0);
  const contentScale = useSharedValue(CONTENT_SCALE_FROM);
  const backdrop = useSharedValue(0);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) =>
      prev && prev.width === width && prev.height === height
        ? prev
        : { width, height },
    );
    // Launcher rects arrive in window space; remember where this container
    // sits in the window so they can be converted to local coordinates.
    containerRef.current?.measureInWindow((x, y) => {
      originRef.current = { x, y };
    });
  }, []);

  const finishClose = useCallback(() => {
    if (phaseRef.current !== "closing") return;
    phaseRef.current = "idle";
    setState(null);
    const href = pendingHrefRef.current;
    pendingHrefRef.current = null;
    if (href) router.push(href as Href);
  }, []);

  const open = useCallback(
    (rect: MorphRect, screen: MorphScreen) => {
      if (phaseRef.current !== "idle") return;
      phaseRef.current = "open";
      pendingHrefRef.current = null;
      progress.set(0);
      contentOpacity.set(0);
      contentScale.set(CONTENT_SCALE_FROM);
      backdrop.set(0);
      setState({
        screen,
        from: {
          x: rect.x - originRef.current.x,
          y: rect.y - originRef.current.y,
          width: rect.width,
          height: rect.height,
          radius: rect.radius ?? rect.width / 2,
        },
      });
    },
    [backdrop, contentOpacity, contentScale, progress],
  );

  const close = useCallback(() => {
    if (phaseRef.current !== "open") return;
    phaseRef.current = "closing";
    // Content fades out first, then the container flies back. If we're
    // interrupted mid-open the content is only partly visible, so shorten
    // the fade proportionally instead of freezing the card while it fades.
    const visible = Math.min(1, Math.max(0, contentOpacity.get()));
    const fadeMs = Math.round(MORPH_CLOSE_FADE_MS * visible);
    contentOpacity.set(withTiming(0, { duration: fadeMs }));
    contentScale.set(withTiming(CONTENT_SCALE_FROM, { duration: fadeMs }));
    backdrop.set(
      withDelay(fadeMs, withTiming(0, { duration: BACKDROP_FADE_MS + 60 })),
    );
    progress.set(
      withDelay(
        fadeMs,
        withSpring(0, MORPH_SPRING, () => {
          scheduleOnRN(finishClose);
        }),
      ),
    );
  }, [backdrop, contentOpacity, contentScale, finishClose, progress]);

  const navigate = useCallback(
    (href: string) => {
      if (phaseRef.current !== "open") return;
      pendingHrefRef.current = href;
      close();
    },
    [close],
  );

  // Android hardware back reverses the morph — but only while this screen
  // is focused, so a route pushed on top (e.g. a saved quote) still pops.
  const focused = useIsFocused();
  const isOpen = state !== null;
  useEffect(() => {
    if (!isOpen || !focused) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [isOpen, focused, close]);

  const api = useMemo<MorphApi>(() => ({ open, close }), [open, close]);
  const to = useMemo<Size>(
    () => size ?? { width: window.width, height: window.height },
    [size, window.width, window.height],
  );

  return (
    <MorphContext.Provider value={api}>
      <View ref={containerRef} style={styles.host} onLayout={onLayout}>
        {children}
        {state ? (
          <MorphLayer
            from={state.from}
            to={to}
            Screen={screens[state.screen]}
            onClose={close}
            onNavigate={navigate}
            progress={progress}
            contentOpacity={contentOpacity}
            contentScale={contentScale}
            backdrop={backdrop}
          />
        ) : null}
      </View>
    </MorphContext.Provider>
  );
}

interface MorphLayerProps {
  from: FromRect;
  to: Size;
  Screen: ComponentType<MorphScreenProps>;
  onClose: () => void;
  onNavigate: (href: string) => void;
  progress: SharedValue<number>;
  contentOpacity: SharedValue<number>;
  contentScale: SharedValue<number>;
  backdrop: SharedValue<number>;
}

/**
 * The animated layer: dimming backdrop + the morphing card. Mounted per
 * open at the launcher rect (progress 0) and only then springs to full
 * screen, so the first painted frame is pixel-identical to the button.
 */
function MorphLayer({
  from,
  to,
  Screen,
  onClose,
  onNavigate,
  progress,
  contentOpacity,
  contentScale,
  backdrop,
}: MorphLayerProps) {
  const colors = useColors();
  const surfaceFrom = colors.card;
  const surfaceTo = colors.bg;

  useEffect(() => {
    progress.set(withSpring(1, MORPH_SPRING));
    contentOpacity.set(
      withDelay(
        MORPH_CONTENT_DELAY_MS,
        withTiming(1, { duration: MORPH_CONTENT_FADE_MS }),
      ),
    );
    contentScale.set(
      withDelay(
        MORPH_CONTENT_DELAY_MS,
        withTiming(1, { duration: MORPH_CONTENT_FADE_MS + 60 }),
      ),
    );
    backdrop.set(
      withTiming(MORPH_BACKDROP_OPACITY, { duration: BACKDROP_FADE_MS }),
    );
  }, [backdrop, contentOpacity, contentScale, progress]);

  const cardStyle = useAnimatedStyle(() => {
    const p = progress.get();
    return {
      left: from.x * (1 - p),
      top: from.y * (1 - p),
      width: from.width + (to.width - from.width) * p,
      height: from.height + (to.height - from.height) * p,
      borderRadius: Math.max(0, from.radius * (1 - p)),
      backgroundColor: interpolateColor(
        p,
        [0, SURFACE_BLEND_END],
        [surfaceFrom, surfaceTo],
      ),
    };
  });

  // Content stays anchored to its final screen position while the card's
  // clip grows over it (a reveal), with a slight settle-in scale.
  const contentStyle = useAnimatedStyle(() => {
    const p = progress.get();
    return {
      opacity: contentOpacity.get(),
      transform: [
        { translateX: -from.x * (1 - p) },
        { translateY: -from.y * (1 - p) },
        { scale: contentScale.get() },
      ],
    };
  });

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdrop.get(),
  }));

  return (
    <View style={styles.layer} accessibilityViewIsModal testID="morph-overlay">
      <Animated.View style={[styles.backdrop, backdropStyle]} />
      <Animated.View style={[styles.card, cardStyle]} testID="morph-card">
        <Animated.View
          style={[
            styles.content,
            { width: to.width, height: to.height },
            contentStyle,
          ]}
        >
          <Suspense fallback={null}>
            <Screen embedded onClose={onClose} onNavigate={onNavigate} />
          </Suspense>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const fill = {
  position: "absolute",
  left: 0,
  top: 0,
  right: 0,
  bottom: 0,
} as const;

const styles = StyleSheet.create({
  host: { flex: 1 },
  layer: { ...fill, overflow: "hidden" },
  backdrop: { ...fill, backgroundColor: "#000000", pointerEvents: "none" },
  card: { position: "absolute", overflow: "hidden" },
  content: { position: "absolute", left: 0, top: 0 },
});
