import { act, fireEvent, render } from "@testing-library/react-native";
import NotificationSettings from "@/app/(main)/settings/notifications";
import { useAppState } from "@/lib/appState";
import { getIdentitySupabase } from "@/lib/supabase";
import { saveNotificationPreferences } from "@/features/notifications/preferences";
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/features/nav/SecondaryMotion", () => ({
  SecondaryMotion: ({ children }: any) => children,
}));
jest.mock("@/design-system/components/BackButton", () => ({
  BackButton: () => null,
}));
jest.mock("@/lib/supabase", () => ({ getIdentitySupabase: jest.fn() }));
jest.mock("@/lib/analytics", () => ({ analytics: { capture: jest.fn() } }));
jest.mock("@/lib/monitoring", () => ({
  monitoring: { captureError: jest.fn() },
}));
jest.mock("@/features/notifications/preferences", () => ({
  ...jest.requireActual("@/features/notifications/preferences"),
  saveNotificationPreferences: jest.fn(),
}));
jest.mock("@/features/notifications/push", () => ({
  getPermissionStatus: async () => "granted",
  registerDevice: async () => {},
  requestNotificationPermission: async () => "granted",
}));
test("retry after an acknowledged preference write only retries schedule recalculation", async () => {
  useAppState.getState().setUserId("fs-local-settings");
  const prefs = {
    quotes_per_day: 3,
    affirmations_per_day: 3,
    streak_reminder: true,
    trial_reminder: true,
    window_start_minutes: 540,
    window_end_minutes: 1260,
    quiet_start_minutes: null,
    quiet_end_minutes: null,
  };
  const rpc = jest
    .fn()
    .mockResolvedValueOnce({ error: new Error("Synthetic schedule outage") })
    .mockResolvedValue({ error: null });
  const q: any = {
    select: () => q,
    eq: () => q,
    maybeSingle: async () => ({ data: prefs, error: null }),
  };
  (getIdentitySupabase as jest.Mock).mockResolvedValue({ from: () => q, rpc });
  (saveNotificationPreferences as jest.Mock).mockResolvedValue({
    ...prefs,
    quotes_per_day: 4,
  });
  const screen = render(<NotificationSettings />);
  await act(async () => {});
  await act(async () => {
    fireEvent.press(screen.getByLabelText("Quotes: increase"));
  });
  expect(saveNotificationPreferences).toHaveBeenCalledTimes(1);
  expect((saveNotificationPreferences as jest.Mock).mock.calls[0][1]).toEqual({
    quotes_per_day: 4,
  });
  await act(async () => {
    fireEvent.press(
      screen.getByText("Your latest change is not fully synced. Tap Retry."),
    );
  });
  expect(saveNotificationPreferences).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledTimes(2);
  expect(
    screen.queryByText("Your latest change is not fully synced. Tap Retry."),
  ).toBeNull();
});
