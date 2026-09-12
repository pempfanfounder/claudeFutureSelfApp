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
import { OWNER_QUOTES } from "@/features/content/ownerQuotes";

import { paletteForWidget } from "./widgetPrefs";

/**
 * Looping tutorial animation inside a phone mockup.
 *
 * The Lock Screen scene is a beat-for-beat reconstruction of what iOS
 * actually does when you add a Lock Screen widget (long-press → wallpaper
 * gallery → edit mode → "Add widgets" → picker sheet → detail sheet →
 * chips slide in → dismiss → Done). Timings were measured from a real
 * device recording sampled at 10 fps: OS transitions run 0.4–0.6 s and
 * every state HOLDS 1.5–2.5 s so the viewer can read it — the long holds
 * are the whole feel. See docs/superpowers/specs/
 * 2026-08-16-widget-tutorial-animation-parity.md for the frame table.
 *
 * Every beat derives from ONE linear master progress `p` (0→1 over
 * LOCK_LOOP_MS / HOME_LOOP_MS) so the loop is seamless and 60fps-safe
 * (opacity/transform only, no layout animation).
 */
const LOCK_LOOP_MS = 27_500;
const HOME_LOOP_MS = 20_000;
const W = 216;
const H = 440;
// Sample chips show real owner quotes (short ones that fit a widget chip).
const ownerQuote = (n: number) =>
  OWNER_QUOTES.find((quote) => quote.n === n)?.body ?? "";
const QUOTE_1 = ownerQuote(9); // "Success is a decision."
const QUOTE_2 = ownerQuote(52); // "Don't wish for it, work for it."

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
      withTiming(1, {
        duration: variant === "lock" ? LOCK_LOOP_MS : HOME_LOOP_MS,
        easing: Easing.linear,
      }),
      -1,
    );
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
  }, [p, w, variant]);

  const palette = paletteForWidget(themeId);

  return (
    <View style={s.frame} accessibilityRole="image">
      <View style={s.screen}>
        {variant === "lock" ? (
          <LockScene p={p} palette={palette} />
        ) : (
          <HomeScene p={p} w={w} palette={palette} />
        )}
      </View>
    </View>
  );
}

type Pal = ReturnType<typeof paletteForWidget>;

/* ------------------------------------------------------------------ */
/* Lock Screen — measured iOS choreography, p ∈ [0,1] over 27.5 s      */
/* ------------------------------------------------------------------ */
// Beat anchors (fractions of the loop). Kept as named constants so the
// web preview and any retune stay in lockstep with this file.
const L = {
  pressIn: 0.055, // long-press dot appears (center)
  zoomOut: 0.13, // screen → gallery
  galleryHold: 0.2,
  tapCard: 0.255, // dot on the Lock Screen card
  zoomIn: 0.29, // gallery → edit mode
  tapAdd: 0.39, // dot on "Add widgets"
  sheetUp: 0.41,
  tapRow: 0.5, // dot on the app row
  sheetExpand: 0.52,
  chip1: 0.6,
  chip2: 0.65,
  tapClose: 0.74, // dot on sheet ✕
  sheetDown: 0.755,
  cancelDone: 0.775,
  tapDone: 0.83,
  chromeOut: 0.86, // edit chrome fades → clean lock screen with chips
  chipsReset: 0.99, // chips fade for a seamless restart (invisible-fast)
} as const;

