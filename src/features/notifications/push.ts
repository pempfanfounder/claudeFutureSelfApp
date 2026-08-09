import Constants from "expo-constants";
import * as Device from "expo-device";
import { getLocales, getCalendars } from "expo-localization";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { getInstallId } from "@/lib/experiments";
import { monitoring } from "@/lib/monitoring";
import { getSupabase } from "@/lib/supabase";

/**
 * Push registration client. All scheduling lives on the server
 * (Supabase Cron + Edge Functions + Expo Push); the device only
 * registers its token, permission status, locale and timezone.
 */

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
    return null;
  }
}

/**
 * Registers (or refreshes) this install's device row. Safe to call
 * often: on launch, after permission changes, and after auth changes.
 */
export async function registerDevice(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;

  try {
    const permissionStatus = await getPermissionStatus();
    const token = permissionStatus === "granted" ? await getPushToken() : null;
    const installId = await getInstallId();
    const timezone = getCalendars()[0]?.timeZone ?? "UTC";
    const locale = getLocales()[0]?.languageTag ?? null;

    // The SQL function treats empty strings as null (nullif) — the
    // generated arg types are non-nullable, so coerce here.
    const { error } = await supabase.rpc("register_device", {
      p_install_id: installId,
      p_push_token: token ?? "",
      p_platform: Platform.OS === "ios" ? "ios" : "android",
      p_permission_status: permissionStatus,
      p_locale: locale ?? "",
      p_timezone: timezone,
      p_app_version: Constants.expoConfig?.version ?? "",
    });
    if (error) throw error;
  } catch (error) {
    monitoring.captureError(error, { area: "push.registerDevice" });
  }
}

/** Marks this install's device row inactive (sign-out). */
export async function deactivateDevice(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  try {
    const installId = await getInstallId();
    await supabase.rpc("deactivate_device", { p_install_id: installId });
  } catch (error) {
    monitoring.captureError(error, { area: "push.deactivateDevice" });
  }
}

/**
 * Extracts the deep-link target from a tapped notification. The server
 * always includes { url, content_id, kind } in the payload data.
 */
export function getNotificationDeepLink(
  response: Notifications.NotificationResponse,
): string | null {
  const data = response.notification.request.content.data as Record<
    string,
    unknown
  > | null;
  const url = data?.["url"];
  return typeof url === "string" ? url : null;
}
