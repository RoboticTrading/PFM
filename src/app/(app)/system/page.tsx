import { SchwabTokenCard } from "@/components/system/SchwabTokenCard";

/**
 * System — connections + integrations PFM owns. Currently the Schwab OAuth token
 * (moved here from prop-desk); brokerage/bank connection health can join it here.
 */
export default function SystemPage() {
  return (
    <main className="px-8 py-6">
      <header className="mb-5">
        <h1 className="font-display text-2xl font-semibold tracking-wide text-accent">
          System
        </h1>
        <p className="text-sm text-fg-muted">Connections &amp; token health</p>
      </header>

      <div className="grid max-w-md gap-4">
        <SchwabTokenCard />
      </div>
    </main>
  );
}
