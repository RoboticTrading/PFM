import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ThemeProvider } from "@/lib/theme";

import { BudgetCard } from "./BudgetCard";
import { CashFlowCard } from "./CashFlowCard";
import { NetWorthCard } from "./NetWorthCard";

function wrap(ui: React.ReactNode) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe("dashboard cards", () => {
  it("NetWorthCard shows total + per-account balances", () => {
    wrap(
      <NetWorthCard
        data={{
          total: "12500.0000",
          byAccount: [
            { accountId: "1", name: "Schwab Checking", balance: "3711.6100" },
            { accountId: "2", name: "Amex", balance: "-211.4500" },
          ],
        }}
      />,
    );
    expect(screen.getByText("$12,500.00")).toBeInTheDocument();
    expect(screen.getByText("Schwab Checking")).toBeInTheDocument();
    expect(screen.getByText("-$211.45")).toBeInTheDocument();
  });

  it("CashFlowCard shows income/expense/net", () => {
    wrap(
      <CashFlowCard
        label="August 2099"
        data={{ income: "1000.0000", expense: "-200.0000", net: "800.0000" }}
      />,
    );
    expect(screen.getByText("$1,000.00")).toBeInTheDocument();
    expect(screen.getByText("-$200.00")).toBeInTheDocument();
    expect(screen.getByText("$800.00")).toBeInTheDocument();
  });

  it("BudgetCard lists categories with variance", () => {
    wrap(
      <BudgetCard
        label="August 2099"
        rows={[
          {
            categoryId: "g",
            categoryName: "Groceries",
            budget: "500.0000",
            actual: "-200.0000",
            variance: "700.0000",
          },
        ]}
      />,
    );
    expect(screen.getByText("Groceries")).toBeInTheDocument();
    expect(screen.getByText("$700.00")).toBeInTheDocument();
  });

  it("BudgetCard shows an empty state", () => {
    wrap(<BudgetCard label="August 2099" rows={[]} />);
    expect(screen.getByText(/no budgets set/i)).toBeInTheDocument();
  });
});
