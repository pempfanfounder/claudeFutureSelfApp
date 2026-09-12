import { readFileSync } from "node:fs";
import path from "node:path";

import {
  EXCLUDED_OWNER_QUOTE_NUMBERS,
  OWNER_QUOTES,
  isNotificationEligible,
} from "@/features/content/ownerQuotes";

const root = path.resolve(__dirname, "..", "..");
const MIGRATION = path.join(
  root,
  "supabase/migrations/20260912090000_owner_quotes.sql",
);
const DOC = path.join(root, "docs/OWNER_QUOTE_LIST.md");

const QUOTE_CATEGORIES = [
  "discipline",
  "ambition",
  "courage",
  "stoic-calm",
  "gratitude",
  "resilience",
  "focus",
  "kindness",
];

/** Pull quote rows out of the migration in file order, unescaping SQL quotes. */
function quoteRowsFromSql(sql: string) {
  const rows: {
    body: string;
    categories: string[];
    notificationEligible: boolean;
  }[] = [];
  const row =
    /\('quote', '((?:[^']|'')*)', NULL, ARRAY\[((?:'[^']*',?)+)\]::text\[\], '\{\}'::text\[\], 0, (true|false)\)/g;
  for (const match of sql.matchAll(row)) {
    rows.push({
      body: match[1].replace(/''/g, "'"),
      categories: [...match[2].matchAll(/'([^']*)'/g)].map((m) => m[1]),
      notificationEligible: match[3] === "true",
    });
  }
  return rows;
}

describe("owner quote list", () => {
  it("ships 65 of the owner's 66 quotes, numbered like the owner's list", () => {
    expect(OWNER_QUOTES).toHaveLength(65);
    const numbers = OWNER_QUOTES.map((quote) => quote.n);
    const expected = Array.from({ length: 66 }, (_, i) => i + 1).filter(
      (n) => !EXCLUDED_OWNER_QUOTE_NUMBERS.includes(n),
    );
    expect(numbers).toEqual(expected);
    expect(EXCLUDED_OWNER_QUOTE_NUMBERS).toEqual([54]);
  });

  it("ships the owner's completed #10 and drops the removed near-duplicate #54", () => {
    const bodies = OWNER_QUOTES.map((quote) => quote.body);
    expect(new Set(bodies).size).toBe(bodies.length);
    expect(bodies).toContain(
      "The graveyard is full of people who thought they had more time.",
    );
    expect(bodies).not.toContain(
      "While you are overthinking, someone dumber than you is having the success you could have had - just by trying.",
    );
    expect(bodies).toContain(
      "While you are overthinking, someone less intelligent than you is becoming successful just by trying.",
    );
    expect(OWNER_QUOTES.find((quote) => quote.n === 11)?.body).toBe(
      "Every day your window of opportunity gets smaller and smaller …",
    );
  });

  it("applies only the allowed typo fixes and terminal punctuation", () => {
    for (const { body } of OWNER_QUOTES) {
      expect(body).toBe(body.trim());
      expect(body).not.toMatch(/\b(dont|doesnt|cant|Everyday)\b/i);
      expect(body).not.toMatch(/[\u2018\u2019]/); // curly apostrophes
      expect(body).toMatch(/[.?!…]$/);
      expect(body.length).toBeLessThanOrEqual(400); // content_items check
    }
  });

  it("assigns one or two valid quote categories to every quote", () => {
    for (const { categories } of OWNER_QUOTES) {
      expect(categories.length).toBeGreaterThanOrEqual(1);
      expect(categories.length).toBeLessThanOrEqual(2);
      for (const slug of categories) expect(QUOTE_CATEGORIES).toContain(slug);
    }
  });

  it("matches the seed migration row for row", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    expect(sql).toMatch(
      /update public\.content_items\s+set active = false\s+where type = 'quote' and active;/,
    );
    const rows = quoteRowsFromSql(sql);
    expect(rows).toHaveLength(OWNER_QUOTES.length);
    rows.forEach((row, index) => {
      const quote = OWNER_QUOTES[index];
      expect(row.body).toBe(quote.body);
      expect(row.categories).toEqual([...quote.categories]);
      expect(row.notificationEligible).toBe(isNotificationEligible(quote.body));
    });
    // The notification picker hard-caps pushable bodies at 178 chars.
    for (const row of rows)
      if (row.notificationEligible)
        expect(row.body.length).toBeLessThanOrEqual(178);
  });

  it("matches docs/OWNER_QUOTE_LIST.md line for line", () => {
    const doc = readFileSync(DOC, "utf8");
    for (const { n, body } of OWNER_QUOTES) {
      expect(doc).toContain(`\n${n}. ${body}\n`);
    }
    for (const n of EXCLUDED_OWNER_QUOTE_NUMBERS) {
      expect(doc).toMatch(new RegExp(`\\n${n}\\. _\\(excluded`));
    }
  });
});
