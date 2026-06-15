"use client";

import Link from "next/link";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc/client";

import { BalanceCell } from "./BalanceCell";
import { KindBadge } from "./KindBadge";

/** The Accounts Explorer register — dense, keyboard-navigable, drill-in rows. */
export function AccountsTable() {
  const { data, isLoading, isError } = trpc.accounts.list.useQuery();

  if (isLoading) {
    return <p className="p-4 text-sm text-fg-muted">Loading accounts…</p>;
  }
  if (isError) {
    return <p className="p-4 text-sm text-danger">Failed to load accounts.</p>;
  }
  if (!data || data.length === 0) {
    return (
      <p className="p-4 text-sm text-fg-muted">
        No accounts registered. Run <code className="font-mono">pnpm db:seed</code>.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Account</TableHead>
          <TableHead>Institution</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Source</TableHead>
          <TableHead className="text-right">Balance</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((a) => (
          <TableRow key={a.id} className="group">
            <TableCell className="font-medium">
              <Link
                href={`/accounts/${a.id}`}
                className="text-fg outline-none group-hover:text-accent-bright focus-visible:text-accent-bright focus-visible:underline"
              >
                {a.name}
              </Link>
            </TableCell>
            <TableCell className="text-fg-muted">{a.institutionName}</TableCell>
            <TableCell>
              <KindBadge kind={a.kind} />
            </TableCell>
            <TableCell className="font-mono text-xs text-fg-subtle">
              {a.sourceSchema}.{a.sourceView}
            </TableCell>
            <TableCell className="text-right">
              <BalanceCell accountId={a.id} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
