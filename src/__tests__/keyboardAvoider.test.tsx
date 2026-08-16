import { fireEvent, render } from "@testing-library/react-native";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { KeyboardAvoider } from "@/features/onboarding/engine/KeyboardAvoider";

const TOP_INSET = 47;

type MeasureCallback = (
  x: number,
  y: number,
  width: number,
  height: number,
) => void;

function renderAvoider(props: { enabled?: boolean } = {}) {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: TOP_INSET, left: 0, right: 0, bottom: 34 },
      }}
    >
      <KeyboardAvoider style={{ flex: 1 }} testID="avoider" {...props}>
        <Text>child</Text>
      </KeyboardAvoider>
    </SafeAreaProvider>,
  );
}

/** Stubs the native measurement so `measureInWindow` reports `y`. */
function mockWindowY(y: number) {
  return jest
    .spyOn(View.prototype, "measureInWindow")
    .mockImplementation(((cb: MeasureCallback) =>
      cb(0, y, 390, 700)) as unknown as View["measureInWindow"]);
}

function layout(screen: ReturnType<typeof renderAvoider>) {
  fireEvent(screen.getByTestId("avoider"), "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 700 } },
  });
}

function kavProps(screen: ReturnType<typeof renderAvoider>) {
  return screen.UNSAFE_getByType(KeyboardAvoidingView).props;
}

describe("KeyboardAvoider", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders its children", () => {
    const screen = renderAvoider();
    expect(screen.getByText("child")).toBeTruthy();
    screen.unmount();
  });

  it("uses behavior=padding on iOS and Android", () => {
    const ios = renderAvoider();
    expect(kavProps(ios).behavior).toBe("padding");
    ios.unmount();

    const os = jest.replaceProperty(Platform, "OS", "android");
    const android = renderAvoider();
    expect(kavProps(android).behavior).toBe("padding");
    android.unmount();
    os.restore();
  });

  it("falls back to the top safe-area inset before any measurement", () => {
    // The preset's measureInWindow is a no-op, so no callback ever fires.
    const screen = renderAvoider();
    layout(screen);
    expect(kavProps(screen).keyboardVerticalOffset).toBe(TOP_INSET);
    screen.unmount();
  });

  it("offsets by its own measured window Y after layout", () => {
    const spy = mockWindowY(123);
    const screen = renderAvoider();
    layout(screen);
    expect(spy).toHaveBeenCalled();
    expect(kavProps(screen).keyboardVerticalOffset).toBe(123);
    screen.unmount();
  });

  it("accepts a measured Y of zero (no top padding) over the fallback", () => {
    mockWindowY(0);
    const screen = renderAvoider();
    layout(screen);
    expect(kavProps(screen).keyboardVerticalOffset).toBe(0);
    screen.unmount();
  });

  it("ignores NaN and negative measurements", () => {
    const spy = mockWindowY(Number.NaN);
    const screen = renderAvoider();
    layout(screen);
    expect(kavProps(screen).keyboardVerticalOffset).toBe(TOP_INSET);

    spy.mockImplementation(((cb: MeasureCallback) =>
      cb(0, -12, 390, 700)) as unknown as View["measureInWindow"]);
    layout(screen);
    expect(kavProps(screen).keyboardVerticalOffset).toBe(TOP_INSET);
    screen.unmount();
  });

  it("forwards enabled to the KeyboardAvoidingView", () => {
    const screen = renderAvoider({ enabled: false });
    expect(kavProps(screen).enabled).toBe(false);
    screen.unmount();
  });
});
