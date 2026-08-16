/* eslint-disable no-undef */
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

// The native date/time picker has no JS fallback under Jest (its module
// registry throws). Render a plain View that carries the props through so
// tests can find it by testID and fire `onValueChange` directly; the
// Android imperative API becomes a spy tests can inspect.
jest.mock("@react-native-community/datetimepicker", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    __esModule: true,
    default: (props) =>
      React.createElement(View, {
        ...props,
        testID: props.testID ?? "datetimepicker",
        accessibilityLabel: props.accessibilityLabel ?? "datetimepicker",
      }),
    DateTimePickerAndroid: {
      open: jest.fn(),
      dismiss: jest.fn().mockResolvedValue(true),
    },
  };
});
