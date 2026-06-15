import { describe, expect, it } from "vitest";

import { ACCOUNTS, INSTITUTIONS } from "./registry";

// Pure config-integrity checks — no DB, runs everywhere.
describe("account registry", () => {
  it("every account references a defined institution", () => {
    const names = new Set(INSTITUTIONS.map((i) => i.name));
    for (const a of ACCOUNTS) {
      expect(names.has(a.institution), `unknown institution: ${a.institution}`).toBe(
        true,
      );
    }
  });

  it("each (sourceSchema, sourceView) is unique (the natural key)", () => {
    const keys = ACCOUNTS.map((a) => `${a.sourceSchema}.${a.sourceView}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every account carries a complete column mapping", () => {
    for (const a of ACCOUNTS) {
      const m = a.columnMapping;
      expect(m.transactionId).toBeTruthy();
      expect(m.transactionDate).toBeTruthy();
      expect(m.description).toBeTruthy();
      expect(m.amount).toBeTruthy();
    }
  });

  it("covers the initial + fast-follow accounts (brokerage x2, checking, 4 cards)", () => {
    expect(ACCOUNTS).toHaveLength(7);
  });
});
