import { router, type Href } from "expo-router";
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import RevenueCatUI from "react-native-purchases-ui";

import { AppText, Icon, Screen } from "@/design-system/components";
import { useColors } from "@/design-system/ThemeProvider";
import { radii, shadows, spacing } from "@/design-system/tokens";
import { useAppState } from "@/lib/appState";
import { config } from "@/lib/config";
import { LEGAL_URLS } from "@/lib/legal";
import { monitoring } from "@/lib/monitoring";
import { isConfigured } from "@/lib/purchases";

import { useAuth } from "@/features/auth/AuthProvider";
import { useFeedStore } from "@/features/content/feedStore";

function openStoreSubscriptionsUrl() {
  return Linking.openURL(
    Platform.OS === "ios"
      ? "https://apps.apple.com/account/subscriptions"
      : "https://play.google.com/store/account/subscriptions",
  );
}

/**
 * Prefers RevenueCat's native Customer Center (manage/cancel, refund
 * requests, restore) when purchases are really configured; falls back to
 * the store's own subscriptions page when RevenueCat isn't configured
 * (or is only dev-mocked) or if presentation throws.
 */
async function manageSubscription() {
  if (!isConfigured() || config.devMockPurchases) {
    await openStoreSubscriptionsUrl();
    return;
  }
  try {
    await RevenueCatUI.presentCustomerCenter();
  } catch (error) {
    monitoring.captureError(error, { area: "settings.customerCenter" });
    await openStoreSubscriptionsUrl();
  }
}

/**
 * Guideline 3.1.2 wants Terms and Privacy reachable from inside the
 * binary. The paywall carries them for non-subscribers; once someone is
 * past it, Profile is the only place left, so they live here too.
 */
function openLegal(url: string, area: string) {
  Linking.openURL(url).catch((error) => {
    monitoring.captureError(error, { area });
  });
}

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

export interface SettingsScreenProps {
  /** True when rendered inside the home-screen morph overlay. */
  embedded?: boolean;
  /** Header close; defaults to `router.back()` on the pushed route. */
  onClose?: () => void;
  /**
   * Row navigation; defaults to `router.push(href)`. The morph overlay
   * supplies a handler that reverses the morph before pushing.
   */
  onNavigate?: (href: string) => void;
}

/**
 * Profile hub: streak card + customize/account sections (I Am style). Works
 * both as the `/settings` route and embedded in the avatar-button morph.
 */
export default function SettingsScreen({
  onClose,
  onNavigate,
}: SettingsScreenProps) {
  const colors = useColors();
  const { displayName } = useAppState();
  const { currentStreak, longestStreak, completedToday } = useFeedStore();
  const { isAnonymous } = useAuth();
  const todayIndex = (new Date().getDay() + 6) % 7;

  const go = (href: string) =>
    onNavigate ? onNavigate(href) : router.push(href as Href);

  const row = (
    label: string,
    onPress: () => void,
    detail?: string,
    testID?: string,
  ) => (
    <Pressable
      onPress={onPress}
      style={[styles.row, { backgroundColor: colors.card }]}
      testID={testID}
    >
      <AppText variant="lead" style={styles.rowLabel}>
        {label}
      </AppText>
      {detail ? (
        <AppText variant="body" tone="ink3">
          {detail}
        </AppText>
      ) : null}
      <Icon name="chevronRight" size={18} color={colors.ink3} />
    </Pressable>
  );

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable
          onPress={onClose ?? (() => router.back())}
          hitSlop={12}
          accessibilityLabel="Close"
          testID="settings-close"
        >
          <Icon name="close" size={22} color={colors.ink3} />
        </Pressable>
        <AppText variant="h3">
          {displayName ? `${displayName}` : "Profile"}
        </AppText>
        <View style={styles.spacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        <View
          style={[
            styles.streakCard,
            { backgroundColor: colors.card },
            shadows.sm,
          ]}
        >
          <AppText variant="eyebrow" tone="ink3">
            Your streak
          </AppText>
          <View style={styles.streakRow}>
            <View style={[styles.streakCircle, { borderColor: colors.accent }]}>
              <AppText variant="h1">{currentStreak}</AppText>
            </View>
            <View style={styles.streakMeta}>
              <AppText variant="body" tone="ink2">
                {completedToday
                  ? "Today counts. See you tomorrow."
                  : "Read 3 items today to keep it alive."}
              </AppText>
              <AppText variant="label" tone="ink3">
                Longest: {longestStreak} {longestStreak === 1 ? "day" : "days"}
              </AppText>
            </View>
          </View>
          <View style={styles.week}>
            {WEEKDAYS.map((d, i) => (
              <View key={d} style={styles.day}>
                <View
                  style={[
                    styles.dot,
                    { borderColor: colors.borderStrong },
                    i === todayIndex &&
                      completedToday && {
                        backgroundColor: colors.accent,
                        borderColor: colors.accent,
                      },
                  ]}
                />
                <AppText variant="label" tone="ink3">
                  {d}
                </AppText>
              </View>
            ))}
          </View>
        </View>

        <AppText variant="eyebrow" tone="ink3" style={styles.sectionTitle}>
          Customize
        </AppText>
        {row(
          "Notifications",
          () => go("/(main)/settings/notifications"),
          undefined,
          "settings-notifications",
        )}
        {row(
          "Widgets",
          () => go("/(main)/settings/widgets"),
          undefined,
          "settings-widgets",
        )}
        {row("Themes", () => go("/(main)/themes"))}

        <AppText variant="eyebrow" tone="ink3" style={styles.sectionTitle}>
          Account
        </AppText>
        {row(
          "Account & subscription",
          () => go("/(main)/settings/account"),
          isAnonymous ? "Not saved yet" : "Signed in",
          "settings-account",
        )}
        {row("Manage subscription", manageSubscription)}

        <AppText variant="eyebrow" tone="ink3" style={styles.sectionTitle}>
          Legal
        </AppText>
        {row(
          "Terms of Service",
          () => openLegal(LEGAL_URLS.terms, "settings.terms"),
          undefined,
          "settings-terms",
        )}
        {row(
          "Privacy Policy",
          () => openLegal(LEGAL_URLS.privacy, "settings.privacy"),
          undefined,
          "settings-privacy",
        )}
        {row(
          "Support",
          () => openLegal(LEGAL_URLS.support, "settings.support"),
          undefined,
          "settings-support",
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
  streakCard: {
    borderRadius: radii.xl,
    padding: spacing.xl,
    marginTop: spacing.md,
  },
  streakRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    marginTop: spacing.md,
  },
  streakCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  streakMeta: { flex: 1, gap: spacing.xs },
  week: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.lg,
  },
  day: { alignItems: "center", gap: spacing.xs },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
  },
  sectionTitle: { marginTop: spacing.xxl, marginBottom: spacing.md },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    marginBottom: spacing.sm,
  },
  rowLabel: { flex: 1 },
});
