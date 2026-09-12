import { createClient } from "@supabase/supabase-js";
import { captureIdentity, useAppState } from "@/lib/appState";
import { getIdentitySupabase } from "@/lib/supabase";
jest.mock("@/lib/config", () => ({
  config: {
    hasSupabase: true,
    supabaseUrl: "https://synthetic.invalid",
    supabaseAnonKey: "synthetic-public-key",
  },
}));
jest.mock("@supabase/supabase-js", () => ({ createClient: jest.fn() }));
let shared: any;
let options: any;
beforeEach(() => {
  useAppState.getState().setUserId(null);
  useAppState.getState().setUserId("fs-local-a");
  shared = {
    auth: {
      getSession: jest.fn(async () => ({
        data: {
          session: { user: { id: "fs-local-a" }, access_token: "synthetic-A" },
        },
        error: null,
      })),
    },
  };
  (createClient as jest.Mock).mockImplementation((_url, _key, config) => {
    if (config.accessToken) {
      options = config;
      return {};
    }
    return shared;
  });
});
test("captured token cannot be replaced by shared auth and stale dispatch is rejected", async () => {
  await getIdentitySupabase(captureIdentity());
  shared.auth.getSession.mockResolvedValue({
    data: {
      session: { user: { id: "fs-local-b" }, access_token: "synthetic-B" },
    },
    error: null,
  });
  expect(await options.accessToken()).toBe("synthetic-A");
  useAppState.getState().setUserId("fs-local-b");
  await expect(options.accessToken()).rejects.toThrow("Account changed");
  const transport = jest.spyOn(global, "fetch");
  await expect(
    options.global.fetch("https://synthetic.invalid/data", {}),
  ).rejects.toThrow("Account changed");
  expect(transport).not.toHaveBeenCalled();
  transport.mockRestore();
});
