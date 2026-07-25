"use client";

import { useMemo } from "react";

import { ALL_ACCOUNTS } from "@/lib/accounts/register-types";
import { currentMonth } from "@/lib/date";
import { trpc } from "@/lib/trpc/client";

import {
  FreshnessPanel,
  LiquidityPanel,
  NetWorthHero,
  PeriodPanel,
  RealEstatePanel,
  SleevePanel,
  TopStrategies,
  TradingPanel,
} from "./panels";

/**
 * The command center — Bob's whole financial life on one page, sourced from the Cube. Net worth,
 * the cash squeeze, this period's flow, the trading book, the ETF income sleeve, and the hard
 * assets — each panel a live read with a deep-link to its full view. Loads panel-by-panel; empty
 * states nudge (categorize) rather than render broken numbers.
 */
export function Dashboard() {
  const month = useMemo(() => currentMonth(), []);

  const netWorth = trpc.cube.netWorth.useQuery();
  const liquidity = trpc.cube.liquidity.useQuery();
  const summary = trpc.cube.summary.useQuery({});
  const equity = trpc.cube.equityCurve.useQuery({});
  const strategies = trpc.cube.strategies.useQuery({});
  const holdings = trpc.cube.holdings.useQuery();
  const properties = trpc.cube.properties.useQuery();
  const matchHealth = trpc.cube.matchHealth.useQuery();
  const flow = trpc.reports.cashFlow.useQuery({ from: month.from, to: month.to });
  const inbox = trpc.transactions.page.useQuery({
    accountId: ALL_ACCOUNTS,
    limit: 1,
  });

  return (
    <main className="px-8 py-6">
      <header className="mb-5">
        <h1 className="font-display text-2xl font-semibold tracking-wide text-accent">
          Dashboard
        </h1>
        <p className="text-sm text-fg-muted">
          The command center · everything, live from the Cube
          {liquidity.data?.asOf ? ` · balances ${liquidity.data.asOf}` : ""}
        </p>
      </header>

      {/* Row 1 — the balance sheet: net worth + the cash squeeze */}
      <div className="grid gap-4 lg:grid-cols-3">
        <NetWorthHero data={netWorth.data} />
        <LiquidityPanel data={liquidity.data} />
      </div>

      {/* Row 2 — the trading book + this period's flow */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <TradingPanel summary={summary.data} points={equity.data} />
        <PeriodPanel
          label={month.label}
          data={flow.data}
          uncategorized={inbox.data?.uncategorized}
        />
      </div>

      {/* Row 3 — the assets + trust signal */}
      <div className="mt-4 grid gap-4 lg:grid-cols-4">
        <SleevePanel holdings={holdings.data} />
        <RealEstatePanel properties={properties.data} />
        <TopStrategies rows={strategies.data} />
        <FreshnessPanel
          health={matchHealth.data}
          balancesAsOf={liquidity.data?.asOf}
        />
      </div>
    </main>
  );
}
