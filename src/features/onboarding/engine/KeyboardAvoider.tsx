import { useCallback, useRef, useState, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface KeyboardAvoiderProps {
  children: ReactNode;
  /** Applied to the outer (measured) view; pass `flex: 1` to fill. */
  style?: StyleProp<ViewStyle>;
  /** Forwarded to KeyboardAvoidingView. Defaults to true. */
  enabled?: boolean;
  testID?: string;
}

/**
 * Keyboard-safe container for the onboarding text steps.
 *
 * Why not a bare `KeyboardAvoidingView`? RN's KAV computes the overlap
 * from its `onLayout` frame, whose `y` is relative to its PARENT, while
 * the keyboard's `screenY` is in window coordinates (see
 * `_relativeKeyboardHeight` in
 * react-native/Libraries/Components/Keyboard/KeyboardAvoidingView.js:
 * `frame.y + frame.height - (screenY - keyboardVerticalOffset)`). Nested
 * under a view padded by `insets.top` (OnboardingFlow's body) it
 * under-shifts by exactly that padding, so the 56 pt Continue button
 * ends up behind the keyboard. `keyboardVerticalOffset` exists to close
 * that gap: it must be the window Y of the KAV's parent — this view. We
 * measure it in `onLayout` (`measureInWindow`, so ancestor padding,
 * headers or a status bar all count) and fall back to `insets.top`,
 * which is the right value for the current OnboardingFlow layout even
 * before the first measurement lands.
 *
 * `behavior="padding"` on both platforms: Android runs edge-to-edge here
 * (`edgeToEdgeEnabled`), so `adjustResize` no longer shrinks the window
 * and the default (undefined) behaviour does nothing. RN's Android
 * keyboard event still reports the keyboard top from the visible display
 * frame (ReactRootView.checkForKeyboardEvents), so the same padding math
 * works there.
 */
export function KeyboardAvoider({
  children,
  style,
  enabled,
  testID,
}: KeyboardAvoiderProps) {
  const insets = useSafeAreaInsets();
  const ref = useRef<View>(null);
  const [measuredY, setMeasuredY] = useState<number | null>(null);

  const onLayout = useCallback(() => {
    // Fires at mount and whenever this view's own frame changes
    // (rotation, inset changes); the KAV padding itself does not move
    // this wrapper, so in practice this is one measurement per step.
    ref.current?.measureInWindow((_x, y) => {
      // Native can report NaN/undefined before the view is attached; a
      // negative Y is never a valid offset (the KAV would over-shift).
      if (typeof y !== "number" || !Number.isFinite(y) || y < 0) return;
      setMeasuredY((prev) => (prev === y ? prev : y));
    });
  }, []);

  return (
    <View ref={ref} onLayout={onLayout} style={style} testID={testID}>
      <KeyboardAvoidingView
        behavior="padding"
        enabled={enabled}
        keyboardVerticalOffset={measuredY ?? insets.top}
        style={styles.fill}
      >
        {children}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
