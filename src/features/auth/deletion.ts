import AsyncStorage from "@react-native-async-storage/async-storage";
import { serializedStorage } from "@/lib/accountStorage";
import * as Crypto from "expo-crypto";
import { assertCurrentIdentity, type Identity } from "@/lib/appState";
import { config } from "@/lib/config";
import { getIdentitySupabase } from "@/lib/supabase";

const INDEX = "fs.deletion.pending.v1";
export interface DeletionReceipt {
  userId: string;
  receipt: string;
}
async function readPendingDeletion(): Promise<DeletionReceipt | null> {
  const raw = await AsyncStorage.getItem(INDEX);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as DeletionReceipt;
    return typeof value.userId === "string" &&
      /^[0-9a-f-]{36}$/i.test(value.receipt)
      ? value
      : (() => {
          throw new Error(
            "Saved deletion status needs recovery. Contact support before deleting another account.",
          );
        })();
  } catch {
    throw new Error(
      "Saved deletion status needs recovery. Contact support before deleting another account.",
    );
  }
}
export function getPendingDeletion(): Promise<DeletionReceipt | null> {
  return serializedStorage(readPendingDeletion);
}
export interface DeletionOptions {
  /**
   * Fresh Sign in with Apple authorization code (valid ~5 minutes). The
   * server exchanges and revokes it so the app disappears from the
   * user's Apple ID (Guideline 5.1.1(v)). Optional: deletion proceeds
   * without it.
   */
  appleAuthorizationCode?: string;
}
export async function requestAccountDeletion(
  identity: Identity,
  options: DeletionOptions = {},
): Promise<string> {
  assertCurrentIdentity(identity);
  const pending = await serializedStorage(async () => {
    assertCurrentIdentity(identity);
    const prior = await readPendingDeletion();
    assertCurrentIdentity(identity);
    if (prior && prior.userId !== identity.userId)
      throw new Error("A previous account deletion needs confirmation first.");
    if (prior) return prior;
    const created = { userId: identity.userId!, receipt: Crypto.randomUUID() };
    await AsyncStorage.setItem(INDEX, JSON.stringify(created));
    assertCurrentIdentity(identity);
    return created;
  });
  assertCurrentIdentity(identity);
  const client = await getIdentitySupabase(identity);
  if (!client) throw new Error("Account service unavailable.");
  const { data, error } = await client.functions.invoke("delete-account", {
    body: {
      receipt: pending.receipt,
      ...(options.appleAuthorizationCode
        ? { apple_authorization_code: options.appleAuthorizationCode }
        : {}),
    },
  });
  if (error || data?.ok !== true || data.deleted_user_id !== identity.userId)
    throw new Error("Deletion was not confirmed.");
  return identity.userId!;
}
/** A receipt can only prove status; check_only cannot delete any account.
 * This path deliberately does not refresh a deleted user's session. The
 * separately reviewed gateway must allow the receipt verifier to run. */
export async function checkPendingDeletion(): Promise<string> {
  const pending = await getPendingDeletion();
  if (!pending) throw new Error("There is no pending deletion on this device.");
  if (!config.hasSupabase) throw new Error("Account service unavailable.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(
      `${config.supabaseUrl}/functions/v1/delete-account`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: config.supabaseAnonKey!,
        },
        body: JSON.stringify({ receipt: pending.receipt, check_only: true }),
        signal: controller.signal,
      },
    );
    const data = await response.json();
    if (
      !response.ok ||
      data?.ok !== true ||
      data.deleted_user_id !== pending.userId
    )
      throw new Error(
        "Deletion is not confirmed yet. Retry while connected, or contact support.",
      );
    return pending.userId;
  } finally {
    clearTimeout(timer);
  }
}
export async function clearDeletionReceipt(userId: string): Promise<void> {
  await serializedStorage(async () => {
    const pending = await readPendingDeletion();
    if (pending?.userId === userId) await AsyncStorage.removeItem(INDEX);
  });
}
