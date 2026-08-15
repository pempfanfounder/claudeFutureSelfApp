import { useEffect } from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import { type } from "@/design-system/tokens";

import { paletteForWidget } from "./widgetPrefs";

/**
 * Looping ~12s tutorial animation inside a phone mockup, mirroring the
 * Motivation reference: lock-screen edit choreography (press → edit
 * mode → widget sheet → chips pop in → Done) or home-screen jiggle +
 * widget drop-in. Pure presentation; every beat derives from one
 * linear master progress, so the loop is seamless and 60fps-safe
 * (opacity/transform only).
 */
const LOOP_MS = 12_000;
const W = 216;
const H = 440;
const QUOTE_1 = "Hard work beats talent, every time.";
const QUOTE_2 = "Small steps lead to big changes.";

const clamp = Extrapolation.CLAMP;

export function WidgetTutorialMock({
  variant,
  themeId,
}: {
  variant: "home" | "lock";
  themeId: string;
}) {
  const p = useSharedValue(0);
  const w = useSharedValue(1);

  useEffect(() => {
    p.value = 0;
    p.value = withRepeat(
      withTiming(1, { duration: LOOP_MS, easing: Easing.linear }),
      -1,
    );
    // Note: no reverse — withRepeat doesn't support reversing a
    // withSequence; the sequence already ends where it starts.
    w.value = withRepeat(
      withSequence(
        withTiming(-1, { duration: 130 }),
        withTiming(1, { duration: 130 }),
      ),
      -1,
    );
    return () => {
      cancelAnimation(p);
      cancelAnimation(w);
    };
  }, [p, w]);

  // Loop-seam crossfade: state resets happen while fully invisible.
  const fade = useAnimatedStyle(() => ({
    opacity: interpolate(
      p.value,
      [0, 0.02, 0.945, 0.97, 0.988, 1],
      [0.6, 1, 1, 0, 0, 0.6],
      clamp,
    ),
  }));

  const palette = paletteForWidget(themeId);
  return (
    <View pointerEvents="none" style={s.frame}>
      <View
        style={[s.screen, variant === "home" && { backgroundColor: "#8A847E" }]}
      >
        <Animated.View style={[s.fill, fade]}>
          {variant === "lock" ? (
            <LockScene p={p} palette={palette} />
          ) : (
            <HomeScene p={p} w={w} palette={palette} />
          )}
        </Animated.View>
      </View>
    </View>
  );
}

type Pal = { bg: string; ink: string; ink2: string };

function LockScene({ p, palette }: { p: SharedValue<number>; palette: Pal }) {
  const screen = useAnimatedStyle(() => ({
    transform: [
      {
        scale: interpolate(
          p.value,
          [0.15, 0.21, 0.62, 0.68],
          [1, 0.82, 0.82, 1],
          clamp,
        ),
      },
    ],
  }));
  const chrome = useAnimatedStyle(() => ({
    opacity: interpolate(
      p.value,
      [0.17, 0.21, 0.62, 0.66],
      [0, 1, 1, 0],
      clamp,
    ),
  }));
  const dim = useAnimatedStyle(() => ({
    opacity: interpolate(
      p.value,
      [0.22, 0.26, 0.37, 0.41],
      [0, 0.35, 0.35, 0],
      clamp,
    ),
  }));
  const sheet = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          p.value,
          [0.22, 0.27, 0.37, 0.42],
          [150, 0, 0, 150],
          clamp,
        ),
      },
    ],
  }));
  const addPill = useAnimatedStyle(() => ({
    opacity: interpolate(
      p.value,
      [0, 0.4, 0.43, 0.972, 0.986, 1],
      [1, 1, 0, 0, 1, 1],
      clamp,
    ),
  }));
  const useChipStyle = (tIn: number) =>
    useAnimatedStyle(() => ({
      opacity: interpolate(
        p.value,
        [0, tIn, tIn + 0.025, 0.972, 0.986, 1],
        [0, 0, 1, 1, 0, 0],
        clamp,
      ),
      transform: [
        {
          scale: interpolate(
            p.value,
            [0, tIn, tIn + 0.035, tIn + 0.055, 1],
            [0.4, 0.4, 1.09, 1, 1],
            clamp,
          ),
        },
      ],
    }));
  const chip1 = useChipStyle(0.43);
  const chip2 = useChipStyle(0.47);
  const done = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(p.value, [0.57, 0.59, 0.61], [1, 1.14, 1], clamp) },
    ],
  }));

  return (
    <View style={s.fill}>
      <Animated.View style={[s.fill, screen]}>
        <Text style={s.date}>Monday, June 6</Text>
        <Text style={s.clock}>9:41</Text>
        <View style={s.widgetSlot}>
          <Animated.View style={[s.addPill, addPill]}>
            <Text style={s.addPillText}>Add widgets</Text>
          </Animated.View>
          <View style={s.chipRow}>
            <Animated.View
              style={[s.chip, { backgroundColor: palette.bg }, chip1]}
            >
              <Text
                numberOfLines={3}
                style={[s.chipText, { color: palette.ink }]}
              >
                {QUOTE_1}
              </Text>
            </Animated.View>
            <Animated.View
              style={[s.chip, { backgroundColor: palette.bg }, chip2]}
            >
              <Text
                numberOfLines={3}
                style={[s.chipText, { color: palette.ink }]}
              >
                {QUOTE_2}
              </Text>
            </Animated.View>
          </View>
        </View>
        <Animated.View style={[s.customize, chrome]}>
          <Text style={s.customizeText}>Customize</Text>
        </Animated.View>
      </Animated.View>

      <Animated.View style={[s.editChip, { left: 12 }, chrome]}>
        <Text style={s.editChipText}>Cancel</Text>
      </Animated.View>
      <Animated.View style={[s.editChip, { right: 12 }, chrome, done]}>
        <Text style={s.editChipText}>Done</Text>
      </Animated.View>

      <Animated.View style={[s.fill, s.dimmer, dim]} />
      <Animated.View style={[s.sheet, sheet]}>
        <View style={s.grabber} />
        <View style={s.sheetRow}>
          <View style={[s.glyph, { backgroundColor: palette.bg }]}>
            <Text style={[s.glyphText, { color: palette.ink }]}>fs</Text>
          </View>
          <View style={s.sheetNameCol}>
            <Text style={s.sheetName}>Future Self</Text>
            <Text style={s.sheetSub}>Quotes & affirmations</Text>
          </View>
          <Text style={s.sheetClose}>✕</Text>
        </View>
      </Animated.View>

      <Dot p={p} at={[0.07, 0.16]} style={{ top: 150, left: W / 2 - 20 }} />
      <Dot p={p} at={[0.29, 0.37]} style={{ bottom: 62, left: W / 2 - 20 }} />
      <Dot p={p} at={[0.55, 0.63]} style={{ top: 8, right: 14 }} />
    </View>
  );
}

