import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { router, useRootNavigationState } from "expo-router";
import { captureIdentity, isCurrentIdentity } from "@/lib/appState";
import { getNotificationDeepLink } from "@/features/notifications/push";

export function useNotificationNavigation(ready: boolean, generation: number) {
  const navigation = useRootNavigationState();
  const lastNotification = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || !navigation?.key) return;
    const identity = captureIdentity();
    let alive = true;
    const open = (response: Notifications.NotificationResponse | null) => {
      if (!alive || !isCurrentIdentity(identity) || !response) return;
      const url = getNotificationDeepLink(response);
      if (!url) return;
      const id = `${identity.generation}:${response.notification.request.identifier}`;
      if (lastNotification.current === id) return;
      router.push(url.replace(/^futureself:\/\//i, "/") as never);
      lastNotification.current = id;
    };
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    void Notifications.getLastNotificationResponseAsync()
      .then(open)
      .catch(() => {});
    return () => {
      alive = false;
      sub.remove();
    };
  }, [ready, generation, navigation?.key]);
}
