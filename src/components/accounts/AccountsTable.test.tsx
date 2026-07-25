import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Mock the typed tRPC client so the register renders from fixtures (no network).
const noopInvalidate = { invalidate: () => Promise.resolve() };
vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    useUtils: () => ({
      accounts: { list: noopInvalidate, byId: noopInvalidate },
      balances: { forAccount: noopInvalidate },
      cube: { netWorth: noopInvalidate, liquidity: noopInvalidate },
      reports: noopInvalidate,
    }),
    accounts: {
      list: {
        useQuery: () => ({
          isLoading: false,
          isError: false,
          data: [
            {
              id: "schwab_checking",
              name: "Schwab Checking",
              kind: "checking",
              active: true,
              sourceLabel: "schwab_checking",
              institutionName: "Charles Schwab — Bank",
              institutionKind: "bank",
              balance: "1500.0000",
              asOfDate: "2026-07-25",
              isLiability: false,
            },
          ],
        }),
      },
      setBalance: {
        useMutation: () => ({
          mutate: () => {},
          reset: () => {},
          isPending: false,
          isError: false,
        }),
      },
    },
    balances: {
      forAccount: {
        useQuery: () => ({
          isLoading: false,
          isError: false,
          data: {
            accountId: "11111111-1111-1111-1111-111111111111",
            asOfDate: null,
            forward: "0.0000",
            since: "1500.0000",
            balance: "1500.0000",
          },
        }),
      },
    },
  },
}));

import { ThemeProvider } from "@/lib/theme";

import { AccountsTable } from "./AccountsTable";

describe("AccountsTable", () => {
  it("renders a dense register row that drills into the account", () => {
    render(
      <ThemeProvider>
        <AccountsTable />
      </ThemeProvider>,
    );

    const link = screen.getByRole("link", { name: "Schwab Checking" });
    expect(link).toHaveAttribute("href", "/accounts/schwab_checking");
    expect(screen.getByText("Charles Schwab — Bank")).toBeInTheDocument();
    expect(screen.getByText("schwab_checking")).toBeInTheDocument();
    // formatted live balance
    expect(screen.getByText("$1,500.00")).toBeInTheDocument();
  });
});
