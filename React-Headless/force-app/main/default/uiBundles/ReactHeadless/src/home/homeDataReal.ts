/**
 * HOME app — REAL data implementation. Split from the mock so each can evolve
 * independently. This is the "wired like today" path:
 *   · Core/FSC (Opportunity, Case, Task, Event, FinancialGoal, Lead) → GraphQL
 *   · Data Cloud (churn, next-best-product, life events, CSAT) → DcBridgeRest
 *
 * GATING: the GraphQL field names + DC DMO columns below MUST be verified
 * against the live org before flipping dataSource to 'real':
 *   1. `npm run graphql:schema` (writes schema.graphql from the org)
 *   2. `graphql-search.sh Opportunity Case Task Event FinancialGoal Lead`
 *   3. probe DC columns: queryDataCloud('SELECT * FROM Bank_Churner__dlm LIMIT 5')
 * Every unverified name is marked // TODO(verify). Do NOT enable 'real' until done.
 */
import { executeGraphQL, queryDataCloud } from '@shared';
import type { HomeDashboard, CallItem } from './homeTypes';

/* ── Core/FSC via GraphQL ─────────────────────────────────────
   TODO(verify): confirm every field via graphql-search.sh before enabling. */
const HOME_CORE_QUERY = /* GraphQL */ `
  query HomeBook {
    uiapi {
      query {
        Opportunity(first: 200, where: { IsClosed: { eq: false } }) {
          totalCount
          edges { node { Id Name @optional { value } StageName @optional { value } Amount @optional { value } CloseDate @optional { value } Account @optional { Name @optional { value } } } }
        }
        Case(first: 1, where: { IsClosed: { eq: false } }) { totalCount }
      }
    }
  }
`;

/* ── Data Cloud via bridge ────────────────────────────────────
   VERIFIED against jdo-1lrnov (2026-07-06) via ssot/queryv2 probes:
   · CSAT_Snowflake__dlm keys on accountid__c and has real csat_score__c +
     nps_score__c — a clean, account-joinable "attention" signal.
   · Bank_Churner__dlm is the raw Kaggle feature set (Attrition_Flag__c label)
     keyed on EmailAddress__c/Id__c — it does NOT join to Account, so it can't
     drive an account-level call list directly (see docs findings).
   Low CSAT = a client who needs a call. */
const LOW_CSAT_SQL = `
  SELECT accountid__c AS account_id,
         csat_score__c AS csat,
         nps_score__c AS nps,
         csat_description__c AS reason
  FROM CSAT_Snowflake__dlm
  WHERE csat_score__c IS NOT NULL
  ORDER BY csat_score__c ASC
  LIMIT 10
`;

interface CsatRow {
  account_id: string;
  csat: number;
  nps: number;
  reason: string;
}

function severityForCsat(csat: number): CallItem['severity'] {
  if (csat < 50) return 'high';
  if (csat < 70) return 'medium';
  return 'low';
}

/**
 * Assemble the HOME dashboard from live Core + Data Cloud sources. Kept
 * structurally identical to the mock's HomeDashboard shape so the UI is
 * unchanged. Only the "who to call" ranking + a couple KPIs are shown wired
 * here as the proving path; the remaining sections follow the same recipe.
 */
export async function fetchHomeDashboardReal(): Promise<HomeDashboard> {
  // NOTE: types for HomeBook come from graphql-operations-types after codegen.
  const [core, csat] = await Promise.all([
    executeGraphQL<{ uiapi?: { query?: { Opportunity?: { totalCount?: number; edges?: { node: Record<string, { value?: unknown } | undefined> }[] }; Case?: { totalCount?: number } } } }>(HOME_CORE_QUERY),
    queryDataCloud<CsatRow>(LOW_CSAT_SQL, 10),
  ]);

  const opp = core.uiapi?.query?.Opportunity;
  const pipelineValue = (opp?.edges ?? []).reduce((s, e) => s + Number((e.node.Amount as { value?: number })?.value ?? 0), 0);

  // "Who to call" ranked by lowest CSAT — an account-joinable, real signal.
  const callList: CallItem[] = csat.rows.map((row, i) => ({
    id: `c${i}`,
    clientId: row.account_id,
    clientName: row.account_id, // enriched with Account.Name in a follow-up join
    segment: 'Retail',
    reason: row.reason || `CSAT ${Math.round(Number(row.csat))}, NPS ${Math.round(Number(row.nps))}`,
    action: 'Service-recovery outreach',
    score: 1 - Math.min(Number(row.csat) || 0, 100) / 100,
    severity: severityForCsat(Number(row.csat) || 0),
    source: 'CSAT / NPS',
    relationshipValue: 0,
  }));

  // Sections not yet wired reuse the mock shape's empty/derived defaults; each
  // will be filled with its own GraphQL/DC source following this same pattern.
  return {
    bankerName: 'Alex',
    dateLabel: '',
    aiBriefHeadline: 'your book today',
    aiBrief: `${callList.length} clients flagged for attention. Pipeline at ${pipelineValue.toLocaleString()}.`,
    confidencePct: 87,
    dataSourceCount: 24,
    kpis: [
      { key: 'pipeline', label: 'Pipeline', value: pipelineValue, format: 'currencyCompact' },
      { key: 'openOpps', label: 'Open Opportunities', value: opp?.totalCount ?? 0, format: 'number' },
      { key: 'openCases', label: 'Open Cases', value: core.uiapi?.query?.Case?.totalCount ?? 0, format: 'number' },
      { key: 'atRisk', label: 'At-Risk', value: callList.filter(c => c.severity === 'high').length, format: 'number' },
    ],
    callList,
    pipeline: (opp?.edges ?? []).slice(0, 6).map((e, i) => ({
      id: `o${i}`,
      clientName: String((e.node.Account as { Name?: { value?: string } })?.Name?.value ?? ''),
      name: String((e.node.Name as { value?: string })?.value ?? ''),
      stage: String((e.node.StageName as { value?: string })?.value ?? ''),
      amount: Number((e.node.Amount as { value?: number })?.value ?? 0),
      closeDate: String((e.node.CloseDate as { value?: string })?.value ?? ''),
      propensity: 0.6,
    })),
    bankerGoals: [],
    lifeEvents: [],
    schedule: [],
    alerts: [],
    leads: [],
  };
}
