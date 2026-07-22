/**
 * Schwab token storage — PFM's `financialmanager.schwab_token` row (the record of
 * truth) plus a transitional mirror to the shared `tokens.json` file.
 *
 * The mirror keeps the legacy prop-desk consumers (Schwab transaction-fetch,
 * ACCT_ACTIVITY) working unchanged during the handoff — same file, same format
 * their client reads. Enabled by SCHWAB_TOKENS_FILE; drops away once those
 * consumers move to PFM too.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { schwabToken } from "@/lib/db/schema";

import type { SchwabTokenResponse } from "./oauth";

function mirrorToFile(
  dict: SchwabTokenResponse,
  accessIssuedIso: string,
  refreshIssuedIso: string,
): void {
  const file = process.env.SCHWAB_TOKENS_FILE;
  if (!file) return;
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(
      file,
      `${JSON.stringify(
        {
          access_token_issued: accessIssuedIso,
          refresh_token_issued: refreshIssuedIso,
          token_dictionary: dict,
        },
        null,
        2,
      )}\n`,
    );
  } catch (e) {
    console.warn("[schwab] compat tokens.json mirror failed:", e);
  }
}

export interface StoredToken {
  refreshToken: string | null;
  accessTokenIssued: Date | null;
  refreshTokenIssued: Date | null;
}

export async function loadToken(): Promise<StoredToken | null> {
  const rows = await getDb().select().from(schwabToken).limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    refreshToken: r.refreshToken,
    accessTokenIssued: r.accessTokenIssued,
    refreshTokenIssued: r.refreshTokenIssued,
  };
}

/** Persist a fresh authorization (both tokens new) — called by the callback. */
export async function saveNewGrant(dict: SchwabTokenResponse): Promise<void> {
  const now = new Date();
  const iso = now.toISOString();
  await getDb()
    .insert(schwabToken)
    .values({
      id: 1,
      accessToken: dict.access_token,
      refreshToken: dict.refresh_token,
      accessTokenIssued: now,
      refreshTokenIssued: now,
      tokenDictionary: dict as unknown as Record<string, unknown>,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: schwabToken.id,
      set: {
        accessToken: dict.access_token,
        refreshToken: dict.refresh_token,
        accessTokenIssued: now,
        refreshTokenIssued: now,
        tokenDictionary: dict as unknown as Record<string, unknown>,
        updatedAt: now,
      },
    });
  mirrorToFile(dict, iso, iso);
}

/** Persist an access-token refresh — called by the refresher. */
export async function saveRefresh(
  dict: SchwabTokenResponse,
  refreshIssued: Date,
): Promise<void> {
  const now = new Date();
  await getDb()
    .update(schwabToken)
    .set({
      accessToken: dict.access_token,
      // Schwab returns the same refresh token within the 7-day window; store it
      // verbatim so a rotation (if it ever happens) is captured.
      refreshToken: dict.refresh_token,
      accessTokenIssued: now,
      tokenDictionary: dict as unknown as Record<string, unknown>,
      updatedAt: now,
    })
    .where(sql`${schwabToken.id} = 1`);
  mirrorToFile(dict, now.toISOString(), refreshIssued.toISOString());
}

export interface TokenStatus {
  exists: boolean;
  accessTokenIssued: string | null;
  refreshTokenIssued: string | null;
  checkedAt: string | null;
}

/** Status for the System page — never throws (degrades to exists:false). */
export async function tokenStatus(): Promise<TokenStatus> {
  try {
    const rows = await getDb().select().from(schwabToken).limit(1);
    const r = rows[0];
    if (!r || !r.refreshToken) {
      return {
        exists: false,
        accessTokenIssued: null,
        refreshTokenIssued: null,
        checkedAt: null,
      };
    }
    return {
      exists: true,
      accessTokenIssued: r.accessTokenIssued?.toISOString() ?? null,
      refreshTokenIssued: r.refreshTokenIssued?.toISOString() ?? null,
      checkedAt: r.updatedAt?.toISOString() ?? null,
    };
  } catch {
    return {
      exists: false,
      accessTokenIssued: null,
      refreshTokenIssued: null,
      checkedAt: null,
    };
  }
}
