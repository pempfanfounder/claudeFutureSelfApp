import { Platform } from "react-native";

import { monitoring } from "@/lib/monitoring";

import { useFeedStore } from "@/features/content/feedStore";
import type { ContentItem } from "@/features/content/types";

import { DEFAULT_PINNED, getPinnedText } from "./pinned";
import {
  DEFAULT_WIDGET_PREFS,
  loadWidgetPrefs,
  paletteForWidget,
  useWidgetPrefs,
} from "./widgetPrefs";

/**
 * Voltra widget sync.
 *
 * - `daily` widget: today's quotes + affirmations interleaved (or the
 *   pinned line when the user picked that source). iOS gets a real
 *   WidgetKit timeline (entries rotate through the day with no app
 *   involvement); Android Glance gets the current item and refreshes
 *   on each app foreground. Palette + content source follow the user's
 *   widget prefs (see `widgetPrefs.ts`).
 * - `future_self` widget: the persistent pinned line (life goal or the
 *   user's own affirmation). Unchanged until the user edits it.
 *
 * Voltra's native modules only exist in dev/production builds (never
 * Expo Go or Jest), so everything loads lazily and fails soft.
 */
export async function syncWidgets(): Promise<void> {
  try {
    // Idempotent: guarantees a cold-start sync uses persisted prefs.
    await loadWidgetPrefs();
    const { quotes, affirmations, lifeGoal, pinnedAffirmation } =
      useFeedStore.getState();
    const items = interleave(quotes, affirmations);
    const pinned = await getPinnedText(pinnedAffirmation ?? lifeGoal);

    if (Platform.OS === "ios") {
      await syncIos(items, pinned);
    } else if (Platform.OS === "android") {
      await syncAndroid(items, pinned);
    }
  } catch (error) {
    // Widget sync must never break the app (e.g. running in Expo Go).
    monitoring.captureError(error, { area: "widgets.sync" });
  }
}

/** Neutral copy shown on the daily widget after sign-out/deletion. */
const CLEARED_DAILY_TEXT = "Your daily words return here.";

/**
 * Replaces both widgets' content with neutral copy (default palette,
 * default pinned line). Runs on sign-out and account deletion so a
 * departed user's personal line never lingers on the OS home screen.
 * Same fail-soft contract as `syncWidgets`: Voltra's native modules
 * only exist in dev/production builds, so imports stay lazy and every
 * failure is swallowed into monitoring.
 */
export async function clearWidgets(): Promise<void> {
  try {
    if (Platform.OS === "ios") {
      await clearIos();
    } else if (Platform.OS === "android") {
      await clearAndroid();
    }
  } catch (error) {
    monitoring.captureError(error, { area: "widgets.clear" });
  }
}

function interleave(a: ContentItem[], b: ContentItem[]): ContentItem[] {
  const out: ContentItem[] = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    if (a[i]) out.push(a[i]!);
    if (b[i]) out.push(b[i]!);
  }
  return out;
}

/** Widget rotation window: 07:00 → 22:00 local. */
function slotDates(count: number): Date[] {
  const dates: Date[] = [];
  const start = new Date();
  start.setHours(7, 0, 0, 0);
  const end = new Date();
  end.setHours(22, 0, 0, 0);
  const stepMs =
    count > 1 ? (end.getTime() - start.getTime()) / (count - 1) : 0;
  for (let i = 0; i < count; i++) {
    dates.push(new Date(start.getTime() + stepMs * i));
  }
  return dates;
}

async function syncIos(items: ContentItem[], pinned: string) {
  const { Voltra } = await import("@use-voltra/ios");
  const { scheduleWidget, updateWidget } =
    await import("@use-voltra/ios-client");
  const { home, lock } = useWidgetPrefs.getState().prefs;
  const colors = paletteForWidget(home.themeId);

  const card = (text: string, author: string | null, fontSize: number) => (
    <Voltra.VStack
      style={{
        flex: 1,
        padding: 14,
        backgroundColor: colors.bg,
        justifyContent: "center",
      }}
    >
      <Voltra.Text style={{ color: colors.ink, fontSize, fontWeight: "500" }}>
        {text}
      </Voltra.Text>
      {author ? (
        <Voltra.Text style={{ color: colors.ink2, fontSize: 11, marginTop: 6 }}>
          — {author}
        </Voltra.Text>
      ) : null}
    </Voltra.VStack>
  );

  // Lock Screen accessories follow their own source preference.
  const lockLine = (item: ContentItem | undefined) =>
    lock.source === "pinned" ? pinned : (item?.body ?? pinned);
  const accessories = (item: ContentItem | undefined) => ({
    accessoryRectangular: (
      <Voltra.Text style={{ fontSize: 12 }}>
        {truncate(lockLine(item), 70)}
      </Voltra.Text>
    ),
    accessoryInline: <Voltra.Text>{truncate(lockLine(item), 40)}</Voltra.Text>,
  });

  if (home.source === "pinned") {
    // Static content: a single always-current entry is enough.
    await scheduleWidget("daily", [
      {
        date: new Date(Date.now() - 60_000),
        deepLinkUrl: "futureself://widget-setup",
        variants: {
          systemSmall: card(truncate(pinned, 90), null, 13),
          systemMedium: card(truncate(pinned, 140), null, 14),
          systemLarge: card(pinned, null, 18),
          ...accessories(items[0]),
        },
      },
    ]);
  } else if (items.length > 0) {
    const dates = slotDates(items.length);
    // A past-dated first entry makes item 0 the current state.
    dates[0] = new Date(Date.now() - 60_000);
    await scheduleWidget(
      "daily",
      items.map((item, i) => ({
        date: dates[i]!,
        deepLinkUrl: `futureself://content/${item.id}?kind=${item.type}`,
        variants: {
          systemSmall: card(truncate(item.body, 90), null, 13),
          systemMedium: card(
            truncate(item.body, 140),
            home.showAuthor ? item.author : null,
            14,
          ),
          systemLarge: card(
            item.body,
            home.showAuthor ? item.author : null,
            18,
          ),
          ...accessories(item),
        },
      })),
    );
  }

  await updateWidget(
    "future_self",
    {
      systemSmall: card(truncate(pinned, 100), null, 14),
      systemMedium: card(truncate(pinned, 160), null, 16),
      accessoryRectangular: (
        <Voltra.Text style={{ fontSize: 12 }}>
          {truncate(pinned, 70)}
        </Voltra.Text>
      ),
    },
    { deepLinkUrl: "futureself://widget-setup" },
  );
}

