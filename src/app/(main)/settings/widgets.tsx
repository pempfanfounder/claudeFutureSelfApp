import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from "react-native";
import Animated, {
  FadeInRight,
  FadeOutLeft,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import {
  AppText,
  Button,
  Icon,
  Screen,
  SelectableRow,
} from "@/design-system/components";
import { useColors } from "@/design-system/ThemeProvider";
import { THEMES } from "@/design-system/themes";
import { radii, shadows, spacing, type } from "@/design-system/tokens";
import { analytics } from "@/lib/analytics";

import { useFeedStore } from "@/features/content/feedStore";
import {
  DEFAULT_PINNED,
  getPinnedText,
  setPinnedText,
} from "@/features/widgets/pinned";
import {
  loadWidgetPrefs,
  setWidgetPrefs,
  useWidgetPrefs,
  type WidgetPrefs,
} from "@/features/widgets/widgetPrefs";
import { WidgetTutorialMock } from "@/features/widgets/WidgetTutorialMock";
import { syncWidgets } from "@/features/widgets/widgetSync";

type Tab = "home" | "lock";

const TABS: { id: Tab; label: string }[] = [
  { id: "home", label: "Home Screen" },
  { id: "lock", label: "Lock Screen" },
];

const STEPS: Record<Tab, string[]> = {
  home: [
    "Long-press your Home Screen until apps jiggle",
    "Tap Edit, then Add Widget, and search Future Self",
    "Pick a size and tap Add Widget",
  ],
  lock: [
    "Long-press your Lock Screen, then tap “Customize”",
    "Tap the widget area and add it",
    "Tap the widget to customize content, font, and refresh rate",
  ],
};

const SEG_PAD = 3;

/**
 * Widget customization: tabbed Home Screen / Lock Screen setup with a
 * looping tutorial mockup, theme + content-source options, and the
 * persistent pinned line editor.
 */
export default function WidgetSettingsScreen() {
  const colors = useColors();
  const { lifeGoal, pinnedAffirmation } = useFeedStore();
  const prefs = useWidgetPrefs((s) => s.prefs);
  const [tab, setTab] = useState<Tab>("home");
  const [pinned, setPinned] = useState(DEFAULT_PINNED);
  const [saved, setSaved] = useState(false);
  const [segW, setSegW] = useState(0);
  const indicator = useSharedValue(0);

  useEffect(() => {
    loadWidgetPrefs().catch(() => {});
  }, []);

  useEffect(() => {
    getPinnedText(pinnedAffirmation ?? lifeGoal).then(setPinned);
  }, [lifeGoal, pinnedAffirmation]);

  const selectTab = (next: Tab) => {
    setTab(next);
    indicator.value = withSpring(next === "home" ? 0 : 1, {
      damping: 22,
      stiffness: 260,
    });
  };

  const indicatorW = Math.max(0, (segW - SEG_PAD * 2) / 2);
  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicator.value * indicatorW }],
  }));

  const save = async () => {
    await setPinnedText(pinned);
    await syncWidgets();
    analytics.capture("widget_pinned_updated");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const install = async () => {
    if (Platform.OS === "android") {
      // Android can open the launcher's native pin sheet directly.
      try {
        const { requestPinAndroidWidget } =
          await import("@use-voltra/android-client");
        await requestPinAndroidWidget("daily", {});
        return;
      } catch {
        // No native module (Expo Go) or unsupported launcher — fall
        // through to the instructions alert.
      }
    }
    Alert.alert(
      "Add the widget",
      `Head to your ${
        tab === "home" ? "Home" : "Lock"
      } Screen and follow the steps above. Future Self appears in the widget list.`,
      [{ text: "OK" }],
    );
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.headerSide}
          testID="widgets-back"
        >
          <Icon name="back" color={colors.ink} size={22} />
        </Pressable>
        <AppText variant="h3">Widgets</AppText>
        <View style={styles.headerSide} />
      </View>

      <View
        style={[styles.segment, { backgroundColor: colors.card }, shadows.sm]}
        onLayout={(e) => setSegW(e.nativeEvent.layout.width)}
      >
        <Animated.View
          style={[
            styles.indicator,
            { backgroundColor: colors.ctaBg, width: indicatorW },
            indicatorStyle,
          ]}
        />
        {TABS.map((t) => (
          <Pressable
            key={t.id}
            onPress={() => selectTab(t.id)}
            style={styles.segmentBtn}
            testID={`tab-${t.id}`}
          >
            <AppText variant="label" tone={tab === t.id ? "ctaInk" : "ink2"}>
              {t.label}
            </AppText>
          </Pressable>
        ))}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        <Animated.View
          key={tab}
          entering={FadeInRight.duration(220)}
          exiting={FadeOutLeft.duration(220)}
        >
          <TabContent
            tab={tab}
            prefs={prefs}
            pinned={pinned}
            onChangePinned={setPinned}
            saved={saved}
            onSave={save}
            lifeGoal={lifeGoal}
          />
        </Animated.View>
      </ScrollView>

      <Button
        label="Install widget"
        onPress={install}
        style={styles.install}
        testID="install-widget"
      />
    </Screen>
  );
}

