import React from "react";
import { render } from "@testing-library/react-native";

import { ThemeProvider } from "@/design-system/ThemeProvider";
import { useAuth } from "@/features/auth/AuthProvider";
import { AuthSheet } from "@/features/auth/AuthSheet";

jest.mock("@/features/auth/AuthProvider", () => ({
  useAuth: jest.fn(),
}));

function renderSheet(
  providers: { apple: boolean; google: boolean; email: boolean },
  extras: {
    isAnonymous?: boolean;
    isPremium?: boolean;
    mode?: "link" | "switch";
    required?: boolean;
  } = {},
) {
  jest.mocked(useAuth).mockReturnValue({
    isAnonymous: extras.isAnonymous ?? true,
    availableProviders: providers,
  } as ReturnType<typeof useAuth>);
  if (extras.isPremium != null) {
    const { useAppState } = require("@/lib/appState");
    useAppState.setState({ isPremium: extras.isPremium });
  }
  return render(
    <ThemeProvider>
      <AuthSheet
        visible
        required={extras.required}
        mode={extras.mode ?? "link"}
        headline="Save this account first."
        sub="Link Apple, Google, or email before starting a subscription."
        onDone={() => {}}
      />
    </ThemeProvider>,
  );
}

test("empty providers explain that sign-in is unavailable on this build", () => {
  const screen = renderSheet({ apple: false, google: false, email: false });
  expect(
    screen.getByText("Sign-in isn't available on this build."),
  ).toBeTruthy();
  expect(screen.queryByTestId("auth-apple")).toBeNull();
  expect(screen.queryByTestId("auth-google")).toBeNull();
  expect(screen.queryByTestId("auth-email")).toBeNull();
  screen.unmount();
});

test("configured providers still render their buttons", () => {
  const screen = renderSheet({ apple: true, google: true, email: true });
  expect(screen.getByTestId("auth-apple")).toBeTruthy();
  expect(screen.getByTestId("auth-google")).toBeTruthy();
  expect(screen.getByTestId("auth-email")).toBeTruthy();
  expect(
    screen.queryByText("Sign-in isn't available on this build."),
  ).toBeNull();
  screen.unmount();
});

test("a required save-account sheet has no Not now dismiss", () => {
  const screen = renderSheet(
    { apple: true, google: false, email: false },
    { required: true },
  );
  expect(screen.queryByText("Not now")).toBeNull();
  screen.unmount();
});

test("guest with a purchase still must link before switching accounts", () => {
  const screen = renderSheet(
    { apple: true, google: false, email: false },
    { isAnonymous: true, isPremium: true, mode: "switch" },
  );
  expect(screen.getByText("Save this account first.")).toBeTruthy();
  expect(
    screen.getByText(
      /Your current guest account has a purchase. Link a sign-in to keep/,
    ),
  ).toBeTruthy();
  expect(screen.getByTestId("auth-apple")).toBeTruthy();
  screen.unmount();
});
