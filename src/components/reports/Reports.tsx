"use client";

import { useState } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatUsd } from "@/lib/money";
import { GRAINS, type Grain } from "@/lib/reports/periods";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

/**
 * Reports workspace — the three accounting statements Bob asked for:
 *   • Income/Expense (P&L)  — categorized flows + trading P&L, by category
 *   • Cashflow              — money in vs out per period, running net
 *   • Balance Sheet         — point-in-time assets vs liabilities
 * The two flow reports window by Week / Bi-Weekly / Month / Quarter; the balance
 * sheet is a current snapshot (a stock, not a flow). All read-only.
 */

type ReportTab = "income" | "cashflow" | "balance";
const TABS: { value: ReportTab; label: string }[] = [
  { value: "income", label: "Income / Expense" },
  { value: "cashflow", label: "Cashflow" },
  { value: "balance", label: "Balance Sheet" },
];

function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
function yearStartIso(): string {
  return `${new Date().getFullYear()}-01-01`;
}

export function Reports() {
  const [tab, setTab] = useState<ReportTab>("income");
  const [grain, setGrain] = useState<Grain>("month");
  const [from, setFrom] = useState(yearStartIso);
  const [to, setTo] = useState(todayIso);

  return (
    <main className="px-8 py-6">
      <header className="mb-5">
        <h1 className="font-display text-2xl font-semibold tracking-wide text-accent">
          Reports
        </h1>
        <p className="text-sm text-fg-muted">
          Income/Expense, Cashflow &amp; Balance Sheet — from the categorized
          ledger + trading P&amp;L
        </p>
      </header>

      {/* Controls */}
      <div className="mb-5 flex flex-wrap items-end gap-4">
        <Segmented value={tab} options={TABS} onChange={setTab} />

        {tab !== "balance" && (
          <>
            <Segmented value={grain} options={GRAINS} onChange={setGrain} />
            <label className="flex flex-col gap-1 text-xs text-fg-muted">
              From
              <input
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
                className={dateInputClass}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-fg-muted">
              To
              <input
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
                className={dateInputClass}
              />
            </label>
          </>
        )}
      </div>

      {tab === "income" && <IncomeReport from={from} to={to} grain={grain} />}
      {tab === "cashflow" && (
        <CashflowReport from={from} to={to} grain={grain} />
      )}
      {tab === "balance" && <BalanceReport />}
    </main>
  );
}

// ─── Income / Expense (P&L) ──────────────────────────────────────────────────

