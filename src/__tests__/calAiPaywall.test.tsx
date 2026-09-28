import React from "react";
import { Alert } from "react-native";
import { act, fireEvent, render } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "@/design-system/ThemeProvider";
import { CALAI_HEADLINES, CalAiPaywall, TRIAL_REMINDER_LABEL } from "@/features/paywall/calai/CalAiPaywall";
import type { CalAiVersion } from "@/features/paywall/paywallVariant";
import type { PaywallData } from "@/features/paywall/useOffering";
import { purchasePackage, restorePurchases } from "@/lib/purchases";

jest.mock("react-native-purchases", () => ({
  __esModule: true,
  default: { configure: jest.fn(), setLogLevel: jest.fn(), addCustomerInfoUpdateListener: jest.fn() },
  LOG_LEVEL: { DEBUG: "DEBUG", ERROR: "ERROR" },
  PACKAGE_TYPE: { ANNUAL: "ANNUAL", WEEKLY: "WEEKLY" },
}));
jest.mock("expo-router", () => ({ router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() } }));
jest.mock("@/lib/analytics", () => ({ analytics: { capture: jest.fn() } }));
jest.mock("@/lib/purchases", () => ({
  purchasePackage: jest.fn(), restorePurchases: jest.fn(),
  isAllowedPackage: (pkg: { packageType: string }) => ["WEEKLY", "ANNUAL"].includes(pkg.packageType),
}));
jest.mock("@/features/auth/AuthProvider", () => ({ useAuth: () => ({ isAnonymous: false }) }));
jest.mock("@/features/auth/AuthSheet", () => ({ AuthSheet: () => null }));
jest.mock("@/features/paywall/PrivacyChoicesSheet", () => {
  const React = require("react");
  const { View } = require("react-native");
  return { PrivacyChoicesSheet: ({ visible }: { visible: boolean }) => visible ? React.createElement(View, { testID: "privacy-choices-sheet" }) : null };
});

const annual = {
  identifier: "$rc_annual", packageType: "ANNUAL",
  product: { identifier: "yearly", price: 35.99, priceString: "$35.99", title: "Yearly", introPrice: { price: 0, periodUnit: "DAY", periodNumberOfUnits: 3 } },
} as NonNullable<PaywallData["pkg"]>;
const weekly = {
  identifier: "$rc_weekly", packageType: "WEEKLY",
  product: { identifier: "weekly", price: 6.99, priceString: "$6.99", title: "Weekly", introPrice: null },
} as NonNullable<PaywallData["pkg"]>;
function makeData(overrides: Partial<PaywallData> = {}): PaywallData {
  return { loading: false, pkg: annual, allPackages: [annual, weekly], selectPackage: jest.fn(), priceLine: "$35.99/year", trialLength: "3 days", trialDays: 3, devMock: false, unavailable: false, eligibility: { yearly: "eligible", weekly: "ineligible" }, ...overrides };
}
function renderPaywall(version: CalAiVersion, data = makeData(), extra: Partial<React.ComponentProps<typeof CalAiPaywall>> = {}) {
  const onPurchased = jest.fn();
  const screen = render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } }}>
      <ThemeProvider><CalAiPaywall data={data} version={version} placement="test" onPurchased={onPurchased} {...extra} /></ThemeProvider>
    </SafeAreaProvider>,
  );
  return { screen, onPurchased };
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(purchasePackage).mockReset().mockResolvedValue({ status: "purchased" });
  jest.mocked(restorePurchases).mockReset().mockResolvedValue({ status: "purchased" });
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});
afterEach(() => { jest.restoreAllMocks(); });

