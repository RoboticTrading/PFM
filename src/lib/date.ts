export interface MonthWindow {
  /** "YYYY-MM" (budget period). */
  period: string;
  /** First day, ISO. */
  from: string;
  /** Last day, ISO. */
  to: string;
  /** Human label, e.g. "August 2099". */
  label: string;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** The window for a given year + 0-based month (normalizes overflow/underflow). */
export function monthWindow(year: number, monthZeroBased: number): MonthWindow {
  const d = new Date(year, monthZeroBased, 1);
  const y = d.getFullYear();
  const m = d.getMonth(); // 0-based, normalized
  const mm = String(m + 1).padStart(2, "0");
  const period = `${y}-${mm}`;
  const lastDay = new Date(y, m + 1, 0).getDate();
  return {
    period,
    from: `${period}-01`,
    to: `${period}-${String(lastDay).padStart(2, "0")}`,
    label: `${MONTHS[m]} ${y}`,
  };
}

/** The calendar-month window containing `now` (injectable for tests). */
export function currentMonth(now: Date = new Date()): MonthWindow {
  return monthWindow(now.getFullYear(), now.getMonth());
}

/** Shift a month window by `delta` months (e.g. −1 = previous month). */
export function shiftMonth(w: MonthWindow, delta: number): MonthWindow {
  const [y, m] = w.period.split("-").map(Number);
  return monthWindow(y, m - 1 + delta);
}
