import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAppState } from "@/lib/appState";
import { getIdentitySupabase } from "@/lib/supabase";
import { getContentById, getDailySet } from "@/features/content/repository";
import * as repository from "@/features/content/repository";
jest.mock("@/lib/supabase", () => ({ getIdentitySupabase: jest.fn() }));
const owner = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
const delivery = "33333333-3333-4333-8333-333333333333";
const second = "44444444-4444-4444-8444-444444444444";
const item = (body: string) => ({
  id,
  type: "quote" as const,
  body,
  author: null,
  categories: [],
  tags: [],
  priority: 1,
});
const original = item("Original delivered text A.");
const current = item("Later edited library text B.");
const context = { source: "delivery", owner, delivery, kind: "quote" } as any;
let from: jest.Mock;
let rows: any[];
beforeEach(async () => {
  await AsyncStorage.clear();
  useAppState.getState().setUserId(null);
  useAppState.getState().setUserId(owner);
  useAppState.getState().setPremium(true);
  rows = [
    {
      id: delivery,
      user_id: owner,
      content_id: id,
      content_snapshot: { ...original },
    },
    {
      id: second,
      user_id: owner,
      content_id: id,
      content_snapshot: item("Second delivery C."),
    },
  ];
  await AsyncStorage.setItem(
    `fs.content-library.v2.${owner}`,
    JSON.stringify({ fetchedAt: Date.now(), items: [current] }),
  );
  from = jest.fn((table: string) => {
    const filters: Record<string, string> = {};
    const q: any = {
      select: () => q,
      eq: (k: string, v: string) => {
        filters[k] = v;
        return q;
      },
      order: () => q,
      limit: () => q,
      maybeSingle: async () => ({
        data:
          table === "notification_deliveries"
            ? (rows.find((r) =>
                Object.entries(filters).every(([k, v]) => r[k] === v),
              ) ?? null)
            : current,
        error: null,
      }),
    };
    return q;
  });
  (getIdentitySupabase as jest.Mock).mockResolvedValue({ from });
});
test("S5 delivery A survives edited active B, two deliveries differ, current lookup stays B", async () => {
  expect(await (getContentById as any)(id, context)).toEqual({
    ...original,
    priority: 0,
  });
  expect(
    (await (getContentById as any)(id, { ...context, delivery: second }))?.body,
  ).toBe("Second delivery C.");
  expect((await getContentById(id))?.body).toBe(current.body);
  expect(from).toHaveBeenCalledWith("notification_deliveries");
});
test("owned delivery cache preserves deactivated text offline and rejects cross-account replay", async () => {
  await (getContentById as any)(id, context);
  await AsyncStorage.removeItem(`fs.content-library.v2.${owner}`);
  (getIdentitySupabase as jest.Mock).mockRejectedValue(new Error("offline"));
  expect((await (getContentById as any)(id, context))?.body).toBe(
    original.body,
  );
  await expect(
    (getContentById as any)(id, { ...context, delivery: second }),
  ).rejects.toThrow("offline");
  useAppState.getState().setUserId(second);
  useAppState.getState().setPremium(true);
  expect(await (getContentById as any)(id, context)).toBeNull();
});
test.each(["wrong-pair", "wrong-owner", "wrong-type", "malformed"])(
  "explicit delivery %s cannot substitute current text",
  async (mode) => {
    if (mode === "wrong-pair") rows[0].content_id = second;
    if (mode === "wrong-owner") rows[0].user_id = second;
    if (mode === "wrong-type") rows[0].content_snapshot.type = "affirmation";
    if (mode === "malformed") rows[0].content_snapshot.body = { text: "bad" };
    expect(await (getContentById as any)(id, context)).toBeNull();
  },
);
test("account switch during snapshot read cannot return old content", async () => {
  from.mockImplementation(() => {
    const q: any = {
      select: () => q,
      eq: () => q,
      order: () => q,
      limit: () => q,
      maybeSingle: async () => {
        useAppState.getState().setUserId(second);
        useAppState.getState().setPremium(true);
        return { data: rows[0], error: null };
      },
    };
    return q;
  });
  await expect((getContentById as any)(id, context)).rejects.toThrow();
});
test("daily context reads original owned day offline rather than current library", async () => {
  await AsyncStorage.setItem(
    `fs.daily.${owner}.2026-09-07.quote`,
    JSON.stringify({ items: [original], confirmed: true }),
  );
  (getIdentitySupabase as jest.Mock).mockRejectedValue(new Error("offline"));
  expect(
    (
      await (getContentById as any)(id, {
        source: "daily",
        owner,
        day: "2026-09-07",
        kind: "quote",
      })
    )?.body,
  ).toBe(original.body);
  expect(
    await (getContentById as any)(id, {
      source: "daily",
      owner,
      day: "2026-09-08",
      kind: "quote",
    }),
  ).toBeNull();
});
test("offline proposal reconciliation preserves its original text after a library edit", async () => {
  await AsyncStorage.setItem(
    `fs.daily.${owner}.2026-09-08.quote`,
    JSON.stringify({ items: [original], confirmed: false }),
  );
  (getIdentitySupabase as jest.Mock).mockResolvedValue({
    from,
    rpc: async () => ({ data: [id], error: null }),
  });
  const weights = {
    quoteInterests: [],
    affirmationInterests: [],
    primaryGoals: [],
    obstacles: [],
    futureTraits: [],
  };
  expect(await getDailySet(owner, "quote", weights, "2026-09-08")).toEqual([
    original,
  ]);
});
test("route context rejects malformed explicit inputs rather than degrading to current", () => {
  const parse = (repository as any).parseContentContext;
  expect(typeof parse).toBe("function");
  for (const params of [
    { source: ["delivery"], owner, delivery },
    { source: "delivery", owner, delivery: "bad" },
    { source: "daily", owner, day: "2026-02-30", kind: "quote" },
    { source: "daily", owner, day: "2026-09-08", kind: ["quote"] },
    { source: "delivery", owner, delivery, body: "injected" },
    { delivery },
  ])
    expect(parse(params)).toBeNull();
  expect(parse({ kind: "quote" })).toEqual({
    source: "current",
    kind: "quote",
  });
});

