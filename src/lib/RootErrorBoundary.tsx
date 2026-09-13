import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { monitoring } from "./monitoring";

interface RootErrorBoundaryProps {
  children: ReactNode;
}
interface RootErrorBoundaryState {
  failed: boolean;
}

export const ROOT_ERROR_COPY = {
  headline: "Something went wrong.",
  body: "Future Self hit a snag it couldn't recover from. Try again; if it keeps happening, close and reopen the app.",
  retry: "Try again",
} as const;

/**
 * Last line of defence above the whole tree: a render throw in release
 * would otherwise leave a blank screen with no way back. Reports one
 * scrubbed event (area only, like every other diagnostic) and shows a
 * minimal fallback that remounts the app on tap. Deliberately uses no
 * theme, fonts or providers, since any of those may be what failed.
 */
export class RootErrorBoundary extends Component<
  RootErrorBoundaryProps,
  RootErrorBoundaryState
> {
  state: RootErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): RootErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown, _info: ErrorInfo) {
    monitoring.captureError(error, { area: "app.render" });
  }

  private retry = () => this.setState({ failed: false });

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View style={styles.root} testID="root-error-fallback">
        <Text accessibilityRole="header" style={styles.headline}>
          {ROOT_ERROR_COPY.headline}
        </Text>
        <Text style={styles.body}>{ROOT_ERROR_COPY.body}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={this.retry}
          style={styles.button}
          testID="root-error-retry"
        >
          <Text style={styles.buttonLabel}>{ROOT_ERROR_COPY.retry}</Text>
        </Pressable>
      </View>
    );
  }
}

// Minimal Sand palette, hardcoded on purpose (see class comment).
const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "center",
    padding: 28,
    gap: 16,
    backgroundColor: "#EDE0D6",
  },
  headline: { fontSize: 24, lineHeight: 30, color: "#2A1E16" },
  body: { fontSize: 16, lineHeight: 24, color: "#4B3A35" },
  button: {
    marginTop: 8,
    alignSelf: "flex-start",
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 999,
    backgroundColor: "#2A1E16",
  },
  buttonLabel: { fontSize: 16, color: "#FFFFFF" },
});
