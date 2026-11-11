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

/**
 * The banker's local calendar day of a Data Cloud date or timestamp, as YYYY-MM-DD.
 *
 * DC returns timestamps in UTC ("2026-11-07 06:27:05.000 UTC"), so slicing the
 * first ten characters gives the UTC day: a bonus that posted on the evening of
 * Nov 6 in Los Angeles read as Nov 7. Date-only values pass through unchanged.
 *
 * A timestamp CAST to VARCHAR comes back in other shapes too, none of which
 * `Date` parses as-is: "2026-11-11 06:59:59+00", "2026-11-11 14:57:48.693364+00"
 * and "2026-11-11 00:00:00.000 Z". A value at exactly midnight UTC is a DATE
 * column stored as a timestamp (trade_date__c), so it keeps its calendar date
 * instead of moving to the evening before west of UTC.
 */
export const localDay = (v: unknown): string => {
  const s = String(v ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const iso = s
    .replace(' ', 'T')
    .replace(/ ?(UTC|Z)$/, 'Z')
    .replace(/([+-]\d{2})$/, '$1:00')
    .replace(/(\.\d{3})\d+/, '$1');
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return s.slice(0, 10);
  return d.getUTCHours() + d.getUTCMinutes() + d.getUTCSeconds() + d.getUTCMilliseconds() === 0
    ? d.toISOString().slice(0, 10)
    : localIsoDate(d);
};
