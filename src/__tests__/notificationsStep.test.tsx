import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ThemeProvider } from "@/design-system/ThemeProvider";
import { DAILY_LIMIT } from "@/features/content/types";
import {
  getPermissionStatus,
  requestNotificationPermission,
} from "@/features/notifications/push";
import {
  applyWindowChange,
  dateToMinutes,
  formatMinutes,
  minutesToDate,
  roundToInterval,
} from "@/features/notifications/time";
import { NotificationsStep } from "@/features/onboarding/engine/steps/NotificationsStep";
import { useOnboardingStore } from "@/features/onboarding/engine/store";
import type {
  OnboardingContext,
  OnboardingStep,
} from "@/features/onboarding/engine/types";

jest.mock("@/features/notifications/push", () => ({
  requestNotificationPermission: jest.fn().mockResolvedValue("granted"),
  getPermissionStatus: jest.fn().mockResolvedValue("undetermined"),
}));

const mockPermissionStatus = getPermissionStatus as jest.MockedFunction<
  typeof getPermissionStatus
>;

const ctx: OnboardingContext = {
  name: "Sam",
  answers: {},
  trialLength: null,
  priceLine: null,
  isAnonymous: true,
};

const STEP: OnboardingStep = {
  id: "notifications",
  type: "notifications",
  headline: "Get the right words through the day.",
  sub: "You choose how often, and when.",
  mockLine: "Discipline is remembering what you want.",
  cta: "Turn on reminders",
};

/** A fixed day at h:m local — what the native pickers hand back. */
function at(hours: number, minutes = 0): Date {
  return new Date(2001, 0, 1, hours, minutes, 0, 0);
}

function pickerEvent(date: Date) {
  return { nativeEvent: { timestamp: date.getTime(), utcOffset: 0 } };
}

function renderStep(family: "iam" | "stella" = "iam") {
  const onDone = jest.fn();
  const screen = render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <ThemeProvider>
        <NotificationsStep
          step={STEP}
          ctx={ctx}
          family={family}
          onDone={onDone}
        />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
  return { screen, onDone };
}

const prefs = () => useOnboardingStore.getState().notificationPrefs;

