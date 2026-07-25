"use client";

import Link from "next/link";

import { EquityCurve } from "@/components/cube/EquityCurve";
import type {
  CubeSummary,
  EquityPoint,
  HoldingRow,
  Liquidity,
  MatchHealth,
  NetWorth,
  PropertyRow,
  StrategyRow,
} from "@/lib/cube/cube";
import { formatUsd, subMoney, sumMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

/* ── Shared shell ─────────────────────────────────────────────────────────── */

/** A dashboard panel: titled card with an optional deep-link and a "view →" affordance. */
export function Panel({
  title,
  href,
  hint,
  className,
  children,
}: {
  title: string;
  href?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex flex-col rounded-md border border-border bg-card",
        href && "transition-colors hover:border-border-light",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
          {title}
        </span>
        {href ? (
          <Link
            href={href}
            className="text-[10px] font-medium uppercase tracking-wide text-accent outline-none hover:text-accent-bright focus-visible:ring-2 focus-visible:ring-ring"
          >
            {hint ?? "view"} →
          </Link>
        ) : (
          hint && <span className="text-[10px] text-fg-subtle">{hint}</span>
        )}
      </div>
      <div className="flex-1 p-4">{children}</div>
    </section>
  );
}

function Loading() {
  return <p className="text-sm text-fg-muted">Loading…</p>;
}

/** A labelled money figure. `tone` overrides the sign-based color. */
function Figure({
  label,
  value,
  tone,
  size = "base",
}: {
  label: string;
  value: string;
  tone?: string;
  size?: "base" | "lg";
}) {
  const neg = value.startsWith("-");
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm text-fg-muted">{label}</span>
      <span
        className={cn(
          "font-mono tabular-nums",
          size === "lg" ? "text-lg" : "text-sm",
          tone ?? (neg ? "text-danger" : "text-fg"),
        )}
      >
        {formatUsd(value)}
      </span>
    </div>
  );
}

