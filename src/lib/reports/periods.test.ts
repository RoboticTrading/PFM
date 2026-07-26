import { describe, expect, it } from "vitest";

import { buildPeriods, periodIndexOf } from "./periods";

describe("buildPeriods", () => {
  it("months: natural calendar boundaries + labels", () => {
    const p = buildPeriods({ from: "2026-01-15", to: "2026-03-10" }, "month");
    expect(p.map((x) => x.key)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(p[0]).toMatchObject({
      from: "2026-01-01",
      to: "2026-01-31",
      label: "Jan 2026",
    });
    expect(p[1].to).toBe("2026-02-28"); // 2026 is not a leap year
    expect(p[2]).toMatchObject({ from: "2026-03-01", to: "2026-03-31" });
  });

  it("quarters: Q1–Q4 across a full year", () => {
    const p = buildPeriods({ from: "2026-01-01", to: "2026-12-31" }, "quarter");
    expect(p.map((x) => x.key)).toEqual([
      "2026-Q1",
      "2026-Q2",
      "2026-Q3",
      "2026-Q4",
    ]);
    expect(p[2]).toMatchObject({
      from: "2026-07-01",
      to: "2026-09-30",
      label: "Q3 2026",
    });
  });

  it("weeks: Monday-started, contiguous", () => {
    // 2026-07-22 is a Wednesday; the week starts Mon 2026-07-20.
    const p = buildPeriods({ from: "2026-07-22", to: "2026-08-02" }, "week");
    expect(p[0]).toMatchObject({ from: "2026-07-20", to: "2026-07-26" });
    expect(p[1]).toMatchObject({ from: "2026-07-27", to: "2026-08-02" });
    // each period's start is the prior end + 1 (no gaps/overlaps)
    for (let i = 1; i < p.length; i++) {
      expect(p[i].from > p[i - 1].to).toBe(true);
    }
  });

  it("biweekly: 14-day blocks anchored to the range's Monday", () => {
    const p = buildPeriods({ from: "2026-07-22", to: "2026-08-20" }, "biweekly");
    expect(p[0]).toMatchObject({ from: "2026-07-20", to: "2026-08-02" });
    expect(p[1]).toMatchObject({ from: "2026-08-03", to: "2026-08-16" });
  });

  it("returns empty when from > to", () => {
    expect(buildPeriods({ from: "2026-05-01", to: "2026-04-01" }, "month")).toEqual(
      [],
    );
  });
});

describe("periodIndexOf", () => {
  const months = buildPeriods({ from: "2026-01-01", to: "2026-03-31" }, "month");

  it("finds the containing period", () => {
    expect(periodIndexOf(months, "2026-01-01")).toBe(0);
    expect(periodIndexOf(months, "2026-02-14")).toBe(1);
    expect(periodIndexOf(months, "2026-03-31")).toBe(2);
  });

  it("returns -1 outside the covered span", () => {
    expect(periodIndexOf(months, "2025-12-31")).toBe(-1);
    expect(periodIndexOf(months, "2026-04-01")).toBe(-1);
  });
});
