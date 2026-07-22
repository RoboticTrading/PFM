/**
 * Schwab token refresher (LAN-only daemon — the "singleton").
 *
 * The ONE process that refreshes the Schwab access token: every cycle it reads
 * the refresh token from financialmanager.schwab_token, exchanges it for a fresh
 * access token (Schwab access tokens live 30 min), and persists the result (+ the
 * transitional tokens.json mirror). Idle-safe: if no token is stored yet (before
 * the first manual re-auth via the callback) it just waits.
 *
 * Replaces the prop-desk schwab_token_singleton — no schwab_client, no Python.
 * Run: `tsx src/services/schwab/refresher.ts`.
 */
import { refreshAccess } from "@/lib/schwab/oauth";
import { loadToken, saveRefresh } from "@/lib/schwab/store";

// Refresh comfortably inside the 30-min access-token TTL (default every 20 min).
const POLL_MS = Number(process.env.SCHWAB_REFRESH_SECONDS ?? 1200) * 1000;

let stop = false;
for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    console.log(`[schwab-refresher] got ${sig} — shutting down`);
    stop = true;
  });
}

async function cycle(): Promise<void> {
  const tok = await loadToken();
  if (!tok?.refreshToken) {
    console.log(
      "[schwab-refresher] no refresh token yet — waiting for a manual re-auth via the callback",
    );
    return;
  }
  try {
    const dict = await refreshAccess(tok.refreshToken);
    await saveRefresh(dict, tok.refreshTokenIssued ?? new Date());
    console.log("[schwab-refresher] access token refreshed");
  } catch (e) {
    // A hard failure here usually means the 7-day refresh token expired →
    // a manual re-auth (the button) is needed. Log loudly, keep looping.
    console.warn("[schwab-refresher] refresh failed:", e);
  }
}

async function main(): Promise<void> {
  console.log(`[schwab-refresher] up — refreshing every ${POLL_MS / 1000}s`);
  while (!stop) {
    await cycle();
    let slept = 0;
    while (slept < POLL_MS && !stop) {
      await new Promise((r) => setTimeout(r, 5000));
      slept += 5000;
    }
  }
  console.log("[schwab-refresher] exited cleanly");
  process.exit(0);
}

void main();
