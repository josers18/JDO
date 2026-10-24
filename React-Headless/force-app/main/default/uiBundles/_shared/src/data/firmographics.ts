/**
 * C5 — firmographic growth-tier mix from ZoomInfo (`BT_Zoominfo_Firmographics__dlm`,
 * monthly by `profile_month__c`): revenue-band and employee-band distribution of
 * the book, with the upmarket ($50M+) clients called out. `tech_stack_flags__c`
 * (comma list) turns into an integration-ready treasury pitch per client.
 *
 * Verified live 2026-10-22: Allen Carter's book 215 × $50M–$200M, 22 × $200M–$1B,
 * 6 × $1B+ of ~5.6K; Jose Sifontes' book is ~all <$1M (no upmarket clients).
 * Tech flags present: Salesforce, HubSpot, Marketo, Workday, Snowflake, AWS,
 * Tableau, Microsoft 365, Google Workspace, Slack, Zoom, Okta (no ERP flags).
 */
import { queryDataCloud, queryDataCloudForBook, type BookScope } from './dataCloudClient';

const LATEST = 'profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Zoominfo_Firmographics__dlm)';
const UPMARKET = "revenue_band__c IN ('$50M-$200M', '$200M-$1B', '$1B+')";
// Searched CASE only — DC SQL rejects the simple `CASE col WHEN …` form.
const BAND_RANK = "CASE WHEN revenue_band__c = '$1B+' THEN 3 WHEN revenue_band__c = '$200M-$1B' THEN 2 ELSE 1 END";

/** Smallest → largest. ZoomInfo's `<$1M` arrives HTML-escaped. */
export const REVENUE_BANDS = ['<$1M', '$1M-$10M', '$10M-$50M', '$50M-$200M', '$200M-$1B', '$1B+'] as const;
export const EMPLOYEE_BANDS = ['1-10', '11-50', '51-200', '201-1000', '1001-5000', '5001-25000', '25001+'] as const;

const upmarketSql = (accountFilter: string) => `
  SELECT account_id__c AS account_id, revenue_band__c AS revenue_band, employee_band__c AS employee_band,
         tech_stack_flags__c AS tech, industry_naics_code__c AS naics, hq_state_code__c AS state
  FROM BT_Zoominfo_Firmographics__dlm
  WHERE ${LATEST} AND ${UPMARKET}
    AND account_id__c ${accountFilter}
  ORDER BY ${BAND_RANK} DESC, CASE WHEN tech_stack_flags__c IS NULL THEN 0 ELSE 1 END DESC
  LIMIT 5
`;

const mixSql = (accountFilter: string) => `
  SELECT 'revenue' AS dim, revenue_band__c AS band, COUNT(*) AS n
  FROM BT_Zoominfo_Firmographics__dlm
  WHERE ${LATEST} AND account_id__c ${accountFilter}
  GROUP BY revenue_band__c
  UNION ALL
  SELECT 'employee' AS dim, employee_band__c AS band, COUNT(*) AS n
  FROM BT_Zoominfo_Firmographics__dlm
  WHERE ${LATEST} AND account_id__c ${accountFilter}
  GROUP BY employee_band__c
`;

export interface BandCount {
  band: string;
  count: number;
}

export interface UpmarketRow {
  accountId: string;
  revenueBand: string;
  employeeBand: string;
  tech: string[];
  /** Treasury pitch derived from the tech stack; empty when none applies. */
  pitch: string;
  naics: string;
  state: string;
  clientName?: string;
}

export interface FirmographicMixResult {
  revenue: BandCount[];
  employees: BandCount[];
  /** Profiled clients on the latest month. */
  total: number;
  /** …of which $50M+ revenue. */
  upmarket: number;
  rows: UpmarketRow[];
  scope: BookScope;
}

const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// First match wins: the stack most directly tied to a treasury product.
const PITCHES: [RegExp, string][] = [
  [/Workday/, 'Workday → payroll-connected disbursements'],
  [/Salesforce|HubSpot/, 'CRM-linked receivables → integrated invoicing & AR'],
  [/Snowflake|AWS/, 'Cloud data stack → API cash-position reporting'],
  [/Tableau/, 'Tableau → treasury data feed for cash dashboards'],
  [/Okta/, 'Okta → SSO into the treasury portal'],
];

export const techPitch = (tech: string[]) => {
  const joined = tech.join(',');
  return PITCHES.find(([re]) => re.test(joined))?.[1] ?? '';
};

const ordered = (counts: Map<string, number>, order: readonly string[]): BandCount[] =>
  [...counts.keys()]
    .sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99))
    .map(band => ({ band, count: counts.get(band) ?? 0 }));

/** C5 — the book's revenue / employee band mix plus the top upmarket clients. */
export async function fetchFirmographicMix(ownerId: string | null | undefined): Promise<FirmographicMixResult> {
  // The mix query decides the scope: an empty book (no ZoomInfo profiles) falls back org-wide.
  const mix = await queryDataCloudForBook<Record<string, unknown>>(mixSql, ownerId, 30);
  const rows = await queryDataCloud<Record<string, unknown>>(upmarketSql(mix.accountFilter), 5)
    .then(r => r.rows)
    .catch((): Record<string, unknown>[] => []);
  const revenue = new Map<string, number>();
  const employees = new Map<string, number>();
  for (const r of mix.rows) {
    const band = decode(String(r.band ?? '')) || 'Unknown';
    (r.dim === 'revenue' ? revenue : employees).set(band, Number(r.n) || 0);
  }
  const total = [...revenue.values()].reduce((a, b) => a + b, 0);
  return {
    scope: mix.scope,
    revenue: ordered(revenue, REVENUE_BANDS),
    employees: ordered(employees, EMPLOYEE_BANDS),
    total,
    upmarket: REVENUE_BANDS.slice(3).reduce((sum, b) => sum + (revenue.get(b) ?? 0), 0),
    rows: rows.map(r => {
      const tech = String(r.tech ?? '').split(',').map(t => t.trim()).filter(Boolean);
      return {
        accountId: String(r.account_id ?? ''),
        revenueBand: decode(String(r.revenue_band ?? '')),
        employeeBand: String(r.employee_band ?? ''),
        tech,
        pitch: techPitch(tech),
        naics: String(r.naics ?? ''),
        state: String(r.state ?? ''),
      };
    }),
  };
}
