import { LOCAL_CATALOG } from "@/features/content/localCatalog";

export interface PreviewNotification {
  body: string;
  time: string;
}

/**
 * Real Future Self-voice lines from the shipped content pack, front card
 * first. Ids are looked up so the paywall never drifts from the catalog;
 * `time` mirrors iOS's relative stamps to read as a day of deliveries.
 * The two older cards are one-liners because only their top strip shows.
 *
 * Paywall-only cuts (TestFlight 13 Sep 2026): drop the ellipsis on owner
 * #11, and swap the middle affirmation for the locked start-now line.
 * The library itself is unchanged.
 */
const PREVIEW: { id: string; time: string; body?: string }[] = [
  { id: "local:q11", time: "Now" },
  { id: "local:a02", time: "3h ago", body: "I start now, not later." },
  { id: "local:a01", time: "Yesterday" },
];

function paywallBody(id: string, catalogBody: string, override?: string): string {
  if (override) return override;
  if (id === "local:q11") return catalogBody.replace(/\s*…\s*$/u, "");
  return catalogBody;
}

export function paywallPreviewNotifications(): PreviewNotification[] {
  const items: PreviewNotification[] = [];
  for (const { id, time, body } of PREVIEW) {
    const item = LOCAL_CATALOG.find((c) => c.id === id);
    if (item) items.push({ body: paywallBody(id, item.body, body), time });
  }
  return items;
}
