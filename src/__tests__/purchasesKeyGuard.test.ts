jest.mock("react-native-purchases", () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    setLogLevel: jest.fn(),
    addCustomerInfoUpdateListener: jest.fn(),
    getOfferings: jest.fn().mockResolvedValue({ current: null }),
    getCustomerInfo: jest
      .fn()
      .mockResolvedValue({ entitlements: { active: {} } }),
  },
  LOG_LEVEL: { DEBUG: "DEBUG", ERROR: "ERROR" },
  PACKAGE_TYPE: { ANNUAL: "ANNUAL", MONTHLY: "MONTHLY", WEEKLY: "WEEKLY" },
}));

import { rejectApiKey } from "@/lib/purchases";

describe("rejectApiKey — RevenueCat key guard", () => {
  it("accepts the platform's real store key in a release build", () => {
    expect(rejectApiKey("appl_abc", "ios", false)).toBeNull();
    expect(rejectApiKey("goog_abc", "android", false)).toBeNull();
  });

  it("refuses a Test Store key in a non-development build", () => {
    // Handing a test_ key to the SDK in a release build makes RevenueCat
    // show "Wrong API Key" and terminate the app on launch.
    expect(rejectApiKey("test_AyrDX", "ios", false)).toMatch(/Test Store/);
    expect(rejectApiKey("test_AyrDX", "android", false)).toMatch(/Test Store/);
  });

  it("allows a Test Store key only in development builds", () => {
    expect(rejectApiKey("test_AyrDX", "ios", true)).toBeNull();
  });

  it("refuses a key for the wrong platform", () => {
    expect(rejectApiKey("goog_abc", "ios", false)).toMatch(/Android/);
    expect(rejectApiKey("appl_abc", "android", false)).toMatch(/iOS/);
  });
});
