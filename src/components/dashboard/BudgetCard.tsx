import { formatUsd } from "@/lib/money";
import { cn } from "@/lib/utils";

export interface BudgetRow {
  categoryId: string;
  categoryName: string;
  budget: string;
  actual: string;
  variance: string;
}

/** Budget vs actual for a period — per-category with variance. */
export function BudgetCard({
  label,
  rows,
}: {
  label: string;
  rows: BudgetRow[];
}) {
  return (
    <section className="rounded-md border border-border bg-card p-5">
      <div className="text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
        Budget vs actual · {label}
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-fg-muted">No budgets set for this period.</p>
      ) : (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-fg-subtle">
              <th className="text-left font-medium">Category</th>
              <th className="text-right font-medium">Budget</th>
              <th className="text-right font-medium">Actual</th>
              <th className="text-right font-medium">Variance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const varNeg = r.variance.startsWith("-");
              return (
                <tr key={r.categoryId} className="border-t border-border">
                  <td className="py-1.5 text-fg">{r.categoryName}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums text-fg-muted">
                    {formatUsd(r.budget)}
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums text-fg-muted">
                    {formatUsd(r.actual)}
                  </td>
                  <td
                    className={cn(
                      "py-1.5 text-right font-mono tabular-nums",
                      varNeg ? "text-danger" : "text-success",
                    )}
                  >
                    {formatUsd(r.variance)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