test("corrupt delivery cache rebuilds from an exact authenticated lookup", async () => {
  await AsyncStorage.setItem(`fs.delivery.v1.${owner}`, "{corrupt");
  expect((await (getContentById as any)(id, context))?.body).toBe(
    original.body,
  );
  expect(
    JSON.parse((await AsyncStorage.getItem(`fs.delivery.v1.${owner}`))!),
  ).toHaveLength(1);
});
test("malformed daily cache is unavailable instead of substituting current content", async () => {
  await AsyncStorage.setItem(
    `fs.daily.${owner}.2026-09-07.quote`,
    JSON.stringify({ items: { body: "bad" }, confirmed: true }),
  );
  expect(
    await (getContentById as any)(id, {
      source: "daily",
      owner,
      day: "2026-09-07",
      kind: "quote",
    }),
  ).toBeNull();
  expect(from).not.toHaveBeenCalled();
});
test("delivery cache stays bounded and preserves another account's cache", async () => {
  await AsyncStorage.setItem(
    `fs.delivery.v1.${owner}`,
    JSON.stringify(
      Array.from({ length: 100 }, (_, i) => ({ ...rows[0], id: `old-${i}` })),
    ),
  );
  await AsyncStorage.setItem(`fs.delivery.v1.${second}`, "preserved-other");
  await (getContentById as any)(id, context);
  expect(
    JSON.parse((await AsyncStorage.getItem(`fs.delivery.v1.${owner}`))!),
  ).toHaveLength(100);
  expect(await AsyncStorage.getItem(`fs.delivery.v1.${second}`)).toBe(
    "preserved-other",
  );
});
test("owned snapshot cleanup removes A without removing B", async () => {
  await (getContentById as any)(id, context);
  await AsyncStorage.setItem(`fs.delivery.v1.${second}`, "preserved");
  await require("@/features/onboarding/engine/store").clearLocalUserData(owner);
  expect(await AsyncStorage.getItem(`fs.delivery.v1.${owner}`)).toBeNull();
  expect(await AsyncStorage.getItem(`fs.delivery.v1.${second}`)).toBe(
    "preserved",
  );
});
test("UUID route identifiers with letters normalize to canonical case", () => {
  const owner = "abcdefab-abcd-abcd-abcd-abcdefabcdef",
    delivery = "bcdefabc-bcde-bcde-bcde-bcdefabcdefa";
  expect(
    (repository as any).parseContentContext({
      source: "delivery",
      owner: owner.toUpperCase(),
      delivery: delivery.toUpperCase(),
      kind: "quote",
    }),
  ).toEqual({ source: "delivery", owner, delivery, kind: "quote" });
});
