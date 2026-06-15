import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/accounts/abc",
  useRouter: () => ({ push: vi.fn() }),
}));

import { ThemeProvider } from "@/lib/theme";

import { AppShell } from "./AppShell";

describe("AppShell", () => {
  it("renders the artifact nav spine with drill-in links", () => {
    render(
      <ThemeProvider>
        <AppShell>
          <div>content</div>
        </AppShell>
      </ThemeProvider>,
    );

    expect(screen.getByRole("link", { name: /accounts/i })).toHaveAttribute(
      "href",
      "/accounts",
    );
    expect(screen.getByRole("link", { name: /categories/i })).toHaveAttribute(
      "href",
      "/categories",
    );
    expect(screen.getByRole("link", { name: /positions/i })).toHaveAttribute(
      "href",
      "/positions",
    );
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("marks the active section (prefix match on a detail route)", () => {
    render(
      <ThemeProvider>
        <AppShell>
          <div />
        </AppShell>
      </ThemeProvider>,
    );
    const accounts = screen.getByRole("link", { name: /accounts/i });
    expect(accounts).toHaveAttribute("aria-current", "page");
  });
});
