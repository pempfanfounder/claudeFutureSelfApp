import { Voltra, type WidgetVariants } from "@use-voltra/ios";

/** Placeholder for the persistent widget before in-app setup. */
const text = "Set your line in Future Self → Widget settings.";

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
  accessoryRectangular: <Voltra.Text style={{ fontSize: 12 }}>{text}</Voltra.Text>,
};

export default initialState;
