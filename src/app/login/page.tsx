import { LoginForm } from "@/components/auth/LoginForm";

export const metadata = { title: "Unlock — PFM" };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-base p-8">
      <div className="w-full max-w-xs rounded-md border border-border bg-card p-6">
        <h1 className="font-display text-2xl font-semibold tracking-wide text-accent">
          PFM
        </h1>
        <p className="mt-1 mb-5 text-sm text-fg-muted">
          Personal Financial Manager — LAN only.
        </p>
        <LoginForm />
      </div>
    </main>
  );
}
