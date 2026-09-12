import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ThemeProvider } from "@/design-system/ThemeProvider";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  CALAI_HEADLINES,
  CalAiPaywall,
} from "@/features/paywall/calai/CalAiPaywall";
import type { CalAiVersion } from "@/features/paywall/paywallVariant";
import type { PaywallData } from "@/features/paywall/useOffering";
import { analytics } from "@/lib/analytics";
import { purchasePackage, restorePurchases } from "@/lib/purchases";

jest.mock("react-native-purchases", () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    setLogLevel: jest.fn(),
    addCustomerInfoUpdateListener: jest.fn(),
  },
  LOG_LEVEL: { DEBUG: "DEBUG", ERROR: "ERROR" },
  PACKAGE_TYPE: { ANNUAL: "ANNUAL", MONTHLY: "MONTHLY" },
}));
jest.mock("expo-router", () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() },
}));
jest.mock("@/features/paywall/PrivacyChoicesSheet", () => ({
  PrivacyChoicesSheet: () => null,
}));
jest.mock("@/lib/analytics", () => ({
  analytics: { capture: jest.fn() },
}));
jest.mock("@/lib/purchases", () => ({
  purchasePackage: jest.fn(async () => ({ status: "purchased" })),
  restorePurchases: jest.fn(async () => ({ status: "purchased" })),
  isAllowedPackage: (pkg: { packageType: string }) =>
    pkg.packageType === "MONTHLY" || pkg.packageType === "ANNUAL",
}));
jest.mock("@/features/auth/AuthProvider", () => ({
  useAuth: jest.fn(),
}));
jest.mock("@/features/auth/AuthSheet", () => {
  const mockReact = require("react");
  const ReactNative = require("react-native");
  return {
    AuthSheet: ({ visible }: any) =>
      visible
        ? mockReact.createElement(ReactNative.View, { testID: "auth-sheet" })
        : null,
  };
});

const annual = {
  identifier: "$rc_annual",
  packageType: "ANNUAL",
  product: {
    identifier: "synthetic-annual",
    price: 59.99,
    priceString: "$59.99",
    title: "Yearly",
    introPrice: { price: 0, periodUnit: "DAY", periodNumberOfUnits: 3 },
  },
} as NonNullable<PaywallData["pkg"]>;

const monthly = {
  identifier: "$rc_monthly",
  packageType: "MONTHLY",
  product: {
    identifier: "synthetic-monthly",
    price: 9.99,
    priceString: "$9.99",
    title: "Monthly",
    introPrice: null,
  },
} as NonNullable<PaywallData["pkg"]>;

function makeData(overrides: Partial<PaywallData> = {}): PaywallData {
  return {
    loading: false,
    pkg: annual,
    allPackages: [annual, monthly],
    selectPackage: jest.fn(),
    priceLine: "$59.99/year",
    trialLength: "3 days",
    trialDays: 3,
    devMock: false,
    unavailable: false,
    eligibility: {
      "synthetic-annual": "eligible",
      "synthetic-monthly": "ineligible",
    },
    ...overrides,
  };
}

function wrap(node: React.ReactElement) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 393, height: 852 },
        insets: { top: 59, left: 0, right: 0, bottom: 34 },
      }}
    >
      <ThemeProvider>{node}</ThemeProvider>
    </SafeAreaProvider>
  );
}

function renderPaywall(
  version: CalAiVersion,
  data = makeData(),
  extra: Partial<React.ComponentProps<typeof CalAiPaywall>> = {},
) {
  const onPurchased = jest.fn();
  const screen = render(
    wrap(
      <CalAiPaywall
        data={data}
        version={version}
        placement="test"
        onPurchased={onPurchased}
        {...extra}
      />,
    ),
  );
  return { screen, onPurchased };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useAuth).mockReturnValue({
    isAnonymous: false,
    availableProviders: { apple: true, google: false, email: false },
  } as ReturnType<typeof useAuth>);
});

