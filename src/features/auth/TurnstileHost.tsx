import { useEffect, useState, type ComponentType } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/design-system/components";
import { useColors, useTheme } from "@/design-system/ThemeProvider";
import { radii, shadows, spacing } from "@/design-system/tokens";
import { config } from "@/lib/config";
import { monitoring } from "@/lib/monitoring";

import { useCaptchaStore } from "./captcha";

type WebViewComponent = ComponentType<{
  source: { html: string; baseUrl: string };
  onMessage: (event: { nativeEvent: { data: string } }) => void;
  onError?: () => void;
  style?: object;
  originWhitelist?: string[];
  javaScriptEnabled?: boolean;
  scrollEnabled?: boolean;
  bounces?: boolean;
  setSupportMultipleWindows?: boolean;
  androidLayerType?: "none" | "software" | "hardware";
  containerStyle?: object;
}>;

type WidgetMessage =
  | { type: "token"; token: string }
  | { type: "error"; code: string }
  | { type: "expired" }
  | { type: "timeout" };

/**
 * Turnstile is web-only, so the widget runs inside a WebView loading an
 * inline page whose origin is `config.turnstileBaseUrl` (the hostname the
 * widget is allowed on in Cloudflare). The page posts the token back.
 */
export function buildTurnstileHtml(siteKey: string, theme: "light" | "dark") {
  const options = JSON.stringify({ sitekey: siteKey, theme, size: "normal" });
  return `<!doctype html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>html,body{margin:0;height:100%;background:transparent}body{display:flex;align-items:center;justify-content:center}</style>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=fsTurnstileLoad" async defer></script>
</head><body><div id="fs-turnstile"></div>
<script>
function fsPost(message){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(message));}
function fsTurnstileLoad(){
  var options=${options};
  options.callback=function(token){fsPost({type:"token",token:token});};
  options["error-callback"]=function(code){fsPost({type:"error",code:String(code)});return true;};
  options["expired-callback"]=function(){fsPost({type:"expired"});};
  options["timeout-callback"]=function(){fsPost({type:"timeout"});};
  window.turnstile.render("#fs-turnstile",options);
}
window.addEventListener("error",function(){fsPost({type:"error",code:"script"});});
</script></body></html>`;
}

export function parseWidgetMessage(raw: string): WidgetMessage | null {
  try {
    const value = JSON.parse(raw) as Partial<WidgetMessage> | null;
    if (!value || typeof value !== "object") return null;
    if (
      value.type === "token" &&
      typeof value.token === "string" &&
      value.token
    )
      return { type: "token", token: value.token };
    if (value.type === "error")
      return {
        type: "error",
        code: typeof value.code === "string" ? value.code : "unknown",
      };
    if (value.type === "expired" || value.type === "timeout")
      return { type: value.type };
    return null;
  } catch {
    return null;
  }
}

/**
 * Renders the pending sign-in challenge from `captcha.ts`. Mounted once
 * inside `AuthProvider`; renders nothing while no challenge is pending or
 * when the captcha is disabled, so the WebView module is only loaded on demand.
 */
export function TurnstileHost() {
  const request = useCaptchaStore((s) => s.request);
  const colors = useColors();
  const { theme } = useTheme();
  const [WebView, setWebView] = useState<WebViewComponent | null>(null);
  const siteKey = config.turnstileSiteKey;

  useEffect(() => {
    if (!request || WebView) return;
    try {
      // Lazy so installs never pay for the WebView module unless a challenge
      // is actually shown (the captcha is off by default).
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const module = require("react-native-webview") as {
        WebView: WebViewComponent;
      };
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Module resolution happens on demand.
      setWebView(() => module.WebView);
    } catch (error) {
      monitoring.captureError(error, { area: "auth.captcha" });
      request.reject(
        new Error("Verification is unavailable on this build. Please retry."),
      );
    }
  }, [request, WebView]);

  if (!request || !siteKey) return null;

  const onMessage = (event: { nativeEvent: { data: string } }) => {
    const message = parseWidgetMessage(event.nativeEvent.data);
    if (!message) return;
    if (message.type === "token") request.resolve(message.token);
    else if (message.type === "error")
      request.reject(new Error(`Verification failed (${message.code}).`));
    else request.reject(new Error("Verification expired. Please retry."));
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() =>
        request.reject(new Error("Verification was cancelled."))
      }
    >
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        <View
          style={[
            styles.card,
            shadows.lg,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <AppText variant="h3" center>
            Quick check
          </AppText>
          <AppText variant="body" tone="ink2" center style={styles.copy}>
            Confirm you’re human to set up your account.
          </AppText>
          <View style={styles.widget}>
            {WebView ? (
              <WebView
                source={{
                  html: buildTurnstileHtml(
                    siteKey,
                    theme.category === "dark" ? "dark" : "light",
                  ),
                  baseUrl: config.turnstileBaseUrl,
                }}
                onMessage={onMessage}
                onError={() =>
                  request.reject(
                    new Error("Verification could not load. Please retry."),
                  )
                }
                originWhitelist={["https://*"]}
                javaScriptEnabled
                scrollEnabled={false}
                bounces={false}
                setSupportMultipleWindows={false}
                style={styles.webview}
                containerStyle={styles.webview}
              />
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              request.reject(new Error("Verification was cancelled."))
            }
            style={styles.cancel}
          >
            <AppText variant="label" tone="ink3" center>
              Cancel
            </AppText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.xl,
    gap: spacing.md,
  },
  copy: { marginBottom: spacing.sm },
  // Turnstile's normal widget is 300×65; leave room for interactive challenges.
  widget: { height: 120, alignItems: "center", justifyContent: "center" },
  webview: { width: 300, height: 120, backgroundColor: "transparent" },
  cancel: { paddingVertical: spacing.sm },
});
