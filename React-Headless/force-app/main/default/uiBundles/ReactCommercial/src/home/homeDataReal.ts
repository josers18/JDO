/**
 * HOME app — REAL data implementation for the Commercial "Relationship Command".
 *   · Core/FSC (Opportunity, Case, Task, Event, FinancialGoal) → GraphQL
 *   · Data Cloud business credit (CumulusDnBBusinessCredit__dlm) → DcBridgeRest
 *
 * The persona signal is CREDIT RISK: the RM's "who to call" ranks accounts by
 * the weakest PAYDEX / highest delinquency-predictor scores (the borrowers most
 * likely to need a covenant or credit review). Field names + DMO columns
 * verified live against jdo-1lrnov (storm-16a17dc388fbe6, 2026-07-07).
 */
import { executeGraphQL, queryDataCloud } from '@shared';
import type { HomeDashboard, CallItem, ScheduleItem, BankerGoal, PipelineItem } from './homeTypes';

/* ── Core/FSC via GraphQL (verified fields) ────────────────── */
const HOME_CORE_QUERY = /* GraphQL */ `
  query CommercialBook {
    uiapi {
      query {
        Opportunity(first: 200, where: { IsClosed: { eq: false } }, orderBy: { Amount: { order: DESC } }) {
          totalCount
          edges { node { Id Name @optional { value } StageName @optional { value } Amount @optional { value } CloseDate @optional { value } Probability @optional { value } Account @optional { Name @optional { value } } } }
        }
        Case(first: 1, where: { IsClosed: { eq: false } }) { totalCount }
        Task(first: 8, where: { IsClosed: { eq: false } }, orderBy: { ActivityDate: { order: ASC } }) {
          edges { node { Id Subject @optional { value } ActivityDate @optional { value } } }
        }
        Event(first: 6, orderBy: { ActivityDateTime: { order: ASC } }) {
          edges { node { Id Subject @optional { value } ActivityDateTime @optional { value } } }
        }
        FinancialGoal(first: 6) {
          edges { node { Id Name @optional { value } TargetAmount @optional { value } ActualAmount @optional { value } } }
        }
      }
    }
  }
`;

/* ── Account name lookup (IDs → names). Id is a PLAIN string on nodes. */
function accountNamesQuery(ids: string[]): string {
  const list = ids.map(id => `"${id.replace(/[^A-Za-z0-9]/g, '')}"`).join(', ');
  return `query AccountNames {
    uiapi {
      query {
        Account(first: 50, where: { Id: { in: [${list}] } }) {
          edges { node { Id Name @optional { value } } }
        }
      }
    }
  }`;
}

/* ── Data Cloud: weakest business credit = "who to call" ──
   Scope to this org's account prefix (001am%) so every row resolves to a local
   Account name. Rank by PAYDEX ascending then delinquency-predictor descending. */
const CREDIT_RISK_SQL = `
  SELECT ssot__AccountId__c AS account_id, paydexScore__c AS paydex,
         compositeRiskScore__c AS composite_risk, delinquencyPredictorScore__c AS delinquency,
         dnbRating__c AS rating, averageDaysBeyondTerms__c AS days_beyond
  FROM CumulusDnBBusinessCredit__dlm
  WHERE paydexScore__c IS NOT NULL AND ssot__AccountId__c LIKE '001am%'
  ORDER BY paydexScore__c ASC, delinquencyPredictorScore__c DESC
  LIMIT 8
`;

interface CreditRow { account_id: string; paydex: number; composite_risk: number; delinquency: number; rating: string; days_beyond: number; }
type Node = Record<string, { value?: unknown } | undefined>;
const v = (n: Node, k: string) => (n[k] as { value?: unknown } | undefined)?.value;
const s = (n: Node, k: string) => String(v(n, k) ?? '');
const num = (n: Node, k: string) => Number(v(n, k) ?? 0);

/** Lower PAYDEX = higher risk. PAYDEX 80 = prompt payment; <50 = severely late. */
function severityForPaydex(paydex: number): CallItem['severity'] {
  if (paydex < 60) return 'high';
  if (paydex < 75) return 'medium';
  return 'low';
}

interface CoreShape {
  uiapi?: { query?: {
    Opportunity?: { totalCount?: number; edges?: { node: Node & { Account?: { Name?: { value?: string } } } }[] };
    Case?: { totalCount?: number };
    Task?: { edges?: { node: Node }[] };
    Event?: { edges?: { node: Node }[] };
    FinancialGoal?: { edges?: { node: Node }[] };
  } };
}

