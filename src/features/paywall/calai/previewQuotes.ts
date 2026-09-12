import { LOCAL_CATALOG } from "@/features/content/localCatalog";

export interface PreviewNotification {
  body: string;
  time: string;
}

/**
 * Real Future Self-voice lines from the shipped content pack, front card
 * first. Ids are looked up so the paywall never drifts from the catalog;
 * `time` mirrors iOS's relative stamps to read as a day of deliveries.
 */
const PREVIEW: { id: string; time: string }[] = [
  { id: "local:q11", time: "Now" },
  { id: "local:a06", time: "3h ago" },
  { id: "local:q12", time: "Yesterday" },
];

export function paywallPreviewNotifications(): PreviewNotification[] {
  const items: PreviewNotification[] = [];
  for (const { id, time } of PREVIEW) {
    const item = LOCAL_CATALOG.find((c) => c.id === id);
    if (item) items.push({ body: item.body, time });
  }
  return items;
}
