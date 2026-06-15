import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Mock the typed tRPC client so the register renders from fixtures (no network).
vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    accounts: {
      list: {
        useQuery: () => ({
          isLoading: false,
          isError: false,
          data: [
            {
              id: "11111111-1111-1111-1111-111111111111",
              name: "Schwab Checking",
              kind: "checking",
              active: true,
              sourceSchema: "schwab_checking",
              sourceView: "v_transactions",
              institutionName: "Charles Schwab — Bank",
              institutionKind: "bank",
            },
          ],
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
    expect(link).toHaveAttribute(
      "href",
      "/accounts/11111111-1111-1111-1111-111111111111",
    );
    expect(screen.getByText("Charles Schwab — Bank")).toBeInTheDocument();
    expect(screen.getByText("schwab_checking.v_transactions")).toBeInTheDocument();
    // formatted live balance
    expect(screen.getByText("$1,500.00")).toBeInTheDocument();
  });
});
