import {
  Linking,
  StyleSheet,
  type StyleProp,
  type TextStyle,
} from "react-native";

import { AppText } from "@/design-system/components";
import { LEGAL_URLS } from "@/lib/legal";

interface LegalFooterProps {
  style?: StyleProp<TextStyle>;
}

/**
 * "By continuing you agree to our Terms and Privacy Policy" with the two
 * phrases as tappable links. Nested Text spans (not Pressables) so the
 * sentence wraps as one paragraph and stays centred under the CTA.
 */
export function LegalFooter({ style }: LegalFooterProps) {
  return (
    <AppText variant="label" tone="ink3" center style={style}>
      By continuing you agree to our{" "}
      <AppText
        variant="label"
        tone="ink2"
        style={styles.link}
        accessibilityRole="link"
        onPress={() => Linking.openURL(LEGAL_URLS.terms).catch(() => {})}
        testID="legal-terms"
      >
        Terms
      </AppText>{" "}
      and{" "}
      <AppText
        variant="label"
        tone="ink2"
        style={styles.link}
        accessibilityRole="link"
        onPress={() => Linking.openURL(LEGAL_URLS.privacy).catch(() => {})}
        testID="legal-privacy"
      >
        Privacy Policy
      </AppText>
    </AppText>
  );
}

const styles = StyleSheet.create({
  link: { textDecorationLine: "underline" },
});
