import { Voltra, type WidgetVariants } from "@use-voltra/ios";

/**
 * Pre-render placeholder for the `daily` widget, bundled at build time.
 * Shown before the app first syncs real content.
 */
const text = "Open Future Self to receive today's words.";

const initialState: WidgetVariants = {
  systemSmall: (
    <Voltra.VStack style={{ flex: 1, padding: 14, backgroundColor: "#F3E9DC", justifyContent: "center" }}>
      <Voltra.Text style={{ color: "#3B2E25", fontSize: 13 }}>{text}</Voltra.Text>
    </Voltra.VStack>
  ),
  systemMedium: (
    <Voltra.VStack style={{ flex: 1, padding: 14, backgroundColor: "#F3E9DC", justifyContent: "center" }}>
      <Voltra.Text style={{ color: "#3B2E25", fontSize: 14 }}>{text}</Voltra.Text>
    </Voltra.VStack>
  ),
  systemLarge: (
    <Voltra.VStack style={{ flex: 1, padding: 16, backgroundColor: "#F3E9DC", justifyContent: "center" }}>
      <Voltra.Text style={{ color: "#3B2E25", fontSize: 17 }}>{text}</Voltra.Text>
    </Voltra.VStack>
  ),
  accessoryRectangular: <Voltra.Text style={{ fontSize: 12 }}>{text}</Voltra.Text>,
  accessoryInline: <Voltra.Text>Future Self</Voltra.Text>,
};

export default initialState;
