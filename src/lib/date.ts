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

/** The calendar-month window containing `now` (injectable for tests). */
export function currentMonth(now: Date = new Date()): MonthWindow {
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-based
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
