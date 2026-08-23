import { fireEvent, render, waitFor } from "@testing-library/react-native";
import * as Sharing from "expo-sharing";
import { Share } from "react-native";
import { captureRef } from "react-native-view-shot";

import { ContentCard } from "@/features/content/ContentCard";
import type { ContentItem } from "@/features/content/types";

jest.mock("react-native-view-shot", () => ({
  captureRef: jest.fn(async () => "file:///tmp/quote-card.png"),
}));
jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => {}),
}));
jest.mock("@/lib/analytics", () => ({
  analytics: { capture: jest.fn() },
}));

const item: ContentItem = {
  id: "q1",
  type: "quote",
  body: "The future belongs to those who prepare for it today.",
  author: "Malcolm X",
  categories: [],
  tags: [],
  priority: 0,
};

function renderCard() {
  return render(
    <ContentCard
      item={item}
      height={800}
      isFavorite={false}
      onToggleFavorite={() => {}}
    />,
  );
}

describe("ContentCard share", () => {
  beforeEach(() => jest.clearAllMocks());

  it("captures the themed quote card and shares it as an image", async () => {
    const { getByTestId } = renderCard();

    fireEvent.press(getByTestId("share-q1"));
    // The test renderer never emits native layout events, so trigger the
    // freshly mounted card's onLayout by hand.
    fireEvent(getByTestId("share-card-q1"), "layout");

    await waitFor(() =>
      expect(Sharing.shareAsync).toHaveBeenCalledWith(
        "file:///tmp/quote-card.png",
        { mimeType: "image/png" },
      ),
    );
    expect(captureRef).toHaveBeenCalled();
  });

  it("falls back to text sharing when the image capture fails", async () => {
    (captureRef as jest.Mock).mockRejectedValueOnce(new Error("no view"));
    const shareSpy = jest
      .spyOn(Share, "share")
      .mockResolvedValue({ action: Share.dismissedAction });
    const { getByTestId } = renderCard();

    fireEvent.press(getByTestId("share-q1"));
    fireEvent(getByTestId("share-card-q1"), "layout");

    await waitFor(() =>
      expect(shareSpy).toHaveBeenCalledWith({
        message: `${item.body} — ${item.author}\n\nvia Future Self`,
      }),
    );
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
    shareSpy.mockRestore();
  });
});
