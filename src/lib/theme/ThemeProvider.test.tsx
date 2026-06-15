import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ThemedCard } from "@/components/theme/ThemedCard";

import { ThemeProvider, useTheme } from "./ThemeProvider";
import { parchment, walnutBrass } from "./skins";
import { VAR_PREFIX } from "./tokens";

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
        <ThemedCard title="Walnut &amp; Brass">body</ThemedCard>
      </ThemeProvider>,
    );
    expect(screen.getByText("Walnut & Brass")).toBeInTheDocument();
    expect(rootVar(`${VAR_PREFIX}-accent`)).toBe(walnutBrass.colors.accent);
    expect(document.documentElement.dataset.skin).toBe(walnutBrass.id);
  });

  it("re-themes :root when the skin is swapped", () => {
    render(
      <ThemeProvider>
        <SkinSwitcher />
      </ThemeProvider>,
    );

    expect(rootVar(`${VAR_PREFIX}-base`)).toBe(walnutBrass.colors.base);

    act(() => {
      screen.getByTestId("swap").click();
    });

    expect(rootVar(`${VAR_PREFIX}-base`)).toBe(parchment.colors.base);
    expect(rootVar(`${VAR_PREFIX}-accent`)).toBe(parchment.colors.accent);
    expect(document.documentElement.dataset.skin).toBe(parchment.id);
  });
});