function LockScene({ p, palette }: { p: SharedValue<number>; palette: Pal }) {
  // Whole lock screen: zoom out to the gallery, slide left, zoom back.
  const screen = useAnimatedStyle(() => {
    const k = interpolate(
      p.value,
      [L.zoomOut, L.zoomOut + 0.03, L.zoomIn, L.zoomIn + 0.03],
      [0, 1, 1, 0],
      clamp,
    );
    return {
      transform: [
        { translateX: -52 * k },
        { translateY: -14 * k },
        { scale: 1 - 0.5 * k },
      ],
      borderRadius: 26,
    };
  });
  // Gallery: the "Home Screen" partner card + labels + Customize pill.
  const gallery = useAnimatedStyle(() => ({
    opacity: interpolate(
      p.value,
      [L.zoomOut + 0.01, L.zoomOut + 0.035, L.zoomIn - 0.005, L.zoomIn + 0.02],
      [0, 1, 1, 0],
      clamp,
    ),
  }));
  // Edit-mode frames around date / clock / add-widgets, plus the pill.
  const editChrome = useAnimatedStyle(() => ({
    opacity: interpolate(
      p.value,
      [L.zoomIn + 0.015, L.zoomIn + 0.035, L.chromeOut, L.chromeOut + 0.015],
      [0, 1, 1, 0],
      clamp,
    ),
  }));
  const addPill = useAnimatedStyle(() => ({
    opacity: interpolate(
      p.value,
      [L.zoomIn + 0.015, L.zoomIn + 0.035, L.chip1, L.chip1 + 0.02],
      [0, 1, 1, 0],
      clamp,
    ),
  }));
  const dim = useAnimatedStyle(() => ({
    opacity: interpolate(
      p.value,
      [L.sheetUp, L.sheetUp + 0.015, L.sheetDown, L.sheetDown + 0.015],
      [0, 0.18, 0.18, 0],
      clamp,
    ),
  }));
  // Picker sheet: slide up (0.42 s), expand to detail (0.5 s), slide down.
  const sheet = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          p.value,
          [L.sheetUp, L.sheetUp + 0.015, L.sheetDown, L.sheetDown + 0.015],
          [235, 0, 0, 235],
          clamp,
        ),
      },
    ],
    height: interpolate(
      p.value,
      [L.sheetExpand, L.sheetExpand + 0.018],
      [150, 235],
      clamp,
    ),
  }));
  const detail = useAnimatedStyle(() => ({
    opacity: interpolate(
      p.value,
      [L.sheetExpand + 0.008, L.sheetExpand + 0.024],
      [0, 1],
      clamp,
    ),
  }));
  const rowOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(
      p.value,
      [L.sheetExpand, L.sheetExpand + 0.012],
      [1, 0],
      clamp,
    ),
  }));
  // Chips slide in from the left with a "–" remove badge (edit look), then
  // become plain text once Done is pressed (finished look).
  const useChip = (tIn: number) =>
    useAnimatedStyle(() => ({
      opacity: interpolate(
        p.value,
        [tIn, tIn + 0.012, L.chipsReset, L.chipsReset + 0.008],
        [0, 1, 1, 0],
        clamp,
      ),
      transform: [
        {
          translateX: interpolate(
            p.value,
            [tIn, tIn + 0.018],
            [-60, 0],
            clamp,
          ),
        },
      ],
    }));
  const chip1 = useChip(L.chip1);
  const chip2 = useChip(L.chip2);
  const cancelDone = useAnimatedStyle(() => ({
    opacity: interpolate(
      p.value,
      [L.cancelDone, L.cancelDone + 0.012, L.chromeOut, L.chromeOut + 0.015],
      [0, 1, 1, 0],
      clamp,
    ),
  }));
  const donePress = useAnimatedStyle(() => ({
    transform: [
      {
        scale: interpolate(
          p.value,
          [L.tapDone, L.tapDone + 0.012, L.tapDone + 0.024],
          [1, 0.92, 1],
          clamp,
        ),
      },
    ],
  }));

  return (
    <View style={s.fill}>
      {/* Gallery layer (behind the zoomed-out lock screen) */}
      <Animated.View style={[s.fill, s.galleryBg, gallery]}>
        <View style={s.galleryPair}>
          <View style={s.galleryLeftSpacer} />
          <View style={s.homeCard}>
            <View style={s.homeGrid}>
              {Array.from({ length: 12 }).map((_, i) => (
                <View key={i} style={s.homeGridTile} />
              ))}
            </View>
          </View>
        </View>
        <View style={s.galleryLabels}>
          <Text style={s.galleryLabel}>Lock Screen</Text>
          <Text style={s.galleryLabel}>Home Screen</Text>
        </View>
        <View style={s.customizePill}>
          <Text style={s.customizeText}>Customize</Text>
        </View>
      </Animated.View>

      {/* The lock screen itself */}
      <Animated.View style={[s.fill, s.lockScreen, screen]}>
        <View style={s.island} />
        <View style={s.dateWrap}>
          <Animated.View style={[s.editFrame, editChrome]} />
          <Text style={s.date}>Monday, June 6</Text>
        </View>
        <View style={s.clockWrap}>
          <Animated.View style={[s.editFrame, editChrome]} />
          <Text style={s.clock}>9:41</Text>
        </View>
        <View style={s.widgetSlot}>
          <Animated.View style={[s.editFrame, editChrome]} />
          <Animated.View style={[s.addPill, addPill]}>
            <Text style={s.addPillText}>Add widgets</Text>
          </Animated.View>
          <View style={s.chipRow}>
            {[
              [QUOTE_1, chip1],
              [QUOTE_2, chip2],
            ].map(([q, st], i) => (
              <Animated.View key={i} style={[s.chip, st as ViewStyle]}>
                {/* edit-mode look (glassy + badge) fades with the chrome */}
                <Animated.View style={[s.fill, s.chipGlass, editChrome]}>
                  <View style={s.badge}>
                    <Text style={s.badgeText}>–</Text>
                  </View>
                </Animated.View>
                <Text numberOfLines={2} style={s.chipText}>
                  {q as string}
                </Text>
              </Animated.View>
            ))}
          </View>
        </View>
        <View style={s.bottomIcons}>
          <View style={s.bottomIcon} />
          <View style={s.bottomIcon} />
        </View>
        <Animated.View style={[s.editTop, cancelDone]}>
          <View style={s.editChip}>
            <Text style={s.editChipText}>Cancel</Text>
          </View>
          <Animated.View style={[s.editChip, s.editChipDone, donePress]}>
            <Text style={s.editChipText}>Done</Text>
          </Animated.View>
        </Animated.View>
      </Animated.View>

      {/* Sheet + dim (over everything) */}
      <Animated.View style={[s.fill, s.dimmer, dim]} pointerEvents="none" />
      <Animated.View style={[s.sheet, sheet]}>
        <View style={s.grabber} />
        <Animated.View style={[s.sheetRow, rowOpacity]}>
          <View style={[s.glyph, { backgroundColor: palette.bg }]}>
            <Text style={[s.glyphText, { color: palette.ink }]}>fs</Text>
          </View>
          <Text style={s.sheetName}>Future Self</Text>
          <View style={s.sheetClose}>
            <Text style={s.sheetCloseText}>✕</Text>
          </View>
        </Animated.View>
        <Animated.View style={[s.sheetDetail, detail]}>
          <View style={s.sheetDetailHeader}>
            <Text style={s.sheetTitle}>Future Self</Text>
            <View style={s.sheetClose}>
              <Text style={s.sheetCloseText}>✕</Text>
            </View>
          </View>
          <Text style={s.sheetSub}>Read quotes on your Lock Screen</Text>
          <View style={[s.previewChip, { backgroundColor: palette.bg }]}>
            <Text style={[s.previewText, { color: palette.ink }]}>
              Attitude is a little thing that makes a big difference.
            </Text>
          </View>
        </Animated.View>
      </Animated.View>

      {/* Fingertips — long-press, card tap, add tap, row tap, ✕, Done */}
      <Dot p={p} at={[L.pressIn, L.zoomOut + 0.02]} grow style={{ top: 214, left: W / 2 - 24 }} />
      <Dot p={p} at={[L.tapCard, L.zoomIn + 0.01]} grow style={{ top: 214, left: 40 }} />
      <Dot p={p} at={[L.tapAdd, L.tapAdd + 0.02]} style={{ top: 132, left: W / 2 - 17 }} />
      <Dot p={p} at={[L.tapRow, L.tapRow + 0.02]} style={{ bottom: 100, left: 40 }} />
      <Dot p={p} at={[L.tapClose, L.tapClose + 0.016]} style={{ bottom: 196, right: 18 }} />
      <Dot p={p} at={[L.tapDone, L.tapDone + 0.024]} grow style={{ top: 6, right: 8 }} />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Home Screen — our own scene, retimed to the same OS rhythm (20 s)   */
/* ------------------------------------------------------------------ */
const Hm = {
  pressIn: 0.06,
  jiggle: 0.15,
  addTap: 0.3, // "+" top-left
  cardIn: 0.42,
  hold: 0.5,
  tapDone: 0.72,
  chromeOut: 0.76,
  reset: 0.985,
} as const;

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
        [Hm.jiggle, Hm.jiggle + 0.02, Hm.chromeOut, Hm.chromeOut + 0.02],
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
      [Hm.cardIn, Hm.cardIn + 0.015, Hm.reset, Hm.reset + 0.01],
      [1, 0, 0, 1],
      clamp,
    ),
  }));
  const card = useAnimatedStyle(() => ({
    opacity: interpolate(
      p.value,
      [Hm.cardIn, Hm.cardIn + 0.015, Hm.reset, Hm.reset + 0.01],
      [0, 1, 1, 0],
      clamp,
    ),
    transform: [
      {
        scale: interpolate(
          p.value,
          [Hm.cardIn, Hm.cardIn + 0.02, Hm.cardIn + 0.035],
          [0.6, 1.04, 1],
          clamp,
        ),
      },
    ],
  }));
  const chrome = useAnimatedStyle(() => ({
    opacity: interpolate(
      p.value,
      [Hm.jiggle, Hm.jiggle + 0.02, Hm.chromeOut, Hm.chromeOut + 0.02],
      [0, 1, 1, 0],
      clamp,
    ),
  }));
  const done = useAnimatedStyle(() => ({
    transform: [
      {
        scale: interpolate(
          p.value,
          [Hm.tapDone, Hm.tapDone + 0.012, Hm.tapDone + 0.024],
          [1, 0.92, 1],
          clamp,
        ),
      },
    ],
  }));

  const isCovered = (row: number, col: number) => row < 2 && col < 2;
  return (
    <View style={[s.fill, s.homeScreen]}>
      <View style={s.island} />
      <Animated.View style={[s.homePlus, chrome]}>
        <Text style={s.homePlusText}>+</Text>
      </Animated.View>
      <Animated.View style={[s.editTop, chrome]}>
        <View style={s.editChip}>
          <Text style={s.editChipText}>Edit</Text>
        </View>
        <Animated.View style={[s.editChip, s.editChipDone, done]}>
          <Text style={s.editChipText}>Done</Text>
        </Animated.View>
      </Animated.View>
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
      <Dot p={p} at={[Hm.pressIn, Hm.jiggle + 0.02]} grow style={{ top: 150, left: W / 2 - 24 }} />
      <Dot p={p} at={[Hm.addTap, Hm.addTap + 0.02]} style={{ top: 6, left: 8 }} />
      <Dot p={p} at={[Hm.tapDone, Hm.tapDone + 0.024]} grow style={{ top: 6, right: 8 }} />
    </View>
  );
}

