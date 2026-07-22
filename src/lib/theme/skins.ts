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

/**
 * "Daylight" — the default skin: a clean, friendly consumer-finance look, the way
 * a modern bank app or Quicken feels. Crisp white cards on a soft cool-gray page,
 * a trustworthy blue accent, calm slate text, green/red money semantics, Inter
 * type, and generously rounded corners. Deliberately NOT a corporate/analytics
 * "board room" look. (Palette instincts carried from the earlier financialmanager
 * attempt, warmed and softened.) Walnut & Brass stays selectable.
 */
export const daylight: Skin = {
  id: "daylight",
  label: "Daylight",
  dark: false,
  colors: {
    base: "#f4f6f9", // soft cool page behind cards (calmer than flat gray)
    panel: "#ffffff", // app chrome / nav
    surface: "#ffffff", // primary content surface
    elevated: "#ffffff", // modals / popovers (elevation via shadow, not color)
    hover: "#eef2f7", // gentle cool hover/active surface
    card: "#ffffff",
    border: "#e6e9ef", // soft cool hairline
    "border-light": "#d5dae3", // stronger cool divider
    accent: "#2563eb", // blue-600 — trustworthy bank blue
    "accent-dim": "#93c5fd", // blue-300 — idle/muted accent
    "accent-bright": "#1d4ed8", // blue-700 — hover/emphasis (buttons darken on hover)
    fg: "#0f172a", // slate-900 — softer than pure black
    "fg-muted": "#475569", // slate-600 secondary
    "fg-subtle": "#94a3b8", // slate-400 tertiary / placeholder
    success: "#16a34a", // green-600 — positive money
    danger: "#dc2626", // red-600 — negative money / destructive
    warning: "#d97706", // amber-600
    info: "#2563eb", // blue-600
  },
  fonts: {
    display: "var(--font-inter), 'Segoe UI', system-ui, sans-serif",
    body: "var(--font-inter), 'Segoe UI', system-ui, sans-serif",
    mono: "'JetBrains Mono', 'Consolas', ui-monospace, monospace",
  },
  radius: "10px",
};

/** Registry of available skins, keyed by id. */
export const SKINS: Record<string, Skin> = {
  [daylight.id]: daylight,
  [walnutBrass.id]: walnutBrass,
  [parchment.id]: parchment,
};

/** The skin applied when none is selected. */
export const DEFAULT_SKIN_ID = daylight.id;

/** Resolve a skin by id, falling back to the default. */
export function resolveSkin(id: string | undefined): Skin {
  return (id && SKINS[id]) || SKINS[DEFAULT_SKIN_ID];
}
