"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { applySkin } from "./cssVars";
import { DEFAULT_SKIN_ID, resolveSkin } from "./skins";
import type { Skin } from "./tokens";

interface ThemeContextValue {
  /** The currently active skin. */
  skin: Skin;
  /** Active skin id (convenience). */
  skinId: string;
  /** Switch the active skin by id; unknown ids fall back to the default. */
  setSkin: (id: string) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Applies the active skin's tokens to `:root` and exposes a setter so any
 * component can re-theme the app. The default skin is also inlined on `<html>`
 * server-side (see `RootLayout`) to avoid a flash before hydration.
 */
export function ThemeProvider({
  children,
  initialSkinId = DEFAULT_SKIN_ID,
}: {
  children: ReactNode;
  initialSkinId?: string;
}) {
  const [skinId, setSkinId] = useState(initialSkinId);
  const skin = useMemo(() => resolveSkin(skinId), [skinId]);

  // useLayoutEffect so the swap is painted before the browser shows a frame.
  useLayoutEffect(() => {
    applySkin(skin);
  }, [skin]);

  const setSkin = useCallback((id: string) => setSkinId(id), []);

  const value = useMemo<ThemeContextValue>(
    () => ({ skin, skinId: skin.id, setSkin }),
    [skin, setSkin],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Access the active skin and the skin setter. Must be inside a `ThemeProvider`. */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
