import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { RegisterTxn } from "@/lib/accounts/register";

const ROWS: RegisterTxn[] = [
  {
    sourceSchema: "schwab_checking",
    sourceView: "v_transactions",
    sourceTxnId: "1",
    date: "2026-05-10",
    description: "Paycheck",
    amount: "2500.0000",
    categoryId: null,
    categoryName: null,
  },
  {
    sourceSchema: "schwab_checking",
    sourceView: "v_transactions",
    sourceTxnId: "2",
    date: "2026-05-01",
    description: "Whole Foods",
    amount: "-82.1000",
    categoryId: null,
    categoryName: null,
  },
  {
    sourceSchema: "schwab_checking",
    sourceView: "v_transactions",
    sourceTxnId: "3",
    date: "2026-05-20",
    description: "Amazon",
    amount: "-19.9900",
    categoryId: null,
    categoryName: null,
  },
];

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    transactions: {
      forAccount: {
        useQuery: () => ({ isLoading: false, isError: false, data: ROWS }),
      },
    },
    categories: {
      list: { useQuery: () => ({ isLoading: false, isError: false, data: [] }) },
    },
  },
}));

import { ThemeProvider } from "@/lib/theme";

import { sortTransactions, TransactionRegister } from "./TransactionRegister";

describe("sortTransactions", () => {
  it("sorts by amount ascending (decimal-correct)", () => {
    const sorted = sortTransactions(ROWS, "amount", "asc");
    expect(sorted.map((r) => r.amount)).toEqual([
      "-82.1000",
      "-19.9900",
      "2500.0000",
    ]);
  });

  it("sorts by date descending", () => {
    const sorted = sortTransactions(ROWS, "date", "desc");
    expect(sorted.map((r) => r.date)).toEqual([
      "2026-05-20",
      "2026-05-10",
      "2026-05-01",
    ]);
  });

  it("sorts by description ascending", () => {
    const sorted = sortTransactions(ROWS, "description", "asc");
    expect(sorted.map((r) => r.description)).toEqual([
      "Amazon",
      "Paycheck",
      "Whole Foods",
    ]);
  });
});

describe("TransactionRegister", () => {
  it("renders a dense register with formatted amounts", () => {
    render(
      <ThemeProvider>
        <TransactionRegister accountId="00000000-0000-0000-0000-000000000000" />
      </ThemeProvider>,
    );
    expect(screen.getByText("Paycheck")).toBeInTheDocument();
    expect(screen.getByText("Whole Foods")).toBeInTheDocument();
    expect(screen.getByText("$2,500.00")).toBeInTheDocument();
    expect(screen.getByText("-$82.10")).toBeInTheDocument();
  });

  it("activates a sort indicator when a header is clicked", () => {
    render(
      <ThemeProvider>
        <TransactionRegister accountId="00000000-0000-0000-0000-000000000000" />
      </ThemeProvider>,
    );
    const amountHeader = screen.getByRole("button", { name: /amount/i });
    fireEvent.click(amountHeader);
    expect(amountHeader.textContent).toMatch(/[▲▼]/);
  });

  it("applies the search facet", () => {
    render(
      <ThemeProvider>
        <TransactionRegister accountId="00000000-0000-0000-0000-000000000000" />
      </ThemeProvider>,
    );
    fireEvent.change(screen.getByLabelText("Search description"), {
      target: { value: "amazon" },
    });
    expect(screen.queryByText("Paycheck")).not.toBeInTheDocument();
    expect(screen.getByText("Amazon")).toBeInTheDocument();
    expect(screen.getByText(/1 of 3/)).toBeInTheDocument();
  });
});
