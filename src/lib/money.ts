/**
 * Decimal-safe money math. Amounts are fixed-precision strings (numeric(20,4)
 * in the DB); we never use floats — a wrong balance is worse than no app. Values
 * are scaled to integer "micro-units" (4 decimal places) and summed as BigInt.
 */

const SCALE = 4;
const SCALE_FACTOR = 10n ** BigInt(SCALE);

/** Parse a decimal string to a scaled BigInt (4dp). Throws on malformed input. */
export function toScaled(value: string): bigint {
  const trimmed = value.trim();
  const match = trimmed.match(/^(-)?(\d+)(?:\.(\d+))?$/);
  if (!match) throw new Error(`Invalid money value: "${value}"`);
  const [, sign, whole, frac = ""] = match;
  const fracPadded = (frac + "0".repeat(SCALE)).slice(0, SCALE);
  const magnitude = BigInt(whole) * SCALE_FACTOR + BigInt(fracPadded);
  return sign ? -magnitude : magnitude;
}

/** Format a scaled BigInt back to a fixed-precision decimal string. */
export function fromScaled(scaled: bigint): string {
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  const whole = abs / SCALE_FACTOR;
  const frac = (abs % SCALE_FACTOR).toString().padStart(SCALE, "0");
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

/** Sum money strings precisely. Empty → "0.0000". */
export function sumMoney(values: Array<string | null | undefined>): string {
  let total = 0n;
  for (const v of values) {
    if (v == null || v === "") continue;
    total += toScaled(v);
  }
  return fromScaled(total);
}

/** Add two money strings precisely. */
export function addMoney(a: string, b: string): string {
  return fromScaled(toScaled(a) + toScaled(b));
}

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/** Format a money string as USD for display, e.g. "-$1,234.56". */
export function formatUsd(value: string): string {
  const n = Number(value);
  return Number.isFinite(n) ? USD.format(n) : value;
}
