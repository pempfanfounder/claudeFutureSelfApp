import { router } from "expo-router";
import { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, View } from "react-native";

import {
  APP_ICON_IDS,
  APP_ICON_SOURCES,
  applyAppIcon,
  getCurrentAppIconId,
} from "@/design-system/appIcons";
import { AppText, Icon, Screen } from "@/design-system/components";
import { useColors, useTheme } from "@/design-system/ThemeProvider";
import { THEMES, themeById, type ThemeCategory } from "@/design-system/themes";
import { radii, spacing, type } from "@/design-system/tokens";
import { analytics } from "@/lib/analytics";

const SECTIONS: { key: ThemeCategory; title: string }[] = [
  { key: "light", title: "Light" },
  { key: "dark", title: "Dark" },
  { key: "seasonal", title: "Seasonal" },
];

const ICON_TILE_SIZE = 64;
const ICON_TILE_RADIUS = 16;
const ICON_RING_WIDTH = 2;
const ICON_RING_GAP = 2;

/** Theme browser — the same theme drives feed and widgets. */
export default function ThemesScreen() {
  const colors = useColors();
  const { theme, setThemeId } = useTheme();
  // Applies immediately here (the iOS "changed the icon" alert is
  // expected in a settings context, unlike mid-onboarding).
  const [appIconId, setAppIconId] = useState(getCurrentAppIconId);

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Icon name="close" size={22} color={colors.ink3} />
        </Pressable>
        <AppText variant="h3">Themes</AppText>
        <View style={styles.spacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {SECTIONS.map((section) => (
          <View key={section.key}>
            <AppText variant="eyebrow" tone="ink3" style={styles.sectionTitle}>
              {section.title}
            </AppText>
            <View style={styles.grid}>
              {THEMES.filter((t) => t.category === section.key).map((t) => {
                const active = theme.id === t.id;
                return (
                  <Pressable
                    key={t.id}
                    testID={`theme-${t.id}`}
                    onPress={() => {
                      setThemeId(t.id);
                      analytics.capture("theme_changed", { theme: t.id });
                    }}
                    style={[
                      styles.tile,
                      {
                        backgroundColor: t.bg,
                        borderColor: active ? t.ink : "transparent",
                      },
                    ]}
                  >
                    <AppText
                      style={{
                        color: t.ink,
                        fontFamily: type.serif,
                        fontSize: 16,
                      }}
                    >
                      I am becoming.
                    </AppText>
                    <View>
                      <AppText variant="label" style={{ color: t.ink }}>
                        {t.name}
                      </AppText>
                      <AppText
                        variant="label"
                        style={{ color: t.ink, opacity: 0.6 }}
                      >
                        {t.preview}
                      </AppText>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}

        <AppText variant="eyebrow" tone="ink3" style={styles.sectionTitle}>
          App icon
        </AppText>
        <View style={styles.iconGrid}>
          {APP_ICON_IDS.map((id) => {
            const active = appIconId === id;
            const name = themeById(id)?.name ?? id;
            return (
              <View key={id} style={styles.iconCell}>
                <Pressable
                  testID={`app-icon-${id}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={name}
                  onPress={() => {
                    setAppIconId(id);
                    void applyAppIcon(id);
                    analytics.capture("app_icon_changed", { icon: id });
                  }}
                  style={[
                    styles.iconRing,
                    { borderColor: active ? colors.ink : "transparent" },
                  ]}
                >
                  <Image
                    source={APP_ICON_SOURCES[id]}
                    style={styles.iconTile}
                    resizeMode="cover"
                  />
                </Pressable>
                <AppText
                  variant="label"
                  tone={active ? "ink" : "ink3"}
                  center
                  numberOfLines={2}
                  style={styles.iconName}
                >
                  {name}
                </AppText>
              </View>
            );
          })}
        </View>
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
  sectionTitle: { marginTop: spacing.xl, marginBottom: spacing.md },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  tile: {
    width: "47.5%",
    aspectRatio: 0.8,
    borderRadius: radii.lg,
    borderWidth: 2,
    padding: spacing.lg,
    justifyContent: "space-between",
  },
  iconGrid: { flexDirection: "row", flexWrap: "wrap", rowGap: spacing.lg },
  iconCell: { width: "25%", alignItems: "center" },
  iconRing: {
    borderWidth: ICON_RING_WIDTH,
    padding: ICON_RING_GAP,
    borderRadius: ICON_TILE_RADIUS + ICON_RING_GAP + ICON_RING_WIDTH,
  },
  iconTile: {
    width: ICON_TILE_SIZE,
    height: ICON_TILE_SIZE,
    borderRadius: ICON_TILE_RADIUS,
  },
  iconName: { marginTop: spacing.sm, fontSize: 11, lineHeight: 14 },
});
