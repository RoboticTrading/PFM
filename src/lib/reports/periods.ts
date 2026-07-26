/**
 * Period windowing for the accounting reports — the Week / Bi-Weekly / Monthly /
 * Quarterly grains Bob wants to slice Income/Expense + Cashflow by.
 *
 * Pure, UTC-anchored ISO-date math (no timezone drift, no `Date.now`): every
 * function takes explicit `YYYY-MM-DD` strings and returns them, so it's fully
 * deterministic and unit-testable. Weeks are Monday-started; bi-weekly blocks are
 * anchored to the Monday on/2before the range start; months and quarters are the
 * natural calendar boundaries.
 */

export type Grain = "week" | "biweekly" | "month" | "quarter";

export const GRAINS: { value: Grain; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "biweekly", label: "Bi-Weekly" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
];

export interface Period {
  /** Stable id, e.g. "2026-07", "2026-Q3", or the block's start date. */
  key: string;
  /** Human label, e.g. "Jul 2026", "Q3 2026", "Jul 21 – 27". */
  label: string;
  /** Inclusive ISO start (YYYY-MM-DD). */
  from: string;
  /** Inclusive ISO end (YYYY-MM-DD). */
  to: string;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Hard ceiling on generated periods so an absurd range (weekly over decades) can't blow up. */
const MAX_PERIODS = 400;

// --- UTC ISO helpers (parse at UTC midnight → no local-tz shifting) --------

function parse(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}
function fmt(dt: Date): string {
  return dt.toISOString().slice(0, 10);
}
function addDays(iso: string, n: number): string {
  const dt = parse(iso);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fmt(dt);
}
/** The Monday on/before a date (Monday-started weeks). */
function mondayOf(iso: string): string {
  const dt = parse(iso);
  const dow = (dt.getUTCDay() + 6) % 7; // 0 = Monday
  dt.setUTCDate(dt.getUTCDate() - dow);
  return fmt(dt);
}
function firstOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}
/** Last calendar day of the month containing `iso`. */
function lastOfMonth(iso: string): string {
  const dt = parse(firstOfMonth(iso));
  dt.setUTCMonth(dt.getUTCMonth() + 1);
  dt.setUTCDate(0);
  return fmt(dt);
}

function weekLabel(from: string, to: string): string {
  const a = parse(from);
  const b = parse(to);
  const m1 = MONTHS[a.getUTCMonth()];
  const m2 = MONTHS[b.getUTCMonth()];
  const d1 = a.getUTCDate();
  const d2 = b.getUTCDate();
  return m1 === m2 ? `${m1} ${d1} – ${d2}` : `${m1} ${d1} – ${m2} ${d2}`;
}

/**
 * The ordered list of periods that overlap `[from, to]` at the given grain.
 * Period boundaries are natural (calendar month/quarter, Monday weeks); the first
 * and last may extend slightly beyond the requested range — bucketing still only
 * counts rows whose date is inside a period, so nothing outside the range leaks in
 * (the caller passes the same range to the SQL filter).
 */
export function buildPeriods(
  range: { from: string; to: string },
  grain: Grain,
): Period[] {
  if (range.from > range.to) return [];
  const out: Period[] = [];

  if (grain === "week" || grain === "biweekly") {
    const span = grain === "week" ? 7 : 14;
    let start = mondayOf(range.from);
    while (start <= range.to && out.length < MAX_PERIODS) {
      const end = addDays(start, span - 1);
      out.push({ key: start, label: weekLabel(start, end), from: start, to: end });
      start = addDays(end, 1);
    }
    return out;
  }

  if (grain === "month") {
    let cursor = firstOfMonth(range.from);
    while (cursor <= range.to && out.length < MAX_PERIODS) {
      const end = lastOfMonth(cursor);
      const dt = parse(cursor);
      out.push({
        key: cursor.slice(0, 7),
        label: `${MONTHS[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`,
        from: cursor,
        to: end,
      });
      cursor = addDays(end, 1);
    }
    return out;
  }

  // quarter
  const startDt = parse(firstOfMonth(range.from));
  let y = startDt.getUTCFullYear();
  let q = Math.floor(startDt.getUTCMonth() / 3); // 0..3
  while (out.length < MAX_PERIODS) {
    const from = `${y}-${String(q * 3 + 1).padStart(2, "0")}-01`;
    if (from > range.to) break;
    const to = lastOfMonth(`${y}-${String(q * 3 + 3).padStart(2, "0")}-01`);
    out.push({ key: `${y}-Q${q + 1}`, label: `Q${q + 1} ${y}`, from, to });
    q += 1;
    if (q > 3) {
      q = 0;
      y += 1;
    }
  }
  return out;
}

/**
 * Index of the period containing `date`, or -1 if before the first / after the
 * last. Periods are contiguous and sorted, so a binary search on `from` finds it.
 */
export function periodIndexOf(periods: Period[], date: string): number {
  let lo = 0;
  let hi = periods.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (periods[mid].from <= date) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (found === -1) return -1;
  return date <= periods[found].to ? found : -1;
}
