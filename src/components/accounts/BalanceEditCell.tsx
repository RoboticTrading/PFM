"use client";

import { Check, Pencil, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatUsd } from "@/lib/money";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

/** The fields the editor needs — a slice of the enriched ledger account. */
export interface EditableAccount {
  id: string; // account_key
  name: string;
  kind: string;
  balance: string;
  asOfDate: string | null;
  isLiability: boolean;
}

const MONEY_RE = /^-?\d+(\.\d+)?$/;
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Inline balance editor for one account. Display mode shows the current balance
 * (mono, sign-colored) with a hover-revealed edit affordance; edit mode swaps in
 * an amount + as-of-date field with Save / Cancel. Saving calls the audited
 * `accounts.setBalance` Action and invalidates every reader that shows a balance.
 */
export function BalanceEditCell({ account }: { account: EditableAccount }) {
  const utils = trpc.useUtils();
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(account.balance);
  const [asOf, setAsOf] = useState(account.asOfDate ?? today());

  const setBalance = trpc.accounts.setBalance.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.accounts.list.invalidate(),
        utils.accounts.byId.invalidate({ id: account.id }),
        utils.balances.forAccount.invalidate({ accountId: account.id }),
        utils.cube.netWorth.invalidate(),
        utils.cube.liquidity.invalidate(),
        utils.reports.invalidate(),
      ]);
      setEditing(false);
    },
  });

  const valid = MONEY_RE.test(amount.trim()) && /^\d{4}-\d{2}-\d{2}$/.test(asOf);

  function open() {
    setAmount(account.balance);
    setAsOf(account.asOfDate ?? today());
    setBalance.reset();
    setEditing(true);
  }

  function cancel() {
    setBalance.reset();
    setEditing(false);
  }

  function save() {
    if (!valid) return;
    setBalance.mutate({
      accountKey: account.id,
      balance: amount.trim(),
      asOfDate: asOf,
      isLiability: account.isLiability,
      kind: account.kind,
      name: account.name,
    });
  }

  if (!editing) {
    const negative = account.balance.startsWith("-");
    return (
      <div className="flex items-center justify-end gap-2">
        <span
          className={cn(
            "font-mono text-sm tabular-nums",
            negative ? "text-danger" : "text-fg",
          )}
        >
          {formatUsd(account.balance)}
        </span>
        <button
          type="button"
          onClick={open}
          aria-label={`Edit ${account.name} balance`}
          className="rounded p-1 text-fg-subtle opacity-0 outline-none transition-opacity hover:text-accent focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
        >
          <Pencil className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-1.5">
        <Input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") cancel();
          }}
          inputMode="decimal"
          aria-label="Balance amount"
          autoFocus
          className={cn(
            "h-8 w-32 text-right font-mono text-sm tabular-nums",
            !MONEY_RE.test(amount.trim()) && "border-danger",
          )}
        />
        <Input
          type="date"
          value={asOf}
          onChange={(e) => setAsOf(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") cancel();
          }}
          aria-label="As-of date"
          className="h-8 w-36 text-xs"
        />
        <Button
          type="button"
          size="icon"
          variant="default"
          onClick={save}
          disabled={!valid || setBalance.isPending}
          aria-label="Save balance"
          className="size-8"
        >
          <Check className="size-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={cancel}
          disabled={setBalance.isPending}
          aria-label="Cancel"
          className="size-8"
        >
          <X className="size-4" />
        </Button>
      </div>
      {setBalance.isError && (
        <span className="text-xs text-danger">Save failed — try again.</span>
      )}
    </div>
  );
}