function IncomeReport({
  from,
  to,
  grain,
}: {
  from: string;
  to: string;
  grain: Grain;
}) {
  const q = trpc.reports.incomeStatement.useQuery({ from, to, grain });
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <Failed />;
  const { series, income, expense, totals } = q.data;
  const empty = income.length === 0 && expense.length === 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Income" value={totals.income} tone="pos" />
        <Stat label="Expenses" value={totals.expense} tone="neg" />
        <Stat label="Net" value={totals.net} tone="net" emphasize />
      </div>

      {empty ? (
        <Empty />
      ) : (
        <>
          <Card title={`Per ${grainNoun(grain)}`}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Income</TableHead>
                  <TableHead className="text-right">Expenses</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {series.map((p) => (
                  <TableRow key={p.key}>
                    <TableCell className="text-fg">{p.label}</TableCell>
                    <MoneyCell v={p.income} />
                    <MoneyCell v={p.expense} />
                    <MoneyCell v={p.net} bold />
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <BreakdownCard
              title="Income by category"
              rows={income}
              total={totals.income}
            />
            <BreakdownCard
              title="Expenses by category"
              rows={expense}
              total={totals.expense}
            />
          </div>
        </>
      )}
    </div>
  );
}

function BreakdownCard({
  title,
  rows,
  total,
}: {
  title: string;
  rows: { label: string; total: string }[];
  total: string;
}) {
  return (
    <Card title={title}>
      {rows.length === 0 ? (
        <p className="p-3 text-sm text-fg-muted">Nothing categorized yet.</p>
      ) : (
        <Table>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.label}>
                <TableCell className="text-fg">{r.label}</TableCell>
                <MoneyCell v={r.total} />
              </TableRow>
            ))}
            <TableRow className="border-t-2 border-border">
              <TableCell className="font-semibold text-fg">Total</TableCell>
              <MoneyCell v={total} bold />
            </TableRow>
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

// ─── Cashflow ────────────────────────────────────────────────────────────────

function CashflowReport({
  from,
  to,
  grain,
}: {
  from: string;
  to: string;
  grain: Grain;
}) {
  const q = trpc.reports.cashFlowSeries.useQuery({ from, to, grain });
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <Failed />;
  const { series, totals } = q.data;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Money in" value={totals.inflow} tone="pos" />
        <Stat label="Money out" value={totals.outflow} tone="neg" />
        <Stat label="Net flow" value={totals.net} tone="net" emphasize />
      </div>

      {series.length === 0 ? (
        <Empty />
      ) : (
        <Card title={`Per ${grainNoun(grain)}`}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">In</TableHead>
                <TableHead className="text-right">Out</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead className="text-right">Running</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {series.map((p) => (
                <TableRow key={p.key}>
                  <TableCell className="text-fg">{p.label}</TableCell>
                  <MoneyCell v={p.inflow} />
                  <MoneyCell v={p.outflow} />
                  <MoneyCell v={p.net} bold />
                  <MoneyCell v={p.running} />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

// ─── Balance Sheet ───────────────────────────────────────────────────────────

function BalanceReport() {
  const q = trpc.reports.balanceSheet.useQuery();
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <Failed />;
  const { assets, liabilities, totalAssets, totalLiabilities, netWorth } =
    q.data;

  return (
    <div className="space-y-4">
      <p className="text-xs text-fg-subtle">
        Point-in-time snapshot — current marked positions &amp; balances (as of
        today).
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Assets" value={totalAssets} tone="pos" />
        <Stat label="Liabilities" value={totalLiabilities} tone="neg" />
        <Stat label="Net worth" value={netWorth} tone="net" emphasize />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Assets">
          <Table>
            <TableBody>
              {assets.map((a) => (
                <TableRow key={a.label}>
                  <TableCell className="text-fg">{a.label}</TableCell>
                  <MoneyCell v={a.amount} />
                </TableRow>
              ))}
              <TableRow className="border-t-2 border-border">
                <TableCell className="font-semibold text-fg">
                  Total assets
                </TableCell>
                <MoneyCell v={totalAssets} bold />
              </TableRow>
            </TableBody>
          </Table>
        </Card>

        <Card title="Liabilities">
          <Table>
            <TableBody>
              {liabilities.length === 0 ? (
                <TableRow>
                  <TableCell className="text-fg-muted">None</TableCell>
                  <TableCell />
                </TableRow>
              ) : (
                liabilities.map((l) => (
                  <TableRow key={l.label}>
                    <TableCell className="text-fg">{l.label}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-danger">
                      {formatUsd(l.amount)}
                    </TableCell>
                  </TableRow>
                ))
              )}
              <TableRow className="border-t-2 border-border">
                <TableCell className="font-semibold text-fg">
                  Total liabilities
                </TableCell>
                <TableCell className="text-right font-mono font-semibold tabular-nums text-danger">
                  {formatUsd(totalLiabilities)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}

// ─── Shared bits ─────────────────────────────────────────────────────────────

const dateInputClass = cn(
  "h-9 rounded-md border border-input bg-surface px-2 text-sm text-fg outline-none",
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-base",
);

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-border bg-base p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded px-3 py-1 text-sm outline-none transition-colors",
            value === o.value
              ? "bg-accent font-medium text-primary-foreground"
              : "text-fg-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-border bg-card">
      <div className="border-b border-border px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
        {title}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
  emphasize,
}: {
  label: string;
  value: string;
  tone: "pos" | "neg" | "net";
  emphasize?: boolean;
}) {
  const neg = value.startsWith("-");
  const color =
    tone === "net"
      ? neg
        ? "text-danger"
        : "text-accent-bright"
      : tone === "pos"
        ? "text-fg"
        : "text-danger";
  return (
    <div
      className={cn(
        "rounded-md border bg-card p-4",
        emphasize ? "border-accent/40" : "border-border",
      )}
    >
      <div className="text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 font-mono tabular-nums",
          emphasize ? "text-2xl font-semibold" : "text-xl",
          color,
        )}
      >
        {formatUsd(value)}
      </div>
    </div>
  );
}

function MoneyCell({ v, bold }: { v: string; bold?: boolean }) {
  const neg = v.startsWith("-");
  return (
    <TableCell
      className={cn(
        "text-right font-mono tabular-nums",
        neg ? "text-danger" : "text-fg",
        bold && "font-semibold",
      )}
    >
      {formatUsd(v)}
    </TableCell>
  );
}

function grainNoun(g: Grain): string {
  return g === "week"
    ? "week"
    : g === "biweekly"
      ? "two weeks"
      : g === "month"
        ? "month"
        : "quarter";
}

function Loading() {
  return <p className="p-4 text-sm text-fg-muted">Loading…</p>;
}
function Failed() {
  return <p className="p-4 text-sm text-danger">Failed to load report.</p>;
}
function Empty() {
  return (
    <p className="rounded-md border border-border bg-card p-6 text-sm text-fg-muted">
      Nothing in this window yet — categorize some transactions in this date
      range, then check back.
    </p>
  );
}