describe.each([1, 2, 3, 4] as CalAiVersion[])("CalAiPaywall version %i", (version) => {
  it("retains its hero, headline, legal links, restore and privacy choices", () => {
    const { screen } = renderPaywall(version);
    expect(screen.getByTestId("paywall-headline")).toHaveTextContent(CALAI_HEADLINES[version]);
    expect(screen.getByTestId("notification-stack")).toBeTruthy();
    expect(screen.getByTestId("paywall-links")).toHaveTextContent("Terms·Privacy·Restore·Privacy choices");
    fireEvent.press(screen.getByTestId("privacy-choices"));
    expect(screen.getByTestId("privacy-choices-sheet")).toBeTruthy();
  });
  it("makes the real bill dominant, removes weekly equivalents, and uses a neutral CTA", () => {
    const { screen } = renderPaywall(version);
    const bill = screen.getByTestId("paywall-billing-amount");
    expect(bill).toHaveTextContent("$35.99/year");
    expect(bill).toHaveStyle({ fontSize: 28, lineHeight: 36, fontWeight: "600" });
    expect(screen.getByTestId("paywall-billing-trial")).toHaveStyle({ fontSize: 14, lineHeight: 20 });
    expect(screen.getByTestId("paywall-cta")).toHaveTextContent("Continue");
    expect(screen.queryByText(/\/wk/)).toBeNull();
    expect(screen.queryByText(/Most popular|Save 90%/)).toBeNull();
    expect(screen.queryByTestId("plan-yearly-tag")).toBeNull();
    const tree = JSON.stringify(screen.toJSON());
    expect(tree.indexOf('"testID":"paywall-billing"')).toBeLessThan(tree.indexOf('"testID":"paywall-cta"'));
    expect(tree.indexOf('"testID":"paywall-disclosure"')).toBeLessThan(tree.indexOf('"testID":"paywall-cta"'));
  });
  it.each(["ineligible", "unknown"] as const)("never advertises a trial when eligibility is %s", (eligibility) => {
    const { screen } = renderPaywall(version, makeData({ eligibility: { yearly: eligibility }, trialLength: null, trialDays: null }));
    expect(screen.queryByTestId("paywall-billing-trial")).toBeNull();
    expect(screen.queryByTestId("billing-$rc_annual-trial")).toBeNull();
    expect(screen.queryByTestId("toggle-billing-trial")).toBeNull();
    expect(screen.queryByText(/free/i)).toBeNull();
    expect(screen.getByTestId("paywall-billing-amount")).toHaveTextContent("$35.99/year");
  });
  it("uses the actual eligible trial duration instead of a hardcoded three days", () => {
    const pkg = { ...annual, product: { ...annual.product, introPrice: { ...annual.product.introPrice!, periodNumberOfUnits: 7 } } };
    const { screen } = renderPaywall(version, makeData({ pkg, allPackages: [pkg, weekly], trialLength: "7 days", trialDays: 7 }));
    expect(screen.getByTestId("paywall-billing-trial")).toHaveTextContent("7 days free before the first payment");
    expect(screen.queryByText(/3 days free/)).toBeNull();
  });
  it("selects and purchases the actual selected store package", async () => {
    const data = makeData({ pkg: weekly, trialLength: null, trialDays: null });
    const { screen, onPurchased } = renderPaywall(version, data);
    expect(screen.getByTestId("paywall-billing-amount")).toHaveTextContent("$6.99/week");
    fireEvent.press(screen.getByTestId("plan-$rc_annual"));
    expect(data.selectPackage).toHaveBeenCalledWith(annual);
    await act(async () => { fireEvent.press(screen.getByTestId("paywall-cta")); });
    expect(purchasePackage).toHaveBeenCalledWith(weekly);
    expect(onPurchased).toHaveBeenCalledTimes(1);
  });
  it("does not call cancellation a purchase failure", async () => {
    jest.mocked(purchasePackage).mockResolvedValueOnce({ status: "cancelled" });
    const { screen, onPurchased } = renderPaywall(version);
    await act(async () => { fireEvent.press(screen.getByTestId("paywall-cta")); });
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(onPurchased).not.toHaveBeenCalled();
  });
  it("shows pending approval without granting premium", async () => {
    jest.mocked(purchasePackage).mockResolvedValueOnce({ status: "pending", code: "PAYMENT_PENDING_ERROR", title: "Purchase pending", message: "Awaiting approval" });
    const { screen, onPurchased } = renderPaywall(version);
    await act(async () => { fireEvent.press(screen.getByTestId("paywall-cta")); });
    expect(Alert.alert).toHaveBeenCalledWith("Purchase pending", "Awaiting approval");
    expect(onPurchased).not.toHaveBeenCalled();
  });
  it("restores purchases", async () => {
    const { screen, onPurchased } = renderPaywall(version);
    await act(async () => { fireEvent.press(screen.getByTestId("restore")); });
    expect(restorePurchases).toHaveBeenCalledTimes(1);
    expect(onPurchased).toHaveBeenCalledTimes(1);
  });
  it("hides stale pricing and disables purchases when loading or unavailable", () => {
    for (const state of [{ loading: true }, { unavailable: true }]) {
      const retry = jest.fn();
      const { screen } = renderPaywall(version, makeData({ ...state, retry }));
      expect(screen.getByTestId("paywall-cta")).toBeDisabled();
      expect(screen.queryByTestId("paywall-billing")).toBeNull();
      expect(screen.queryByTestId("plan-$rc_annual")).toBeNull();
      if ("unavailable" in state) { fireEvent.press(screen.getByText("Retry store")); expect(retry).toHaveBeenCalledTimes(1); }
      screen.unmount();
    }
  });
});

