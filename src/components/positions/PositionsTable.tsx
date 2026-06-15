"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatUsd } from "@/lib/money";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

/**
 * Positions artifact — read-only view of trade_analysis.position_history. Phase
 * 6 builds PFM's own fill-pairing on top; this is the navigable spine for now.
 */
export function PositionsTable() {
  const { data, isLoading, isError } = trpc.positions.history.useQuery({
    openOnly: false,
    limit: 100,
  });

  if (isLoading) return <p className="p-4 text-sm text-fg-muted">Loading…</p>;
  if (isError) return <p className="p-4 text-sm text-danger">Failed to load.</p>;
  if (!data || data.length === 0) {
    return <p className="p-4 text-sm text-fg-muted">No position history.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Underlying</TableHead>
          <TableHead>Strategy</TableHead>
          <TableHead>Opened</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Net P&amp;L</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((p) => {
          const pnl = p.netPnl ?? "0";
          const negative = pnl.startsWith("-");
          return (
            <TableRow key={p.positionId}>
              <TableCell className="font-medium text-fg">
                {p.underlying ?? "—"}
              </TableCell>
              <TableCell className="text-fg-muted">
                {p.strategyType ?? "—"}
              </TableCell>
              <TableCell className="font-mono text-xs text-fg-muted">
                {p.openDate ?? "—"}
              </TableCell>
              <TableCell className="text-xs uppercase tracking-wide text-fg-subtle">
                {p.isClosed ? "closed" : "open"}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right font-mono text-sm tabular-nums",
                  negative ? "text-danger" : "text-success",
                )}
              >
                {formatUsd(pnl)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
