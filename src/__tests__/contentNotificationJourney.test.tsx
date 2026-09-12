import React from "react";
import { render, act, fireEvent } from "@testing-library/react-native";
import { View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNotificationNavigation } from "@/features/nav/useNotificationNavigation";
import ContentDeepLink from "@/app/content/[id]";
import { useAppState } from "@/lib/appState";
import { getIdentitySupabase } from "@/lib/supabase";
import { router } from "expo-router";
import * as Notifications from "expo-notifications";
jest.mock("@/lib/supabase", () => ({ getIdentitySupabase: jest.fn() }));
jest.mock("@/lib/experiments", () => ({ getInstallId: jest.fn() }));
jest.mock("@/lib/analytics", () => ({ analytics: { capture: jest.fn() } }));
jest.mock("@/lib/monitoring", () => ({
  monitoring: { captureError: jest.fn() },
}));
jest.mock("expo-device", () => ({ isDevice: false }));
jest.mock("expo-localization", () => ({
  getLocales: () => [],
  getCalendars: () => [],
}));
jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(() => ({
    remove: jest.fn(),
  })),
  getLastNotificationResponseAsync: jest.fn(),
}));
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useRootNavigationState: () => ({ key: "root" }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock("@/design-system/components", () => {
  const React = require("react"),
    { Text, View } = require("react-native");
  return {
    Screen: ({ children }: any) => React.createElement(View, null, children),
    AppText: ({ children }: any) => React.createElement(Text, null, children),
  };
});
jest.mock("@/features/nav/SecondaryMotion", () => ({
  SecondaryMotion: ({ children }: any) => children,
}));
jest.mock("@/design-system/components/BackButton", () => ({
  BackButton: () => null,
}));
jest.mock("@/features/content/ContentCard", () => ({
  ContentCard: ({ item }: any) =>
    require("react").createElement(
      require("react-native").Text,
      null,
      item.body,
    ),
}));
jest.mock("@/features/content/feedStore", () => ({
  useFeedStore: Object.assign(
    () => ({ favoriteIds: [], toggleFavorite: jest.fn() }),
    { getState: () => ({ markViewed: mockViewed }) },
  ),
}));
let mockParams: Record<string, unknown> = {};
const mockViewed = jest.fn(async () => {});
const owner = "11111111-1111-4111-8111-111111111111",
  other = "44444444-4444-4444-8444-444444444444",
  id = "22222222-2222-4222-8222-222222222222",
  delivery = "33333333-3333-4333-8333-333333333333";
const response = {
  notification: {
    request: {
      identifier: "delivery-tap",
      content: {
        data: {
          url: `futureself://content/${id}?kind=quote`,
          content_id: id,
          kind: "quote",
          delivery_id: delivery,
        },
      },
    },
  },
};
function Probe({ ready = true }: { ready?: boolean }) {
  useNotificationNavigation(ready, useAppState.getState().identityGeneration);
  return null;
}
function accept(user: string) {
  useAppState.getState().setUserId(user);
  useAppState.setState({
    isPremium: true,
    onboardingComplete: true,
    identityReady: true,
  });
}
const routeParams = (url: string) => ({
  id: url.split("/").pop()!.split("?")[0],
  ...Object.fromEntries(
    url
      .split("?")[1]
      .split("&")
      .map((p) => p.split("=")),
  ),
});
beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  useAppState.getState().setUserId(null);
  accept(owner);
  mockParams = {};
  (
    Notifications.getLastNotificationResponseAsync as jest.Mock
  ).mockResolvedValue(response);
  (getIdentitySupabase as jest.Mock).mockResolvedValue({
    from: () => {
      const filters: any = {};
      const q: any = {
        select: () => q,
        eq: (k: string, v: string) => {
          filters[k] = v;
          return q;
        },
        maybeSingle: async () => ({
          error: null,
          data:
            filters.user_id === owner
              ? {
                  id: delivery,
                  user_id: owner,
                  content_id: id,
                  content_snapshot: {
                    type: "quote",
                    body: "Original delivery A.",
                    author: null,
                  },
                }
              : null,
        }),
      };
      return q;
    },
  });
});
async function showDetail() {
  const screen = render(<ContentDeepLink />);
  await act(async () => {});
  const host = screen.UNSAFE_getAllByType(View).find((v) => v.props.onLayout);
  if (host)
    fireEvent(host, "layout", { nativeEvent: { layout: { height: 600 } } });
  return screen;
}
test.each(["cold", "warm"])(
  "%s notification goes through real parser, route, owned loader and rendered snapshot",
  async (mode) => {
    if (mode === "warm")
      (
        Notifications.getLastNotificationResponseAsync as jest.Mock
      ).mockResolvedValue(null);
    const nav = render(<Probe ready={false} />);
    await act(async () => {});
    expect(router.push).not.toHaveBeenCalled();
    nav.rerender(<Probe />);
    await act(async () => {});
    if (mode === "warm")
      act(() => {
        (
          Notifications.addNotificationResponseReceivedListener as jest.Mock
        ).mock.calls.at(-1)[0](response);
      });
    expect(router.push).toHaveBeenCalledTimes(1);
    mockParams = routeParams((router.push as jest.Mock).mock.calls[0][0]);
    const screen = await showDetail();
    expect(screen.getByText("Original delivery A.")).toBeTruthy();
    expect(mockViewed).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({ id, body: "Original delivery A." }),
    );
    screen.unmount();
    nav.unmount();
    (getIdentitySupabase as jest.Mock).mockRejectedValue(new Error("offline"));
    const reopened = await showDetail();
    expect(reopened.getByText("Original delivery A.")).toBeTruthy();
    reopened.unmount();
  },
);
test("failed cross-account replay does not consume the original owner's notification", async () => {
  accept(other);
  const nav = render(<Probe />);
  await act(async () => {});
  mockParams = routeParams((router.push as jest.Mock).mock.calls[0][0]);
  const rejected = await showDetail();
  expect(rejected.getByText("That one has moved on.")).toBeTruthy();
  expect(mockViewed).not.toHaveBeenCalled();
  rejected.unmount();
  accept(owner);
  nav.rerender(<Probe />);
  await act(async () => {});
  expect(router.push).toHaveBeenCalledTimes(2);
  mockParams = routeParams((router.push as jest.Mock).mock.calls[1][0]);
  const accepted = await showDetail();
  expect(accepted.getByText("Original delivery A.")).toBeTruthy();
  accepted.unmount();
  nav.unmount();
});
test("malformed explicit route cannot load or mark a substitute as viewed", async () => {
  mockParams = {
    id,
    source: "delivery",
    owner,
    delivery: [delivery, other],
    kind: "quote",
  };
  const screen = await showDetail();
  expect(screen.getByText("That one has moved on.")).toBeTruthy();
  expect(getIdentitySupabase).not.toHaveBeenCalled();
  expect(mockViewed).not.toHaveBeenCalled();
  screen.unmount();
});
