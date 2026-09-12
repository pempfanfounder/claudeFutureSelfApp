import { Platform } from "react-native";

import {
  captureIdentity,
  assertCurrentIdentity,
  useAppState,
  type Identity,
} from "@/lib/appState";
import { getLocalDate } from "@/features/content/dailySet";
import { monitoring } from "@/lib/monitoring";

import { useFeedStore } from "@/features/content/feedStore";
import type { ContentItem } from "@/features/content/types";

import { DEFAULT_PINNED, getPinnedText } from "./pinned";
import {
  DEFAULT_WIDGET_PREFS,
  loadWidgetPrefs,
  paletteForWidget,
  useWidgetPrefs,
  setWidgetSyncError,
  type WidgetPrefs,
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
let nativeQueue: Promise<unknown> = Promise.resolve();
let nativeStalled = false;
function queueNative<T>(work: () => Promise<T>, clearing = false): Promise<T> {
  if (nativeStalled && !clearing)
    return Promise.reject(
      new Error("Widget service is still busy. Restart the app to recover."),
    );
  const next = nativeQueue.then(work, work);
  nativeQueue = next.catch(() => {});
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      nativeStalled = true;
      reject(
        new Error("Widget service did not finish. Restart the app to recover."),
      );
    }, 8000);
  });
  // Keep the actual write on the queue even when the UI deadline expires.
  // Releasing its lock early would let it overwrite a newer neutral clear.
  void next
    .finally(() => {
      clearTimeout(timer);
      nativeStalled = false;
    })
    .catch(() => {});
  return Promise.race([next, timeout]);
}

function valid(identity: Identity, day: string, version?: number) {
  assertCurrentIdentity(identity);
  const feed = useFeedStore.getState();
  if (
    !useAppState.getState().isPremium ||
    day !== getLocalDate() ||
    feed.loading ||
    feed.ownerGeneration !== identity.generation ||
    feed.contentDay !== day ||
    (version !== undefined && feed.contentVersion !== version)
  )
    throw new Error("Widget source changed.");
}
export async function syncWidgets(identity = captureIdentity()): Promise<void> {
  const day = getLocalDate();
  try {
    valid(identity, day);
    await loadWidgetPrefs(identity);
    const {
      quotes,
      affirmations,
      lifeGoal,
      pinnedAffirmation,
      contentVersion,
    } = useFeedStore.getState();
    const items = interleave(quotes, affirmations);
    const pinned = await getPinnedText(pinnedAffirmation ?? lifeGoal, identity);
    valid(identity, day);
    const prefs = useWidgetPrefs.getState().prefs;
    await queueNative(async () => {
      const check = () => valid(identity, day, contentVersion);
      check();
      const link = (item: ContentItem) =>
        `futureself://content/${item.id}?kind=${item.type}&source=daily&day=${day}&owner=${identity.userId}`;
      if (Platform.OS === "ios")
        await syncIos(items, pinned, prefs, check, link);
      else if (Platform.OS === "android")
        await syncAndroid(items, pinned, prefs, check, link);
    });
    setWidgetSyncError(identity, null);
  } catch (error) {
    monitoring.captureError(error, { area: "widgets.sync" });
    setWidgetSyncError(
      identity,
      "Saved in the app. Widget refresh failed; tap Retry.",
    );
    throw error;
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
  // Always queue neutral content after an in-flight departed-account write.
  // A native call already in progress cannot be canceled by JavaScript.
  await queueNative(async () => {
    if (Platform.OS === "ios") await clearIos();
    else if (Platform.OS === "android") await clearAndroid();
  }, true);
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

/** Current entry first, then strictly increasing future entries through 22:00. */
export function slotDates(count: number, now = new Date()): Date[] {
  if (count <= 0) return [];
  const end = new Date(now);
  end.setHours(22, 0, 0, 0);
  if (now >= end) return [new Date(now.getTime() - 1000)];
  const start = Math.max(now.getTime(), new Date(now).setHours(7, 0, 0, 0));
  return Array.from(
    { length: count },
    (_, i) =>
      new Date(
        i === 0
          ? now.getTime() - 1000
          : start + ((end.getTime() - start) * i) / Math.max(1, count - 1),
      ),
  );
}

async function syncIos(
  items: ContentItem[],
  pinned: string,
  prefs: WidgetPrefs,
  check: () => void,
  link: (item: ContentItem) => string,
) {
  const { Voltra } = await import("@use-voltra/ios");
  const { scheduleWidget, updateWidget } =
    await import("@use-voltra/ios-client");
  check();
  const { home, lock } = prefs;
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
  const lockLink = (item: ContentItem | undefined) =>
    lock.source === "pinned" || !item?.id
      ? "futureself://widget-setup"
      : link(item);
  const accessories = (item: ContentItem | undefined) => ({
    accessoryRectangular: (
      <Voltra.Link destination={lockLink(item)}>
        <Voltra.Text style={{ fontSize: 12 }}>
          {truncate(lockLine(item), 70)}
        </Voltra.Text>
      </Voltra.Link>
    ),
    accessoryInline: (
      <Voltra.Link destination={lockLink(item)}>
        <Voltra.Text>{truncate(lockLine(item), 40)}</Voltra.Text>
      </Voltra.Link>
    ),
  });

  if (home.source === "pinned") {
    // Static content: a single always-current entry is enough.
    check();
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
  } else {
    if (!items.length)
      items = [
        {
          id: "",
          type: "quote",
          body: CLEARED_DAILY_TEXT,
          author: null,
          categories: [],
          tags: [],
          priority: 0,
        },
      ];
    const dates = slotDates(items.length);
    // A past-dated first entry makes item 0 the current state.
    items = items.slice(0, dates.length);
    check();
    await scheduleWidget(
      "daily",
      items.map((item, i) => ({
        date: dates[i]!,
        deepLinkUrl: item.id ? link(item) : "futureself://widget-setup",
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

  check();
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

async function syncAndroid(
  items: ContentItem[],
  pinned: string,
  prefs: WidgetPrefs,
  check: () => void,
  link: (item: ContentItem) => string,
) {
  const { VoltraAndroid } = await import("@use-voltra/android");
  const { updateAndroidWidget } = await import("@use-voltra/android-client");
  check();
  const { home } = prefs;
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
  const current = items[0] ?? {
    id: "",
    type: "quote",
    body: CLEARED_DAILY_TEXT,
    author: null,
  };
  if (usePinned || current) {
    const body = usePinned ? pinned : current!.body;
    const author =
      usePinned || !home.showAuthor ? null : (current!.author ?? null);
    check();
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
        deepLinkUrl:
          usePinned || !current.id
            ? "futureself://widget-setup"
            : link(current as ContentItem),
      },
    );
  }

  check();
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
