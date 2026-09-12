import Constants from "expo-constants";
import * as Device from "expo-device";
import { getLocales, getCalendars } from "expo-localization";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { getInstallId } from "@/lib/experiments";
import { monitoring } from "@/lib/monitoring";
import { getIdentitySupabase } from "@/lib/supabase";
import {
  assertCurrentIdentity,
  captureIdentity,
  type Identity,
  withDeadline,
} from "@/lib/appState";

/**
 * Push registration client. All scheduling lives on the server
 * (Supabase Cron + Edge Functions + Expo Push); the device only
 * registers its token, permission status, locale and timezone.
 */

let deviceQueue: Promise<unknown> = Promise.resolve();
let suspendedGeneration: number | null = null;
export function pauseDeviceRegistration(identity: Identity) {
  suspendedGeneration = identity.generation;
}
export function resumeDeviceRegistration(identity: Identity) {
  if (suspendedGeneration === identity.generation) suspendedGeneration = null;
}
function registrationAllowed(identity: Identity) {
  assertCurrentIdentity(identity);
  if (suspendedGeneration === identity.generation)
    throw new Error("This account is signing out.");
}
function serializeDevice(work: (check: () => void) => Promise<void>) {
  let expired = false;
  const check = () => {
    if (expired)
      throw new Error("Device registration timed out. Please retry.");
  };
  const result = deviceQueue.then(
    () => work(check),
    () => work(check),
  );
  deviceQueue = result.catch(() => {});
  return withDeadline(result).finally(() => {
    expired = true;
  });
}
export async function registerDevice(
  identity: Identity = captureIdentity(),
): Promise<void> {
  registrationAllowed(identity);
  return serializeDevice((check) => registerDeviceWork(identity, check));
}
export async function deactivateDevice(
  identity: Identity = captureIdentity(),
): Promise<void> {
  return serializeDevice((check) => deactivateDeviceWork(identity, check));
}

export type PermissionStatus = "undetermined" | "granted" | "denied";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function getPermissionStatus(): Promise<PermissionStatus> {
  const settings = await Notifications.getPermissionsAsync();
  if (settings.granted) return "granted";
  if (settings.canAskAgain) return "undetermined";
  return "denied";
}

/** Shows the OS permission dialog. Callers show education UI first. */
export async function requestNotificationPermission(): Promise<PermissionStatus> {
  const settings = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  if (settings.granted) return "granted";
  if (settings.canAskAgain) return "undetermined";
  return "denied";
}

async function getPushToken(): Promise<string | null> {
  try {
    if (!Device.isDevice) return null;
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Daily inspiration",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;
    if (!projectId) {
      // EAS not configured yet (docs/SETUP_REQUIRED.md) — register the
      // device without a token so preferences still sync.
      return null;
    }
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token.data;
  } catch (error) {
    monitoring.captureError(error, { area: "push.getToken" });
    throw error;
  }
}

/**
 * Registers (or refreshes) this install's device row. Safe to call
 * often: on launch, after permission changes, and after auth changes.
 */
async function registerDeviceWork(
  identity: Identity,
  check: () => void,
): Promise<void> {
  registrationAllowed(identity);
  check();
  const supabase = await getIdentitySupabase(identity);
  if (!supabase) throw new Error("Device registration is unavailable.");
  const permissionStatus = await getPermissionStatus();
  registrationAllowed(identity);
  check();
  const token = permissionStatus === "granted" ? await getPushToken() : null;
  const installId = await getInstallId();
  registrationAllowed(identity);
  check();
  const { error } = await supabase.rpc("register_device", {
    p_install_id: installId,
    p_push_token: token ?? "",
    p_platform: Platform.OS === "ios" ? "ios" : "android",
    p_permission_status: permissionStatus,
    p_locale: getLocales()[0]?.languageTag ?? "",
    p_timezone: getCalendars()[0]?.timeZone ?? "UTC",
    p_app_version: Constants.expoConfig?.version ?? "",
  });
  if (error) throw error;
  assertCurrentIdentity(identity);
  check();
}

/** Resolves only after the server acknowledges this captured account's row. */
async function deactivateDeviceWork(
  identity: Identity,
  check: () => void,
): Promise<void> {
  assertCurrentIdentity(identity);
  check();
  const supabase = await getIdentitySupabase(identity);
  if (!supabase) throw new Error("Device deactivation is unavailable.");
  const installId = await getInstallId();
  assertCurrentIdentity(identity);
  check();
  const { error } = await supabase.rpc("deactivate_device", {
    p_install_id: installId,
  });
  if (error) throw error;
  assertCurrentIdentity(identity);
  check();
}

/** Only fixed destinations and a validated owned delivery context may navigate. */
export function getNotificationDeepLink(
  response: Notifications.NotificationResponse,
): string | null {
  const data = response.notification.request.content.data as Record<
    string,
    unknown
  > | null;
  const url = data?.url;
  if (typeof url !== "string" || url.length > 300) return null;
  if (/^futureself:\/\/(?:feed|settings|paywall|widget-setup)$/i.test(url))
    return url;
  const match =
    /^futureself:\/\/content\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\?kind=(quote|affirmation))?$/i.exec(
      url,
    );
  if (!match) return null;
  const id = match[1]!.toLowerCase(),
    urlKind = match[2]?.toLowerCase();
  if (
    data?.content_id !== undefined &&
    (typeof data.content_id !== "string" ||
      data.content_id.toLowerCase() !== id)
  )
    return null;
  if (
    data?.kind !== undefined &&
    data.kind !== "quote" &&
    data.kind !== "affirmation"
  )
    return null;
  if (urlKind && data?.kind !== undefined && data.kind !== urlKind) return null;
  if (data?.delivery_id === undefined) return url; // Legacy links show current text.
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const owner = captureIdentity().userId;
  if (
    typeof data.delivery_id !== "string" ||
    !uuid.test(data.delivery_id) ||
    !owner ||
    !uuid.test(owner)
  )
    return null;
  const kind = urlKind ?? data.kind;
  return `futureself://content/${id}?${kind ? `kind=${kind}&` : ""}source=delivery&delivery=${data.delivery_id.toLowerCase()}&owner=${owner.toLowerCase()}`;
}