function HomeScene({
  p,
  w,
  palette,
}: {
  p: SharedValue<number>;
  w: SharedValue<number>;
  palette: Pal;
}) {
  const useWobbleStyle = (dir: 1 | -1) =>
    useAnimatedStyle(() => {
      const amt = interpolate(
        p.value,
        [0.18, 0.22, 0.6, 0.65],
        [0, 1, 1, 0],
        clamp,
      );
      return { transform: [{ rotate: `${dir * w.value * 1.6 * amt}deg` }] };
    });
  const wobbleEven = useWobbleStyle(1);
  const wobbleOdd = useWobbleStyle(-1);
  const covered = useAnimatedStyle(() => ({
    opacity: interpolate(
      p.value,
      [0, 0.31, 0.34, 0.972, 0.986, 1],
      [1, 1, 0, 0, 1, 1],
      clamp,
    ),
  }));
  const card = useAnimatedStyle(() => ({
    opacity: interpolate(
      p.value,
      [0, 0.32, 0.345, 0.972, 0.986, 1],
      [0, 0, 1, 1, 0, 0],
      clamp,
    ),
    transform: [
      {
        scale: interpolate(
          p.value,
          [0, 0.32, 0.365, 0.385, 1],
          [0.3, 0.3, 1.08, 1, 1],
          clamp,
        ),
      },
    ],
  }));
  const chrome = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0.2, 0.24, 0.6, 0.65], [0, 1, 1, 0], clamp),
  }));
  const done = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(p.value, [0.52, 0.54, 0.56], [1, 1.14, 1], clamp) },
    ],
  }));

  const isCovered = (row: number, col: number) => row < 2 && col < 2;
  return (
    <View style={s.fill}>
      <View style={s.grid}>
        {[0, 1, 2, 3].map((row) => (
          <View key={row} style={s.gridRow}>
            {[0, 1, 2, 3].map((col) => (
              <Animated.View
                key={col}
                style={[
                  s.tile,
                  (row + col) % 2 === 0 ? wobbleEven : wobbleOdd,
                  isCovered(row, col) && covered,
                ]}
              />
            ))}
          </View>
        ))}
        <Animated.View
          style={[s.widgetCard, { backgroundColor: palette.bg }, card]}
        >
          <Text style={[s.widgetCardQuote, { color: palette.ink }]}>
            I am becoming.
          </Text>
          <Text style={[s.widgetCardBrand, { color: palette.ink2 }]}>
            Future Self
          </Text>
        </Animated.View>
      </View>
      <View style={s.dock}>
        {[0, 1, 2, 3].map((i) => (
          <Animated.View
            key={i}
            style={[s.tile, s.dockTile, i % 2 === 0 ? wobbleEven : wobbleOdd]}
          />
        ))}
      </View>
      <Animated.View style={[s.editChip, { right: 12 }, chrome, done]}>
        <Text style={s.editChipText}>Done</Text>
      </Animated.View>
      <Dot p={p} at={[0.08, 0.23]} style={{ top: 130, left: W / 2 - 20 }} />
      <Dot p={p} at={[0.5, 0.58]} style={{ top: 8, right: 14 }} />
    </View>
  );
}

