"use client";

import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

/** The public callback service that drives the Schwab re-auth (bolivardrive). */
const CALLBACK_URL = "https://callback.bolivardrive.com";

function fmtTs(ts: string | null | undefined): string {
  if (!ts) return "never";
  return String(ts).slice(0, 19).replace("T", " ");
}

/**
 * Schwab token status + manual re-auth. The refresher keeps the access token
 * fresh automatically; the button is for the periodic (weekly) refresh-token
 * re-approval that Schwab requires. Moved here from the prop-desk System Health
 * page — PFM owns the Schwab token now.
 */
export function SchwabTokenCard() {
  const status = trpc.schwab.tokenStatus.useQuery(undefined, {
    refetchInterval: 15_000,
  });
  const t = status.data;
  const ok = t?.exists === true;

  return (
    <section className="rounded-md border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
            Schwab Token
          </div>
          <div
            className={cn(
              "mt-1 text-sm",
              ok ? "text-accent-bright" : "text-danger",
            )}
          >
            {ok ? "Active" : status.isLoading ? "Checking…" : "Missing or expired"}
          </div>
        </div>
        <a href={CALLBACK_URL} target="_blank" rel="noopener noreferrer">
          <Button variant="default" size="sm">
            Refresh Token
          </Button>
        </a>
      </div>

      <dl className="mt-4 space-y-1.5 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-fg-muted">Access token issued</dt>
          <dd className="font-mono tabular-nums text-fg">
            {fmtTs(t?.accessTokenIssued)}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-fg-muted">Refresh token issued</dt>
          <dd className="font-mono tabular-nums text-fg">
            {fmtTs(t?.refreshTokenIssued)}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-fg-muted">Last checked</dt>
          <dd className="font-mono tabular-nums text-fg-subtle">
            {fmtTs(t?.checkedAt)}
          </dd>
        </div>
      </dl>

      <p className="mt-4 text-xs leading-relaxed text-fg-subtle">
        The refresher keeps the 30-minute access token fresh automatically. Use
        Refresh Token for the weekly Schwab re-approval (opens the Schwab login).
      </p>
    </section>
  );
}
