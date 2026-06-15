import { describe, expect, it } from "vitest";

import { APP } from "./version";

describe("version", () => {
  it("identifies the app as pfm", () => {
    expect(APP).toBe("pfm");
  });
});
