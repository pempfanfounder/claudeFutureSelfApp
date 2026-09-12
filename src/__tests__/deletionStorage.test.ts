import AsyncStorage from "@react-native-async-storage/async-storage";
import { captureIdentity, useAppState } from "@/lib/appState";
import { getIdentitySupabase } from "@/lib/supabase";
import {
  getPendingDeletion,
  requestAccountDeletion,
  clearDeletionReceipt,
} from "@/features/auth/deletion";
import { storageNeedsRestart } from "@/lib/accountStorage";
jest.mock("@/lib/supabase", () => ({ getIdentitySupabase: jest.fn() }));
jest.mock("expo-crypto", () => ({
  randomUUID: () => "11111111-1111-4111-8111-111111111111",
}));
const key = "fs.deletion.pending.v1";
beforeEach(async () => {
  await AsyncStorage.clear();
  jest.useFakeTimers();
  useAppState.getState().setUserId(null);
  useAppState.getState().setUserId("fs-local-a");
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});
test("receipt is durable before dispatch and a lost acknowledgement reuses it", async () => {
  const receipts: string[] = [];
  let fail = true;
  const invoke = jest.fn(async (_name: string, { body }: any) => {
    expect(JSON.parse((await AsyncStorage.getItem(key))!).receipt).toBe(
      body.receipt,
    );
    receipts.push(body.receipt);
    return fail
      ? { error: new Error("Synthetic lost response") }
      : { data: { ok: true, deleted_user_id: "fs-local-a" }, error: null };
  });
  (getIdentitySupabase as jest.Mock).mockResolvedValue({
    functions: { invoke },
  });
  await expect(requestAccountDeletion(captureIdentity())).rejects.toThrow(
    "not confirmed",
  );
  fail = false;
  await expect(requestAccountDeletion(captureIdentity())).resolves.toBe(
    "fs-local-a",
  );
  expect(receipts[0]).toBe(receipts[1]);
  await clearDeletionReceipt("fs-local-b");
  expect(await getPendingDeletion()).not.toBeNull();
  await clearDeletionReceipt("fs-local-a");
  expect(await getPendingDeletion()).toBeNull();
});
test.each(["getItem", "setItem"] as const)(
  "a hung receipt %s settles the caller but preserves the queue",
  async (method) => {
    let release!: (value: any) => void;
    const underlying = new Promise((r) => {
      release = r;
    });
    const spy = jest
      .spyOn(AsyncStorage, method)
      .mockImplementationOnce(() => underlying as any);
    const operation =
      method === "getItem"
        ? getPendingDeletion()
        : requestAccountDeletion(captureIdentity());
    const outcome = operation.catch((e) => e);
    for (let i = 0; i < 8; i++) await Promise.resolve();
    jest.advanceTimersByTime(8001);
    expect(String(await outcome)).toContain("Restart");
    expect(storageNeedsRestart()).toBe(true);
    await expect(getPendingDeletion()).rejects.toThrow("Restart");
    release(method === "getItem" ? null : undefined);
    for (let i = 0; i < 15; i++) await Promise.resolve();
    expect(storageNeedsRestart()).toBe(false);
    spy.mockRestore();
  },
);
