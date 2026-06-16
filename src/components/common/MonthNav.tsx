"use client";

/** Prev / current-label / next month stepper, shared by Reports + Budgets. */
export function MonthNav({
  label,
  onShift,
}: {
  label: string;
  onShift: (delta: number) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-md border border-border bg-base">
      <button
        type="button"
        aria-label="Previous month"
        onClick={() => onShift(-1)}
        className="px-2 py-1 text-fg-muted outline-none hover:text-accent focus-visible:text-accent"
      >
        ‹
      </button>
      <span className="min-w-[9rem] text-center text-sm font-medium text-fg">
        {label}
      </span>
      <button
        type="button"
        aria-label="Next month"
        onClick={() => onShift(1)}
        className="px-2 py-1 text-fg-muted outline-none hover:text-accent focus-visible:text-accent"
      >
        ›
      </button>
    </div>
  );
}
