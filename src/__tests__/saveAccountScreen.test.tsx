import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import { Linking } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ThemeProvider } from "@/design-system/ThemeProvider";
import { useAuth } from "@/features/auth/AuthProvider";
import { SaveAccountScreen } from "@/features/auth/SaveAccountScreen";
import { LEGAL_URLS } from "@/lib/legal";

jest.mock("@/features/auth/AuthProvider", () => ({
  useAuth: jest.fn(),
}));
jest.mock("@/lib/monitoring", () => ({
  monitoring: { captureError: jest.fn() },
}));

type Providers = { apple: boolean; google: boolean; email: boolean };

function mockAuth(
  providers: Providers,
  overrides: Partial<ReturnType<typeof useAuth>> = {},
) {
  const value = {
    isAnonymous: true,
    availableProviders: providers,
    linkWithApple: jest.fn(async () => ({ ok: true as const })),
    linkWithGoogle: jest.fn(async () => ({ ok: true as const })),
    startEmailLink: jest.fn(async () => ({ ok: true as const })),
    verifyEmailLink: jest.fn(async () => ({ ok: true as const })),
    recordConsent: jest.fn(async () => {}),
    ...overrides,
  } as unknown as ReturnType<typeof useAuth>;
  jest.mocked(useAuth).mockReturnValue(value);
  return value;
}

function renderScreen(
  props: Partial<React.ComponentProps<typeof SaveAccountScreen>> = {},
) {
  const onDone = jest.fn();
  const screen = render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <ThemeProvider>
        <SaveAccountScreen progress={0.9} onDone={onDone} {...props} />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
  return { screen, onDone };
}

beforeEach(() => {
  jest.clearAllMocks();
});

test("renders the title, the three provider pills and both consent boxes", () => {
  mockAuth({ apple: true, google: true, email: true });
  const { screen } = renderScreen();
  expect(screen.getByText("Save your progress")).toBeTruthy();
  expect(screen.getByText("Sign in with Apple")).toBeTruthy();
  expect(screen.getByText("Sign in with Google")).toBeTruthy();
  expect(screen.getByText("Continue with email")).toBeTruthy();
  // The glyph is decorative (hidden from assistive tech), so opt in.
  expect(
    screen.getByTestId("google-glyph", { includeHiddenElements: true }),
  ).toBeTruthy();
  expect(screen.getByTestId("consent-terms")).toBeTruthy();
  expect(screen.getByTestId("consent-marketing")).toBeTruthy();
  expect(screen.queryByText("Not now")).toBeNull();
  screen.unmount();
});

test("hides the back button unless a handler is provided", () => {
  mockAuth({ apple: true, google: false, email: false });
  const { screen } = renderScreen();
  expect(screen.queryByTestId("save-account-back")).toBeNull();
  screen.unmount();
  const onBack = jest.fn();
  const next = renderScreen({ onBack });
  fireEvent.press(next.screen.getByTestId("save-account-back"));
  expect(onBack).toHaveBeenCalledTimes(1);
  next.screen.unmount();
});

test("only renders configured providers and explains an empty build", () => {
  mockAuth({ apple: false, google: true, email: false });
  const { screen } = renderScreen();
  expect(screen.queryByTestId("auth-apple")).toBeNull();
  expect(screen.getByTestId("auth-google")).toBeTruthy();
  expect(screen.queryByTestId("auth-email")).toBeNull();
  screen.unmount();

  mockAuth({ apple: false, google: false, email: false });
  const empty = renderScreen();
  expect(
    empty.screen.getByText("Sign-in isn't available on this build."),
  ).toBeTruthy();
  expect(empty.screen.queryByTestId("consent-terms")).toBeNull();
  empty.screen.unmount();
});

test("the Terms checkbox gates every provider until accepted", async () => {
  const auth = mockAuth({ apple: true, google: true, email: true });
  const { screen, onDone } = renderScreen();

  fireEvent.press(screen.getByTestId("auth-apple"));
  fireEvent.press(screen.getByTestId("auth-google"));
  fireEvent.press(screen.getByTestId("auth-email"));
  expect(auth.linkWithApple).not.toHaveBeenCalled();
  expect(auth.linkWithGoogle).not.toHaveBeenCalled();
  expect(screen.queryByTestId("auth-email-input")).toBeNull();
  expect(screen.getByTestId("consent-hint")).toBeTruthy();
  expect(
    screen.getByTestId("consent-terms").props.accessibilityState.checked,
  ).toBe(false);

  fireEvent.press(screen.getByTestId("consent-terms"));
  expect(screen.queryByTestId("consent-hint")).toBeNull();
  expect(
    screen.getByTestId("consent-terms").props.accessibilityState.checked,
  ).toBe(true);

  await act(async () => {
    fireEvent.press(screen.getByTestId("auth-apple"));
  });
  expect(auth.linkWithApple).toHaveBeenCalledTimes(1);
  expect(onDone).toHaveBeenCalledWith(true);
  screen.unmount();
});

