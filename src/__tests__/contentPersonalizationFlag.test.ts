import { readFileSync } from "node:fs";
import path from "node:path";

const FLAG = "EXPO_PUBLIC_CONTENT_PERSONALIZATION_ENABLED";

function loadConfig(value: string | undefined) {
  const previous = process.env.EXPO_PUBLIC_CONTENT_PERSONALIZATION_ENABLED;
  if (value === undefined)
    delete process.env.EXPO_PUBLIC_CONTENT_PERSONALIZATION_ENABLED;
  else process.env.EXPO_PUBLIC_CONTENT_PERSONALIZATION_ENABLED = value;
  let loaded: { contentPersonalizationEnabled: boolean } | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require("@/lib/config").config;
  });
  if (previous === undefined)
    delete process.env.EXPO_PUBLIC_CONTENT_PERSONALIZATION_ENABLED;
  else process.env.EXPO_PUBLIC_CONTENT_PERSONALIZATION_ENABLED = previous;
  return loaded!;
}

describe("content personalization flag", () => {
  it('is off unless the env var is exactly "true"', () => {
    expect(loadConfig(undefined).contentPersonalizationEnabled).toBe(false);
    expect(loadConfig("false").contentPersonalizationEnabled).toBe(false);
    expect(loadConfig("true").contentPersonalizationEnabled).toBe(true);
  });

  it("is not switched on in any EAS build profile", () => {
    const eas = JSON.parse(
      readFileSync(path.resolve(__dirname, "../../eas.json"), "utf8"),
    ) as { build: Record<string, { env?: Record<string, string> }> };
    for (const profile of Object.values(eas.build)) {
      expect(profile.env?.[FLAG]).toBeUndefined();
    }
  });

  it("has a matching server-side switch in push-dispatch", () => {
    const source = readFileSync(
      path.resolve(
        __dirname,
        "../../supabase/functions/push-dispatch/index.ts",
      ),
      "utf8",
    );
    expect(source).toContain(
      'Deno.env.get("CONTENT_PERSONALIZATION_ENABLED") === "true"',
    );
  });
});
