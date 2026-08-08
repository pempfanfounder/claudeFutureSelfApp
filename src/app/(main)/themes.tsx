import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { AppText, Screen } from "@/design-system/components";
import { useTheme } from "@/design-system/ThemeProvider";
import { THEMES, type ThemeCategory } from "@/design-system/themes";
import { radii, spacing, type } from "@/design-system/tokens";
import { analytics } from "@/lib/analytics";

const SECTIONS: { key: ThemeCategory; title: string }[] = [
  { key: "light", title: "Light" },
  { key: "dark", title: "Dark" },
  { key: "seasonal", title: "Seasonal" },
];

/** Theme browser — the same theme drives feed and widgets. */
export default function ThemesScreen() {
  const { theme, setThemeId } = useTheme();

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <AppText variant="h3" tone="ink3">
            ✕
          </AppText>
        </Pressable>
        <AppText variant="h3">Themes</AppText>
        <View style={styles.spacer} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
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
                      { backgroundColor: t.bg, borderColor: active ? t.ink : "transparent" },
                    ]}
                  >
                    <AppText style={{ color: t.ink, fontFamily: type.serif, fontSize: 16 }}>
                      I am becoming.
                    </AppText>
                    <View>
                      <AppText variant="label" style={{ color: t.ink }}>
                        {t.name}
                      </AppText>
                      <AppText variant="label" style={{ color: t.ink, opacity: 0.6 }}>
                        {t.preview}
                      </AppText>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
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
});
