/**
 * Schwab OAuth2 — authorization-code + refresh-token, raw (no SDK, no Python).
 *
 * The whole flow is three HTTP calls:
 *   authorize (browser redirect) → exchange code → refresh access token.
 * PFM owns the Schwab token now; this is the only place that talks OAuth to Schwab.
 */

const AUTH_URL = "https://api.schwabapi.com/v1/oauth/authorize";
const TOKEN_URL = "https://api.schwabapi.com/v1/oauth/token";

export interface SchwabTokenResponse {
  access_token: string;
  refresh_token: string;
  id_token?: string;
  token_type: string;
  scope?: string;
  expires_in: number;
}

function creds(): { key: string; basic: string } {
  const key = process.env.SCHWAB_APP_KEY ?? "";
  const secret = process.env.SCHWAB_APP_SECRET ?? "";
  return { key, basic: Buffer.from(`${key}:${secret}`).toString("base64") };
}

/** The registered redirect URI (must match the Schwab developer app exactly). */
export function callbackUrl(): string {
  return (
    process.env.SCHWAB_CALLBACK_URL ??
    "https://callback.bolivardrive.com/callback"
  );
}

/** Where the browser goes to start the manual re-auth. */
export function authorizeUrl(): string {
  const { key } = creds();
  return `${AUTH_URL}?client_id=${key}&redirect_uri=${encodeURIComponent(callbackUrl())}`;
}

async function tokenPost(
  body: Record<string, string>,
): Promise<SchwabTokenResponse> {
  const { basic } = creds();
  // Server-side call to Schwab's external OAuth token endpoint (not app data); the
  // no-raw-fetch guardrail targets UI/data code.
  // eslint-disable-next-line no-restricted-syntax
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body).toString(),
  });
  if (!resp.ok) {
    throw new Error(`Schwab token HTTP ${resp.status}: ${await resp.text()}`);
  }
  return (await resp.json()) as SchwabTokenResponse;
}

/**
 * Schwab URL-encodes the trailing `@` in the auth code as `%40`; the code sent
 * to the token endpoint must end with a literal `@`.
 */
export function normalizeCode(raw: string): string {
  if (raw.includes("%40")) return raw.replace(/%40/g, "@");
  if (!raw.includes("@")) return `${raw}@`;
  return raw;
}

/** Exchange a fresh authorization code for the initial token pair. */
export function exchangeCode(code: string): Promise<SchwabTokenResponse> {
  return tokenPost({
    grant_type: "authorization_code",
    code,
    redirect_uri: callbackUrl(),
  });
}

/** Refresh the 30-minute access token using the 7-day refresh token. */
export function refreshAccess(
  refreshToken: string,
): Promise<SchwabTokenResponse> {
  return tokenPost({ grant_type: "refresh_token", refresh_token: refreshToken });
}
