import {
  APP_ICON_IDS,
  APP_ICON_SOURCES,
  DEFAULT_APP_ICON_ID,
  RETIRED_APP_ICON_IDS,
  appIconIdFromName,
  appIconNameFor,
  applyAppIcon,
  getCurrentAppIconId,
} from "@/design-system/appIcons";

const mockSetAlternateAppIcon = jest.fn(async (name: string | null) => name);
const mockGetAppIconName = jest.fn<string | null, []>(() => null);
let mockSupports = true;

jest.mock("expo-alternate-app-icons", () => ({
  get supportsAlternateIcons() {
    return mockSupports;
  },
  setAlternateAppIcon: (name: string | null) => mockSetAlternateAppIcon(name),
  getAppIconName: () => mockGetAppIconName(),
  resetAppIcon: () => mockSetAlternateAppIcon(null),
}));

beforeEach(() => {
  mockSupports = true;
  mockSetAlternateAppIcon.mockClear();
  mockGetAppIconName.mockReset();
  mockGetAppIconName.mockReturnValue(null);
});

describe("app icon catalogue", () => {
  it("offers exactly the nine full-bleed icons, without Soft Bloom or Inkwell", () => {
    expect(APP_ICON_IDS).toEqual([
      "minimal_sand",
      "ocean_clarity",
      "terracotta",
      "midnight_focus",
      "arctic",
      "sun",
      "sunrise_momentum",
      "golden_success",
      "evergreen",
    ]);
    expect([...RETIRED_APP_ICON_IDS]).toEqual(["soft_bloom", "ink_well"]);
    expect(APP_ICON_IDS).not.toContain("soft_bloom");
    expect(APP_ICON_IDS).not.toContain("ink_well");
  });

  it("bundles a static image source for every icon id", () => {
    for (const id of APP_ICON_IDS) {
      expect(APP_ICON_SOURCES[id]).toBeTruthy();
    }
    expect(Object.keys(APP_ICON_SOURCES).sort()).toEqual(
      [...APP_ICON_IDS].sort(),
    );
    // Default tile must be the real Home Screen icon, not a generated
    // copy that used to show a lighter sand frame around the mark.
    expect(APP_ICON_SOURCES.minimal_sand).toEqual(
      require("../../assets/images/icon.png"),
    );
  });

  it("treats Minimal Sand — the bundled primary icon — as the default", () => {
    expect(DEFAULT_APP_ICON_ID).toBe("minimal_sand");
    expect(APP_ICON_IDS[0]).toBe(DEFAULT_APP_ICON_ID);
  });

  it("maps theme ids to the PascalCase names the config plugin registers", () => {
    // expo-alternate-app-icons PascalCases lowercase names, so the
    // runtime must address icons the way the asset catalogue names them.
    expect(appIconNameFor("minimal_sand")).toBe("MinimalSand");
    expect(appIconNameFor("ink_well")).toBe("InkWell");
    expect(appIconNameFor("sun")).toBe("Sun");
    expect(appIconNameFor("arctic")).toBe("Arctic");
    expect(appIconNameFor("sunrise_momentum")).toBe("SunriseMomentum");
    for (const id of APP_ICON_IDS) {
      expect(appIconIdFromName(appIconNameFor(id))).toBe(id);
    }
  });
});

