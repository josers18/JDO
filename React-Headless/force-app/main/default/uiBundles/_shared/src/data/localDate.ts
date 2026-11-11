/**
 * The banker's local calendar date `days` from `now`, as YYYY-MM-DD.
 *
 * Queue due dates are calendar days in the banker's time zone. Formatting local
 * midnight with `toISOString()` converts it to UTC first, which moves the date a
 * day early anywhere east of UTC (in Tokyo, Nov 11 + 2 came out 2026-11-12).
 */
export const localIsoDate = (now: Date = new Date(), days = 0): string => {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
