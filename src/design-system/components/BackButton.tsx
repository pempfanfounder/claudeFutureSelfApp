import { Pressable } from "react-native";
import { useSecondaryBack } from "@/features/nav/SecondaryMotion";
import { useColors } from "../ThemeProvider";
import { Icon } from "./Icon";
export function BackButton({ testID }: { testID?: string }) {
  const back = useSecondaryBack(),
    colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      onPress={back}
      testID={testID}
      style={{ minWidth: 44, minHeight: 44, justifyContent: "center" }}
    >
      <Icon name="back" size={22} color={colors.ink} />
    </Pressable>
  );
}
