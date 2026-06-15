import { VAR_PREFIX, type Skin } from "./tokens";

/**
 * Project a {@link Skin} into the flat CSS-custom-property map the app consumes.
 * Pure — the single source of truth for how a skin becomes `--pfm-*` variables,
 * shared by SSR inlining, the runtime {@link applySkin}, and tests.
 */
export function skinToCssVars(skin: Skin): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [token, value] of Object.entries(skin.colors)) {
    vars[`${VAR_PREFIX}-${token}`] = value;
  }
  vars[`${VAR_PREFIX}-font-display`] = skin.fonts.display;
  vars[`${VAR_PREFIX}-font-body`] = skin.fonts.body;
  vars[`${VAR_PREFIX}-font-mono`] = skin.fonts.mono;
  vars[`${VAR_PREFIX}-radius`] = skin.radius;
  return vars;
}

/** Serialize a skin's variables into an inline `style` string (for SSR `<html>`). */
export function skinToInlineStyle(skin: Skin): string {
  return Object.entries(skinToCssVars(skin))
    .map(([k, v]) => `${k}: ${v};`)
    .join(" ");
}

/**
 * Apply a skin's variables to a DOM element (default `:root`). Also sets
 * `data-skin` and `color-scheme` so descendants and native UI follow the theme.
 * Used by the {@link import("./ThemeProvider").ThemeProvider}.
 */
export function applySkin(skin: Skin, target?: HTMLElement): void {
  const el = target ?? document.documentElement;
  for (const [name, value] of Object.entries(skinToCssVars(skin))) {
    el.style.setProperty(name, value);
  }
  el.dataset.skin = skin.id;
  el.style.colorScheme = skin.dark ? "dark" : "light";
}
