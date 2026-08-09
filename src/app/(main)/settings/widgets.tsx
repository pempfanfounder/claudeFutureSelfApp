import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { AppText, Button, Screen } from "@/design-system/components";
import { useColors } from "@/design-system/ThemeProvider";
import { radii, shadows, spacing, type } from "@/design-system/tokens";
import { analytics } from "@/lib/analytics";

import { useFeedStore } from "@/features/content/feedStore";
import {
  DEFAULT_PINNED,
  getPinnedText,
  setPinnedText,
} from "@/features/widgets/pinned";
import { syncWidgets } from "@/features/widgets/widgetSync";

/**
 * Widget setup: live preview + the persistent widget's pinned line.
 * The pinned line stays exactly as written until edited here.
 */
export default function WidgetSettingsScreen() {
  const colors = useColors();
  const { lifeGoal, pinnedAffirmation } = useFeedStore();
  const [pinned, setPinned] = useState(DEFAULT_PINNED);
  const [saved, setSaved] = useState(false);
  const [pinRequested, setPinRequested] = useState(false);

  useEffect(() => {
    getPinnedText(pinnedAffirmation ?? lifeGoal).then(setPinned);
  }, [lifeGoal, pinnedAffirmation]);

  const save = async () => {
    await setPinnedText(pinned);
    await syncWidgets();
    analytics.capture("widget_pinned_updated");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const requestAndroidPin = async () => {
    try {
      const { requestPinAndroidWidget } =
        await import("@use-voltra/android-client");
      await requestPinAndroidWidget("future_self", {});
      setPinRequested(true);
    } catch {
      setPinRequested(false);
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <AppText variant="h3" tone="ink3">
            ‹
          </AppText>
        </Pressable>
        <AppText variant="h3">Widgets</AppText>
        <View style={styles.spacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        <AppText variant="eyebrow" tone="ink3" style={styles.sectionTitle}>
          Your Future Self widget
        </AppText>
        <AppText variant="body" tone="ink2">
          One line that stays on your Home Screen until you change it — your
          goal, or the words your future self would say.
        </AppText>

        <View
          style={[
            styles.preview,
            { backgroundColor: colors.bgAlt, borderColor: colors.border },
            shadows.sm,
          ]}
        >
          <AppText variant="h3">{pinned || DEFAULT_PINNED}</AppText>
          <AppText variant="label" tone="ink3" style={styles.previewLabel}>
            Widget preview
          </AppText>
        </View>

        <TextInput
          value={pinned}
          onChangeText={setPinned}
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
          <Pressable onPress={() => setPinned(lifeGoal)} hitSlop={8}>
            <AppText variant="label" tone="accent" style={styles.useGoal}>
              Use my goal: “
              {lifeGoal.length > 60 ? `${lifeGoal.slice(0, 60)}…` : lifeGoal}”
            </AppText>
          </Pressable>
        ) : null}

        <Button
          label={saved ? "Saved ✓" : "Save to widget"}
          onPress={save}
          disabled={pinned.trim().length === 0}
          style={styles.save}
          testID="save-pinned"
        />

        <AppText variant="eyebrow" tone="ink3" style={styles.sectionTitle}>
          Daily inspiration widget
        </AppText>
        <AppText variant="body" tone="ink2">
          {`Rotates through today's quotes and affirmations on your Home Screen${
            Platform.OS === "ios" ? " and Lock Screen" : ""
          }. Tapping a widget opens that exact line in the app.`}
        </AppText>

        <AppText variant="eyebrow" tone="ink3" style={styles.sectionTitle}>
          How to add widgets
        </AppText>
        {Platform.OS === "ios" ? (
          <AppText variant="body" tone="ink2">
            Home Screen: touch and hold an empty area → Edit → Add Widget →
            search “Future Self”.
            {"\n\n"}Lock Screen: touch and hold the Lock Screen → Customize →
            tap the widget area → add Future Self.
          </AppText>
        ) : (
          <>
            <AppText variant="body" tone="ink2">
              Touch and hold an empty Home Screen area → Widgets → Future Self —
              or tap below.
            </AppText>
            <Button
              label={pinRequested ? "Requested ✓" : "Add widget to Home Screen"}
              variant="secondary"
              onPress={requestAndroidPin}
              style={styles.save}
            />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
  },
  spacer: { width: 24 },
  scroll: { paddingBottom: spacing.xxxl },
  sectionTitle: { marginTop: spacing.xxl, marginBottom: spacing.sm },
  preview: {
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.xl,
    marginTop: spacing.lg,
  },
  previewLabel: { marginTop: spacing.md },
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
});
