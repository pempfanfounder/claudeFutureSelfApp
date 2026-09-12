import { router } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from "react-native";

import { AppText } from "@/design-system/components";
import { useColors } from "@/design-system/ThemeProvider";
import { radii, shadows, spacing } from "@/design-system/tokens";
import { useAuth } from "@/features/auth/AuthProvider";
import { LEGAL_URLS } from "@/lib/legal";

const SUPPORT_EMAIL = "hello@joinfutureself.com";

interface PrivacyChoicesSheetProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * Privacy choices bottom sheet: legal pages, support, and account
 * deletion. Reachable from the legacy paywall footer (so they stay
 * available behind the hard paywall, Guideline 5.1.1(v)) and from
 * Settings › Account.
 */
export function PrivacyChoicesSheet({
  visible,
  onClose,
}: PrivacyChoicesSheetProps) {
  const colors = useColors();
  const auth = useAuth();
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = () => {
    Alert.alert(
      "Delete account & data",
      "This permanently deletes your account and everything in it. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            const result = await auth.deleteAccount();
            setDeleting(false);
            if (result.ok) {
              onClose();
              router.replace("/");
            } else {
              Alert.alert(
                "Delete account",
                ("message" in result && result.message) ||
                  "Could not delete the account. Try again.",
              );
            }
          },
        },
      ],
    );
  };

  const rows = [
    {
      key: "privacy",
      label: "Privacy Policy",
      onPress: () => Linking.openURL(LEGAL_URLS.privacy),
    },
    {
      key: "terms",
      label: "Terms of Service",
      onPress: () => Linking.openURL(LEGAL_URLS.terms),
    },
    {
      key: "support",
      label: "Contact support",
      onPress: () => Linking.openURL(`mailto:${SUPPORT_EMAIL}`),
    },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View
          style={[styles.sheet, { backgroundColor: colors.card }, shadows.lg]}
        >
          <AppText variant="h3" center>
            Privacy choices
          </AppText>

          <View style={styles.rows}>
            {rows.map((row) => (
              <Pressable
                key={row.key}
                onPress={row.onPress}
                style={[styles.row, { borderBottomColor: colors.border }]}
                hitSlop={4}
                testID={`privacy-${row.key}`}
              >
                <AppText variant="body">{row.label}</AppText>
              </Pressable>
            ))}
            <Pressable
              onPress={confirmDelete}
              disabled={deleting}
              style={[styles.row, styles.lastRow]}
              hitSlop={4}
              testID="privacy-delete-account"
            >
              <AppText variant="body" style={styles.destructive}>
                {deleting ? "Deleting…" : "Delete my account & data"}
              </AppText>
            </Pressable>
          </View>

          <Pressable onPress={onClose} style={styles.dismiss} hitSlop={8}>
            <AppText variant="body" tone="ink3" center>
              Close
            </AppText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(42,30,22,0.45)",
  },
  sheet: {
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxxl,
  },
  rows: { marginTop: spacing.lg },
  row: {
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  lastRow: { borderBottomWidth: 0 },
  destructive: { color: "#B4553C" },
  dismiss: { marginTop: spacing.xl },
});
