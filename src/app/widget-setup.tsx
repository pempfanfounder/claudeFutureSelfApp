import { Redirect } from "expo-router";

/** Deep-link alias used by the persistent widget. */
export default function WidgetSetupRedirect() {
  return <Redirect href="/(main)/settings/widgets" />;
}