async function clearIos() {
  const { Voltra } = await import("@use-voltra/ios");
  const { scheduleWidget, updateWidget } =
    await import("@use-voltra/ios-client");
  const colors = paletteForWidget(DEFAULT_WIDGET_PREFS.home.themeId);

  const card = (text: string, fontSize: number) => (
    <Voltra.VStack
      style={{
        flex: 1,
        padding: 14,
        backgroundColor: colors.bg,
        justifyContent: "center",
      }}
    >
      <Voltra.Text style={{ color: colors.ink, fontSize, fontWeight: "500" }}>
        {text}
      </Voltra.Text>
    </Voltra.VStack>
  );

  await scheduleWidget("daily", [
    {
      date: new Date(Date.now() - 60_000),
      deepLinkUrl: "futureself://widget-setup",
      variants: {
        systemSmall: card(CLEARED_DAILY_TEXT, 13),
        systemMedium: card(CLEARED_DAILY_TEXT, 14),
        systemLarge: card(CLEARED_DAILY_TEXT, 18),
        accessoryRectangular: (
          <Voltra.Text style={{ fontSize: 12 }}>
            {CLEARED_DAILY_TEXT}
          </Voltra.Text>
        ),
        accessoryInline: (
          <Voltra.Text>{truncate(CLEARED_DAILY_TEXT, 40)}</Voltra.Text>
        ),
      },
    },
  ]);

  await updateWidget(
    "future_self",
    {
      systemSmall: card(DEFAULT_PINNED, 14),
      systemMedium: card(DEFAULT_PINNED, 16),
      accessoryRectangular: (
        <Voltra.Text style={{ fontSize: 12 }}>{DEFAULT_PINNED}</Voltra.Text>
      ),
    },
    { deepLinkUrl: "futureself://widget-setup" },
  );
}

async function syncAndroid(items: ContentItem[], pinned: string) {
  const { VoltraAndroid } = await import("@use-voltra/android");
  const { updateAndroidWidget } = await import("@use-voltra/android-client");
  const { home } = useWidgetPrefs.getState().prefs;
  const colors = paletteForWidget(home.themeId);

  const card = (text: string, author: string | null, fontSize: number) => (
    <VoltraAndroid.Column
      style={{
        width: "100%",
        height: "100%",
        padding: 14,
        backgroundColor: colors.bg,
      }}
      verticalAlignment="center-vertically"
    >
      <VoltraAndroid.Text style={{ color: colors.ink, fontSize }}>
        {text}
      </VoltraAndroid.Text>
      {author ? (
        <VoltraAndroid.Text style={{ color: colors.ink2, fontSize: 11 }}>
          — {author}
        </VoltraAndroid.Text>
      ) : null}
    </VoltraAndroid.Column>
  );

  const usePinned = home.source === "pinned";
  const current = items[0];
  if (usePinned || current) {
    const body = usePinned ? pinned : current!.body;
    const author =
      usePinned || !home.showAuthor ? null : (current!.author ?? null);
    await updateAndroidWidget(
      "daily",
      [
        {
          size: { width: 110, height: 110 },
          content: card(truncate(body, 90), null, 13),
        },
        {
          size: { width: 250, height: 110 },
          content: card(truncate(body, 160), author, 15),
        },
      ],
      {
        deepLinkUrl: usePinned
          ? "futureself://widget-setup"
          : `futureself://content/${current!.id}?kind=${current!.type}`,
      },
    );
  }

  await updateAndroidWidget(
    "future_self",
    [
      {
        size: { width: 110, height: 110 },
        content: card(truncate(pinned, 120), null, 14),
      },
    ],
    { deepLinkUrl: "futureself://widget-setup" },
  );
}

async function clearAndroid() {
  const { VoltraAndroid } = await import("@use-voltra/android");
  const { updateAndroidWidget } = await import("@use-voltra/android-client");
  const colors = paletteForWidget(DEFAULT_WIDGET_PREFS.home.themeId);

  const card = (text: string, fontSize: number) => (
    <VoltraAndroid.Column
      style={{
        width: "100%",
        height: "100%",
        padding: 14,
        backgroundColor: colors.bg,
      }}
      verticalAlignment="center-vertically"
    >
      <VoltraAndroid.Text style={{ color: colors.ink, fontSize }}>
        {text}
      </VoltraAndroid.Text>
    </VoltraAndroid.Column>
  );

  await updateAndroidWidget(
    "daily",
    [
      {
        size: { width: 110, height: 110 },
        content: card(CLEARED_DAILY_TEXT, 13),
      },
      {
        size: { width: 250, height: 110 },
        content: card(CLEARED_DAILY_TEXT, 15),
      },
    ],
    { deepLinkUrl: "futureself://widget-setup" },
  );

  await updateAndroidWidget(
    "future_self",
    [
      {
        size: { width: 110, height: 110 },
        content: card(DEFAULT_PINNED, 14),
      },
    ],
    { deepLinkUrl: "futureself://widget-setup" },
  );
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
