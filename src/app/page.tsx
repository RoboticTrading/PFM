import Link from "next/link";

import { ThemedCard } from "@/components/theme/ThemedCard";
import { APP } from "@/lib/version";

export default function Home() {
  return (
    <main className="min-h-screen bg-base p-8">
      <h1 className="font-display text-3xl font-semibold uppercase tracking-wide text-accent">
        {APP.toUpperCase()}
      </h1>
      <p className="mt-1 text-sm text-fg-muted">Personal Financial Manager</p>
      <div className="mt-6 max-w-md">
        <ThemedCard title="Walnut &amp; Brass">
          <p>Token-driven cockpit. Start with the artifacts:</p>
          <Link
            href="/accounts"
            className="mt-3 inline-block text-accent hover:text-accent-bright"
          >
            → Accounts
          </Link>
        </ThemedCard>
      </div>
    </main>
  );
}
