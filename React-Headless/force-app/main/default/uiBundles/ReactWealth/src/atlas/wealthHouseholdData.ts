import { queryDataCloud } from '@shared/data/dataCloudClient';
import { fetchFull360Real } from '../personas/customer/full360DataReal';
import { fetchRecords, fetchOutside, fetchProviderPlans, type RecordNode } from './wealthAtlasData';

export async function verifyHousehold(ownerId: string, accountId: string): Promise<RecordNode | null> {
  if (!/^001[a-z\d]{12}(?:[a-z\d]{3})?$/i.test(accountId)) return null;
  const result = await fetchRecords(ownerId, 'Account', undefined, '', accountId);
  return result.rows.find(row => row.Id.slice(0, 15) === accountId.slice(0, 15)) ?? null;
}

const wealthProducts: Record<string, string> = {
  'PCHK-ACQ': 'Premier Checking',
  'WM-CASH': 'High-Yield Cash',
  'WM-MAS': 'Managed Account',
  'IRA-RTH': 'Roth / IRA',
  'IRA-ROL': '401(k) Rollover',
  'MTG-JMB': 'Jumbo Mortgage',
  'HEL-ACQ': 'HELOC',
};
export function householdProductLabel(value: unknown) {
  const code = String(value ?? '');
  return wealthProducts[code] ?? code;
}

type DcRow = Record<string, unknown>;
export type Evidence = { rows: DcRow[]; error: boolean };
const read = async (sql: string, limit: number): Promise<Evidence> => {
  try {
    return { rows: (await queryDataCloud<DcRow>(sql, limit)).rows, error: false };
  } catch {
    return { rows: [], error: true };
  }
};

export function fetchProductEligibility(id: string) {
  if (!/^001[a-z\d]{12}(?:[a-z\d]{3})?$/i.test(id)) throw new Error('Invalid household.');
  return read(
      `SELECT action_code__c code, recommended_action_rank__c rank, conversion_probability__c probability,
      expected_value_uplift__c value, start_date__c period
      FROM BT_Offer_Eligibility__dlm
      WHERE account_id__c = '${id}'
        AND action_code__c IN (${Object.keys(wealthProducts)
          .map(code => `'${code}'`)
          .join(', ')})
        AND recommended_action_rank__c IS NOT NULL
      ORDER BY recommended_action_rank__c LIMIT 25`,
      25
    );
}

export async function fetchHouseholdSignals(account: RecordNode) {
  const id = account.Id;
  if (!/^001[a-z\d]{12}(?:[a-z\d]{3})?$/i.test(id)) throw new Error('Invalid household evidence request.');
  const [feedback, prediction, attrition, gong, screening, products, productHistory] = await Promise.all([
    read(
      `SELECT csat_score__c csat, nps_score__c nps, csat_description__c csatd, nps_description__c npsd, score_date__c dt
      FROM CSAT_Snowflake__dlm WHERE accountid__c = '${id}' ORDER BY score_date__c DESC LIMIT 8`,
      8
    ),
    read(
      `SELECT CSAT_Score_prediction__c pred, Cross_Sell_Score__c xsell, Digital_Engagement__c dig, Complaint_Count__c comp, Segment__c seg
      FROM Predicted_CSAT_Output__dlm WHERE accountid__c = '${id}' LIMIT 1`,
      1
    ),
    read(
      `SELECT Churned_c__c churned FROM Attrition_Prediction__dlm WHERE PrimaryObjectPk__c = '${id}' LIMIT 1`,
      1
    ),
    read(
      `SELECT overall_sentiment__c sent, sentiment_trend__c trend, deal_risk_score__c risk, rm_name__c rm,
      last_call_date__c dt, profile_week__c period FROM BT_Gong_Call_Sentiment__dlm
      WHERE account_id__c = '${id}' ORDER BY profile_week__c DESC LIMIT 4`,
      4
    ),
    read(
      `SELECT overall_risk_rating__c rating, sanctions_hit__c sanc, pep_hit__c pep, adverse_media_hit__c media, last_screened_at__c dt
      FROM BT_WorldCheck_AML__dlm WHERE account_id__c = '${id}' ORDER BY profile_date__c DESC LIMIT 1`,
      1
    ),
    fetchProductEligibility(id),
    read(
      `SELECT action_code__c code, CAST(start_date__c AS VARCHAR) period, conversion_probability__c probability
      FROM BT_Offer_Eligibility_History__dlm
      WHERE account_id__c = '${id}' AND action_code__c IN (${Object.keys(wealthProducts)
        .map(code => `'${code}'`)
        .join(', ')})
        AND start_date__c >= (SELECT MAX(start_date__c) FROM BT_Offer_Eligibility_History__dlm) - INTERVAL '6' MONTH
      ORDER BY start_date__c, action_code__c LIMIT 60`,
      60
    ),
  ]);
  return { feedback, prediction, attrition, gong, screening, products, productHistory };
}

export async function fetchHouseholdEvidence(ownerId: string, account: RecordNode) {
  const id = account.Id;
  const [core, plans, outside, goals, crmPlans, moments, tasks, meetings, signals] = await Promise.allSettled(
    [
      fetchFull360Real(id),
      fetchProviderPlans(ownerId, 'provider', id, true),
      fetchOutside(ownerId, id),
      fetchRecords(ownerId, 'FinancialGoal', undefined, '', id),
      fetchRecords(ownerId, 'FinancialPlan', undefined, '', id),
      fetchRecords(ownerId, 'PersonLifeEvent', undefined, '', id),
      fetchRecords(ownerId, 'Task', undefined, '', id),
      fetchRecords(ownerId, 'Event', undefined, '', id),
      fetchHouseholdSignals(account),
    ]
  );
  const available = <T>(result: PromiseSettledResult<T>) =>
    result.status === 'fulfilled' ? result.value : undefined;
  return {
    core: available(core),
    plan: available(plans)?.[0],
    outside: available(outside)?.rows[0],
    goals: available(goals)?.rows,
    crmPlans: available(crmPlans)?.rows,
    moments: available(moments)?.rows,
    tasks: available(tasks)?.rows,
    meetings: available(meetings)?.rows,
    signals: available(signals),
  };
}
export type HouseholdEvidence = Awaited<ReturnType<typeof fetchHouseholdEvidence>>;
