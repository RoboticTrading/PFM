import { formatUsd } from "@/lib/money";
import { cn } from "@/lib/utils";

export interface NetWorthData {
  total: string;
  byAccount: { accountId: string; name: string; balance: string }[];
}

/** Net worth headline + per-account breakdown (dense). */
export function NetWorthCard({ data }: { data: NetWorthData }) {
  const negative = data.total.startsWith("-");
  return (
    <section className="rounded-md border border-border bg-card p-5">
      <div className="text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
        Net worth
      </div>
      <div
        className={cn(
          "mt-1 font-mono text-3xl tabular-nums",
          negative ? "text-danger" : "text-accent-bright",
        )}
      >
        {formatUsd(data.total)}
      </div>
      <ul className="mt-4 space-y-1">
        {data.byAccount.map((a) => {
          const neg = a.balance.startsWith("-");
          return (
            <li
              key={a.accountId}
              className="flex items-center justify-between text-sm"
            >
              <span className="text-fg-muted">{a.name}</span>
              <span
                className={cn(
                  "font-mono tabular-nums",
                  neg ? "text-danger" : "text-fg",
                )}
              >
                {formatUsd(a.balance)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
