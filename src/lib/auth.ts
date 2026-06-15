/**
 * PIN gate for LAN access (single-user). Edge-safe (no node:crypto) so the
 * middleware can import it. The session cookie holds the configured
 * `PFM_SESSION_SECRET`, set only after the correct `PFM_PIN` is entered; the
 * gate is "valid secret cookie present". httpOnly + LAN-only (never public).
 */

export const AUTH_COOKIE = "pfm_auth";

function pin(): string {
  return process.env.PFM_PIN ?? "";
}

function secret(): string {
  return process.env.PFM_SESSION_SECRET ?? "";
}

/** True if `candidate` matches the configured PIN (and a PIN is configured). */
export function verifyPin(candidate: string): boolean {
  const expected = pin();
  return expected.length > 0 && candidate === expected;
}

/** The value to store in the auth cookie after a successful PIN entry. */
export function sessionValue(): string {
  return secret();
}

/** True if the cookie value proves an authenticated session. */
export function isAuthed(cookieValue: string | undefined): boolean {
  const s = secret();
  return s.length > 0 && cookieValue === s;
}

/** Whether the gate is configured at all (PIN + session secret present). */
export function authConfigured(): boolean {
  return pin().length > 0 && secret().length > 0;
}
