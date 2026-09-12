import { StyleSheet } from "react-native";
import { render, waitFor } from "@testing-library/react-native";
import type { ReactTestRendererJSON } from "react-test-renderer";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ThemeProvider } from "@/design-system/ThemeProvider";
import { toPalette, themeById } from "@/design-system/themes";
import { ShareCard } from "@/features/content/ShareCard";
import type { ContentItem } from "@/features/content/types";

const item: ContentItem = {
  id: "quote-1",
  type: "quote",
  body: "Discipline is remembering what you want.",
  author: "Test Author",
  categories: [],
  tags: [],
  priority: 0,
};

function surfaceColor(json: ReactTestRendererJSON | null) {
  expect(json).not.toBeNull();
  expect(Array.isArray(json)).toBe(false);
  const style = StyleSheet.flatten(
    (json as ReactTestRendererJSON).props.style,
  ) as { backgroundColor?: string };
  return style.backgroundColor;
}

describe("ShareCard", () => {
  it("renders the quote, author, and Future Self mark", () => {
    const screen = render(
      <ThemeProvider>
        <ShareCard item={item} />
      </ThemeProvider>,
    );
    expect(
      screen.getByText("Discipline is remembering what you want."),
    ).toBeTruthy();
    expect(screen.getByText("— Test Author")).toBeTruthy();
    expect(screen.getByText("Future Self")).toBeTruthy();
    screen.unmount();
  });

  it("paints the card with the active app theme", async () => {
    await AsyncStorage.setItem("fs.theme.v1", "midnight_focus");
    const midnight = toPalette(themeById("midnight_focus")!);
    const screen = render(
      <ThemeProvider>
        <ShareCard item={item} />
      </ThemeProvider>,
    );
    await waitFor(() => {
      expect(surfaceColor(screen.toJSON() as ReactTestRendererJSON)).toBe(
        midnight.bg,
      );
    });
    expect(midnight.bg).toBe("#12161A");
    screen.unmount();
  });
});
