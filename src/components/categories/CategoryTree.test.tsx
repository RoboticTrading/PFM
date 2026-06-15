import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    categories: {
      list: {
        useQuery: () => ({
          isLoading: false,
          isError: false,
          data: [
            { id: "exp", parentId: null, name: "Expense", kind: "Expense" },
            { id: "gro", parentId: "exp", name: "Groceries", kind: "Expense" },
            { id: "inc", parentId: null, name: "Income", kind: "Income" },
            { id: "sal", parentId: "inc", name: "Salary", kind: "Income" },
          ],
        }),
      },
    },
  },
}));

import { ThemeProvider } from "@/lib/theme";

import { CategoryTree } from "./CategoryTree";

describe("CategoryTree", () => {
  it("renders kind groups with children nested under roots", () => {
    render(
      <ThemeProvider>
        <CategoryTree />
      </ThemeProvider>,
    );
    // "Income"/"Expense" appear as both the kind heading and the root category.
    expect(screen.getAllByText("Income").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Expense").length).toBeGreaterThanOrEqual(1);
    // Children are unique.
    expect(screen.getByText("Salary")).toBeInTheDocument();
    expect(screen.getByText("Groceries")).toBeInTheDocument();
  });
});
