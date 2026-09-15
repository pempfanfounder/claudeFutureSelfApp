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
  it("ships 62 of the owner's 66 quotes, numbered like the owner's list", () => {
    expect(OWNER_QUOTES).toHaveLength(62);
    const numbers = OWNER_QUOTES.map((quote) => quote.n);
    const expected = Array.from({ length: 66 }, (_, i) => i + 1).filter(
      (n) => !EXCLUDED_OWNER_QUOTE_NUMBERS.includes(n),
    );
    expect(numbers).toEqual(expected);
    expect(EXCLUDED_OWNER_QUOTE_NUMBERS).toEqual([54, 30, 14, 49]);
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
    expect(bodies).not.toContain(
      "Why be worried about a girl when there's kids your age doing 100k months?",
    );
    expect(bodies).not.toContain(
      "No revenge because I'll be the most successful guy she's ever talked to.",
    );
    expect(bodies).not.toContain(
      "She better cook like her mom, cuz I definitely make more money than her dad.",
    );
    expect(bodies).not.toContain(
      "A man that doesn't keep his word is no man at all.",
    );
    expect(bodies).toContain(
      "A person that doesn't keep their word is no person at all.",
    );
    expect(bodies).toContain(
      "Don't be the 35 year old wondering what they even did with their 20s.",
    );
    expect(bodies).toContain(
      "There are people who had nothing last year - they took action, and now they are running empires.",
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
    const DEACTIVATED_BODIES = [
      "Why be worried about a girl when there's kids your age doing 100k months?",
      "No revenge because I'll be the most successful guy she's ever talked to.",
      "She better cook like her mom, cuz I definitely make more money than her dad.",
    ];
    const REWRITES: Record<string, string> = {
      "A man that doesn't keep his word is no man at all.":
        "A person that doesn't keep their word is no person at all.",
      "Don't be the 35 year old man wondering what he even did with his 20s.":
        "Don't be the 35 year old wondering what they even did with their 20s.",
      "There are men who had nothing last year - they took action, and now they are running empires.":
        "There are people who had nothing last year - they took action, and now they are running empires.",
    };
    const rows = quoteRowsFromSql(sql);
    expect(rows.map((row) => row.body)).toEqual(
      expect.arrayContaining(DEACTIVATED_BODIES),
    );
    const shipped = rows
      .filter((row) => !DEACTIVATED_BODIES.includes(row.body))
      .map((row) => ({ ...row, body: REWRITES[row.body] ?? row.body }));
    expect(shipped).toHaveLength(OWNER_QUOTES.length);
    shipped.forEach((row, index) => {
      const quote = OWNER_QUOTES[index];
      expect(row.body).toBe(quote.body);
      expect(row.categories).toEqual([...quote.categories]);
      expect(row.notificationEligible).toBe(isNotificationEligible(quote.body));
    });
    const girlSql = readFileSync(
      path.join(root, "supabase/migrations/20260915120000_deactivate_girl_quote.sql"),
      "utf8",
    );
    expect(girlSql).toMatch(/set active = false/i);
    expect(girlSql).toContain(DEACTIVATED_BODIES[0]!.replace(/'/g, "''"));
    const datingSql = readFileSync(
      path.join(
        root,
        "supabase/migrations/20260915180000_unisex_and_dating_quotes.sql",
      ),
      "utf8",
    );
    expect(datingSql).toMatch(/set active = false/i);
    expect(datingSql).toContain(DEACTIVATED_BODIES[1]!.replace(/'/g, "''"));
    expect(datingSql).toContain(DEACTIVATED_BODIES[2]!.replace(/'/g, "''"));
    for (const [from, to] of Object.entries(REWRITES)) {
      expect(datingSql).toContain(from.replace(/'/g, "''"));
      expect(datingSql).toContain(to.replace(/'/g, "''"));
    }
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
