import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ThemedCard } from "@/components/theme/ThemedCard";

import { ThemeProvider, useTheme } from "./ThemeProvider";
import { DEFAULT_SKIN_ID, parchment, resolveSkin } from "./skins";
import { VAR_PREFIX } from "./tokens";

/** Track whatever the current default skin is, so this test survives default changes. */
const defaultSkin = resolveSkin(DEFAULT_SKIN_ID);

function rootVar(name: string): string {
  return document.documentElement.style.getPropertyValue(name).trim();
}

function SkinSwitcher() {
  const { skinId, setSkin } = useTheme();
  return (
    <button data-testid="swap" onClick={() => setSkin(parchment.id)}>
      {skinId}
    </button>
  );
}

describe("ThemeProvider", () => {
  it("renders a token-only component under the default skin", () => {
    render(
      <ThemeProvider>
        <ThemedCard title="Default Skin">body</ThemedCard>
      </ThemeProvider>,
    );
    expect(screen.getByText("Default Skin")).toBeInTheDocument();
    expect(rootVar(`${VAR_PREFIX}-accent`)).toBe(defaultSkin.colors.accent);
    expect(document.documentElement.dataset.skin).toBe(defaultSkin.id);
  });

  it("re-themes :root when the skin is swapped", () => {
    render(
      <ThemeProvider>
        <SkinSwitcher />
      </ThemeProvider>,
    );

    expect(rootVar(`${VAR_PREFIX}-base`)).toBe(defaultSkin.colors.base);

    act(() => {
      screen.getByTestId("swap").click();
    });

    expect(rootVar(`${VAR_PREFIX}-base`)).toBe(parchment.colors.base);
    expect(rootVar(`${VAR_PREFIX}-accent`)).toBe(parchment.colors.accent);
    expect(document.documentElement.dataset.skin).toBe(parchment.id);
  });
});
