import * as dailySet from "@/features/content/dailySet";
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
const storageWrite = (
  AsyncStorage.setItem as jest.Mock
).getMockImplementation()!;
let rpc: jest.Mock;
let favoriteError: unknown;
let upsert: jest.Mock;
let remove: jest.Mock;
beforeEach(async () => {
  (AsyncStorage.setItem as jest.Mock).mockImplementation(storageWrite);
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
  upsert = jest.fn(async ({ content_id }: { content_id: string }) => ({
    error: favoriteError,
  }));
  remove = jest.fn(async () => ({ error: favoriteError }));
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
      upsert,
      delete: () => ({ match: remove }),
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
const key = "fs.feed.state.v2.fs-local-a";
let date: jest.SpyInstance;
const today = "2026-09-08";
const saved = async () => JSON.parse((await AsyncStorage.getItem(key))!);
const favorite = {
  kind: "favorite",
  id: "valid-save",
  value: true,
  revision: 3001,
};
beforeEach(() => {
  date = jest.spyOn(dailySet, "getLocalDate").mockReturnValue(today);
});
afterEach(() => jest.restoreAllMocks());
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
async function seed(value: boolean) {
  await AsyncStorage.setItem(
    key,
    JSON.stringify({
      day: today,
      favorites: value ? [favorite.id] : [],
      viewed: [],
      currentStreak: 0,
      longestStreak: 0,
      pending: [{ ...favorite, value }],
      favoriteRevision: 1,
    }),
  );
}
function holdRead() {
  const entered = deferred<void>(),
    result = deferred<{ data: { content_id: string }[]; error: null }>();
  const client = (getSupabase as jest.Mock).getMockImplementation()!();
  const original = client.from;
  client.from = (table: string) => {
    const q = original(table);
    if (table === "favorites")
      q.then = (a: any, b: any) => {
        entered.resolve();
        return result.promise.then(a, b);
      };
    return q;
  };
  return {
    entered: entered.promise,
    release: (ids: string[]) =>
      result.resolve({
        data: ids.map((content_id) => ({ content_id })),
        error: null,
      }),
  };
}
function holdWrite(value: boolean) {
  const entered = deferred<void>(),
    result = deferred<{ error: unknown }>();
  (value ? upsert : remove).mockImplementationOnce(() => {
    entered.resolve();
    return result.promise;
  });
  return {
    entered: entered.promise,
    release: (error: unknown = null) => result.resolve({ error }),
  };
}

test.each([true, false])(
  "acknowledgement during refresh preserves value=%s, survives cache relaunch, then accepts a later changed server set",
  async (value) => {
    await seed(value);
    const write = holdWrite(value);
    const retry = useFeedStore.getState().retryPending("fs-local-a");
    await write.entered;
    const read = holdRead();
    const load = useFeedStore.getState().load("fs-local-a");
    await read.entered;
    write.release();
    await retry;
    read.release(value ? [] : [favorite.id]);
    await load;
    const after = await saved();
    expect(after.pending).toEqual([]);
    expect(after.favorites.includes(favorite.id)).toBe(value);
    expect(useFeedStore.getState().favoriteIds.includes(favorite.id)).toBe(
      value,
    );
    resetFeed();
    (getIdentitySupabase as jest.Mock).mockRejectedValueOnce(
      new Error("Synthetic offline"),
    );
    await useFeedStore.getState().load("fs-local-a");
    expect(useFeedStore.getState().favoriteIds.includes(favorite.id)).toBe(
      value,
    );
    const next = holdRead();
    const refreshing = useFeedStore.getState().load("fs-local-a");
    await next.entered;
    next.release(value ? ["remote-other"] : [favorite.id, "remote-other"]);
    await refreshing;
    expect((await saved()).favorites).toContain("remote-other");
    expect((await saved()).favorites.includes(favorite.id)).toBe(!value);
    expect(useFeedStore.getState().favoriteIds.includes(favorite.id)).toBe(
      !value,
    );
  },
);

test.each([true, false])(
  "ack-before-load accepts the later authoritative favorites value=%s",
  async (value) => {
    await seed(value);
    await useFeedStore.getState().retryPending("fs-local-a");
    const read = holdRead();
    const load = useFeedStore.getState().load("fs-local-a");
    await read.entered;
    read.release(value ? [] : [favorite.id]);
    await load;
    expect((await saved()).favorites.includes(favorite.id)).toBe(!value);
    expect((await saved()).pending).toEqual([]);
  },
);

test.each([true, false])(
  "rejected write overlays stale read and preserves exact pending value=%s",
  async (value) => {
    await seed(value);
    favoriteError = new Error("Synthetic rejected write");
    const original = (await saved()).pending;
    const write = holdWrite(value);
    const retry = useFeedStore.getState().retryPending("fs-local-a");
    await write.entered;
    const read = holdRead();
    const load = useFeedStore.getState().load("fs-local-a");
    await read.entered;
    write.release(favoriteError);
    await retry;
    read.release(value ? [] : [favorite.id]);
    await load;
    expect((await saved()).favorites.includes(favorite.id)).toBe(value);
    expect((await saved()).pending).toEqual(original);
    expect(useFeedStore.getState().pendingCount).toBe(1);
  },
);

test.each(["same-id", "different-id"])(
  "a %s change during read and old acknowledgement keeps its own revision",
  async (kind) => {
    await seed(true);
    const write = holdWrite(true);
    const retry = useFeedStore.getState().retryPending("fs-local-a");
    await write.entered;
    const read = holdRead();
    const load = useFeedStore.getState().load("fs-local-a");
    await read.entered;
    const id = kind === "same-id" ? favorite.id : "second-save";
    const stored = deferred<void>();
    const setItem = (
      AsyncStorage.setItem as jest.Mock
    ).getMockImplementation()!;
    jest.spyOn(AsyncStorage, "setItem").mockImplementation(async (k, v) => {
      await setItem(k, v);
      if (
        k === key &&
        JSON.parse(v).pending.some(
          (p: any) => p.id === id && p.revision !== favorite.revision,
        )
      )
        stored.resolve();
    });
    favoriteError = new Error("Synthetic keep replacement pending");
    const toggle = useFeedStore
      .getState()
      .toggleFavorite("fs-local-a", item(id));
    await stored.promise;
    const replacement = (await saved()).pending.find(
      (p: any) => p.id === id && p.revision !== favorite.revision,
    );
    write.release();
    await Promise.all([retry, toggle]);
    read.release([]);
    await load;
    expect((await saved()).pending).toEqual([replacement]);
    expect((await saved()).favorites.includes(id)).toBe(kind !== "same-id");
    expect((await saved()).favorites.includes(favorite.id)).toBe(
      kind !== "same-id",
    );
  },
);

test("ack persistence rejection retains overlay and exact operation until a healthy retry", async () => {
  await seed(true);
  const write = holdWrite(true);
  const retry = useFeedStore.getState().retryPending("fs-local-a");
  await write.entered;
  const read = holdRead();
  const load = useFeedStore.getState().load("fs-local-a");
  await read.entered;
  const setItem = (AsyncStorage.setItem as jest.Mock).getMockImplementation()!;
  const disk = jest
    .spyOn(AsyncStorage, "setItem")
    .mockImplementation(async (k, v) => {
      if (k === key && JSON.parse(v).pending.length === 0)
        throw new Error("Synthetic disk rejection");
      return setItem(k, v);
    });
  write.release();
  await retry;
  read.release([]);
  await load;
  expect((await saved()).pending).toEqual([favorite]);
  expect((await saved()).favorites).toEqual([favorite.id]);
  disk.mockImplementation(storageWrite);
  await useFeedStore.getState().retryPending("fs-local-a");
  expect((await saved()).pending).toEqual([]);
  expect((await saved()).favorites).toEqual([favorite.id]);
});

test.each(["identity", "day"])(
  "late read/ack across %s change cannot replace current display",
  async (kind) => {
    await seed(true);
    const write = holdWrite(true);
    const retry = useFeedStore.getState().retryPending("fs-local-a");
    await write.entered;
    const read = holdRead();
    const load = useFeedStore.getState().load("fs-local-a");
    await read.entered;
    if (kind === "identity") {
      useAppState.getState().setUserId("fs-local-b");
      useAppState.getState().setPremium(true);
    } else {
      date.mockReturnValue("2026-09-09");
      await AsyncStorage.setItem(
        key,
        JSON.stringify({
          ...(await saved()),
          day: "2026-09-09",
          viewed: ["current-day"],
        }),
      );
    }
    resetFeed();
    useFeedStore.setState({
      favoriteIds: ["current-owner"],
      viewedToday: ["current-day"],
    });
    write.release();
    await retry;
    read.release([]);
    await load;
    if (kind === "identity")
      expect(useFeedStore.getState().favoriteIds).toEqual(["current-owner"]);
    expect(useFeedStore.getState().viewedToday).toEqual(["current-day"]);
    expect((await saved()).favorites).toEqual([favorite.id]);
    expect((await saved()).pending.length).toBe(kind === "identity" ? 1 : 0);
  },
);
