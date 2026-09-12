import { useAppState } from "@/lib/appState";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { themeById } from "@/design-system/themes";
import {
  DEFAULT_WIDGET_PREFS,
  loadWidgetPrefs,
  paletteForWidget,
  setWidgetPrefs,
  useWidgetPrefs,
} from "@/features/widgets/widgetPrefs";
import { syncWidgets } from "@/features/widgets/widgetSync";

jest.mock("@/features/widgets/widgetSync", () => ({
  syncWidgets: jest.fn(async () => {}),
}));

const resetStore = () => {
  useWidgetPrefs.setState({
    prefs: DEFAULT_WIDGET_PREFS,
    hydrated: false,
  });
};

beforeEach(async () => {
  await AsyncStorage.clear();
  useAppState.getState().setUserId(null);
  useAppState.getState().setUserId("fs-local-widget-a");
  resetStore();
  jest.clearAllMocks();
});

describe("widgetPrefs store", () => {
  it("starts with the documented defaults", () => {
    const { prefs } = useWidgetPrefs.getState();
    expect(prefs).toEqual({
      home: { themeId: "minimal_sand", source: "daily", showAuthor: true },
      lock: { source: "daily" },
    });
    expect(prefs).toEqual(DEFAULT_WIDGET_PREFS);
  });

  it("deep-merges partial updates without touching other branches", async () => {
    await setWidgetPrefs({ home: { themeId: "midnight_focus" } });

    const afterHome = useWidgetPrefs.getState().prefs;
    expect(afterHome.home.themeId).toBe("midnight_focus");
    // Untouched siblings survive the merge.
    expect(afterHome.home.source).toBe("daily");
    expect(afterHome.home.showAuthor).toBe(true);
    // Lock branch untouched.
    expect(afterHome.lock).toEqual({ source: "daily" });

    await setWidgetPrefs({ lock: { source: "pinned" } });
    const afterLock = useWidgetPrefs.getState().prefs;
    expect(afterLock.lock.source).toBe("pinned");
    expect(afterLock.home.themeId).toBe("midnight_focus");
  });

  it("persists prefs and hydrates them back on a fresh load", async () => {
    await setWidgetPrefs({
      home: { themeId: "arctic", source: "pinned", showAuthor: false },
      lock: { source: "pinned" },
    });

    // Simulate a fresh app launch: in-memory state gone, storage intact.
    resetStore();
    expect(useWidgetPrefs.getState().prefs).toEqual(DEFAULT_WIDGET_PREFS);

    await loadWidgetPrefs();
    const { prefs, hydrated } = useWidgetPrefs.getState();
    expect(hydrated).toBe(true);
    expect(prefs.home).toEqual({
      themeId: "arctic",
      source: "pinned",
      showAuthor: false,
    });
    expect(prefs.lock).toEqual({ source: "pinned" });
  });

  it("hydrates only once", async () => {
    await setWidgetPrefs({ home: { themeId: "evergreen" } });
    resetStore();
    await loadWidgetPrefs();

    // A later in-session change must not be clobbered by a second load.
    await setWidgetPrefs({ home: { themeId: "terracotta" } });
    await loadWidgetPrefs();
    expect(useWidgetPrefs.getState().prefs.home.themeId).toBe("terracotta");
  });

  it("calls syncWidgets after persisting a change", async () => {
    expect(syncWidgets).not.toHaveBeenCalled();
    await setWidgetPrefs({ home: { showAuthor: false } });
    expect(syncWidgets).toHaveBeenCalledTimes(1);

    const stored = await AsyncStorage.getItem(
      "fs.widget.prefs.v2.fs-local-widget-a",
    );
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored!).home.showAuthor).toBe(false);
  });
});

describe("paletteForWidget", () => {
  it("derives bg/ink from a theme without an explicit palette", () => {
    const theme = themeById("midnight_focus")!;
    expect(paletteForWidget("midnight_focus")).toEqual({
      bg: theme.bg,
      ink: theme.ink,
      ink2: `${theme.ink}99`,
    });
  });

  it("uses explicit palette values when the theme has one", () => {
    const sand = themeById("minimal_sand")!;
    const palette = paletteForWidget("minimal_sand");
    expect(palette.bg).toBe(sand.palette!.bg);
    expect(palette.ink).toBe(sand.palette!.ink);
    expect(palette.ink2).toBe(sand.palette!.ink2);
  });

  it("falls back to minimal_sand for unknown theme ids", () => {
    expect(paletteForWidget("nonsense")).toEqual(
      paletteForWidget("minimal_sand"),
    );
    expect(paletteForWidget("nonsense").bg).toBe("#EDE0D6");
  });
});

test("widget preferences never hydrate a departed account into the new account", async () => {
  await setWidgetPrefs({ home: { source: "pinned" } });
  useAppState.getState().setUserId("fs-local-widget-b");
  resetStore();
  await loadWidgetPrefs();
  expect(useWidgetPrefs.getState().prefs.home.source).toBe("daily");
  useAppState.getState().setUserId("fs-local-widget-a");
  resetStore();
  await loadWidgetPrefs();
  expect(useWidgetPrefs.getState().prefs.home.source).toBe("pinned");
});
test("storage rejection cannot claim a widget preference was saved", async () => {
  const prior = useWidgetPrefs.getState().prefs;
  (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(
    new Error("Synthetic disk full"),
  );
  await expect(
    setWidgetPrefs({ home: { source: "pinned" } }),
  ).rejects.toThrow();
  expect(useWidgetPrefs.getState().prefs).toEqual(prior);
});
