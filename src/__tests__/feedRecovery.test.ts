import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAppState } from "@/lib/appState";
import { getSupabase, getIdentitySupabase } from "@/lib/supabase";
import { getDailySet } from "@/features/content/repository";
import { useFeedStore, resetFeed } from "@/features/content/feedStore";
jest.mock("@/lib/supabase", () => ({
  getSupabase: jest.fn(),
  getIdentitySupabase: jest.fn(),
}));
jest.mock("@/features/content/repository", () => ({ getDailySet: jest.fn() }));
jest.mock("@/lib/analytics", () => ({ analytics: { capture: jest.fn() } }));
jest.mock("@/lib/monitoring", () => ({
  monitoring: { captureError: jest.fn() },
}));
const item = (id: string) => ({
  id,
  type: "quote" as const,
  body: "Original fixture words",
  author: null,
  categories: [],
  tags: [],
  priority: 1,
});
let rpc: jest.Mock;
let favoriteError: unknown;
beforeEach(async () => {
  await AsyncStorage.clear();
  resetFeed();
  useAppState.getState().setUserId(null);
  useAppState.getState().setUserId("fs-local-a");
  useAppState.getState().setPremium(true);
  favoriteError = null;
  rpc = jest.fn(async () => ({
    data: [{ completed_today: false, current_streak: 0, longest_streak: 0 }],
    error: null,
  }));
  const from = (table: string) => {
    const data =
      table === "personalization" ? {} : table === "streaks" ? null : [];
    const result = { data, error: null };
    const q: any = {
      select: () => q,
      eq: () => q,
      limit: () => q,
      maybeSingle: async () => result,
      then: (a: any, b: any) => Promise.resolve(result).then(a, b),
      upsert: async () => ({ error: favoriteError }),
      delete: () => ({ match: async () => ({ error: favoriteError }) }),
    };
    return q;
  };
  const client = { from, rpc };
  (getSupabase as jest.Mock).mockReturnValue(client);
  (getIdentitySupabase as jest.Mock).mockResolvedValue(client);
  (getDailySet as jest.Mock).mockImplementation(
    async (_u: string, t: string) => (t === "quote" ? [item("quote-1")] : []),
  );
});
test("late A feed cannot overwrite accepted B feed", async () => {
  let release!: (value: unknown) => void;
  const old = new Promise((r) => {
    release = r;
  });
  (getDailySet as jest.Mock).mockImplementation((u: string) =>
    u === "fs-local-a" ? old : Promise.resolve([item("b-quote")]),
  );
  const a = useFeedStore.getState().load("fs-local-a");
  await Promise.resolve();
  await Promise.resolve();
  useAppState.getState().setUserId("fs-local-b");
  useAppState.getState().setPremium(true);
  await useFeedStore.getState().load("fs-local-b");
  release([item("a-quote")]);
  await a;
  expect(useFeedStore.getState().quotes[0]?.id).toBe("b-quote");
});
test("rejected favorite remains a durable pending change across relaunch", async () => {
  await useFeedStore.getState().load("fs-local-a");
  favoriteError = new Error("Synthetic offline");
  await useFeedStore.getState().toggleFavorite("fs-local-a", item("quote-1"));
  expect((useFeedStore.getState() as any).pendingCount).toBeGreaterThan(0);
  resetFeed();
  await useFeedStore.getState().load("fs-local-a");
  expect(useFeedStore.getState().favoriteIds).toContain("quote-1");
  expect((useFeedStore.getState() as any).pendingCount).toBeGreaterThan(0);
});
test("a failed view can retry without losing its local progress or double counting", async () => {
  await useFeedStore.getState().load("fs-local-a");
  rpc.mockResolvedValueOnce({ error: new Error("Synthetic offline") });
  await useFeedStore.getState().markViewed("fs-local-a", item("quote-1"));
  await useFeedStore.getState().markViewed("fs-local-a", item("quote-1"));
  expect(rpc).toHaveBeenCalledTimes(2);
  expect(useFeedStore.getState().viewedToday).toEqual(["quote-1"]);
});
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
test("midnight acknowledgement retains new-day progress and sends joined work", async () => {
  const dateSpy = jest.spyOn(Date, "now");
  // getLocalDate uses Date construction, so isolate only the calendar dependency.
  const day = jest.spyOn(
    require("@/features/content/dailySet"),
    "getLocalDate",
  );
  day.mockReturnValue("2026-09-08");
  await useFeedStore.getState().load("fs-local-a");
  let release!: (v: unknown) => void;
  rpc.mockImplementationOnce(
    () =>
      new Promise((r) => {
        release = r;
      }),
  );
  const old = useFeedStore.getState().markViewed("fs-local-a", item("day-one"));
  await tick();
  day.mockReturnValue("2026-09-09");
  const next = useFeedStore
    .getState()
    .markViewed("fs-local-a", item("day-two"));
  await tick();
  release({
    data: [{ completed_today: false, current_streak: 0, longest_streak: 0 }],
    error: null,
  });
  await Promise.all([old, next]);
  expect(useFeedStore.getState().viewedToday).toEqual(["day-two"]);
  expect(rpc).toHaveBeenCalledTimes(2);
  resetFeed();
  await useFeedStore.getState().load("fs-local-a");
  expect(useFeedStore.getState().viewedToday).toEqual(["day-two"]);
  day.mockRestore();
  dateSpy.mockRestore();
});
test("a rejected item cannot block a later valid view", async () => {
  await useFeedStore.getState().load("fs-local-a");
  rpc.mockImplementation(async (_name: string, args: any) =>
    args.p_content_id === "bad"
      ? { error: new Error("Unknown content") }
      : {
          data: [
            { completed_today: false, current_streak: 0, longest_streak: 0 },
          ],
          error: null,
        },
  );
  await useFeedStore.getState().markViewed("fs-local-a", item("bad"));
  await useFeedStore.getState().markViewed("fs-local-a", item("good"));
  expect(rpc.mock.calls.some((call) => call[1].p_content_id === "good")).toBe(
    true,
  );
  expect(useFeedStore.getState().pendingCount).toBe(1);
});
test("missing view acknowledgement stays pending", async () => {
  await useFeedStore.getState().load("fs-local-a");
  rpc.mockResolvedValue({ data: null, error: null });
  await useFeedStore.getState().markViewed("fs-local-a", item("quote-1"));
  expect(useFeedStore.getState().pendingCount).toBe(1);
});