beforeEach(() => {
  act(() => {
    useOnboardingStore.getState().reset();
  });
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("NotificationsStep (iam)", () => {
  it("shows the store defaults: 3x / 3x and the 9 AM – 9 PM hint", () => {
    const { screen } = renderStep();
    expect(screen.getByTestId("quotes-value")).toHaveTextContent("3x");
    expect(screen.getByTestId("affirmations-value")).toHaveTextContent("3x");
    expect(screen.getByTestId("window-hint")).toHaveTextContent(
      `Between ${formatMinutes(540)} and ${formatMinutes(1260)} · your future self won't wake you`,
    );
    expect(screen.getByText(STEP.mockLine!)).toBeTruthy();
    expect(screen.getByText("Future Self")).toBeTruthy();
    expect(screen.getByText("Now")).toBeTruthy();
  });

  it("plus / minus write through to the store", () => {
    const { screen } = renderStep();
    fireEvent.press(screen.getByTestId("quotes-plus"));
    fireEvent.press(screen.getByTestId("quotes-plus"));
    expect(prefs().quotesPerDay).toBe(5);
    expect(screen.getByTestId("quotes-value")).toHaveTextContent("5x");

    fireEvent.press(screen.getByTestId("affirmations-minus"));
    expect(prefs().affirmationsPerDay).toBe(2);
    expect(screen.getByTestId("affirmations-value")).toHaveTextContent("2x");
    // The other row is untouched.
    expect(prefs().quotesPerDay).toBe(5);
  });

  it("clamps at 0: minus dims and is a no-op", () => {
    act(() => {
      useOnboardingStore.getState().setNotificationPrefs({
        affirmationsPerDay: 0,
      });
    });
    const { screen } = renderStep();
    const minus = screen.getByTestId("affirmations-minus");
    expect(minus).toHaveStyle({ opacity: 0.35 });
    expect(minus).toBeDisabled();
    fireEvent.press(minus);
    expect(prefs().affirmationsPerDay).toBe(0);
    expect(screen.getByTestId("affirmations-value")).toHaveTextContent("0x");
    // Plus is still live.
    expect(screen.getByTestId("affirmations-plus")).not.toHaveStyle({
      opacity: 0.35,
    });
    fireEvent.press(screen.getByTestId("affirmations-plus"));
    expect(prefs().affirmationsPerDay).toBe(1);
  });

  it(`clamps at DAILY_LIMIT (${DAILY_LIMIT}): plus dims and is a no-op`, () => {
    act(() => {
      useOnboardingStore.getState().setNotificationPrefs({
        quotesPerDay: DAILY_LIMIT - 1,
      });
    });
    const { screen } = renderStep();
    const plus = screen.getByTestId("quotes-plus");
    expect(plus).not.toHaveStyle({ opacity: 0.35 });
    fireEvent.press(plus);
    expect(prefs().quotesPerDay).toBe(DAILY_LIMIT);
    expect(plus).toHaveStyle({ opacity: 0.35 });
    fireEvent.press(plus);
    expect(prefs().quotesPerDay).toBe(DAILY_LIMIT);
    expect(screen.getByTestId("quotes-value")).toHaveTextContent(
      `${DAILY_LIMIT}x`,
    );
  });

  it("renders the iOS compact pickers and applies picked times", () => {
    const { screen } = renderStep();
    const start = screen.getByTestId("start-picker");
    const end = screen.getByTestId("end-picker");
    expect(start.props.mode).toBe("time");
    expect(start.props.display).toBe("compact");
    expect(start.props.minuteInterval).toBe(30);
    expect(dateToMinutes(start.props.value)).toBe(9 * 60);
    expect(dateToMinutes(end.props.value)).toBe(21 * 60);

    fireEvent(start, "valueChange", pickerEvent(at(10, 30)), at(10, 30));
    expect(prefs().windowStartMinutes).toBe(630);
    expect(prefs().windowEndMinutes).toBe(21 * 60);
    expect(screen.getByTestId("window-hint")).toHaveTextContent(
      /^Between 10:30 AM and 9:00 PM/,
    );

    fireEvent(end, "valueChange", pickerEvent(at(18, 0)), at(18, 0));
    expect(prefs().windowEndMinutes).toBe(18 * 60);
    expect(prefs().windowStartMinutes).toBe(630);
    expect(screen.getByTestId("window-hint")).toHaveTextContent(
      /^Between 10:30 AM and 6:00 PM/,
    );
  });

  it("keeps a 60-minute gap by moving the other bound", () => {
    const { screen } = renderStep();
    const start = screen.getByTestId("start-picker");
    const end = screen.getByTestId("end-picker");

    // Start pushed up to the end → end moves out of the way.
    fireEvent(start, "valueChange", pickerEvent(at(21, 0)), at(21, 0));
    expect(prefs()).toMatchObject({
      windowStartMinutes: 21 * 60,
      windowEndMinutes: 22 * 60,
    });

    // End dragged below the start → start moves down.
    fireEvent(end, "valueChange", pickerEvent(at(8, 0)), at(8, 0));
    expect(prefs()).toMatchObject({
      windowStartMinutes: 7 * 60,
      windowEndMinutes: 8 * 60,
    });

    // Start at the last slot of the day: end can't follow past 23:30,
    // so the start is pulled back instead.
    fireEvent(start, "valueChange", pickerEvent(at(23, 30)), at(23, 30));
    expect(prefs()).toMatchObject({
      windowStartMinutes: 22 * 60 + 30,
      windowEndMinutes: 23 * 60 + 30,
    });

    // The picker value re-renders from the store.
    expect(dateToMinutes(screen.getByTestId("start-picker").props.value)).toBe(
      22 * 60 + 30,
    );
    expect(screen.getByTestId("window-hint")).toHaveTextContent(
      /^Between 10:30 PM and 11:30 PM/,
    );
  });

  it("renders the Android capsule and opens the native time dialog", () => {
    jest.replaceProperty(Platform, "OS", "android");
    const open = DateTimePickerAndroid.open as jest.Mock;
    const { screen } = renderStep();

    const start = screen.getByTestId("start-picker");
    expect(start).toHaveTextContent(formatMinutes(540));
    expect(screen.getByTestId("end-picker")).toHaveTextContent(
      formatMinutes(1260),
    );
    // No inline picker on Android — the dialog is imperative.
    expect(start.props.mode).toBeUndefined();

    fireEvent.press(start);
    expect(open).toHaveBeenCalledTimes(1);
    const params = open.mock.calls[0]![0];
    expect(params).toMatchObject({
      mode: "time",
      display: "default",
      minuteInterval: 30,
    });
    // The dialog follows the device hour cycle (no forced 12-hour clock).
    expect(params).not.toHaveProperty("is24Hour");
    expect(dateToMinutes(params.value)).toBe(9 * 60);

    act(() => {
      params.onValueChange(pickerEvent(at(7, 30)), at(7, 30));
    });
    expect(prefs().windowStartMinutes).toBe(7 * 60 + 30);
    expect(screen.getByTestId("start-picker")).toHaveTextContent("7:30 AM");

    // Cancel leaves everything as it was.
    act(() => {
      params.onDismiss();
    });
    expect(prefs().windowStartMinutes).toBe(7 * 60 + 30);
  });

  it("Turn on reminders asks the OS, stores the status and advances", async () => {
    const { screen, onDone } = renderStep();
    fireEvent.press(screen.getByTestId("notif-allow"));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(requestNotificationPermission).toHaveBeenCalledTimes(1);
    expect(useOnboardingStore.getState().permissionStatus).toBe("granted");
  });

  it("keeps the configured CTA while permission is still undetermined", async () => {
    const { screen } = renderStep();
    await waitFor(() => expect(mockPermissionStatus).toHaveBeenCalled());
    expect(screen.getByTestId("notif-allow")).toHaveTextContent(
      "Turn on reminders",
    );
  });

  it("says just 'Save' when the OS already granted permission", async () => {
    // Reinstall / update over a build that had permission: iOS returns
    // the carried-over status and shows no dialog, so promising one would
    // be a lie. The button still saves the counts and window.
    mockPermissionStatus.mockResolvedValueOnce("granted");
    const { screen, onDone } = renderStep();
    await waitFor(() =>
      expect(screen.getByTestId("notif-allow")).toHaveTextContent("Save"),
    );
    expect(screen.queryByText("Turn on reminders")).toBeNull();

    fireEvent.press(screen.getByTestId("notif-allow"));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(requestNotificationPermission).toHaveBeenCalledTimes(1);
    expect(useOnboardingStore.getState().permissionStatus).toBe("granted");
  });

  it("Not now advances without asking", () => {
    const { screen, onDone } = renderStep();
    fireEvent.press(screen.getByTestId("notif-not-now"));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(requestNotificationPermission).not.toHaveBeenCalled();
    expect(useOnboardingStore.getState().permissionStatus).toBe("undetermined");
  });
});

describe("notification time helpers", () => {
  it("formats minutes on a 12-hour clock", () => {
    expect(formatMinutes(0, "en-US")).toBe("12:00 AM");
    expect(formatMinutes(30, "en-US")).toBe("12:30 AM");
    expect(formatMinutes(540, "en-US")).toBe("9:00 AM");
    expect(formatMinutes(570, "en-US")).toBe("9:30 AM");
    expect(formatMinutes(720, "en-US")).toBe("12:00 PM");
    expect(formatMinutes(1290, "en-US")).toBe("9:30 PM");
    expect(formatMinutes(1439, "en-US")).toBe("11:59 PM");
    // Wraps instead of producing "24:00".
    expect(formatMinutes(1440, "en-US")).toBe("12:00 AM");
    // 24-hour locales get their own hour cycle (matches the native pickers).
    expect(formatMinutes(1290, "nl-NL")).toBe("21:30");
  });

  it("round-trips minutes through a local Date", () => {
    for (const m of [0, 1, 540, 570, 1290, 1439]) {
      expect(dateToMinutes(minutesToDate(m))).toBe(m);
    }
    expect(minutesToDate(570).getSeconds()).toBe(0);
    // Out-of-range input is clamped, never rolls into another day.
    expect(dateToMinutes(minutesToDate(-30))).toBe(0);
    expect(dateToMinutes(minutesToDate(5000))).toBe(1439);
  });

  it("snaps to the 30-minute grid inside the day", () => {
    expect(roundToInterval(540)).toBe(540);
    expect(roundToInterval(554)).toBe(540);
    expect(roundToInterval(555)).toBe(570);
    expect(roundToInterval(569)).toBe(570);
    expect(roundToInterval(-10)).toBe(0);
    // 23:59 must not become 24:00 (or an off-grid 23:59).
    expect(roundToInterval(1439)).toBe(1410);
    expect(roundToInterval(1425)).toBe(1410);
    expect(roundToInterval(547, 60)).toBe(540);
    expect(roundToInterval(1439, 60)).toBe(1380);
  });

  it("applyWindowChange keeps start ≤ end − 60 by moving the other bound", () => {
    const base = { windowStartMinutes: 540, windowEndMinutes: 1260 };

    // Plain moves inside the window.
    expect(applyWindowChange(base, "windowStartMinutes", 600)).toEqual({
      windowStartMinutes: 600,
      windowEndMinutes: 1260,
    });
    expect(applyWindowChange(base, "windowEndMinutes", 1200)).toEqual({
      windowStartMinutes: 540,
      windowEndMinutes: 1200,
    });

    // Snapped to the grid first.
    expect(applyWindowChange(base, "windowStartMinutes", 611)).toEqual({
      windowStartMinutes: 600,
      windowEndMinutes: 1260,
    });

    // Start reaches into the gap → end follows.
    expect(applyWindowChange(base, "windowStartMinutes", 1230)).toEqual({
      windowStartMinutes: 1230,
      windowEndMinutes: 1290,
    });
    expect(applyWindowChange(base, "windowStartMinutes", 1260)).toEqual({
      windowStartMinutes: 1260,
      windowEndMinutes: 1320,
    });
    // Exactly one gap apart is allowed.
    expect(applyWindowChange(base, "windowStartMinutes", 1200)).toEqual({
      windowStartMinutes: 1200,
      windowEndMinutes: 1260,
    });

    // End reaches into the gap → start follows.
    expect(applyWindowChange(base, "windowEndMinutes", 570)).toEqual({
      windowStartMinutes: 510,
      windowEndMinutes: 570,
    });
    expect(applyWindowChange(base, "windowEndMinutes", 300)).toEqual({
      windowStartMinutes: 240,
      windowEndMinutes: 300,
    });

    // Top of the day: end stops at 23:30, start is pulled back.
    expect(applyWindowChange(base, "windowStartMinutes", 1410)).toEqual({
      windowStartMinutes: 1350,
      windowEndMinutes: 1410,
    });
    expect(applyWindowChange(base, "windowStartMinutes", 1439)).toEqual({
      windowStartMinutes: 1350,
      windowEndMinutes: 1410,
    });
    // 23:00 would need an end of 24:00 → same fallback.
    expect(applyWindowChange(base, "windowStartMinutes", 1380)).toEqual({
      windowStartMinutes: 1350,
      windowEndMinutes: 1410,
    });
    // 22:30 fits exactly.
    expect(applyWindowChange(base, "windowStartMinutes", 1350)).toEqual({
      windowStartMinutes: 1350,
      windowEndMinutes: 1410,
    });

    // Bottom of the day: start stops at 0, end is pushed to 1:00 AM.
    expect(applyWindowChange(base, "windowEndMinutes", 0)).toEqual({
      windowStartMinutes: 0,
      windowEndMinutes: 60,
    });
    expect(applyWindowChange(base, "windowEndMinutes", 30)).toEqual({
      windowStartMinutes: 0,
      windowEndMinutes: 60,
    });
    expect(applyWindowChange(base, "windowEndMinutes", 60)).toEqual({
      windowStartMinutes: 0,
      windowEndMinutes: 60,
    });
  });
});
