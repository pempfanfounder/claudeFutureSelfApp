/**
 * Failure-path coverage for the RevenueCat wrapper.
 *
 * Every one of these paths used to render the same "the store can't be
 * reached" string, which is why a misconfigured build was undiagnosable
 * from the device. The point of these tests is that each distinct cause
 * reports a distinct, actionable reason.
 */

const mockConfigure = jest.fn();
const mockSetLogLevel = jest.fn();
const mockGetOfferings = jest.fn();
const mockAddListener = jest.fn();

jest.mock("react-native-purchases", () => ({
  __esModule: true,
  default: {
    configure: mockConfigure,
    setLogLevel: mockSetLogLevel,
    addCustomerInfoUpdateListener: mockAddListener,
    getOfferings: mockGetOfferings,
    getCustomerInfo: jest
      .fn()
      .mockResolvedValue({ entitlements: { active: {} } }),
  },
  LOG_LEVEL: { DEBUG: "DEBUG", ERROR: "ERROR" },
  PACKAGE_TYPE: { ANNUAL: "ANNUAL", MONTHLY: "MONTHLY", WEEKLY: "WEEKLY" },
}));

jest.mock("@/lib/analytics", () => ({ analytics: { capture: jest.fn() } }));
jest.mock("@/lib/monitoring", () => ({
  monitoring: { captureError: jest.fn() },
}));

interface ConfigOverrides {
  revenueCatIosKey?: string;
  revenueCatAndroidKey?: string;
  allowTestStore?: boolean;
  mockPurchases?: boolean;
  rcDebugLogs?: boolean;
}

/**
 * `purchases.ts` reads config and __DEV__ at module scope, so each case
 * needs a fresh module registry.
 */
function loadPurchases(overrides: ConfigOverrides, opts?: { dev?: boolean }) {
  let mod: typeof import("@/lib/purchases");
  jest.isolateModules(() => {
    (globalThis as unknown as { __DEV__: boolean }).__DEV__ =
      opts?.dev ?? false;
    jest.doMock("@/lib/config", () => ({
      config: {
        revenueCatIosKey: undefined,
        revenueCatAndroidKey: undefined,
        rcEntitlementId: "premium",
        mockPurchases: false,
        allowTestStore: false,
        rcDebugLogs: false,
        ...overrides,
      },
    }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require("@/lib/purchases");
  });
  return mod!;
}

const realDev = (globalThis as unknown as { __DEV__: boolean }).__DEV__;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  (globalThis as unknown as { __DEV__: boolean }).__DEV__ = realDev;
  jest.restoreAllMocks();
});

describe("initPurchases failure reasons", () => {
  it("reports missing-api-key when no key is configured for the platform", async () => {
    const p = loadPurchases({});
    await p.initPurchases();
    expect(p.isConfigured()).toBe(false);
    expect(p.getPurchasesDiagnostics().failure?.reason).toBe("missing-api-key");
    expect(mockConfigure).not.toHaveBeenCalled();
  });

  it("refuses a Test Store key in a release build", async () => {
    const p = loadPurchases({ revenueCatIosKey: "test_abc123" });
    await p.initPurchases();
    expect(p.isConfigured()).toBe(false);
    expect(p.getPurchasesDiagnostics().failure?.reason).toBe(
      "test-key-in-release",
    );
    expect(mockConfigure).not.toHaveBeenCalled();
  });

  it("allows a Test Store key in a release build behind the explicit opt-in", async () => {
    const p = loadPurchases({
      revenueCatIosKey: "test_abc123",
      allowTestStore: true,
    });
    await p.initPurchases();
    expect(p.isConfigured()).toBe(true);
    expect(mockConfigure).toHaveBeenCalledTimes(1);
  });

  it("allows a Test Store key in a dev build without the opt-in", async () => {
    const p = loadPurchases({ revenueCatIosKey: "test_abc123" }, { dev: true });
    await p.initPurchases();
    expect(p.isConfigured()).toBe(true);
  });

  it("refuses an Android key on iOS", async () => {
    const p = loadPurchases({ revenueCatIosKey: "goog_wrongplatform" });
    await p.initPurchases();
    expect(p.isConfigured()).toBe(false);
    expect(p.getPurchasesDiagnostics().failure?.reason).toBe(
      "key-platform-mismatch",
    );
  });

  it("configures normally with a real Apple key", async () => {
    const p = loadPurchases({ revenueCatIosKey: "appl_realkey" });
    await p.initPurchases();
    expect(p.isConfigured()).toBe(true);
    expect(p.getPurchasesDiagnostics().failure).toBeNull();
    expect(mockConfigure).toHaveBeenCalledWith({
      apiKey: "appl_realkey",
      appUserID: null,
    });
  });

  it("does not enable DEBUG logging in a release build by default", async () => {
    const p = loadPurchases({ revenueCatIosKey: "appl_realkey" });
    await p.initPurchases();
    expect(mockSetLogLevel).toHaveBeenCalledWith("ERROR");
  });

  it("enables DEBUG logging in a release build behind the explicit opt-in", async () => {
    const p = loadPurchases({
      revenueCatIosKey: "appl_realkey",
      rcDebugLogs: true,
    });
    await p.initPurchases();
    expect(mockSetLogLevel).toHaveBeenCalledWith("DEBUG");
  });

  it("never leaks the API key itself through diagnostics", async () => {
    const p = loadPurchases({ revenueCatIosKey: "appl_supersecret" });
    await p.initPurchases();
    const diag = p.getPurchasesDiagnostics();
    expect(JSON.stringify(diag)).not.toContain("appl_supersecret");
    expect(diag.keyKind).toBe("apple");
  });
});

