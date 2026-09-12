const { buildConfig, googleScheme } = require("../../app.config.js");
test("Google scheme is derived from a supplied valid public ID only", () => {
  expect(googleScheme("12345-synthetic.apps.googleusercontent.com")).toBe(
    "com.googleusercontent.apps.12345-synthetic",
  );
  expect(() => googleScheme("private words")).toThrow();
  expect(
    buildConfig({}).plugins.some((p: unknown) =>
      JSON.stringify(p).includes("google-signin"),
    ),
  ).toBe(false);
  expect(
    buildConfig({
      EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID:
        "12345-synthetic.apps.googleusercontent.com",
    }).plugins,
  ).toContainEqual([
    "@react-native-google-signin/google-signin",
    { iosUrlScheme: "com.googleusercontent.apps.12345-synthetic" },
  ]);
  expect(buildConfig({}).ios.bundleIdentifier).toBe("com.futureself.mobile");
});