describe("applyAppIcon", () => {
  it("sets the alternate icon by its PascalCase name", async () => {
    await applyAppIcon("midnight_focus");
    expect(mockSetAlternateAppIcon).toHaveBeenCalledTimes(1);
    expect(mockSetAlternateAppIcon).toHaveBeenCalledWith("MidnightFocus");
  });

  it("does nothing for the default (or null) while the primary icon is active", async () => {
    // Keeping the default must never raise the iOS "changed the icon"
    // alert — the primary icon already is the Minimal Sand look.
    await applyAppIcon("minimal_sand");
    await applyAppIcon(null);
    expect(mockSetAlternateAppIcon).not.toHaveBeenCalled();
  });

  it("resets to the primary icon (null) for Minimal Sand once another icon is active", async () => {
    // Minimal Sand IS the bundled primary icon, so choosing it must reset
    // the alternate icon rather than select an alternate by name.
    mockGetAppIconName.mockReturnValue("Arctic");
    await expect(applyAppIcon("minimal_sand")).resolves.toBe(true);
    expect(mockSetAlternateAppIcon).toHaveBeenLastCalledWith(null);
    await expect(applyAppIcon(null)).resolves.toBe(true);
    expect(mockSetAlternateAppIcon).toHaveBeenLastCalledWith(null);
    expect(mockSetAlternateAppIcon).toHaveBeenCalledTimes(2);
    expect(mockSetAlternateAppIcon).not.toHaveBeenCalledWith("MinimalSand");
  });

  it("reports success without a native call when the icon is already active", async () => {
    mockGetAppIconName.mockReturnValue("MidnightFocus");
    await expect(applyAppIcon("midnight_focus")).resolves.toBe(true);
    expect(mockSetAlternateAppIcon).not.toHaveBeenCalled();
  });

  it("reports success after applying", async () => {
    await expect(applyAppIcon("evergreen")).resolves.toBe(true);
    expect(mockSetAlternateAppIcon).toHaveBeenCalledWith("Evergreen");
  });

  it("maps retired icons back to the default and resets a leftover native icon", async () => {
    mockGetAppIconName.mockReturnValue("SoftBloom");
    await expect(applyAppIcon("soft_bloom")).resolves.toBe(true);
    expect(mockSetAlternateAppIcon).toHaveBeenCalledWith(null);
    mockSetAlternateAppIcon.mockClear();
    mockGetAppIconName.mockReturnValue("InkWell");
    await expect(applyAppIcon("ink_well")).resolves.toBe(true);
    expect(mockSetAlternateAppIcon).toHaveBeenCalledWith(null);
  });

  it("applies restored Arctic and Sun by their PascalCase names", async () => {
    await expect(applyAppIcon("arctic")).resolves.toBe(true);
    expect(mockSetAlternateAppIcon).toHaveBeenCalledWith("Arctic");
    mockGetAppIconName.mockReturnValue("Arctic");
    await expect(applyAppIcon("sun")).resolves.toBe(true);
    expect(mockSetAlternateAppIcon).toHaveBeenCalledWith("Sun");
  });

  it("ignores ids that are not app icons", async () => {
    await expect(applyAppIcon("not_a_theme")).resolves.toBe(false);
    expect(mockSetAlternateAppIcon).not.toHaveBeenCalled();
  });

  it("reports failure on devices without alternate-icon support", async () => {
    mockSupports = false;
    await expect(applyAppIcon("evergreen")).resolves.toBe(false);
    expect(mockSetAlternateAppIcon).not.toHaveBeenCalled();
  });

  it("never throws when the native call fails: logs in dev, reports false", async () => {
    // Monitoring logs the swallowed error in dev; keep the run quiet.
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const consoleWarn = jest
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    mockSetAlternateAppIcon.mockRejectedValueOnce(new Error("nope"));
    await expect(applyAppIcon("evergreen")).resolves.toBe(false);
    expect(consoleError).toHaveBeenCalled();
    expect(consoleWarn).toHaveBeenCalledWith(
      expect.stringContaining('could not apply "evergreen"'),
      expect.any(Error),
    );
    consoleError.mockRestore();
    consoleWarn.mockRestore();
  });
});

describe("getCurrentAppIconId", () => {
  it("maps the primary icon (null) to minimal_sand", () => {
    mockGetAppIconName.mockReturnValue(null);
    expect(getCurrentAppIconId()).toBe("minimal_sand");
  });

  it("maps a PascalCase alternate name back to its theme id", () => {
    mockGetAppIconName.mockReturnValue("OceanClarity");
    expect(getCurrentAppIconId()).toBe("ocean_clarity");
  });

  it("treats a leftover retired icon as the default in the picker", () => {
    mockGetAppIconName.mockReturnValue("SoftBloom");
    expect(getCurrentAppIconId()).toBe("minimal_sand");
    mockGetAppIconName.mockReturnValue("InkWell");
    expect(getCurrentAppIconId()).toBe("minimal_sand");
  });

  it("maps restored Arctic back to its theme id", () => {
    mockGetAppIconName.mockReturnValue("Arctic");
    expect(getCurrentAppIconId()).toBe("arctic");
  });

  it("falls back to minimal_sand for unknown names", () => {
    mockGetAppIconName.mockReturnValue("Legacy");
    expect(getCurrentAppIconId()).toBe("minimal_sand");
  });

  it("reports the default when alternate icons are unsupported", () => {
    mockSupports = false;
    mockGetAppIconName.mockReturnValue("SoftBloom");
    expect(getCurrentAppIconId()).toBe("minimal_sand");
  });
});