describe.each([1, 2, 3, 4] as CalAiVersion[])(
  "CalAiPaywall version %i",
  (version) => {
    it("renders its headline, the notification stack and the small print", () => {
      const { screen } = renderPaywall(version);
      expect(screen.getByTestId("paywall-headline")).toHaveTextContent(
        CALAI_HEADLINES[version],
      );
      expect(screen.getByTestId("notification-stack")).toBeTruthy();
      expect(screen.getAllByText("Future Self").length).toBeGreaterThanOrEqual(
        3,
      );
      expect(screen.getByTestId("notification-card-0")).toHaveTextContent(
        /^Future SelfNowMake yourself the kind of person you promised you would become\.$/,
      );
      expect(screen.getByTestId("paywall-disclosure")).toHaveTextContent(
        "3 days free, then $59.99 per year. Renews automatically unless cancelled in the App Store.",
      );
      // Trimmed footer: exactly Terms · Privacy · Restore.
      expect(screen.getByTestId("paywall-links")).toHaveTextContent(
        "Terms·Privacy·Restore",
      );
      expect(screen.getByTestId("terms")).toBeTruthy();
      expect(screen.getByTestId("privacy")).toBeTruthy();
      expect(screen.getByTestId("restore")).toBeTruthy();
      expect(screen.queryByText("Privacy choices")).toBeNull();
      expect(screen.queryByText(/Sign in/)).toBeNull();
      expect(screen.queryByText(/24 hours/)).toBeNull();
      expect(analytics.capture).toHaveBeenCalledWith("paywall_viewed", {
        style: `calai-${version}`,
        placement: "test",
      });
      screen.unmount();
    });

    it("shows the real saving, per-month prices and trial, and selects plans", () => {
      const data = makeData();
      const { screen } = renderPaywall(version, data);
      expect(screen.getByText("Save 50%")).toBeTruthy();
      expect(screen.getByText("$5.00/mo")).toBeTruthy();
      expect(screen.getByText("$59.99 billed yearly")).toBeTruthy();
      fireEvent.press(screen.getByTestId("plan-$rc_monthly"));
      expect(data.selectPackage).toHaveBeenCalledWith(monthly);
      screen.unmount();
    });

    it("CTA names the store trial and purchases the selected package", async () => {
      const { screen, onPurchased } = renderPaywall(version);
      expect(screen.getByTestId("paywall-cta")).toHaveTextContent(
        "Start your 3-day free trial",
      );
      await act(async () => {
        fireEvent.press(screen.getByTestId("paywall-cta"));
      });
      expect(screen.queryByTestId("auth-sheet")).toBeNull();
      expect(purchasePackage).toHaveBeenCalledWith(annual);
      expect(onPurchased).toHaveBeenCalledTimes(1);
      screen.unmount();
    });

    it("falls back to Continue and plain price terms without a trial", () => {
      const { screen } = renderPaywall(
        version,
        makeData({
          trialLength: null,
          trialDays: null,
          eligibility: { "synthetic-annual": "ineligible" },
        }),
      );
      expect(screen.getByTestId("paywall-cta")).toHaveTextContent("Continue");
      expect(screen.getByTestId("paywall-disclosure")).toHaveTextContent(
        "$59.99 per year. Renews automatically unless cancelled in the App Store.",
      );
      expect(screen.queryByText(/free/)).toBeNull();
      screen.unmount();
    });

    it("restore runs without a login sheet", async () => {
      const { screen, onPurchased } = renderPaywall(version);
      await act(async () => {
        fireEvent.press(screen.getByTestId("restore"));
      });
      expect(screen.queryByTestId("auth-sheet")).toBeNull();
      expect(restorePurchases).toHaveBeenCalled();
      expect(onPurchased).toHaveBeenCalledTimes(1);
      screen.unmount();
    });

    it("keeps the gate closed when the store is unreachable", () => {
      const retry = jest.fn();
      const { screen } = renderPaywall(
        version,
        makeData({ unavailable: true, pkg: null, allPackages: [], retry }),
      );
      expect(screen.getByTestId("paywall-cta")).toBeDisabled();
      fireEvent.press(screen.getByText("Retry store"));
      expect(retry).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId("paywall-close")).toBeNull();
      screen.unmount();
    });
  },
);

describe("CalAiPaywall layout differences", () => {
  it("v1 and v2 stack plan cards with a Most popular tab; v3 uses a toggle", () => {
    const one = renderPaywall(1);
    expect(one.screen.getByText("Most popular")).toBeTruthy();
    expect(one.screen.getByText("Monthly")).toBeTruthy();
    expect(one.screen.queryByTestId("plan-price-line")).toBeNull();
    one.screen.unmount();

    const two = renderPaywall(2);
    expect(two.screen.getByTestId("hero-2")).toBeTruthy();
    expect(two.screen.getByText("Most popular")).toBeTruthy();
    two.screen.unmount();

    const three = renderPaywall(3);
    expect(three.screen.queryByText("Most popular")).toBeNull();
    expect(three.screen.getByTestId("plan-price-line")).toHaveTextContent(
      "$5.00/mo$59.99 billed yearly",
    );
    expect(three.screen.getByTestId("paywall-cta")).toHaveStyle({
      minHeight: 65,
    });
    three.screen.unmount();
  });

  it("v4 keeps v1's plan cards and headline over v2's gradient hero", () => {
    const { screen } = renderPaywall(4);
    expect(screen.getByTestId("hero-4")).toBeTruthy();
    expect(screen.getByTestId("paywall-headline")).toHaveTextContent(
      CALAI_HEADLINES[1],
    );
    expect(screen.getByText("Most popular")).toBeTruthy();
    expect(screen.getByText("Monthly")).toBeTruthy();
    expect(screen.queryByTestId("plan-price-line")).toBeNull();
    expect(screen.getByTestId("paywall-cta")).not.toHaveStyle({
      minHeight: 65,
    });
    screen.unmount();
  });

  it("v3 price line follows the selected plan", () => {
    const { screen } = renderPaywall(3, makeData({ pkg: monthly }));
    expect(screen.getByTestId("plan-price-line")).toHaveTextContent(
      "$9.99/mo$9.99 billed monthly",
    );
    screen.unmount();
  });
});

describe("CalAiPaywall close control", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("appears only after the configured delay and calls onClose", () => {
    const onClose = jest.fn();
    const { screen } = renderPaywall(1, makeData(), {
      closeDelayMs: 2000,
      onClose,
    });
    expect(screen.queryByTestId("paywall-close")).toBeNull();
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    fireEvent.press(screen.getByTestId("paywall-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
    screen.unmount();
  });

  it("never appears on the hard gate", () => {
    const { screen } = renderPaywall(1, makeData(), { onClose: jest.fn() });
    act(() => {
      jest.advanceTimersByTime(10_000);
    });
    expect(screen.queryByTestId("paywall-close")).toBeNull();
    screen.unmount();
  });
});
