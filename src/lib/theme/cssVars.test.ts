import { describe, expect, it } from "vitest";

import { skinToCssVars, skinToInlineStyle } from "./cssVars";
import { parchment, walnutBrass } from "./skins";
import { COLOR_TOKENS, VAR_PREFIX } from "./tokens";

describe("skinToCssVars", () => {
  it("emits a prefixed variable for every color token plus fonts and radius", () => {
    const vars = skinToCssVars(walnutBrass);
    for (const token of COLOR_TOKENS) {
      expect(vars[`${VAR_PREFIX}-${token}`]).toBe(walnutBrass.colors[token]);
    }
    expect(vars[`${VAR_PREFIX}-font-display`]).toBe(walnutBrass.fonts.display);
    expect(vars[`${VAR_PREFIX}-font-mono`]).toBe(walnutBrass.fonts.mono);
    expect(vars[`${VAR_PREFIX}-radius`]).toBe(walnutBrass.radius);
  });

  it("produces different values per skin so swapping re-themes", () => {
    const dark = skinToCssVars(walnutBrass);
    const light = skinToCssVars(parchment);
    expect(dark[`${VAR_PREFIX}-base`]).not.toBe(light[`${VAR_PREFIX}-base`]);
    expect(dark[`${VAR_PREFIX}-accent`]).not.toBe(light[`${VAR_PREFIX}-accent`]);
  });
});

describe("skinToInlineStyle", () => {
  it("serializes the accent var into a CSS declaration string", () => {
    expect(skinToInlineStyle(walnutBrass)).toContain(
      `${VAR_PREFIX}-accent: ${walnutBrass.colors.accent};`,
    );
  });
});
