import { describe, expect, it } from "vitest";

import { currentMonth } from "./date";

describe("currentMonth", () => {
  it("computes the month window for a mid-month date", () => {
    const w = currentMonth(new Date(2099, 7, 15)); // Aug 2099
    expect(w.period).toBe("2099-08");
    expect(w.from).toBe("2099-08-01");
    expect(w.to).toBe("2099-08-31");
    expect(w.label).toBe("August 2099");
  });

  it("handles a 30-day month and zero-pads", () => {
    const w = currentMonth(new Date(2026, 3, 5)); // April 2026 (30 days)
    expect(w.period).toBe("2026-04");
    expect(w.to).toBe("2026-04-30");
  });

  it("handles February in a leap year", () => {
    const w = currentMonth(new Date(2024, 1, 10)); // Feb 2024
    expect(w.to).toBe("2024-02-29");
  });
});
