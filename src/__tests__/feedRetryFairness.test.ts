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
let upsert: jest.Mock;
let remove: jest.Mock;
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
  upsert = jest.fn(async ({ content_id }: { content_id: string }) => ({
    error: content_id.startsWith("removed-") ? favoriteError : null,
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
const today = "2026-09-08";
const saved = async () => JSON.parse((await AsyncStorage.getItem(key))!);
const rejected = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    kind: "favorite",
    id: `removed-${i}`,
    value: true,
    revision: 1000 + i,
  }));
async function seed(count: number, followers: any[] = []) {
  favoriteError = new Error("Synthetic removed-content rejection");
  const pending = [...rejected(count), ...followers];
  await AsyncStorage.setItem(
    key,
    JSON.stringify({
      day: today,
      favorites: pending.filter((p) => p.kind === "favorite").map((p) => p.id),
      viewed: followers.filter((p) => p.kind === "view").map((p) => p.id),
      currentStreak: 0,
      longestStreak: 0,
      pending,
    }),
  );
}
const view = { kind: "view", id: "valid-view", day: today, revision: 3000 };
const favorite = {
  kind: "favorite",
  id: "valid-save",
  value: true,
  revision: 3001,
};
beforeEach(() =>
  jest
    .spyOn(require("@/features/content/dailySet"), "getLocalDate")
    .mockReturnValue(today),
);
afterEach(() => jest.restoreAllMocks());

test.each([39, 40, 41])(
  "valid view and save behind %i rejected favorites eventually sync",
  async (count) => {
    await seed(count, [view, favorite]);
    await useFeedStore.getState().load("fs-local-a");
    for (let n = 0; n < 2; n++)
      await useFeedStore.getState().retryPending("fs-local-a");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(
      upsert.mock.calls.filter(([row]) => row.content_id === favorite.id),
    ).toHaveLength(1);
    expect((await saved()).pending).toEqual(
      expect.arrayContaining(rejected(count)),
    );
    expect((await saved()).pending).toHaveLength(count);
    expect((await saved()).favorites).toContain(favorite.id);
    expect((await saved()).viewed).toContain(view.id);
    expect(useFeedStore.getState().pendingCount).toBe(count);
    expect(useFeedStore.getState().error).toMatch(/pending/);
  },
);

test("retry progress survives relaunch and stays bounded with a full queue", async () => {
  await seed(498, [view, favorite]);
  for (let n = 0; n < 13; n++) {
    resetFeed();
    const before =
      upsert.mock.calls.length +
      rpc.mock.calls.length +
      remove.mock.calls.length;
    await useFeedStore.getState().load("fs-local-a");
    expect(
      upsert.mock.calls.length +
        rpc.mock.calls.length +
        remove.mock.calls.length -
        before,
    ).toBeLessThanOrEqual(40);
  }
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(
    upsert.mock.calls.filter(([row]) => row.content_id === favorite.id),
  ).toHaveLength(1);
  expect((await saved()).pending).toHaveLength(498);
  expect((await saved()).pending).toEqual(
    expect.arrayContaining(rejected(498)),
  );
});

test("all rejections retain exact intent and a later healthy retry clears only acknowledgements", async () => {
  await seed(81);
  for (let n = 0; n < 3; n++)
    await useFeedStore.getState().retryPending("fs-local-a");
  expect(new Set(upsert.mock.calls.map(([row]) => row.content_id)).size).toBe(
    81,
  );
  expect((await saved()).pending).toEqual(expect.arrayContaining(rejected(81)));
  expect((await saved()).pending).toHaveLength(81);
  favoriteError = null;
  for (let n = 0; n < 3; n++)
    await useFeedStore.getState().retryPending("fs-local-a");
  expect((await saved()).pending).toEqual([]);
  expect((await saved()).favorites).toHaveLength(81);
  expect(useFeedStore.getState().error).toBeNull();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

test("concurrent appended view and replacement favorite retain their own revisions", async () => {
  await seed(41);
  const entered = deferred<void>();
  const release = deferred<{ error: null }>();
  upsert.mockImplementationOnce(() => {
    entered.resolve();
    return release.promise;
  });
  const first = useFeedStore.getState().retryPending("fs-local-a");
  await entered.promise;
  const append = useFeedStore
    .getState()
    .markViewed("fs-local-a", item("new-view"));
  const replace = useFeedStore
    .getState()
    .toggleFavorite("fs-local-a", item("removed-0"));
  // Wait for both queued persistence writes before releasing the old acknowledgement.
  const { serializedStorage } = require("@/lib/accountStorage");
  await serializedStorage(async () => {});
  release.resolve({ error: null });
  await Promise.all([first, append, replace]);
  await useFeedStore.getState().retryPending("fs-local-a");
  expect(
    (await saved()).pending.some(
      (p: any) => p.kind === "favorite" && p.id === "removed-0" && !p.value,
    ),
  ).toBe(true);
  expect((await saved()).favorites).not.toContain("removed-0");
  expect((await saved()).pending.some((p: any) => p.id === "new-view")).toBe(
    false,
  );
  expect((await saved()).viewed).toContain("new-view");
  expect(
    upsert.mock.calls.length + rpc.mock.calls.length + remove.mock.calls.length,
  ).toBeLessThanOrEqual(120);
});

test("midnight retires old views while later independent work still advances", async () => {
  await seed(41, [view, favorite]);
  await useFeedStore.getState().retryPending("fs-local-a");
  const getLocalDate = require("@/features/content/dailySet").getLocalDate;
  getLocalDate.mockReturnValue("2026-09-10");
  await useFeedStore.getState().retryPending("fs-local-a");
  expect(rpc).not.toHaveBeenCalled();
  expect((await saved()).localOnlyViews).toContainEqual(view);
  expect((await saved()).pending.some((p: any) => p.id === favorite.id)).toBe(
    false,
  );
  expect((await saved()).viewed).toEqual([]);
});

test("late rejected A does not rotate or project B's queue", async () => {
  await seed(41, [view]);
  const entered = deferred<void>();
  const release = deferred<{ error: Error }>();
  upsert.mockImplementationOnce(() => {
    entered.resolve();
    return release.promise;
  });
  const first = useFeedStore.getState().retryPending("fs-local-a");
  await entered.promise;
  useAppState.getState().setUserId("fs-local-b");
  useAppState.getState().setPremium(true);
  await useFeedStore.getState().load("fs-local-b");
  const b = await AsyncStorage.getItem("fs.feed.state.v2.fs-local-b");
  release.resolve({ error: new Error("Synthetic stale A") });
  await first;
  expect(await AsyncStorage.getItem("fs.feed.state.v2.fs-local-b")).toBe(b);
  expect(useFeedStore.getState().pendingCount).toBe(0);
  expect((await saved()).pending).toHaveLength(42);
});

test("failed retry-position persistence sends nothing and retains recoverable intent", async () => {
  await seed(41, [view]);
  const setItem = AsyncStorage.setItem as jest.Mock;
  const original = setItem.getMockImplementation()!;
  setItem
    .mockImplementationOnce(original)
    .mockRejectedValueOnce(new Error("Synthetic storage write failure"));
  await useFeedStore.getState().retryPending("fs-local-a");
  expect(upsert).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
  expect((await saved()).pending).toHaveLength(42);
  for (let n = 0; n < 2; n++)
    await useFeedStore.getState().retryPending("fs-local-a");
  expect(rpc).toHaveBeenCalledTimes(1);
  expect((await saved()).pending).toHaveLength(41);
});
