"use client";

import { formatUsd } from "@/lib/money";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

/**
 * Live account balance, right-aligned and mono (register style). Concurrent
 * instances batch into one request via httpBatchLink. Colored by sign.
 */
export function BalanceCell({ accountId }: { accountId: string }) {
  const { data, isLoading, isError } = trpc.balances.forAccount.useQuery({
    accountId,
  });

  if (isLoading) {
    return <span className="font-mono text-xs text-fg-subtle">…</span>;
  }
  if (isError || !data) {
    return <span className="font-mono text-xs text-danger">err</span>;
  }

  const negative = data.balance.startsWith("-");
  return (
    <span
      className={cn(
        "font-mono text-sm tabular-nums",
        negative ? "text-danger" : "text-fg",
      )}
    >
      {formatUsd(data.balance)}
    </span>
  );
}
