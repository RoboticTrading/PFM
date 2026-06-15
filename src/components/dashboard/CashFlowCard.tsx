import { formatUsd } from "@/lib/money";
import { cn } from "@/lib/utils";

export interface CashFlowData {
  income: string;
  expense: string;
  net: string;
}

function Row({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-fg-muted">{label}</span>
      <span className={cn("font-mono tabular-nums", tone)}>
        {formatUsd(value)}
      </span>
    </div>
  );
}

/** Income vs expense for a period. */
export function CashFlowCard({
  label,
  data,
}: {
  label: string;
  data: CashFlowData;
}) {
  const netNeg = data.net.startsWith("-");
  return (
    <section className="rounded-md border border-border bg-card p-5">
      <div className="text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
        Cash flow · {label}
      </div>
      <div className="mt-3 space-y-1.5">
        <Row label="Income" value={data.income} tone="text-success" />
        <Row label="Expense" value={data.expense} tone="text-danger" />
        <div className="my-2 h-px bg-border" />
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-fg">Net</span>
          <span
            className={cn(
              "font-mono text-lg tabular-nums",
              netNeg ? "text-danger" : "text-accent-bright",
            )}
          >
            {formatUsd(data.net)}
          </span>
        </div>
      </div>
    </section>
  );
}
