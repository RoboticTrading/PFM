import { describe, expect, it } from "vitest";

import { addMoney, fromScaled, sumMoney, toScaled } from "./money";

describe("money", () => {
  it("round-trips decimal strings at 4dp", () => {
    expect(fromScaled(toScaled("1234.56"))).toBe("1234.5600");
    expect(fromScaled(toScaled("-0.01"))).toBe("-0.0100");
    expect(fromScaled(toScaled("0"))).toBe("0.0000");
  });

  it("sums precisely without float drift", () => {
    // 0.1 + 0.2 famously != 0.3 in float; here it must be exact.
    expect(sumMoney(["0.1", "0.2"])).toBe("0.3000");
    expect(sumMoney(["100.25", "-50.10", "0.0000"])).toBe("50.1500");
    expect(sumMoney([null, undefined, ""])).toBe("0.0000");
  });

  it("adds large values without precision loss", () => {
    expect(addMoney("999999999999.9999", "0.0001")).toBe("1000000000000.0000");
  });

  it("rejects malformed input", () => {
    expect(() => toScaled("12.3.4")).toThrow();
    expect(() => toScaled("abc")).toThrow();
  });
});
