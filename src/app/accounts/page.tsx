import { AccountsTable } from "@/components/accounts/AccountsTable";

export const metadata = { title: "Accounts — PFM" };

export default function AccountsPage() {
  return (
    <main className="min-h-screen bg-base px-8 py-6">
      <header className="mb-5">
        <h1 className="font-display text-2xl font-semibold tracking-wide text-accent">
          Accounts
        </h1>
        <p className="text-sm text-fg-muted">
          The account registry — every balance traces to its source.
        </p>
      </header>
      <div className="rounded-md border border-border bg-surface">
        <AccountsTable />
      </div>
    </main>
  );
}