describe("S5 expired local view recovery", () => {
  let day: jest.SpyInstance;
  const key = "fs.feed.state.v2.fs-local-a";
  const view = (id: string, date: string, revision: number) => ({
    kind: "view",
    id,
    day: date,
    revision,
  });
  const seed = async (pending: unknown[]) =>
    AsyncStorage.setItem(
      key,
      JSON.stringify({
        day: "2026-09-08",
        favorites: [],
        viewed: ["preserved"],
        pending,
        currentStreak: 3,
        longestStreak: 9,
      }),
    );
  const saved = async () => JSON.parse((await AsyncStorage.getItem(key))!);
  beforeEach(() => {
    day = jest
      .spyOn(require("@/features/content/dailySet"), "getLocalDate")
      .mockReturnValue("2026-09-08");
  });
  afterEach(() => day.mockRestore());
  test.each([1, 500])(
    "preserves %i expired views outside active capacity across relaunch",
    async (count) => {
      const old = Array.from({ length: count }, (_, i) =>
        view(`old-${i}`, "2026-09-05", i + 1),
      );
      await seed(old);
      await useFeedStore.getState().load("fs-local-a");
      await useFeedStore
        .getState()
        .toggleFavorite("fs-local-a", item("new-favorite"));
      await useFeedStore.getState().markViewed("fs-local-a", item("new-view"));
      expect((await saved()).pending).toEqual([]);
      expect((await saved()).localOnlyViews).toEqual(old);
      expect((await saved()).favorites).toContain("new-favorite");
      expect(
        rpc.mock.calls.every((c) => c[1].p_content_id === "new-view"),
      ).toBe(true);
      resetFeed();
      await useFeedStore.getState().load("fs-local-a");
      expect((useFeedStore.getState() as any).localOnlyCount).toBe(count);
      expect(useFeedStore.getState().pendingCount).toBe(0);
      expect(useFeedStore.getState().viewedToday).toContain("preserved");
      expect((await saved()).localOnlyViews).toEqual(old);
    },
  );
  test("reclaims capacity offline and retains failed current work until acknowledged", async () => {
    await seed(
      Array.from({ length: 500 }, (_, i) =>
        view(`old-${i}`, "2026-09-05", i + 1),
      ),
    );
    (getIdentitySupabase as jest.Mock).mockRejectedValueOnce(
      new Error("offline"),
    );
    favoriteError = new Error("offline");
    await useFeedStore.getState().toggleFavorite("fs-local-a", item("fresh"));
    expect((await saved()).favorites).toContain("fresh");
    expect((await saved()).pending).toHaveLength(1);
    expect((await saved()).localOnlyViews).toHaveLength(500);
    favoriteError = null;
    await useFeedStore.getState().retryPending("fs-local-a");
    expect((await saved()).pending).toEqual([]);
    expect(useFeedStore.getState().error).toBeNull();
  });
  test("expired-only offline history is not reported as active pending sync", async () => {
    await seed([view("old", "2026-09-05", 1)]);
    (getIdentitySupabase as jest.Mock).mockRejectedValueOnce(
      new Error("offline"),
    );
    await useFeedStore.getState().retryPending("fs-local-a");
    expect(useFeedStore.getState().pendingCount).toBe(0);
    expect((useFeedStore.getState() as any).localOnlyCount).toBe(1);
    expect(useFeedStore.getState().error).toBeNull();
  });
  test("expiration clears a previous pending-sync error even when still offline", async () => {
    rpc.mockResolvedValue({ error: new Error("offline") });
    await useFeedStore.getState().markViewed("fs-local-a", item("old"));
    expect(useFeedStore.getState().error).toMatch(/pending/);
    day.mockReturnValue("2026-09-11");
    (getIdentitySupabase as jest.Mock).mockRejectedValueOnce(
      new Error("offline"),
    );
    await useFeedStore.getState().retryPending("fs-local-a");
    expect(useFeedStore.getState().pendingCount).toBe(0);
    expect((useFeedStore.getState() as any).localOnlyCount).toBe(1);
    expect(useFeedStore.getState().error).toBeNull();
  });
  test("delayed local reconciliation cannot project yesterday after midnight", async () => {
    await seed([]);
    const original = AsyncStorage.setItem;
    let release!: () => void;
    (AsyncStorage.setItem as jest.Mock).mockImplementationOnce(
      async (k: string, v: string) => {
        await new Promise<void>((r) => {
          release = r;
        });
        return original(k, v);
      },
    );
    const work = useFeedStore.getState().retryPending("fs-local-a");
    await tick();
    day.mockReturnValue("2026-09-09");
    useFeedStore.setState({ viewedToday: ["new-day"] });
    release();
    await work;
    expect(useFeedStore.getState().viewedToday).not.toContain("preserved");
  });
  test("successful in-flight acknowledgement removes a view retired during midnight", async () => {
    await seed([view("yesterday", "2026-09-07", 1)]);
    let release!: (v: unknown) => void;
    rpc.mockImplementationOnce(
      () =>
        new Promise((r) => {
          release = r;
        }),
    );
    const old = useFeedStore.getState().retryPending("fs-local-a");
    await tick();
    day.mockReturnValue("2026-09-09");
    const fresh = useFeedStore
      .getState()
      .toggleFavorite("fs-local-a", item("fresh"));
    await tick();
    expect((await saved()).localOnlyViews).toHaveLength(1);
    release({
      data: [{ completed_today: false, current_streak: 1, longest_streak: 9 }],
      error: null,
    });
    await Promise.all([old, fresh]);
    expect((await saved()).localOnlyViews).toEqual([]);
    expect((await saved()).pending).toEqual([]);
  });
  test.each(["2026-03-09", "2026-11-02"])(
    "uses calendar dates around DST on %s",
    async (date) => {
      day.mockReturnValue(date);
      const today = new Date(`${date}T00:00:00Z`);
      const prior = (n: number) =>
        new Date(+today - n * 86400000).toISOString().slice(0, 10);
      await seed([
        view("expired", prior(2), 1),
        view("yesterday", prior(1), 2),
        view("today", date, 3),
        view("future", prior(-3), 4),
      ]);
      await useFeedStore.getState().retryPending("fs-local-a");
      expect((await saved()).localOnlyViews.map((v: any) => v.id)).toEqual([
        "expired",
      ]);
      expect((await saved()).pending.map((v: any) => v.id)).toEqual(["future"]);
      expect(rpc.mock.calls.map((c) => c[1].p_content_id)).toEqual([
        "yesterday",
        "today",
      ]);
    },
  );
});
