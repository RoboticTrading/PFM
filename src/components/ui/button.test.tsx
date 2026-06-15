import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ThemeProvider } from "@/lib/theme";
import { VAR_PREFIX } from "@/lib/theme/tokens";
import { walnutBrass } from "@/lib/theme/skins";

import { Button } from "./button";
import { Table, TableBody, TableCell, TableRow } from "./table";

describe("shadcn primitives under Walnut & Brass", () => {
  it("renders a Button themed via tokens", () => {
    render(
      <ThemeProvider>
        <Button>Categorize</Button>
      </ThemeProvider>,
    );
    const btn = screen.getByRole("button", { name: "Categorize" });
    expect(btn).toBeInTheDocument();
    // default variant maps to the brass primary token
    expect(btn.className).toContain("bg-primary");
    // and the active skin really is Walnut & Brass
    expect(
      document.documentElement.style.getPropertyValue(`${VAR_PREFIX}-accent`),
    ).toBe(walnutBrass.colors.accent);
  });

  it("renders a dense Table register", () => {
    render(
      <ThemeProvider>
        <Table>
          <TableBody>
            <TableRow>
              <TableCell>AAPL</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </ThemeProvider>,
    );
    expect(screen.getByText("AAPL")).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });
});
