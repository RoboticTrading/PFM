import type { Skin } from "./tokens";

/**
 * "Walnut & Brass" — the default skin, carried over from the original PFM mood
 * (a warm brass accent over deep walnut-dark surfaces). Refine freely; the whole
 * app reads these via tokens, so tweaks here re-theme everything.
 */
export const walnutBrass: Skin = {
  id: "walnut-brass",
  label: "Walnut & Brass",
  dark: true,
  colors: {
    base: "#0a0d14",
    panel: "#0e1118",
    surface: "#12161f",
    elevated: "#171c28",
    hover: "#1c2233",
    card: "#12161f",
    border: "#1a1f2c",
    "border-light": "#242a3a",
    accent: "#b4964f",
    "accent-dim": "#8a7340",
    "accent-bright": "#d4b668",
    fg: "#d8d3c7",
    "fg-muted": "#9a9faa",
    "fg-subtle": "#6a7080",
    success: "#5a9e6f",
    danger: "#b05555",
    warning: "#c49a3c",
    info: "#5a7faa",
  },
  fonts: {
    display: "'Cormorant Garamond', Georgia, serif",
    body: "'DM Sans', system-ui, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, monospace",
  },
  radius: "2px",
};

/**
 * "Parchment" — a light counter-skin. Exists to prove the engine is genuinely
 * skinnable (swapping `id` re-themes the whole app); not yet a polished theme.
 */
export const parchment: Skin = {
  id: "parchment",
  label: "Parchment",
  dark: false,
  colors: {
    base: "#efe9dc",
    panel: "#e7e0d0",
    surface: "#f5f0e6",
    elevated: "#fbf8f1",
    hover: "#e2d9c6",
    card: "#f5f0e6",
    border: "#d6cdb8",
    "border-light": "#c7bca3",
    accent: "#8a6d2f",
    "accent-dim": "#a3895a",
    "accent-bright": "#6f5320",
    fg: "#2a2620",
    "fg-muted": "#5c564a",
    "fg-subtle": "#857d6d",
    success: "#3f7a52",
    danger: "#9c4040",
    warning: "#9a7521",
    info: "#3f5f86",
  },
  fonts: walnutBrass.fonts,
  radius: walnutBrass.radius,
};

/** Registry of available skins, keyed by id. */
export const SKINS: Record<string, Skin> = {
  [walnutBrass.id]: walnutBrass,
  [parchment.id]: parchment,
};

/** The skin applied when none is selected. */
export const DEFAULT_SKIN_ID = walnutBrass.id;

/** Resolve a skin by id, falling back to the default. */
export function resolveSkin(id: string | undefined): Skin {
  return (id && SKINS[id]) || SKINS[DEFAULT_SKIN_ID];
}
