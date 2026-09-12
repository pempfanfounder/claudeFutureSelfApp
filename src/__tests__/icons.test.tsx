import { render } from "@testing-library/react-native";
import { Platform } from "react-native";

import { Icon, type IconName } from "@/design-system/components";
import { ThemeProvider } from "@/design-system/ThemeProvider";
import {
  CARD_ACTION_ICON_SIZE,
  ContentCard,
  FAVORITE_RED,
} from "@/features/content/ContentCard";
import type { ContentItem } from "@/features/content/types";

/**
 * Every semantic icon name must render on both branches: the
 * SymbolView path (jest-expo runs as iOS) and the unicode fallback
 * (Android and any platform without SF Symbols).
 */
const ALL_ICONS: IconName[] = [
  "share",
  "heart",
  "heartFill",
  "close",
  "back",
  "chevronRight",
  "settings",
  "palette",
  "sparkle",
  "plus",
  "minus",
  "grid",
  "person",
  "widget",
  "bell",
  "check",
  "flame",
  "chart",
  "fog",
  "strength",
  "brain",
  "health",
  "briefcase",
  "peace",
  "compass",
  "hourglass",
  "phone",
  "repeat",
  "spiral",
  "reflect",
  "map",
  "money",
  "target",
  "lockOpen",
  "diamond",
];

describe("Icon", () => {
  it.each(ALL_ICONS)("renders %s on the iOS symbol path", (name) => {
    const screen = render(<Icon name={name} size={24} color="#111111" />);
    expect(screen.toJSON()).not.toBeNull();
    screen.unmount();
  });

  it.each(ALL_ICONS)("renders %s via the unicode fallback", (name) => {
    const os = jest.replaceProperty(Platform, "OS", "android");
    const screen = render(<Icon name={name} size={24} color="#111111" />);
    expect(screen.toJSON()).not.toBeNull();
    screen.unmount();
    os.restore();
  });
});

describe("ContentCard actions", () => {
  const item: ContentItem = {
    id: "quote-1",
    type: "quote",
    body: "Discipline is remembering what you want.",
    author: "Test Author",
    categories: ["discipline"],
    tags: [],
    priority: 0,
  };

  it("keeps the share and favorite testIDs after the icon swap", () => {
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
    expect(screen.getByTestId("share-quote-1")).toBeTruthy();
    expect(screen.getByTestId("favorite-quote-1")).toBeTruthy();
    screen.unmount();
  });

  it("renders share and like larger than the 24pt chrome icons", () => {
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
    const icons = screen.UNSAFE_getAllByType(Icon);
    const share = icons.find((node) => node.props.name === "share");
    const heart = icons.find((node) => node.props.name === "heart");
    expect(share?.props.size).toBe(CARD_ACTION_ICON_SIZE);
    expect(heart?.props.size).toBe(CARD_ACTION_ICON_SIZE);
    expect(CARD_ACTION_ICON_SIZE).toBeGreaterThan(24);
    screen.unmount();
  });

  it("fills a liked heart with a bright red, not the dusty theme accent", () => {
    const screen = render(
      <ThemeProvider>
        <ContentCard
          item={item}
          height={700}
          isFavorite
          onToggleFavorite={() => {}}
        />
      </ThemeProvider>,
    );
    const heart = screen
      .UNSAFE_getAllByType(Icon)
      .find((node) => node.props.name === "heartFill");
    expect(heart?.props.color).toBe(FAVORITE_RED);
    expect(heart?.props.color).not.toBe("#E4B5A4");
    screen.unmount();
  });
});
