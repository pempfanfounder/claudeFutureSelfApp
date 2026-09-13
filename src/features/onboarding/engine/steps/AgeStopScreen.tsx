import { StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { AppText, Button } from "@/design-system/components";
import { spacing } from "@/design-system/tokens";

import { AGE_STOP_COPY } from "../ageGate";

interface AgeStopScreenProps {
  onBack: () => void;
}

/**
 * Soft age gate: shown in place of the age question when the answer is
 * below the Terms' minimum (16). There is deliberately no way forward;
 * the only control returns to the age question. No identity check.
 */
export function AgeStopScreen({ onBack }: AgeStopScreenProps) {
  return (
    <Animated.View
      entering={FadeIn.duration(280)}
      exiting={FadeOut.duration(150)}
      style={styles.root}
      testID="age-stop"
    >
      <View style={styles.body}>
        <AppText variant="h1" center>
          {AGE_STOP_COPY.headline}
        </AppText>
        <AppText variant="lead" tone="ink2" center style={styles.sub}>
          {AGE_STOP_COPY.sub}
        </AppText>
      </View>
      <View style={styles.footer}>
        <Button
          label={AGE_STOP_COPY.back}
          variant="secondary"
          onPress={onBack}
          testID="age-stop-back"
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1, justifyContent: "center" },
  sub: { marginTop: spacing.lg },
  footer: { paddingBottom: spacing.sm },
});
