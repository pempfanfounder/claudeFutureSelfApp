/// <reference types="node" />
// tsconfig limits `types` to jest/react; this Node-only test walks src/ on
// disk, so it pulls in the Node typings itself.
import * as fs from "fs";
import * as path from "path";

import { LEGAL_URLS } from "@/lib/legal";

const SRC_ROOT = path.resolve(__dirname, "..");
const SOURCE_FILE = /\.(ts|tsx|js|jsx)$/;

/** Every source file under src/, skipping test directories. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "__tests__") walk(full, out);
    } else if (SOURCE_FILE.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe("legal URLs", () => {
  it("point at the https joinfutureself.com pages App Review will follow", () => {
    expect(LEGAL_URLS).toEqual({
      terms: "https://joinfutureself.com/terms",
      privacy: "https://joinfutureself.com/privacy",
      support: "https://joinfutureself.com/support",
    });
    for (const url of Object.values(LEGAL_URLS)) {
      expect(url).toMatch(/^https:\/\/joinfutureself\.com\/[a-z]+$/);
    }
  });

  it("no source file still links to the Supabase legal edge function", () => {
    const files = walk(SRC_ROOT);
    expect(files.length).toBeGreaterThan(0);
    const offenders = files
      .filter((file) =>
        fs.readFileSync(file, "utf8").includes("functions/v1/legal"),
      )
      .map((file) => path.relative(SRC_ROOT, file));
    expect(offenders).toEqual([]);
  });
});