/** Translucent fingertip that fades in, presses (scale dip), fades out. */
function Dot({
  p,
  at,
  style,
}: {
  p: SharedValue<number>;
  at: [number, number];
  style: ViewStyle;
}) {
  const [tIn, tOut] = at;
  const mid = (tIn + tOut) / 2;
  const a = useAnimatedStyle(() => ({
    opacity: interpolate(
      p.value,
      [tIn, tIn + 0.018, tOut - 0.018, tOut],
      [0, 0.9, 0.9, 0],
      clamp,
    ),
    transform: [
      {
        scale: interpolate(
          p.value,
          [tIn + 0.018, mid, tOut - 0.018],
          [1, 0.72, 1],
          clamp,
        ),
      },
    ],
  }));
  return <Animated.View style={[s.dot, style, a]} />;
}

const s = StyleSheet.create({
  frame: {
    width: W,
    height: H,
    borderRadius: 40,
    padding: 7,
    backgroundColor: "#DCD7D1",
    alignSelf: "center",
  },
  screen: {
    flex: 1,
    borderRadius: 34,
    backgroundColor: "#96908A",
    overflow: "hidden",
  },
  fill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  date: {
    marginTop: 34,
    textAlign: "center",
    color: "#FFFFFFE6",
    fontSize: 11,
  },
  clock: {
    textAlign: "center",
    color: "#FFFFFF",
    fontSize: 64,
    fontWeight: "200",
    lineHeight: 70,
  },
  widgetSlot: { marginTop: 6, height: 58, justifyContent: "center" },
  addPill: {
    position: "absolute",
    alignSelf: "center",
    borderWidth: 1.5,
    borderColor: "#FFFFFFB3",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  addPillText: { color: "#FFFFFF", fontSize: 11, fontWeight: "500" },
  chipRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 10,
  },
  chip: {
    width: 90,
    height: 56,
    borderRadius: 13,
    padding: 8,
    justifyContent: "center",
  },
  chipText: { fontSize: 8.5, lineHeight: 11.5, fontWeight: "500" },
  customize: {
    position: "absolute",
    bottom: 16,
    alignSelf: "center",
    backgroundColor: "#1E1C1ABF",
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  customizeText: { color: "#FFFFFF", fontSize: 12, fontWeight: "500" },
  editChip: {
    position: "absolute",
    top: 12,
    backgroundColor: "#F5F3F0E6",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  editChipText: { color: "#2A2724", fontSize: 11, fontWeight: "600" },
  dimmer: { backgroundColor: "#14120F" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 132,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: "#F5F3F0",
    alignItems: "center",
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D5D0CA",
    marginTop: 8,
  },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    paddingHorizontal: 16,
    marginTop: 18,
    gap: 10,
  },
  glyph: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  glyphText: { fontFamily: type.serif, fontSize: 15 },
  sheetNameCol: { flex: 1 },
  sheetName: { color: "#1D1A17", fontSize: 13, fontWeight: "600" },
  sheetSub: { color: "#8E8880", fontSize: 10, marginTop: 1 },
  sheetClose: { color: "#8E8880", fontSize: 13 },
  grid: { marginTop: 46, alignSelf: "center", width: 156, gap: 12 },
  gridRow: { flexDirection: "row", gap: 12 },
  tile: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: "#FFFFFF61",
  },
  widgetCard: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 72,
    height: 72,
    borderRadius: 16,
    padding: 8,
    justifyContent: "space-between",
  },
  widgetCardQuote: { fontFamily: type.serif, fontSize: 10.5, lineHeight: 13 },
  widgetCardBrand: { fontSize: 6.5, fontWeight: "600", letterSpacing: 0.4 },
  dock: {
    position: "absolute",
    bottom: 14,
    alignSelf: "center",
    flexDirection: "row",
    gap: 12,
    backgroundColor: "#FFFFFF2E",
    borderRadius: 20,
    padding: 8,
  },
  dockTile: { backgroundColor: "#FFFFFF4D" },
  dot: {
    position: "absolute",
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#14110E66",
    borderWidth: 1.5,
    borderColor: "#FFFFFF59",
  },
});
