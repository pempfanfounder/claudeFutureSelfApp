import { act, fireEvent, render } from "@testing-library/react-native";
import { BackHandler, Pressable, View } from "react-native";
import { getAnimatedStyle } from "react-native-reanimated";

import { ThemeProvider } from "@/design-system/ThemeProvider";
import {
  MorphProvider,
  useMorph,
  type MorphRect,
  type MorphScreen,
  type MorphScreens,
} from "@/features/nav/MorphOverlay";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: () => false,
  },
  useIsFocused: () => true,
}));

/** Stand-ins for the real destinations: identifiable, and able to close. */
const screens: MorphScreens = {
  profile: ({ onClose, onNavigate }) => (
    <View testID="screen-profile">
      <Pressable testID="profile-close" onPress={onClose} />
      <Pressable
        testID="profile-notifications"
        onPress={() => onNavigate?.("/(main)/settings/notifications")}
      />
    </View>
  ),
  favorites: ({ onClose }) => (
    <View testID="screen-favorites">
      <Pressable testID="favorites-close" onPress={onClose} />
    </View>
  ),
  themes: () => <View testID="screen-themes" />,
};

const RECT: MorphRect = { x: 300, y: 700, width: 52, height: 52, radius: 16 };

function Probe() {
  const morph = useMorph();
  const launcher = (screen: MorphScreen) => (
    <Pressable
      key={screen}
      testID={`open-${screen}`}
      onPress={() => morph.open(RECT, screen)}
    />
  );
  return (
    <View>
      {(["profile", "favorites", "themes"] as const).map(launcher)}
      <Pressable testID="close" onPress={morph.close} />
    </View>
  );
}

function renderHost() {
  return render(
    <ThemeProvider>
      <MorphProvider screens={screens}>
        <Probe />
      </MorphProvider>
    </ThemeProvider>,
  );
}

/**
 * While the overlay is up it is `accessibilityViewIsModal`, which hides
 * the feed's launchers from queries (as it does from VoiceOver); reach
 * them anyway when a test needs to press "behind" the overlay.
 */
const behind = { includeHiddenElements: true };

/** Lets the reverse morph (fade + spring) run to completion and unmount. */
async function settle() {
  await act(async () => {
    jest.advanceTimersByTime(2000);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe("MorphOverlay", () => {
  let removeSpy: jest.Mock;
  let addListenerSpy: jest.SpyInstance;
  let backHandler: (() => boolean | null | undefined) | null;

  beforeEach(() => {
    jest.useFakeTimers();
    mockPush.mockClear();
    removeSpy = jest.fn();
    backHandler = null;
    addListenerSpy = jest
      .spyOn(BackHandler, "addEventListener")
      .mockImplementation((_event, handler) => {
        backHandler = handler as () => boolean;
        return { remove: removeSpy };
      });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("renders no overlay until a launcher opens it", () => {
    const screen = renderHost();
    expect(screen.queryByTestId("morph-overlay")).toBeNull();
    expect(addListenerSpy).not.toHaveBeenCalled();
    screen.unmount();
  });

  it.each(["profile", "favorites", "themes"] as const)(
    "open() mounts the %s screen inside the overlay",
    (name) => {
      const screen = renderHost();
      fireEvent.press(screen.getByTestId(`open-${name}`));
      expect(screen.getByTestId("morph-overlay")).toBeTruthy();
      expect(screen.getByTestId(`screen-${name}`)).toBeTruthy();
      screen.unmount();
    },
  );

  it("starts the card exactly at the launcher rect", () => {
    const screen = renderHost();
    fireEvent.press(screen.getByTestId("open-themes"));
    const style = getAnimatedStyle(screen.getByTestId("morph-card")) as {
      left: number;
      top: number;
      width: number;
      height: number;
      borderRadius: number;
    };
    expect(style.left).toBe(RECT.x);
    expect(style.top).toBe(RECT.y);
    expect(style.width).toBe(RECT.width);
    expect(style.height).toBe(RECT.height);
    expect(style.borderRadius).toBe(RECT.radius);
    screen.unmount();
  });

  it("hides the feed behind it from accessibility while open", () => {
    const screen = renderHost();
    expect(screen.getByTestId("open-themes")).toBeTruthy();
    fireEvent.press(screen.getByTestId("open-themes"));
    expect(screen.queryByTestId("open-themes")).toBeNull();
    expect(screen.getByTestId("open-themes", behind)).toBeTruthy();
    screen.unmount();
  });

  it("ignores a second open() while one morph is showing", () => {
    const screen = renderHost();
    fireEvent.press(screen.getByTestId("open-themes"));
    fireEvent.press(screen.getByTestId("open-favorites", behind));
    expect(screen.getByTestId("screen-themes")).toBeTruthy();
    expect(screen.queryByTestId("screen-favorites")).toBeNull();
    screen.unmount();
  });

  it("registers a hardware-back handler only while open", async () => {
    const screen = renderHost();
    fireEvent.press(screen.getByTestId("open-favorites"));
    expect(addListenerSpy).toHaveBeenCalledWith(
      "hardwareBackPress",
      expect.any(Function),
    );
    expect(removeSpy).not.toHaveBeenCalled();

    // Back closes (and is consumed) rather than leaving the feed.
    let handled: boolean | null | undefined;
    act(() => {
      handled = backHandler?.();
    });
    expect(handled).toBe(true);
    await settle();
    expect(screen.queryByTestId("morph-overlay")).toBeNull();
    expect(removeSpy).toHaveBeenCalled();
    screen.unmount();
  });

  it("close() reverses the morph and unmounts the overlay", async () => {
    const screen = renderHost();
    fireEvent.press(screen.getByTestId("open-themes"));
    fireEvent.press(screen.getByTestId("close", behind));
    // Content fades first; the container is still on screen right away.
    expect(screen.getByTestId("morph-overlay")).toBeTruthy();
    await settle();
    expect(screen.queryByTestId("morph-overlay")).toBeNull();
    screen.unmount();
  });

  it("the embedded screen's onClose reverses the morph", async () => {
    const screen = renderHost();
    fireEvent.press(screen.getByTestId("open-favorites"));
    fireEvent.press(screen.getByTestId("favorites-close"));
    await settle();
    expect(screen.queryByTestId("morph-overlay")).toBeNull();
    screen.unmount();
  });

  it("onNavigate closes first, then pushes the route", async () => {
    const screen = renderHost();
    fireEvent.press(screen.getByTestId("open-profile"));
    fireEvent.press(screen.getByTestId("profile-notifications"));
    expect(mockPush).not.toHaveBeenCalled();
    await settle();
    expect(screen.queryByTestId("morph-overlay")).toBeNull();
    expect(mockPush).toHaveBeenCalledWith("/(main)/settings/notifications");
    screen.unmount();
  });

  it("can open again after closing", async () => {
    const screen = renderHost();
    fireEvent.press(screen.getByTestId("open-themes"));
    fireEvent.press(screen.getByTestId("close", behind));
    await settle();
    fireEvent.press(screen.getByTestId("open-profile"));
    expect(screen.getByTestId("screen-profile")).toBeTruthy();
    screen.unmount();
  });
});