function pct(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

/* ── 1. Net worth headline ────────────────────────────────────────────────── */

export function NetWorthHero({ data }: { data?: NetWorth }) {
  const net = data ? Number(data.netWorth) : 0;
  const assets = data ? Number(data.totalAssets) : 0;
  const liabs = data ? Number(data.totalLiabilities) : 0;
  const denom = assets + liabs || 1;
  const assetPct = (assets / denom) * 100;

  return (
    <Panel title="Net worth" href="/networth" className="lg:col-span-2">
      {!data ? (
        <Loading />
      ) : (
        <>
          <div
            className={cn(
              "font-display text-4xl font-semibold tabular-nums",
              net > 0 ? "text-success" : net < 0 ? "text-danger" : "text-fg",
            )}
          >
            {formatUsd(data.netWorth)}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-6 gap-y-0.5 text-sm text-fg-muted">
            <span>
              Assets{" "}
              <span className="font-mono font-medium tabular-nums text-fg">
                {formatUsd(data.totalAssets)}
              </span>
            </span>
            <span>
              Liabilities{" "}
              <span className="font-mono font-medium tabular-nums text-danger">
                {formatUsd(`-${data.totalLiabilities}`)}
              </span>
            </span>
          </div>
          <div className="mt-3">
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full"
                style={{ width: `${assetPct}%`, backgroundColor: "var(--color-success)", opacity: 0.75 }}
              />
              <div
                className="h-full"
                style={{ width: `${100 - assetPct}%`, backgroundColor: "var(--color-danger)", opacity: 0.75 }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-fg-subtle">
              <span>assets {assetPct.toFixed(0)}%</span>
              <span>liabilities {(100 - assetPct).toFixed(0)}%</span>
            </div>
          </div>
        </>
      )}
    </Panel>
  );
}

/* ── 2. Liquidity / cash squeeze ──────────────────────────────────────────── */

export function LiquidityPanel({ data }: { data?: Liquidity }) {
  return (
    <Panel title="Liquidity" href="/networth" hint="accounts">
      {!data ? (
        <Loading />
      ) : (
        <>
          <div className="text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
            Spendable cash
          </div>
          <div
            className={cn(
              "font-display text-2xl font-semibold tabular-nums",
              Number(data.cash) >= 0 ? "text-fg" : "text-danger",
            )}
          >
            {formatUsd(data.cash)}
          </div>
          <div className="mt-3 space-y-1.5">
            <Figure label="Cards" value={`-${data.cards}`} />
            <Figure label="Margin" value={`-${data.margin}`} />
            <div className="my-1.5 h-px bg-border" />
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium text-fg">Owed (revolving)</span>
              <span className="font-mono text-base font-semibold tabular-nums text-danger">
                {formatUsd(`-${data.revolvingDebt}`)}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-fg-muted">Cash − owed</span>
              <span
                className={cn(
                  "font-mono text-sm tabular-nums",
                  data.net.startsWith("-") ? "text-danger" : "text-success",
                )}
              >
                {formatUsd(data.net)}
              </span>
            </div>
          </div>
        </>
      )}
    </Panel>
  );
}

/* ── 3. This period — income vs expense vs transfer + uncategorized CTA ─────── */

export interface PeriodFlow {
  income: string;
  expense: string;
  transfer: string;
  net: string;
}

export function PeriodPanel({
  label,
  data,
  uncategorized,
}: {
  label: string;
  data?: PeriodFlow;
  uncategorized?: number;
}) {
  const empty =
    data &&
    Number(data.income) === 0 &&
    Number(data.expense) === 0 &&
    Number(data.transfer) === 0;

  return (
    <Panel title={`This period · ${label}`} href="/reports">
      {!data ? (
        <Loading />
      ) : empty ? (
        <p className="text-sm text-fg-muted">
          No categorized activity yet this period.
        </p>
      ) : (
        <div className="space-y-1.5">
          <Figure label="Income" value={data.income} tone="text-success" />
          <Figure label="Expense" value={data.expense} tone="text-danger" />
          <Figure label="Transfer" value={data.transfer} tone="text-fg-muted" />
          <div className="my-1.5 h-px bg-border" />
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium text-fg">Net</span>
            <span
              className={cn(
                "font-mono text-lg font-semibold tabular-nums",
                data.net.startsWith("-") ? "text-danger" : "text-accent-bright",
              )}
            >
              {formatUsd(data.net)}
            </span>
          </div>
        </div>
      )}

      {uncategorized != null && uncategorized > 0 && (
        <Link
          href="/transactions"
          className="mt-3 flex items-center justify-between rounded border border-warning/40 bg-warning/10 px-3 py-2 text-sm outline-none transition-colors hover:bg-warning/20 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="text-fg">
            <span className="font-mono font-semibold tabular-nums text-warning">
              {uncategorized.toLocaleString()}
            </span>{" "}
            uncategorized — start tagging
          </span>
          <span className="text-warning">→</span>
        </Link>
      )}
    </Panel>
  );
}

/* ── 4. Trading — realized P&L + equity curve ─────────────────────────────── */

export function TradingPanel({
  summary,
  points,
}: {
  summary?: CubeSummary;
  points?: EquityPoint[];
}) {
  return (
    <Panel title="Trading · realized P&L" href="/cube" className="lg:col-span-2">
      {!summary ? (
        <Loading />
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <span
              className={cn(
                "font-display text-3xl font-semibold tabular-nums",
                Number(summary.realizedPnl) >= 0 ? "text-success" : "text-danger",
              )}
            >
              {formatUsd(summary.realizedPnl)}
            </span>
            <span className="text-sm text-fg-muted">
              {summary.trades.toLocaleString()} trades ·{" "}
              {(summary.winRate * 100).toFixed(0)}% win ·{" "}
              {summary.underlyings} underlyings
            </span>
          </div>
          {points && points.length >= 2 ? (
            <div className="mt-3">
              <EquityCurve points={points} />
            </div>
          ) : (
            <p className="mt-3 text-sm text-fg-muted">
              Not enough closed trades to chart.
            </p>
          )}
        </>
      )}
    </Panel>
  );
}

/* ── 5. Top strategies ────────────────────────────────────────────────────── */

export function TopStrategies({ rows }: { rows?: StrategyRow[] }) {
  const top = rows
    ? [...rows].sort((a, b) => Number(b.realizedPnl) - Number(a.realizedPnl)).slice(0, 6)
    : undefined;

  return (
    <Panel title="Top strategies" href="/cube">
      {!top ? (
        <Loading />
      ) : top.length === 0 ? (
        <p className="text-sm text-fg-muted">No strategies reconstructed yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {top.map((s) => (
            <li key={s.strategy} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-sm text-fg" title={s.strategy}>
                {s.strategy}
                <span className="ml-1.5 text-[10px] text-fg-subtle">
                  {s.n}× · {(s.winRate * 100).toFixed(0)}%
                </span>
              </span>
              <span
                className={cn(
                  "shrink-0 font-mono text-sm tabular-nums",
                  Number(s.realizedPnl) >= 0 ? "text-success" : "text-danger",
                )}
              >
                {formatUsd(s.realizedPnl)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ── 6. ETF income sleeve ─────────────────────────────────────────────────── */

export function SleevePanel({ holdings }: { holdings?: HoldingRow[] }) {
  let body: React.ReactNode;
  if (!holdings) {
    body = <Loading />;
  } else if (holdings.length === 0) {
    body = <p className="text-sm text-fg-muted">No ETF holdings yet.</p>;
  } else {
    const marketValue = sumMoney(holdings.map((h) => h.marketValue));
    const dividends = sumMoney(holdings.map((h) => h.dividendsReceived));
    const cost = sumMoney(holdings.map((h) => h.cashCostBasis));
    const totalReturn = sumMoney(holdings.map((h) => h.totalReturn));
    const trPct = Number(cost) ? (Number(totalReturn) / Number(cost)) * 100 : NaN;
    body = (
      <>
        <div className="font-display text-2xl font-semibold tabular-nums text-fg">
          {formatUsd(marketValue)}
        </div>
        <div className="mt-0.5 text-[10px] uppercase tracking-wide text-fg-subtle">
          market value · {holdings.length} names
        </div>
        <div className="mt-3 space-y-1.5">
          <Figure label="Dividends collected" value={dividends} tone="text-success" />
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-fg-muted">Total return</span>
            <span
              className={cn(
                "font-mono text-sm tabular-nums",
                Number(totalReturn) >= 0 ? "text-success" : "text-danger",
              )}
            >
              {formatUsd(totalReturn)}{" "}
              <span className="text-fg-subtle">({pct(trPct)})</span>
            </span>
          </div>
        </div>
      </>
    );
  }
  return (
    <Panel title="ETF income sleeve" href="/positions">
      {body}
    </Panel>
  );
}

/* ── 7. Real estate + vehicle ─────────────────────────────────────────────── */

export function RealEstatePanel({ properties }: { properties?: PropertyRow[] }) {
  return (
    <Panel title="Real estate + vehicle" href="/networth">
      {!properties ? (
        <Loading />
      ) : properties.length === 0 ? (
        <p className="text-sm text-fg-muted">No tracked assets.</p>
      ) : (
        <ul className="space-y-2.5">
          {properties.map((p) => {
            const equity =
              p.value != null && p.adjustedCost != null
                ? subMoney(p.value, p.adjustedCost)
                : null;
            return (
              <li key={p.propertyKey}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-sm text-fg">{p.label}</span>
                  <span className="shrink-0 font-mono text-sm tabular-nums text-fg">
                    {p.value != null ? formatUsd(p.value) : "—"}
                  </span>
                </div>
                {equity != null && (
                  <div className="flex items-baseline justify-between text-[11px] text-fg-subtle">
                    <span>{p.kind === "vehicle" ? "value" : "equity vs cost"}</span>
                    <span
                      className={cn(
                        "font-mono tabular-nums",
                        equity.startsWith("-") ? "text-danger" : "text-success",
                      )}
                    >
                      {formatUsd(equity)}
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/* ── 8. Match health / freshness — the trust signal ───────────────────────── */

export function FreshnessPanel({
  health,
  balancesAsOf,
}: {
  health?: MatchHealth[];
  balancesAsOf?: string | null;
}) {
  return (
    <Panel title="Data freshness" href="/cube" hint="the cube">
      {!health ? (
        <Loading />
      ) : (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-fg-muted">Balances as of</span>
            <span className="font-mono tabular-nums text-fg">
              {balancesAsOf ?? "—"}
            </span>
          </div>
          {health.length === 0 ? (
            <p className="text-sm text-fg-muted">No match runs recorded.</p>
          ) : (
            <ul className="space-y-1">
              {health.map((h) => (
                <li
                  key={h.source}
                  className="flex items-baseline justify-between text-[11px]"
                >
                  <span className="text-fg-muted">{h.source}</span>
                  <span className="flex items-baseline gap-2">
                    <span
                      className={cn(
                        "font-mono tabular-nums",
                        h.matchRate >= 0.99
                          ? "text-success"
                          : h.matchRate >= 0.9
                            ? "text-warning"
                            : "text-danger",
                      )}
                    >
                      {(h.matchRate * 100).toFixed(1)}% matched
                    </span>
                    <span className="text-fg-subtle">{h.runAt?.slice(0, 10) ?? "—"}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Panel>
  );
}