describe("getCurrentOffering failure reasons", () => {
  it("distinguishes a transport error from an empty catalogue", async () => {
    const p = loadPurchases({ revenueCatIosKey: "appl_realkey" });
    await p.initPurchases();
    mockGetOfferings.mockRejectedValueOnce(new Error("offline"));
    const result = await p.getCurrentOffering();
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.failure.reason).toBe(
      "offerings-error",
    );
  });

  it("reports no-offerings when the dashboard returned nothing at all", async () => {
    const p = loadPurchases({ revenueCatIosKey: "appl_realkey" });
    await p.initPurchases();
    mockGetOfferings.mockResolvedValueOnce({ current: null, all: {} });
    const result = await p.getCurrentOffering();
    expect(result.ok === false && result.failure.reason).toBe("no-offerings");
  });

  it("reports empty-offering when an offering exists but has no packages", async () => {
    const p = loadPurchases({ revenueCatIosKey: "appl_realkey" });
    await p.initPurchases();
    mockGetOfferings.mockResolvedValueOnce({
      current: { identifier: "default", availablePackages: [] },
      all: { default: { identifier: "default", availablePackages: [] } },
    });
    const result = await p.getCurrentOffering();
    expect(result.ok === false && result.failure.reason).toBe("empty-offering");
  });

  it("tolerates an offerings payload with no `all` map", async () => {
    const p = loadPurchases({ revenueCatIosKey: "appl_realkey" });
    await p.initPurchases();
    // The previous implementation threw TypeError here (Object.values(undefined))
    // and only survived because a catch-all swallowed it.
    mockGetOfferings.mockResolvedValueOnce({ current: null });
    const result = await p.getCurrentOffering();
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.failure.reason).toBe("no-offerings");
  });

  it("reports no-current-offering rather than selling an arbitrary one", async () => {
    const p = loadPurchases({ revenueCatIosKey: "appl_realkey" });
    await p.initPurchases();
    // Picking blindly out of `all` here can sell a stale or experimental
    // price, so this must surface as a misconfiguration instead.
    mockGetOfferings.mockResolvedValueOnce({
      current: null,
      all: {
        legacy_2024: { identifier: "legacy_2024", availablePackages: [{}] },
        experiment: { identifier: "experiment", availablePackages: [{}] },
      },
    });
    const result = await p.getCurrentOffering();
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.failure.reason).toBe(
      "no-current-offering",
    );
    expect(result.ok === false && result.failure.detail).toContain(
      "legacy_2024",
    );
  });

  it("returns the current offering when one is properly configured", async () => {
    const p = loadPurchases({ revenueCatIosKey: "appl_realkey" });
    await p.initPurchases();
    const offering = {
      identifier: "default",
      availablePackages: [{ identifier: "$rc_annual" }],
    };
    mockGetOfferings.mockResolvedValueOnce({ current: offering, all: {} });
    const result = await p.getCurrentOffering();
    expect(result.ok).toBe(true);
    expect(result.ok === true && result.offering.identifier).toBe("default");
  });

  it("reports not-configured rather than silently returning null", async () => {
    const p = loadPurchases({});
    await p.initPurchases();
    const result = await p.getCurrentOffering();
    expect(result.ok === false && result.failure.reason).toBe(
      "missing-api-key",
    );
  });
});

describe("describeFailure", () => {
  const failure = {
    reason: "missing-api-key" as const,
    detail: "Set EXPO_PUBLIC_REVENUECAT_IOS_KEY in the eas.json build profile.",
  };

  it("never leaks operator detail to customers in production", () => {
    const p = loadPurchases({});
    const msg = p.describeFailure(failure, "Purchases are unavailable.");
    expect(msg).toBe("Purchases are unavailable.");
    expect(msg).not.toContain("eas.json");
  });

  it("appends the operator detail when diagnostics are enabled", () => {
    const p = loadPurchases({ rcDebugLogs: true });
    const msg = p.describeFailure(failure, "Purchases are unavailable.");
    expect(msg).toContain("missing-api-key");
    expect(msg).toContain("eas.json");
  });

  it("appends the operator detail in development", () => {
    const p = loadPurchases({}, { dev: true });
    expect(p.describeFailure(failure, "Nope")).toContain("missing-api-key");
  });

  it("returns the plain fallback when there is no failure", () => {
    const p = loadPurchases({}, { dev: true });
    expect(p.describeFailure(null, "All good")).toBe("All good");
  });
});
