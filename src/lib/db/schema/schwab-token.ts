import { integer, jsonb, text, timestamp } from "drizzle-orm/pg-core";

import { financialmanager } from "./_schema";
import { timestamps } from "./columns";

/**
 * The Schwab OAuth token PFM now owns.
 *
 * Moved off the prop-desk platform: PFM is the sole manager of the Schwab token
 * (the callback service seeds it after a manual re-auth; the refresher keeps the
 * 30-min access token fresh using the 7-day refresh token). A single row (id=1).
 *
 * `token_dictionary` holds the raw Schwab token response (access_token,
 * refresh_token, expires_in, scope, id_token) — the same shape the legacy
 * consumers read, so the refresher can mirror it to the shared tokens.json
 * during the transition. `updated_at` doubles as the "last checked" timestamp
 * for the System page status readout.
 */
export const schwabToken = financialmanager.table("schwab_token", {
  // Singleton: always id=1 (upserted). Not auto-increment — there is one token.
  id: integer("id").primaryKey().default(1),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenIssued: timestamp("access_token_issued", { withTimezone: true }),
  refreshTokenIssued: timestamp("refresh_token_issued", { withTimezone: true }),
  tokenDictionary: jsonb("token_dictionary").$type<Record<string, unknown>>(),
  ...timestamps,
});

export type SchwabToken = typeof schwabToken.$inferSelect;
export type NewSchwabToken = typeof schwabToken.$inferInsert;
