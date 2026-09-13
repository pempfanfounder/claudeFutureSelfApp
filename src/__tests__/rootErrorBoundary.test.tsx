import { fireEvent, render } from "@testing-library/react-native";
import * as Sentry from "@sentry/react-native";
import { Text } from "react-native";

import { initMonitoring, monitoring } from "@/lib/monitoring";
import { ROOT_ERROR_COPY, RootErrorBoundary } from "@/lib/RootErrorBoundary";

jest.mock("@/lib/config", () => ({
  config: {
    hasSentry: true,
    sentryDsn: "http://synthetic.invalid",
    appEnvironment: "production",
  },
}));
jest.mock("@sentry/react-native", () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  setUser: jest.fn(),
}));

const CANARY = "CANARY_RENDER_SECRET";
function Bomb({ explode }: { explode: boolean }) {
  if (explode) throw new Error(CANARY);
  return <Text>recovered content</Text>;
}

let initOptions: Record<string, unknown>;
beforeAll(() => {
  initMonitoring();
  initOptions = (Sentry.init as jest.Mock).mock.calls[0][0];
});
beforeEach(() => jest.clearAllMocks());

describe("RootErrorBoundary", () => {
  let consoleError: jest.SpyInstance;
  beforeEach(() => {
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => consoleError.mockRestore());

  it("shows the minimal fallback instead of a blank screen and reports one scrubbed event", () => {
    const screen = render(
      <RootErrorBoundary>
        <Bomb explode />
      </RootErrorBoundary>,
    );
    expect(screen.getByTestId("root-error-fallback")).toBeTruthy();
    expect(screen.getByText(ROOT_ERROR_COPY.headline)).toBeTruthy();
    expect(screen.getByText(ROOT_ERROR_COPY.retry)).toBeTruthy();
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    const calls = JSON.stringify(
      (Sentry.captureException as jest.Mock).mock.calls,
    );
    expect(calls).not.toContain(CANARY);
    expect(calls).toContain('"area":"app.render"');
    screen.unmount();
  });

  it("remounts the tree on Try again", () => {
    let explode = true;
    const Child = () => <Bomb explode={explode} />;
    const screen = render(
      <RootErrorBoundary>
        <Child />
      </RootErrorBoundary>,
    );
    expect(screen.getByTestId("root-error-fallback")).toBeTruthy();
    explode = false;
    fireEvent.press(screen.getByTestId("root-error-retry"));
    expect(screen.queryByTestId("root-error-fallback")).toBeNull();
    expect(screen.getByText("recovered content")).toBeTruthy();
    screen.unmount();
  });

  it("renders children untouched when nothing throws", () => {
    const screen = render(
      <RootErrorBoundary>
        <Bomb explode={false} />
      </RootErrorBoundary>,
    );
    expect(screen.getByText("recovered content")).toBeTruthy();
    expect(screen.queryByTestId("root-error-fallback")).toBeNull();
    expect(monitoring).toBeDefined();
    screen.unmount();
  });
});

describe("Sentry init", () => {
  it("captures native crashes while keeping PII, tracing and screenshots off", () => {
    const options = initOptions;
    expect(options.enableNative).toBe(true);
    expect(options.enableNativeCrashHandling).toBe(true);
    expect(options.sendDefaultPii).toBe(false);
    expect(options.tracesSampleRate).toBe(0);
    expect(options.attachScreenshot).toBe(false);
    expect(options.attachViewHierarchy).toBe(false);
    expect(typeof options.beforeSend).toBe("function");
  });
});
