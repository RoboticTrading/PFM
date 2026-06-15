"use client";

import Link from "next/link";

import { TransactionRegister } from "@/components/transactions/TransactionRegister";
import { formatUsd } from "@/lib/money";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

import { KindBadge } from "./KindBadge";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
        {label}
      </dt>
      <dd className="text-sm text-fg">{value}</dd>
    </div>
  );
}

/** Account detail pane — meta + live balance breakdown (lineage-friendly). */
export function AccountDetail({ id }: { id: string }) {
  const account = trpc.accounts.byId.useQuery({ id });
  const balance = trpc.balances.forAccount.useQuery({ accountId: id });

  if (account.isLoading) {
    return <p className="text-sm text-fg-muted">Loading…</p>;
  }
  if (account.isError || !account.data) {
    return <p className="text-sm text-danger">Account not found.</p>;
  }
  const a = account.data;
  const negative = balance.data?.balance.startsWith("-");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-2xl font-semibold text-fg">{a.name}</h1>
        <KindBadge kind={a.kind} />
        {!a.active && <KindBadge kind="inactive" />}
      </div>

      <section className="rounded-md border border-border bg-card p-5">
        <div className="text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
          Current balance
        </div>
        <div
          className={cn(
            "mt-1 font-mono text-3xl tabular-nums",
            negative ? "text-danger" : "text-accent-bright",
          )}
        >
          {balance.data ? formatUsd(balance.data.balance) : "…"}
        </div>
        {balance.data && (
          <p className="mt-2 text-xs text-fg-subtle">
            forward {formatUsd(balance.data.forward)}
            {balance.data.asOfDate ? ` as of ${balance.data.asOfDate}` : " (none set)"}
            {" + since "}
            {formatUsd(balance.data.since)}
          </p>
        )}
      </section>

      <dl className="grid grid-cols-2 gap-4 rounded-md border border-border bg-surface p-5 sm:grid-cols-3">
        <Field label="Institution" value={a.institutionName} />
        <Field label="Institution type" value={<KindBadge kind={a.institutionKind} />} />
        <Field label="Account type" value={<KindBadge kind={a.kind} />} />
        <Field
          label="Source"
          value={
            <span className="font-mono text-xs text-fg-muted">
              {a.sourceSchema}.{a.sourceView}
            </span>
          }
        />
      </dl>

      <section>
        <h2 className="mb-2 font-display text-lg font-semibold text-fg">
          Register
        </h2>
        <div className="rounded-md border border-border bg-surface">
          <TransactionRegister accountId={id} />
        </div>
      </section>

      <Link
        href="/accounts"
        className="inline-block text-sm text-accent hover:text-accent-bright"
      >
        ← All accounts
      </Link>
    </div>
  );
}
