"use client";

import { useState } from "react";

import { trpc } from "@/lib/trpc/client";

const MONEY_RE = /^-?\d+(\.\d+)?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Set an account's known balance as of a date — the anchor for
 * "current = forward + Σ since". Wraps the `balances.setForward` write.
 */
export function BalanceForwardForm({
  accountId,
  currentAsOf,
  currentAmount,
}: {
  accountId: string;
  currentAsOf: string | null;
  currentAmount: string;
}) {
  const [open, setOpen] = useState(false);
  const [asOfDate, setAsOfDate] = useState(currentAsOf ?? "");
  const [amount, setAmount] = useState(currentAmount);

  const utils = trpc.useUtils();
  const setForward = trpc.balances.setForward.useMutation({
    onSuccess: () => {
      void utils.balances.forAccount.invalidate({ accountId });
      setOpen(false);
    },
  });

  const valid = DATE_RE.test(asOfDate) && MONEY_RE.test(amount.trim());

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 text-xs text-accent outline-none hover:text-accent-bright focus-visible:text-accent-bright"
      >
        Set balance forward →
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) setForward.mutate({ accountId, asOfDate, amount: amount.trim() });
      }}
      className="mt-3 flex flex-wrap items-end gap-3 border-t border-border pt-3"
    >
      <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-fg-subtle">
        As of
        <input
          type="date"
          value={asOfDate}
          onChange={(e) => setAsOfDate(e.target.value)}
          className="rounded-md border border-border bg-base px-2 py-1 text-sm text-fg outline-none focus-visible:border-accent"
        />
      </label>
      <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-fg-subtle">
        Balance
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder="0.00"
          className="w-32 rounded-md border border-border bg-base px-2 py-1 text-right font-mono text-sm text-fg outline-none focus-visible:border-accent"
        />
      </label>
      <button
        type="submit"
        disabled={!valid || setForward.isPending}
        className="rounded-md bg-primary px-3 py-1 text-sm font-medium text-primary-foreground outline-none transition-colors hover:bg-accent-bright disabled:opacity-40"
      >
        {setForward.isPending ? "Saving…" : "Save"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="px-2 py-1 text-sm text-fg-muted outline-none hover:text-fg"
      >
        Cancel
      </button>
      {setForward.isError && (
        <span className="text-sm text-danger">Couldn’t save — check the values.</span>
      )}
    </form>
  );
}