it("prevents double taps and locks plan changes until the native result", async () => {
  let finish!: (value: { status: "cancelled" }) => void;
  jest.mocked(purchasePackage).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const { screen } = renderPaywall(1);
  await act(async () => { fireEvent.press(screen.getByTestId("paywall-cta")); fireEvent.press(screen.getByTestId("paywall-cta")); });
  expect(purchasePackage).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId("plan-$rc_weekly")).toBeDisabled();
  await act(async () => { finish({ status: "cancelled" }); });
  expect(screen.getByTestId("plan-$rc_weekly")).not.toBeDisabled();
});
it("uses the store's localized billed amount without hardcoded USD prices", () => {
  const pkg = { ...annual, product: { ...annual.product, priceString: "€ 42,99", price: 42.99 } };
  const { screen } = renderPaywall(1, makeData({ pkg, allPackages: [pkg] }));
  expect(screen.getByTestId("paywall-billing-amount")).toHaveTextContent("€ 42,99/year");
  expect(screen.queryByText(/\$35\.99/)).toBeNull();
});
it("retains the wired eligible-trial reminder", () => {
  const changed = jest.fn();
  const { screen } = renderPaywall(1, makeData(), { trialReminder: true, onTrialReminderChange: changed });
  expect(screen.getByTestId("trial-reminder-row")).toHaveTextContent(TRIAL_REMINDER_LABEL);
  fireEvent(screen.getByTestId("trial-reminder-toggle"), "valueChange", false);
  expect(changed).toHaveBeenCalledWith(false);
});
it("hides the reminder if the caller has not wired it", () => {
  expect(renderPaywall(1).screen.queryByTestId("trial-reminder-row")).toBeNull();
});
it("retains the outlined v1 hero and v3 tall CTA", () => {
  const one = renderPaywall(1);
  expect(one.screen.getByTestId("notification-card-0")).toHaveStyle({ borderWidth: 1, borderColor: "#4B3A35" });
  one.screen.unmount();
  expect(renderPaywall(3).screen.getByTestId("paywall-cta")).toHaveStyle({ minHeight: 65 });
});
describe("close control", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  it("appears only after the configured delay", () => {
    const onClose = jest.fn();
    const { screen } = renderPaywall(1, makeData(), { closeDelayMs: 2000, onClose });
    expect(screen.queryByTestId("paywall-close")).toBeNull();
    act(() => { jest.advanceTimersByTime(2000); });
    fireEvent.press(screen.getByTestId("paywall-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it("never appears on a hard gate", () => {
    const { screen } = renderPaywall(1, makeData(), { onClose: jest.fn() });
    act(() => { jest.advanceTimersByTime(10_000); });
    expect(screen.queryByTestId("paywall-close")).toBeNull();
  });
});
