/**
 * Semantic design tokens for PFM.
 *
 * We model *roles* (surface, accent, foreground, status) — never raw colors at
 * the call site. A {@link Skin} binds each role to a concrete value; the engine
 * projects those into CSS custom properties (`--pfm-*`) that Tailwind v4 maps to
 * utilities. Swapping the skin re-themes the whole app — nothing is hardcoded.
 */

/** Color roles. Keep in sync with the `@theme inline` block in `globals.css`. */
export const COLOR_TOKENS = [
  "base", // page background (deepest)
  "panel", // app chrome / nav background
  "surface", // primary content surface
  "elevated", // raised surface (modals, popovers)
  "hover", // hover/active surface
  "card", // card background
  "border", // default hairline border
  "border-light", // brighter border (focus rows, dividers)
  "accent", // brass — the brand accent
  "accent-dim", // muted accent (borders, idle)
  "accent-bright", // hot accent (hover, emphasis)
  "fg", // primary text
  "fg-muted", // secondary text
  "fg-subtle", // tertiary / placeholder text
  "success", // positive money / confirmations
  "danger", // negative money / destructive
  "warning", // caution
  "info", // neutral info
] as const;

export type ColorToken = (typeof COLOR_TOKENS)[number];

/** Typography roles. */
export interface SkinFonts {
  /** Serif display face — headings, brand, stat values. */
  display: string;
  /** Sans body face — UI text. */
  body: string;
  /** Monospace — numbers, registers, amounts. */
  mono: string;
}

/** A complete, swappable theme. */
export interface Skin {
  /** Stable id used to select the skin (also the `data-skin` attribute value). */
  id: string;
  /** Human label for the skin picker. */
  label: string;
  /** Whether this skin is dark (drives `color-scheme`). */
  dark: boolean;
  /** Role → CSS color value (any valid CSS color string). */
  colors: Record<ColorToken, string>;
  fonts: SkinFonts;
  /** Base corner radius (e.g. `2px`). */
  radius: string;
}

/** CSS custom-property prefix for every emitted token. */
export const VAR_PREFIX = "--pfm";
