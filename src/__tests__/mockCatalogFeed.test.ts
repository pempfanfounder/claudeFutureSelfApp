import AsyncStorage from "@react-native-async-storage/async-storage";

import { LOCAL_CATALOG } from "@/features/content/localCatalog";
import { getDailySet } from "@/features/content/repository";
import { DAILY_LIMIT } from "@/features/content/types";
import { useAppState } from "@/lib/appState";
import { getIdentitySupabase } from "@/lib/supabase";

jest.mock("@/lib/supabase", () => ({ getIdentitySupabase: jest.fn() }));
jest.mock("@/lib/config", () => ({
  config: { devMockPurchases: true },
}));

const weights = {
  quoteInterests: [],
  affirmationInterests: [],
  primaryGoals: [],
  obstacles: [],
  futureTraits: [],
};

beforeEach(async () => {
  await AsyncStorage.clear();
  useAppState.getState().setUserId(null);
  useAppState.getState().setUserId("fs-local-a");
  useAppState.getState().setPremium(true);
});

test("mock purchases serve the local catalog when the server library is empty", async () => {
  const rpc = jest.fn();
  (getIdentitySupabase as jest.Mock).mockResolvedValue({
    rpc,
    from: () => {
      const q: { select: () => unknown; eq: () => unknown; limit: () => unknown } =
        {
          select: () => q,
          eq: () => q,
          limit: async () => ({ data: [], error: null }),
        };
      return q;
    },
  });
  const quotes = await getDailySet("fs-local-a", "quote", weights);
  const affirmations = await getDailySet("fs-local-a", "affirmation", weights);
  const localQuoteIds = new Set(
    LOCAL_CATALOG.filter((item) => item.type === "quote").map(
      (item) => item.id,
    ),
  );
  // The local pack has more quotes than a day shows; the daily set is a
  // full DAILY_LIMIT-sized, duplicate-free sample drawn from it.
  expect(quotes).toHaveLength(Math.min(DAILY_LIMIT, localQuoteIds.size));
  expect(affirmations).toHaveLength(12);
  expect(quotes.every((item) => item.type === "quote")).toBe(true);
  expect(affirmations.every((item) => item.type === "affirmation")).toBe(true);
  expect(new Set(quotes.map((item) => item.id)).size).toBe(quotes.length);
  expect(quotes.every((item) => localQuoteIds.has(item.id))).toBe(true);
  expect(rpc).not.toHaveBeenCalled();
});