/**
 * Translucent fingertip. `grow` = long-press feel: swells 0.55→1 and
 * holds; otherwise a quick tap dip.
 */
function Dot({
  p,
  at,
  style,
  grow = false,
}: {
  p: SharedValue<number>;
  at: [number, number];
  style: ViewStyle;
  grow?: boolean;
}) {
  const [tIn, tOut] = at;
  const mid = (tIn + tOut) / 2;
  const a = useAnimatedStyle(() => ({
    opacity: interpolate(
      p.value,
      [tIn, tIn + 0.01, tOut - 0.01, tOut],
      [0, 0.85, 0.85, 0],
      clamp,
    ),
    transform: [
      {
        scale: grow
          ? interpolate(p.value, [tIn, tIn + 0.022, tOut], [0.55, 1, 1], clamp)
          : interpolate(
              p.value,
              [tIn + 0.006, mid, tOut - 0.006],
              [1, 0.72, 1],
              clamp,
            ),
      },
    ],
  }));
  return <Animated.View style={[s.dot, style, a]} />;
}

/* ------------------------------------------------------------------ */
const GRAY_BG = "#F4F5F9";
const GRAY_CHROME = "#D6D9E4";
const GRAY_CHROME_2 = "#C3C7D6";
const GRAY_INK = "#6C7291";
const GRAY_INK_2 = "#8E93A8";
const SHEET = "#E4E6EE";
const DOT = "#3A3F52";

