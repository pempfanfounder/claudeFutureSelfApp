import {
  APP_ICON_IDS,
  APP_ICON_SOURCES,
  DEFAULT_APP_ICON_ID,
  appIconIdFromName,
  appIconNameFor,
  applyAppIcon,
  getCurrentAppIconId,
} from "@/design-system/appIcons";
import { THEMES } from "@/design-system/themes";

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
  it("offers exactly one icon per theme, in theme order", () => {
    expect(APP_ICON_IDS).toEqual(THEMES.map((t) => t.id));
  });

  it("bundles a static image source for every icon id", () => {
    for (const id of APP_ICON_IDS) {
      expect(APP_ICON_SOURCES[id]).toBeTruthy();
    }
    expect(Object.keys(APP_ICON_SOURCES).sort()).toEqual(
      [...APP_ICON_IDS].sort(),
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
    expect(appIconNameFor("evergreen")).toBe("Evergreen");
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

  it("switches back to Minimal Sand by name once another icon is active", async () => {
    mockGetAppIconName.mockReturnValue("Arctic");
    await applyAppIcon("minimal_sand");
    expect(mockSetAlternateAppIcon).toHaveBeenLastCalledWith("MinimalSand");
    await applyAppIcon(null);
    expect(mockSetAlternateAppIcon).toHaveBeenLastCalledWith("MinimalSand");
    expect(mockSetAlternateAppIcon).toHaveBeenCalledTimes(2);
  });

  it("does nothing when the icon is already active", async () => {
    mockGetAppIconName.mockReturnValue("MidnightFocus");
    await applyAppIcon("midnight_focus");
    expect(mockSetAlternateAppIcon).not.toHaveBeenCalled();
  });

  it("ignores ids that are not app icons", async () => {
    await applyAppIcon("not_a_theme");
    expect(mockSetAlternateAppIcon).not.toHaveBeenCalled();
  });

  it("does nothing on devices without alternate-icon support", async () => {
    mockSupports = false;
    await applyAppIcon("arctic");
    expect(mockSetAlternateAppIcon).not.toHaveBeenCalled();
  });

  it("never throws when the native call fails", async () => {
    // Monitoring logs the swallowed error in dev; keep the run quiet.
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    mockSetAlternateAppIcon.mockRejectedValueOnce(new Error("nope"));
    await expect(applyAppIcon("arctic")).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
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

  it("falls back to minimal_sand for unknown names", () => {
    mockGetAppIconName.mockReturnValue("Legacy");
    expect(getCurrentAppIconId()).toBe("minimal_sand");
  });

  it("reports the default when alternate icons are unsupported", () => {
    mockSupports = false;
    mockGetAppIconName.mockReturnValue("Arctic");
    expect(getCurrentAppIconId()).toBe("minimal_sand");
  });
});
