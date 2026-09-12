import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { ThemeProvider } from "@/design-system/ThemeProvider";
import { useAuth } from "@/features/auth/AuthProvider";
import { NotePaywall } from "@/features/paywall/NotePaywall";
import { TimelinePaywall } from "@/features/paywall/TimelinePaywall";
import type { PaywallData } from "@/features/paywall/useOffering";
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

const pkg = {
  identifier: "$rc_annual",
  packageType: "ANNUAL",
  product: {
    identifier: "synthetic-annual",
    priceString: "$59.99",
    title: "Yearly",
    introPrice: { price: 0, periodUnit: "DAY", periodNumberOfUnits: 3 },
  },
} as PaywallData["pkg"];

const data: PaywallData = {
  loading: false,
  pkg,
  allPackages: [pkg!],
  selectPackage: jest.fn(),
  priceLine: "$59.99/year",
  trialLength: "3 days",
  trialDays: 3,
  devMock: false,
  unavailable: false,
  eligibility: { "synthetic-annual": "eligible" },
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useAuth).mockReturnValue({
    isAnonymous: false,
    availableProviders: { apple: true, google: false, email: false },
  } as ReturnType<typeof useAuth>);
});

function wrap(node: React.ReactElement) {
  return <ThemeProvider>{node}</ThemeProvider>;
}

test("timeline CTA purchases without opening a login sheet", async () => {
  const screen = render(
    wrap(
      <TimelinePaywall
        data={data}
        closeDelayMs={null}
        trialReminder={false}
        onTrialReminderChange={() => {}}
        onPurchased={() => {}}
        placement="test"
      />,
    ),
  );
  fireEvent.press(screen.getByTestId("paywall-cta"));
  expect(screen.queryByTestId("auth-sheet")).toBeNull();
  expect(purchasePackage).toHaveBeenCalledWith(pkg);
  screen.unmount();
});

test("note CTA purchases without opening a login sheet", async () => {
  const screen = render(
    wrap(
      <NotePaywall
        data={data}
        voice="team"
        userName={null}
        onPurchased={() => {}}
        placement="test"
      />,
    ),
  );
  fireEvent.press(screen.getByTestId("paywall-cta"));
  expect(screen.queryByTestId("auth-sheet")).toBeNull();
  expect(purchasePackage).toHaveBeenCalledWith(pkg);
  screen.unmount();
});

test("restore does not open a login sheet", async () => {
  const screen = render(
    wrap(
      <TimelinePaywall
        data={data}
        closeDelayMs={null}
        trialReminder={false}
        onTrialReminderChange={() => {}}
        onPurchased={() => {}}
        placement="test"
      />,
    ),
  );
  fireEvent.press(screen.getByTestId("restore"));
  expect(screen.queryByTestId("auth-sheet")).toBeNull();
  expect(restorePurchases).toHaveBeenCalled();
  screen.unmount();
});
