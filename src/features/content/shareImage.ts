import { Share } from "react-native";

import type { ContentItem } from "./types";

export function shareCaption(item: ContentItem): string {
  const suffix = item.author ? ` — ${item.author}` : "";
  return `${item.body}${suffix}\n\nvia Future Self`;
}

/** iOS Share.share needs a file URL; view-shot often returns a bare path. */
export function shareFileUri(path: string): string {
  if (
    path.startsWith("file://") ||
    path.startsWith("content://") ||
    path.startsWith("ph://")
  )
    return path;
  return `file://${path}`;
}

/**
 * Share a PNG of the themed quote card. Falls back to the text caption
 * if capture fails so the button still does something.
 */
export async function shareContentImage({
  item,
  capture,
}: {
  item: ContentItem;
  capture: () => Promise<string>;
}): Promise<"image" | "text"> {
  const message = shareCaption(item);
  try {
    const uri = shareFileUri(await capture());
    if (!uri || uri === "file://") throw new Error("empty capture");
    // Image only. Passing `message` on iOS turns this into a text share.
    await Share.share({ url: uri });
    return "image";
  } catch {
    await Share.share({ message }).catch(() => {});
    return "text";
  }
}