test("records the marketing choice on the account after a successful link", async () => {
  const auth = mockAuth({ apple: false, google: true, email: false });
  const { screen, onDone } = renderScreen();
  fireEvent.press(screen.getByTestId("consent-terms"));
  fireEvent.press(screen.getByTestId("consent-marketing"));
  await act(async () => {
    fireEvent.press(screen.getByTestId("auth-google"));
  });
  expect(auth.linkWithGoogle).toHaveBeenCalledTimes(1);
  expect(auth.recordConsent).toHaveBeenCalledWith({ marketingOptIn: true });
  expect(onDone).toHaveBeenCalledWith(true);
  screen.unmount();
});

test("defaults marketing to opted out and never records consent on failure", async () => {
  const auth = mockAuth(
    { apple: true, google: false, email: false },
    {
      linkWithApple: jest.fn(async () => ({
        ok: false as const,
        reason: "error" as const,
        message: "Synthetic failure",
      })),
    },
  );
  const { screen, onDone } = renderScreen();
  fireEvent.press(screen.getByTestId("consent-terms"));
  await act(async () => {
    fireEvent.press(screen.getByTestId("auth-apple"));
  });
  expect(screen.getByText("Synthetic failure")).toBeTruthy();
  expect(auth.recordConsent).not.toHaveBeenCalled();
  expect(onDone).not.toHaveBeenCalled();

  jest.mocked(auth.linkWithApple).mockResolvedValueOnce({ ok: true } as never);
  await act(async () => {
    fireEvent.press(screen.getByTestId("auth-apple"));
  });
  expect(auth.recordConsent).toHaveBeenCalledWith({ marketingOptIn: false });
  screen.unmount();
});

test("email walks through send and verify, and can return to the providers", async () => {
  const auth = mockAuth({ apple: false, google: false, email: true });
  const { screen, onDone } = renderScreen();
  fireEvent.press(screen.getByTestId("consent-terms"));
  fireEvent.press(screen.getByTestId("auth-email"));
  fireEvent.changeText(
    screen.getByTestId("auth-email-input"),
    "Someone@Example.invalid",
  );
  await act(async () => {
    fireEvent.press(screen.getByTestId("auth-email-send"));
  });
  expect(auth.startEmailLink).toHaveBeenCalledWith("someone@example.invalid");
  fireEvent.changeText(screen.getByTestId("auth-code-input"), "123456");
  await act(async () => {
    fireEvent.press(screen.getByTestId("auth-code-verify"));
  });
  expect(auth.verifyEmailLink).toHaveBeenCalledWith(
    "someone@example.invalid",
    "123456",
  );
  expect(onDone).toHaveBeenCalledWith(true);
  screen.unmount();

  const again = renderScreen();
  fireEvent.press(again.screen.getByTestId("consent-terms"));
  fireEvent.press(again.screen.getByTestId("auth-email"));
  expect(again.screen.getByTestId("auth-email-input")).toBeTruthy();
  fireEvent.press(again.screen.getByTestId("auth-email-back"));
  expect(again.screen.queryByTestId("auth-email-input")).toBeNull();
  expect(again.screen.getByTestId("auth-email")).toBeTruthy();
  expect(again.onDone).not.toHaveBeenCalled();
  again.screen.unmount();
});

test("the consent label links to the hosted Terms and Privacy Policy", () => {
  mockAuth({ apple: true, google: false, email: false });
  const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  const { screen } = renderScreen();
  fireEvent.press(screen.getByTestId("consent-terms-link"));
  fireEvent.press(screen.getByTestId("consent-privacy-link"));
  expect(open).toHaveBeenCalledWith(LEGAL_URLS.terms);
  expect(open).toHaveBeenCalledWith(LEGAL_URLS.privacy);
  open.mockRestore();
  screen.unmount();
});
