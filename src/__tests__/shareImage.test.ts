import { Share } from "react-native";

import {
  shareCaption,
  shareContentImage,
  shareFileUri,
} from "@/features/content/shareImage";
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

describe("shareCaption", () => {
  it("includes the quote, author, and Future Self mark", () => {
    expect(shareCaption(item)).toBe(
      "Discipline is remembering what you want. — Test Author\n\nvia Future Self",
    );
  });

  it("omits the author dash when there is no author", () => {
    expect(shareCaption({ ...item, author: null })).toBe(
      "Discipline is remembering what you want.\n\nvia Future Self",
    );
  });
});

describe("shareFileUri", () => {
  it("prefixes bare filesystem paths for the iOS share sheet", () => {
    expect(shareFileUri("/tmp/quote-card.png")).toBe(
      "file:///tmp/quote-card.png",
    );
    expect(shareFileUri("file:///tmp/quote-card.png")).toBe(
      "file:///tmp/quote-card.png",
    );
  });
});

describe("shareContentImage", () => {
  const share = jest.spyOn(Share, "share").mockResolvedValue({
    action: Share.sharedAction,
  });

  afterEach(() => {
    share.mockClear();
  });

  afterAll(() => {
    share.mockRestore();
  });

  it("shares the captured image file, not a text-only payload", async () => {
    const result = await shareContentImage({
      item,
      capture: async () => "file:///tmp/quote-card.png",
    });
    expect(result).toBe("image");
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ url: "file:///tmp/quote-card.png" }),
    );
    const payload = share.mock.calls[0]?.[0] as { message?: string };
    expect(payload.message).toBeUndefined();
  });

  it("falls back to the text caption if capture fails", async () => {
    const result = await shareContentImage({
      item,
      capture: async () => {
        throw new Error("capture failed");
      },
    });
    expect(result).toBe("text");
    expect(share).toHaveBeenCalledWith({
      message: shareCaption(item),
    });
  });
});