const s = StyleSheet.create({
  frame: {
    width: W,
    height: H,
    borderRadius: 40,
    padding: 8,
    backgroundColor: "#E7E9F0",
    alignSelf: "center",
  },
  screen: {
    flex: 1,
    borderRadius: 34,
    backgroundColor: "#EAECF2",
    overflow: "hidden",
  },
  fill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  island: {
    position: "absolute",
    top: 10,
    alignSelf: "center",
    width: 70,
    height: 20,
    borderRadius: 10,
    backgroundColor: GRAY_CHROME,
  },
  /* lock screen */
  lockScreen: { backgroundColor: GRAY_BG, borderRadius: 26 },
  dateWrap: { position: "absolute", top: 40, left: 40, right: 40, height: 20 },
  clockWrap: {
    position: "absolute",
    top: 62,
    left: 40,
    right: 40,
    height: 54,
    justifyContent: "center",
  },
  editFrame: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    borderWidth: 1,
    borderColor: GRAY_CHROME_2,
    borderRadius: 8,
    marginHorizontal: -6,
    marginVertical: -2,
  },
  date: {
    textAlign: "center",
    color: GRAY_INK,
    fontSize: 9,
    fontWeight: "500",
    lineHeight: 20,
  },
  clock: {
    textAlign: "center",
    color: GRAY_INK,
    fontSize: 46,
    fontWeight: "600",
    letterSpacing: -1,
  },
  widgetSlot: {
    position: "absolute",
    top: 124,
    left: 34,
    right: 34,
    height: 28,
    justifyContent: "center",
  },
  addPill: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: GRAY_CHROME_2,
    alignItems: "center",
    justifyContent: "center",
  },
  addPillText: { color: GRAY_INK_2, fontSize: 9, fontWeight: "500" },
  chipRow: { flexDirection: "row", gap: 10, paddingHorizontal: 2 },
  chip: {
    flex: 1,
    height: 28,
    borderRadius: 8,
    justifyContent: "center",
    paddingHorizontal: 6,
    overflow: "visible",
  },
  chipGlass: {
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.78)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
  },
  chipText: { color: GRAY_INK, fontSize: 6.5, fontWeight: "500", lineHeight: 8 },
  badge: {
    position: "absolute",
    top: -5,
    left: -5,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: DOT,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#FFF", fontSize: 8, lineHeight: 9, fontWeight: "700" },
  bottomIcons: {
    position: "absolute",
    bottom: 22,
    left: 30,
    right: 30,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  bottomIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: GRAY_CHROME,
    opacity: 0.6,
  },
  editTop: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  editChip: {
    height: 18,
    paddingHorizontal: 9,
    borderRadius: 9,
    backgroundColor: GRAY_CHROME_2,
    alignItems: "center",
    justifyContent: "center",
  },
  editChipDone: { backgroundColor: DOT },
  editChipText: { color: "#FFF", fontSize: 8, fontWeight: "600" },
  /* gallery */
  galleryBg: { backgroundColor: "#EAECF2" },
  galleryPair: {
    position: "absolute",
    top: 96,
    left: 0,
    right: 0,
    height: 220,
    flexDirection: "row",
  },
  galleryLeftSpacer: { flex: 1 },
  homeCard: {
    width: 100,
    height: 212,
    marginRight: 6,
    borderRadius: 20,
    backgroundColor: GRAY_BG,
    padding: 9,
  },
  homeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    marginTop: 14,
  },
  homeGridTile: {
    width: 17,
    height: 17,
    borderRadius: 4,
    backgroundColor: GRAY_CHROME,
  },
  galleryLabels: {
    position: "absolute",
    top: 316,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 4,
  },
  galleryLabel: { color: GRAY_INK_2, fontSize: 8, width: 100, textAlign: "center" },
  customizePill: {
    position: "absolute",
    bottom: 40,
    left: 46,
    right: 46,
    height: 24,
    borderRadius: 12,
    backgroundColor: GRAY_CHROME_2,
    alignItems: "center",
    justifyContent: "center",
  },
  customizeText: { color: GRAY_INK, fontSize: 9, fontWeight: "600" },
  /* sheet */
  dimmer: { backgroundColor: "#000" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 150,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: SHEET,
    paddingHorizontal: 12,
    paddingTop: 8,
    overflow: "hidden",
  },
  grabber: {
    alignSelf: "center",
    width: 30,
    height: 4,
    borderRadius: 2,
    backgroundColor: GRAY_CHROME_2,
    marginBottom: 12,
  },
  sheetRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  glyph: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  glyphText: { fontSize: 9, fontWeight: "700" },
  sheetName: { flex: 1, color: GRAY_INK, fontSize: 9, fontWeight: "600" },
  sheetClose: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: GRAY_CHROME_2,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetCloseText: { color: "#FFF", fontSize: 7, fontWeight: "700" },
  sheetDetail: { position: "absolute", top: 20, left: 12, right: 12 },
  sheetDetailHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetTitle: {
    flex: 1,
    textAlign: "center",
    color: GRAY_INK,
    fontSize: 10,
    fontWeight: "600",
    marginLeft: 14,
  },
  sheetSub: {
    textAlign: "center",
    color: GRAY_INK_2,
    fontSize: 7,
    marginTop: 3,
  },
  previewChip: {
    alignSelf: "center",
    marginTop: 22,
    width: 120,
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 8,
    opacity: 0.9,
  },
  previewText: { fontSize: 6.5, lineHeight: 8.5, textAlign: "center" },
  /* home */
  homeScreen: { backgroundColor: "#DDE1EA" },
  homePlus: {
    position: "absolute",
    top: 12,
    left: 12,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: GRAY_CHROME_2,
    alignItems: "center",
    justifyContent: "center",
  },
  homePlusText: { color: "#FFF", fontSize: 12, lineHeight: 14, fontWeight: "700" },
  grid: {
    position: "absolute",
    top: 44,
    left: 18,
    right: 18,
    gap: 12,
  },
  gridRow: { flexDirection: "row", justifyContent: "space-between" },
  tile: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: GRAY_CHROME,
  },
  widgetCard: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 30 * 2 + 30,
    height: 30 * 2 + 12,
    borderRadius: 12,
    padding: 8,
    justifyContent: "flex-end",
  },
  widgetCardQuote: {
    fontFamily: type.serif,
    fontSize: 10,
    lineHeight: 12,
  },
  widgetCardBrand: { fontSize: 6, marginTop: 3 },
  dock: {
    position: "absolute",
    bottom: 14,
    left: 20,
    right: 20,
    height: 46,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.5)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 6,
  },
  dockTile: { backgroundColor: GRAY_CHROME_2 },
  dot: {
    position: "absolute",
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: DOT,
    opacity: 0,
    shadowColor: DOT,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
});
