import { render, act } from "@testing-library/react-native";
import { useNotificationNavigation } from "@/features/nav/useNotificationNavigation";
import { useAppState } from "@/lib/appState";
import { router, useRootNavigationState } from "expo-router";
import * as Notifications from "expo-notifications";
jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useRootNavigationState: jest.fn(() => ({ key: "synthetic-root" })),
}));
jest.mock("expo-notifications", () => ({
  addNotificationResponseReceivedListener: jest.fn(() => ({
    remove: jest.fn(),
  })),
  getLastNotificationResponseAsync: jest.fn(),
}));
jest.mock("@/features/notifications/push", () => ({
  getNotificationDeepLink: (response: any) =>
    response.notification.request.content.data.url,
}));
const response = {
  notification: {
    request: {
      identifier: "synthetic-notification",
      content: {
        data: {
          url: "futureself://content/11111111-1111-4111-8111-111111111111?kind=quote",
        },
      },
    },
  },
};
function Probe({ ready }: { ready: boolean }) {
  useNotificationNavigation(ready, useAppState.getState().identityGeneration);
  return null;
}
test("stored notification waits for fonts, identity and a mounted navigator then dispatches exactly once", async () => {
  useAppState.getState().setUserId("fs-local-a");
  (
    Notifications.getLastNotificationResponseAsync as jest.Mock
  ).mockResolvedValue(response);
  const screen = render(<Probe ready={false} />);
  await act(async () => {});
  expect(router.push).not.toHaveBeenCalled();
  (useRootNavigationState as jest.Mock).mockReturnValue(undefined);
  screen.rerender(<Probe ready />);
  await act(async () => {});
  expect(router.push).not.toHaveBeenCalled();
  (useRootNavigationState as jest.Mock).mockReturnValue({
    key: "synthetic-root",
  });
  screen.rerender(<Probe ready />);
  await act(async () => {});
  expect(router.push).toHaveBeenCalledWith(
    "/content/11111111-1111-4111-8111-111111111111?kind=quote",
  );
  screen.rerender(<Probe ready={false} />);
  screen.rerender(<Probe ready />);
  await act(async () => {});
  expect(router.push).toHaveBeenCalledTimes(1);
});
