import { describe, expect, it } from "vitest";

import { activeNav, NAV_ITEMS } from "./nav";

describe("activeNav", () => {
  it("matches the section for a detail route via prefix", () => {
    expect(activeNav("/accounts")?.href).toBe("/accounts");
    expect(activeNav("/accounts/abc-123")?.href).toBe("/accounts");
    expect(activeNav("/categories")?.href).toBe("/categories");
    expect(activeNav("/positions")?.href).toBe("/positions");
  });

  it("returns undefined off-spine", () => {
    expect(activeNav("/")).toBeUndefined();
  });

  it("exposes the artifact spine", () => {
    expect(NAV_ITEMS.map((i) => i.href)).toEqual([
      "/dashboard",
      "/accounts",
      "/categories",
      "/budgets",
      "/reports",
      "/positions",
    ]);
  });
});
