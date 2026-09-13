import { render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import type { ReactTestRendererJSON } from "react-test-renderer";

import { feedRetryOverlayText, pageLayout } from "@/app/(main)/feed";
import { ThemeProvider } from "@/design-system/ThemeProvider";
import { ContentCard } from "@/features/content/ContentCard";
import type { ContentItem } from "@/features/content/types";

jest.mock("expo-router", () => ({
  router: {
    replace: jest.fn(),
    push: jest.fn(),
    back: jest.fn(),
    canGoBack: () => false,
  },
  Redirect: () => null,
}));

describe("pageLayout", () => {
  it("sizes and offsets every page from the measured list height", () => {
    expect(pageLayout(700, 2)).toEqual({ length: 700, offset: 1400, index: 2 });
  });

  it("keeps the first page at offset zero", () => {
    expect(pageLayout(812, 0)).toEqual({ length: 812, offset: 0, index: 0 });
  });
});

describe("ContentCard", () => {
  const item: ContentItem = {
    id: "quote-1",
    type: "quote",
    body: "Discipline is remembering what you want.",
    author: "Test Author",
    categories: ["discipline"],
    tags: [],
    priority: 0,
  };

  it("applies the height prop to its root style", () => {
    const screen = render(
      <ThemeProvider>
        <ContentCard
          item={item}
          height={700}
          isFavorite={false}
          onToggleFavorite={() => {}}
        />
      </ThemeProvider>,
    );
    const root = screen.toJSON() as ReactTestRendererJSON | null;
    expect(root).not.toBeNull();
    expect(Array.isArray(root)).toBe(false);
    const style = StyleSheet.flatten(root!.props.style) as {
      height?: number;
    };
    expect(style.height).toBe(700);
    screen.unmount();
  });
});

describe("feedRetryOverlayText", () => {
  it("does not treat an in-flight quote view as a failed sync", () => {
    expect(
      feedRetryOverlayText({
        loading: false,
        error: null,
        pendingCount: 1,
      }),
    ).toBeNull();
    expect(
      feedRetryOverlayText({
        loading: false,
        error: null,
        pendingCount: 3,
      }),
    ).toBeNull();
  });

  it("still surfaces a real load or sync failure", () => {
    expect(
      feedRetryOverlayText({
        loading: true,
        error: null,
        pendingCount: 0,
      }),
    ).toBe("Loading your quotes.");
    expect(
      feedRetryOverlayText({
        loading: false,
        error: "Saved on this device. Some changes are pending; tap Retry.",
        pendingCount: 1,
      }),
    ).toBe("Saved on this device. Some changes are pending; tap Retry.");
  });
});

it("empty or pending feed states never claim an acknowledged safe streak", () => {
  const { EndCard } = require("@/app/(main)/feed");
  const screen = render(
    <ThemeProvider>
      <EndCard height={700} tab="quote" completed empty failed />
    </ThemeProvider>,
  );
  expect(screen.queryByText("That's the whole set for today.")).toBeNull();
  expect(
    screen.getByText("Tap Retry to reconnect and load your set."),
  ).toBeTruthy();
  screen.rerender(
    <ThemeProvider>
      <EndCard height={700} tab="quote" completed pending />
    </ThemeProvider>,
  );
  expect(
    screen.getByText(
      "Your progress is saved on this device and waiting to sync.",
    ),
  ).toBeTruthy();
  expect(screen.queryByText(/Streak's safe/)).toBeNull();
});