function TabContent({
  tab,
  prefs,
  pinned,
  onChangePinned,
  saved,
  onSave,
  lifeGoal,
}: {
  tab: Tab;
  prefs: WidgetPrefs;
  pinned: string;
  onChangePinned: (text: string) => void;
  saved: boolean;
  onSave: () => void;
  lifeGoal: string | null;
}) {
  const colors = useColors();
  const isHome = tab === "home";
  const source = isHome ? prefs.home.source : prefs.lock.source;
  const setSource = (s: "daily" | "pinned") =>
    setWidgetPrefs(isHome ? { home: { source: s } } : { lock: { source: s } });

  return (
    <>
      <View
        style={[
          styles.mockCard,
          { backgroundColor: colors.bgAlt, borderColor: colors.border },
        ]}
      >
        <WidgetTutorialMock variant={tab} themeId={prefs.home.themeId} />
      </View>

      <AppText variant="h3" center style={styles.headline}>
        {`Add a widget to your phone's ${isHome ? "Home" : "Lock"} Screen`}
      </AppText>
      {STEPS[tab].map((step, i) => (
        <View key={step} style={styles.stepRow}>
          <View style={[styles.stepNum, { backgroundColor: colors.bgAlt }]}>
            <AppText variant="label">{i + 1}</AppText>
          </View>
          <AppText variant="body" tone="ink2" style={styles.stepText}>
            {step}
          </AppText>
        </View>
      ))}

      <AppText variant="eyebrow" tone="ink3" style={styles.sectionTitle}>
        Make it yours
      </AppText>

      {isHome ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.swatches}
        >
          {THEMES.map((t) => {
            const active = prefs.home.themeId === t.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => setWidgetPrefs({ home: { themeId: t.id } })}
                style={[
                  styles.swatchRing,
                  { borderColor: active ? t.ink : "transparent" },
                ]}
                testID={`swatch-${t.id}`}
              >
                <View
                  style={[
                    styles.swatch,
                    { backgroundColor: t.bg, borderColor: colors.border },
                  ]}
                />
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <SelectableRow
        label="Today's daily mix"
        selected={source === "daily"}
        onPress={() => setSource("daily")}
        testID="source-daily"
      />
      <SelectableRow
        label="My pinned line"
        selected={source === "pinned"}
        onPress={() => setSource("pinned")}
        testID="source-pinned"
      />

      {isHome ? (
        <View
          style={[
            styles.switchRow,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <AppText variant="lead" style={styles.switchLabel}>
            Show authors
          </AppText>
          <Switch
            value={prefs.home.showAuthor}
            onValueChange={(v) => setWidgetPrefs({ home: { showAuthor: v } })}
            trackColor={{ false: colors.borderStrong, true: colors.ink }}
            thumbColor="#FFFFFF"
            testID="show-authors"
          />
        </View>
      ) : null}

      <AppText variant="eyebrow" tone="ink3" style={styles.sectionTitle}>
        Your pinned line
      </AppText>
      <AppText variant="body" tone="ink2">
        Shown when a widget uses “My pinned line”, and always on the Future Self
        widget. It stays exactly as written until you change it.
      </AppText>
      <TextInput
        value={pinned}
        onChangeText={onChangePinned}
        placeholder={lifeGoal ?? DEFAULT_PINNED}
        placeholderTextColor={colors.ink3}
        multiline
        maxLength={160}
        style={[
          styles.input,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            color: colors.ink,
          },
        ]}
        testID="pinned-input"
      />
      {lifeGoal && pinned !== lifeGoal ? (
        <Pressable onPress={() => onChangePinned(lifeGoal)} hitSlop={8}>
          <AppText variant="label" tone="accent" style={styles.useGoal}>
            Use my goal: “
            {lifeGoal.length > 60 ? `${lifeGoal.slice(0, 60)}…` : lifeGoal}”
          </AppText>
        </Pressable>
      ) : null}
      <Button
        label={saved ? "Saved ✓" : "Save to widget"}
        variant="secondary"
        size="md"
        onPress={onSave}
        disabled={pinned.trim().length === 0}
        style={styles.save}
        testID="save-pinned"
      />
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
  },
  headerSide: { width: 32, alignItems: "flex-start" },
  segment: {
    flexDirection: "row",
    borderRadius: radii.pill,
    padding: SEG_PAD,
    marginBottom: spacing.md,
  },
  indicator: {
    position: "absolute",
    top: SEG_PAD,
    bottom: SEG_PAD,
    left: SEG_PAD,
    borderRadius: radii.pill,
  },
  segmentBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 9,
    borderRadius: radii.pill,
  },
  scroll: { paddingBottom: spacing.xl },
  mockCard: {
    borderRadius: radii.xl,
    borderWidth: 1,
    paddingVertical: spacing.lg,
    marginTop: spacing.sm,
  },
  headline: { marginTop: spacing.xl, paddingHorizontal: spacing.lg },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  stepText: { flex: 1 },
  sectionTitle: { marginTop: spacing.xxl, marginBottom: spacing.md },
  swatches: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
    paddingRight: spacing.lg,
  },
  swatchRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  switchLabel: { flex: 1 },
  input: {
    marginTop: spacing.lg,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
    minHeight: 80,
    textAlignVertical: "top",
    fontSize: type.sizes.lead,
    fontFamily: type.sans,
  },
  useGoal: { marginTop: spacing.sm },
  save: { marginTop: spacing.lg },
  install: { marginTop: spacing.md },
});
