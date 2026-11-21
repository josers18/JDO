import { queryDataCloudForBook } from '@shared';
import { paymentBandSql, latestCreditPeriod, recordKey, str, validId, verifyAccounts } from './commercialData';

export type CreditCohort =
  | { kind: 'supplier'; band: string; watch?: boolean; observationCount?: number }
  | { kind: 'revenue'; band: string; observationCount?: number }
  | { kind: 'market'; zip: string; observationCount?: number };

type MemberRecord = {
  account_id: string;
  period?: string;
  paydex?: string | number | null;
  failure?: string | number | null;
  delinquency?: string | number | null;
  days_beyond?: string | number | null;
  tier?: string | null;
  employee_band?: string | null;
  naics?: string | null;
  state?: string | null;
};

const pageSize = 30;
const literal = (value: string) => `'${value.replace(/'/g, "''")}'`;

export async function readCreditCohort(owner: string, cohort: CreditCohort, after?: string) {
  const lowerBound = (column: string) => after && validId(after) ? `AND ${column} > ${literal(after)}` : '';
  const result = await queryDataCloudForBook<MemberRecord>(book => {
    switch (cohort.kind) {
      case 'supplier': return `
        SELECT account_id__c AS account_id, profile_month__c AS period, paydex_score__c AS paydex,
          average_days_beyond_terms__c AS days_beyond, supplier_risk_level__c AS tier,
          failure_risk_score__c AS failure, delinquency_predictor_score__c AS delinquency
        FROM BT_DNB_Business_Credit__dlm
        WHERE account_id__c ${book} AND ${latestCreditPeriod} ${cohort.watch ? "AND (supplier_risk_level__c = 'Severe' OR paydex_score__c < 60)" : 'AND average_days_beyond_terms__c IS NOT NULL'}
          ${cohort.band ? `AND (${paymentBandSql}) = ${literal(cohort.band)}` : ''}
          ${lowerBound('account_id__c')}
        ORDER BY account_id__c ASC LIMIT ${pageSize + 1}`;
      case 'revenue': {
        // The summary decodes the source's HTML entities and combines null and
        // empty as Unknown. Apply the same comparison to source rows.
        const band = "COALESCE(NULLIF(REPLACE(REPLACE(REPLACE(revenue_band__c, '&lt;', '<'), '&gt;', '>'), '&amp;', '&'), ''), 'Unknown')";
        return `
          SELECT account_id__c AS account_id, profile_month__c AS period, employee_band__c AS employee_band,
            industry_naics_code__c AS naics, hq_state_code__c AS state
          FROM BT_Zoominfo_Firmographics__dlm
          WHERE account_id__c ${book} AND ${band} = ${literal(cohort.band)}
            AND profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Zoominfo_Firmographics__dlm)
            ${lowerBound('account_id__c')}
          ORDER BY account_id__c ASC LIMIT ${pageSize + 1}`;
      }
      case 'market': return `
        SELECT a.ssot__Id__c AS account_id, MAX(e.profile_month__c) AS period
        FROM ssot__Account__dlm a
        JOIN BT_ESRI_GEO_Footprint__dlm e ON e.branch_zip__c = a.BillingPostalCode__c
          AND e.profile_month__c = (SELECT MAX(profile_month__c) FROM BT_ESRI_GEO_Footprint__dlm)
        WHERE a.ssot__Id__c ${book} AND e.branch_zip__c = ${literal(cohort.zip)} ${lowerBound('a.ssot__Id__c')}
        GROUP BY a.ssot__Id__c ORDER BY account_id ASC LIMIT ${pageSize + 1}`;
    }
  }, owner, pageSize + 1, true);

  const page = result.rows.slice(0, pageSize);
  const accounts = await verifyAccounts(owner, page.map(r => r.account_id));
  const rows = page.flatMap(member => {
    const account = accounts.get(recordKey(member.account_id));
    if (!account) return [];
    return [{ ...member, id: account.Id, name: str(account, 'Name'), industry: str(account, 'Industry'),
      location: [str(account, 'BillingCity'), str(account, 'BillingState')].filter(Boolean).join(', ') }];
  });
  const last = page[page.length - 1]?.account_id;
  return { rows, period: page[0]?.period, next: result.rows.length > pageSize && validId(last) && last !== after ? last : undefined };
}