export async function fetchHomeDashboardReal(): Promise<HomeDashboard> {
  const [core, credit] = await Promise.all([
    executeGraphQL<CoreShape>(HOME_CORE_QUERY),
    queryDataCloud<CreditRow>(CREDIT_RISK_SQL, 8),
  ]);
  const q = core.uiapi?.query;
  const opp = q?.Opportunity;

  const ids = [...new Set(credit.rows.map(r => r.account_id).filter(Boolean))];
  const nameById: Record<string, string> = {};
  if (ids.length) {
    try {
      const names = await executeGraphQL<{ uiapi?: { query?: { Account?: { edges?: { node: Node }[] } } } }>(accountNamesQuery(ids));
      for (const e of names.uiapi?.query?.Account?.edges ?? []) {
        const id = (e.node as { Id?: string }).Id ?? '';
        if (id) nameById[id] = s(e.node, 'Name');
      }
    } catch { /* names best-effort */ }
  }

  const pipelineValue = (opp?.edges ?? []).reduce((sum, e) => sum + num(e.node, 'Amount'), 0);

  const callList: CallItem[] = credit.rows.map((row, i) => {
    const paydex = Number(row.paydex || 0);
    const dbt = Number(row.days_beyond || 0);
    return {
      id: `c${i}`,
      clientId: row.account_id,
      clientName: nameById[row.account_id] || row.account_id,
      segment: `D&B ${row.rating || 'unrated'}`,
      reason: `PAYDEX ${Math.round(paydex)}${dbt ? `, ${Math.round(dbt)} days beyond terms` : ''}; delinquency score ${Math.round(Number(row.delinquency || 0))}`,
      action: 'Credit / covenant review',
      score: 1 - Math.min(paydex, 100) / 100,
      severity: severityForPaydex(paydex),
      source: 'D&B credit',
      relationshipValue: 0,
    };
  });

  const schedule: ScheduleItem[] = [
    ...(q?.Task?.edges ?? []).map((e, i) => ({ id: `t${i}`, time: s(e.node, 'ActivityDate') || '—', title: s(e.node, 'Subject') || 'Task', kind: 'task' as const })),
    ...(q?.Event?.edges ?? []).map((e, i) => ({ id: `e${i}`, time: (s(e.node, 'ActivityDateTime') || '').slice(0, 10) || '—', title: s(e.node, 'Subject') || 'Event', kind: 'meeting' as const })),
  ].slice(0, 8);

  const bankerGoals: BankerGoal[] = (q?.FinancialGoal?.edges ?? []).map((e, i) => ({
    id: `g${i}`, name: s(e.node, 'Name') || 'Goal',
    current: num(e.node, 'ActualAmount'), target: num(e.node, 'TargetAmount') || 1,
    format: 'currencyCompact' as const,
  }));

  const pipeline: PipelineItem[] = (opp?.edges ?? []).slice(0, 8).map((e, i) => ({
    id: `o${i}`,
    clientName: e.node.Account?.Name?.value ?? '—',
    name: s(e.node, 'Name'), stage: s(e.node, 'StageName'),
    amount: num(e.node, 'Amount'), closeDate: s(e.node, 'CloseDate'),
    propensity: Math.min(1, num(e.node, 'Probability') / 100) || 0.5,
  }));

  const highRisk = callList.filter(c => c.severity === 'high').length;

  return {
    bankerName: 'Alex',
    dateLabel: 'Today',
    aiBriefHeadline: 'borrowers on the credit watchlist',
    aiBrief: `${callList.length} relationships flagged by D&B business credit, ${highRisk} with PAYDEX under 60 (covenant-review candidates). ${opp?.totalCount ?? 0} open opportunities worth ${pipelineValue.toLocaleString('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 })} in pipeline. ${schedule.length} activities scheduled.`,
    confidencePct: 86,
    dataSourceCount: 25,
    kpis: [
      { key: 'pipeline', label: 'Pipeline', value: pipelineValue, format: 'currencyCompact' },
      { key: 'openOpps', label: 'Open Opportunities', value: opp?.totalCount ?? 0, format: 'number' },
      { key: 'openCases', label: 'Open Cases', value: q?.Case?.totalCount ?? 0, format: 'number' },
      { key: 'creditWatch', label: 'Credit Watch', value: callList.length, format: 'number' },
      { key: 'highRisk', label: 'PAYDEX < 60', value: highRisk, format: 'number' },
    ],
    callList,
    pipeline,
    bankerGoals,
    lifeEvents: [],
    schedule,
    alerts: callList.slice(0, 4).map((c, i) => ({
      id: `a${i}`, title: `Credit risk — ${c.clientName}`, detail: c.reason,
      tone: 'risk' as const, severity: c.severity === 'high' ? 'High' as const : 'Medium' as const, when: 'recent',
    })),
    leads: [],
  };
}
