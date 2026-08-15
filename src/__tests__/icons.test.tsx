import { render } from "@testing-library/react-native";
import { Platform } from "react-native";

import { Icon, type IconName } from "@/design-system/components";
import { ThemeProvider } from "@/design-system/ThemeProvider";
import { ContentCard } from "@/features/content/ContentCard";
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
});
