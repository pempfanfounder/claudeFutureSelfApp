import { createRef } from "react";
import { FlatList } from "react-native";
import { render } from "@testing-library/react-native";

import {
  FeedColumn,
  programmaticPagerScroll,
  type FeedRow,
} from "@/app/(main)/feed";
import { ThemeProvider } from "@/design-system/ThemeProvider";
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

const quote: ContentItem = {
  id: "quote-1",
  type: "quote",
  body: "Discipline is remembering what you want.",
  author: null,
  categories: [],
  tags: [],
  priority: 0,
};

const rows: FeedRow[] = [
  { kind: "item", item: quote },
  { kind: "end" },
];

const feed = {
  quotes: [quote],
  affirmations: [],
  favoriteIds: [] as string[],
  completedToday: false,
  loading: false,
  error: null as string | null,
  pendingCount: 0,
  toggleFavorite: () => {},
};

describe("programmaticPagerScroll", () => {
  it("never asks UIKit to animate the Quotes / Affirmations page change", () => {
    expect(programmaticPagerScroll(390, "affirmation")).toEqual({
      x: 390,
      y: 0,
      animated: false,
    });
    expect(programmaticPagerScroll(390, "quote")).toEqual({
      x: 0,
      y: 0,
      animated: false,
    });
  });
});

describe("FeedColumn viewability", () => {
  const viewabilityConfig = { itemVisiblePercentThreshold: 70 };
  const onViewableItemsChanged = jest.fn();

  function renderColumn(active: boolean) {
    return render(
      <ThemeProvider>
        <FeedColumn
          listRef={createRef()}
          rows={rows}
          kind="quote"
          active={active}
          pageH={700}
          userId="fs-local-a"
          feed={feed as never}
          offsets={{ current: { quote: 0, affirmation: 0 } }}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
        />
      </ThemeProvider>,
    );
  }

  it("keeps onViewableItemsChanged defined when the other tab is selected", () => {
    const inactive = renderColumn(false);
    const list = inactive.UNSAFE_getByType(FlatList);
    expect(typeof list.props.onViewableItemsChanged).toBe("function");
    inactive.unmount();
  });

  it("does not change onViewableItemsChanged nullability when the tab flips", () => {
    const screen = renderColumn(true);
    const before = typeof screen.UNSAFE_getByType(FlatList).props
      .onViewableItemsChanged;
    screen.rerender(
      <ThemeProvider>
        <FeedColumn
          listRef={createRef()}
          rows={rows}
          kind="quote"
          active={false}
          pageH={700}
          userId="fs-local-a"
          feed={feed as never}
          offsets={{ current: { quote: 0, affirmation: 0 } }}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
        />
      </ThemeProvider>,
    );
    const after = typeof screen.UNSAFE_getByType(FlatList).props
      .onViewableItemsChanged;
    expect(before).toBe("function");
    expect(after).toBe("function");
    screen.unmount();
  });
});
