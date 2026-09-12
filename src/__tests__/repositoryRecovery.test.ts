import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAppState } from "@/lib/appState";
import { getIdentitySupabase } from "@/lib/supabase";
import { getDailySet } from "@/features/content/repository";
jest.mock("@/lib/supabase", () => ({ getIdentitySupabase: jest.fn() }));
const weights = {
  quoteInterests: [],
  affirmationInterests: [],
  primaryGoals: [],
  obstacles: [],
  futureTraits: [],
};
const quote = {
  id: "q",
  type: "quote",
  body: "Exact original words.",
  author: null,
  categories: [],
  tags: [],
  priority: 1,
};
beforeEach(async () => {
  await AsyncStorage.clear();
  useAppState.getState().setUserId(null);
  useAppState.getState().setUserId("fs-local-a");
  useAppState.getState().setPremium(true);
});
test("empty library on first load can recover to populated daily set", async () => {
  let library: any[] = [];
  const rpc = jest.fn(async () => ({ data: ["q"], error: null }));
  (getIdentitySupabase as jest.Mock).mockResolvedValue({
    rpc,
    from: () => {
      const q: any = {
        select: () => q,
        eq: () => q,
        limit: async () => ({ data: library, error: null }),
      };
      return q;
    },
  });
  expect(await getDailySet("fs-local-a", "quote", weights)).toEqual([]);
  library = [quote];
  expect(await getDailySet("fs-local-a", "quote", weights)).toEqual([quote]);
  expect(rpc).toHaveBeenCalledTimes(1);
});
test("offline proposal keeps original text, reports degradation, and retries acknowledgement", async () => {
  let fail = true;
  const rpc = jest.fn(async () =>
    fail
      ? { error: new Error("Synthetic offline") }
      : { data: ["q"], error: null },
  );
  (getIdentitySupabase as jest.Mock).mockResolvedValue({
    rpc,
    from: () => {
      const q: any = {
        select: () => q,
        eq: () => q,
        limit: async () => ({ data: [quote], error: null }),
      };
      return q;
    },
  });
  const degraded = jest.fn();
  expect(
    await getDailySet("fs-local-a", "quote", weights, undefined, degraded),
  ).toEqual([quote]);
  expect(degraded).toHaveBeenCalled();
  fail = false;
  expect(await getDailySet("fs-local-a", "quote", weights)).toEqual([quote]);
  expect(rpc).toHaveBeenCalledTimes(2);
  useAppState.getState().setPremium(false);
  await expect(getDailySet("fs-local-a", "quote", weights)).rejects.toThrow(
    "Subscription",
  );
});

test("overlapping daily loads share one server winner and preserve exact text", async () => {
  let release!: (value: unknown) => void;
  let started!: () => void;
  const dispatched = new Promise<void>((r) => {
    started = r;
  });
  const rpc = jest.fn(() => {
    started();
    return new Promise((r) => {
      release = r;
    });
  });
  (getIdentitySupabase as jest.Mock).mockResolvedValue({
    rpc,
    from: () => {
      const q: any = {
        select: () => q,
        eq: () => q,
        limit: async () => ({ data: [quote], error: null }),
      };
      return q;
    },
  });
  const first = getDailySet("fs-local-a", "quote", weights);
  const second = getDailySet("fs-local-a", "quote", {
    ...weights,
    quoteInterests: ["focus"],
  });
  await dispatched;
  expect(rpc).toHaveBeenCalledTimes(1);
  release({ data: ["q"], error: null });
  expect(await first).toEqual([quote]);
  expect(await second).toEqual([quote]);
  expect(await getDailySet("fs-local-a", "quote", weights)).toEqual([quote]);
  expect(rpc).toHaveBeenCalledTimes(1);
});
