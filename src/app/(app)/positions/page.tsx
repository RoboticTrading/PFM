import { PositionsTable } from "@/components/positions/PositionsTable";

export const metadata = { title: "Positions — PFM" };

export default function PositionsPage() {
  return (
    <main className="px-8 py-6">
      <header className="mb-5">
        <h1 className="font-display text-2xl font-semibold tracking-wide text-accent">
          Positions
        </h1>
        <p className="text-sm text-fg-muted">
          Trade position history (read-only) — fill pairing arrives in Phase 6.
        </p>
      </header>
      <div className="rounded-md border border-border bg-surface">
        <PositionsTable />
      </div>
    </main>
  );
}
