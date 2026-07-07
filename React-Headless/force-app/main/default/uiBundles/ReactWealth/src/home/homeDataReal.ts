/**
 * HOME app — REAL data implementation for the Wealth "Advisory Desk".
 *   · Core/FSC (Opportunity, Case, Task, Event, FinancialGoal) → GraphQL
 *   · Data Cloud held-away capture (CumulusPlaidHeldAway__dlm) → DcBridgeRest
 *
 * The persona signal is HELD-AWAY: the advisor's "who to call" ranks accounts
 * by the largest active held-away balances (the biggest consolidation
 * opportunities). Field names + DMO columns verified live against jdo-1lrnov
 * (storm-16a17dc388fbe6, 2026-07-07) via uiapi + ssot/queryv2 probes.
 */
import { executeGraphQL, queryDataCloud } from '@shared';
import type { HomeDashboard, CallItem, ScheduleItem, BankerGoal, PipelineItem } from './homeTypes';

/* ── Core/FSC via GraphQL (verified fields) ────────────────── */
const HOME_CORE_QUERY = /* GraphQL */ `
  query WealthBook {
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

/* ── Account name lookup (IDs → names). Id is a PLAIN string on nodes;
   Name is wrapped in { value }. IDs are org-generated alphanumerics (safe). */
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

/* ── Data Cloud: largest active held-away balances = "who to call" ──
   Scope to this org's account prefix (001am%) so every row resolves to a local
   Account name (the unified profile spans multiple source orgs). */
const HELD_AWAY_SQL = `
  SELECT ssot__AccountId__c AS account_id, balanceUsd__c AS balance,
         institutionName__c AS institution, accountType__c AS acct_type,
         monthlyNetFlowUsd__c AS net_flow
  FROM CumulusPlaidHeldAway__dlm
  WHERE isActive__c = true AND balanceUsd__c IS NOT NULL AND ssot__AccountId__c LIKE '001am%'
  ORDER BY balanceUsd__c DESC
  LIMIT 8
`;

interface HeldAwayRow { account_id: string; balance: number; institution: string; acct_type: string; net_flow: number; }
type Node = Record<string, { value?: unknown } | undefined>;
const v = (n: Node, k: string) => (n[k] as { value?: unknown } | undefined)?.value;
const s = (n: Node, k: string) => String(v(n, k) ?? '');
const num = (n: Node, k: string) => Number(v(n, k) ?? 0);

function severityForBalance(balance: number): CallItem['severity'] {
  if (balance >= 5_000_000) return 'high';
  if (balance >= 1_000_000) return 'medium';
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
  const [core, held] = await Promise.all([
    executeGraphQL<CoreShape>(HOME_CORE_QUERY),
    queryDataCloud<HeldAwayRow>(HELD_AWAY_SQL, 8),
  ]);
  const q = core.uiapi?.query;
  const opp = q?.Opportunity;

  // resolve held-away account IDs → names
  const ids = [...new Set(held.rows.map(r => r.account_id).filter(Boolean))];
  const nameById: Record<string, string> = {};
  if (ids.length) {
    try {
      const names = await executeGraphQL<{ uiapi?: { query?: { Account?: { edges?: { node: Node }[] } } } }>(accountNamesQuery(ids));
      for (const e of names.uiapi?.query?.Account?.edges ?? []) {
        const id = (e.node as { Id?: string }).Id ?? '';
        if (id) nameById[id] = s(e.node, 'Name');
      }
    } catch { /* names best-effort; fall back to raw ID */ }
  }

  const totalHeldAway = held.rows.reduce((sum, r) => sum + Number(r.balance || 0), 0);
  const pipelineValue = (opp?.edges ?? []).reduce((sum, e) => sum + num(e.node, 'Amount'), 0);

  const callList: CallItem[] = held.rows.map((row, i) => {
    const bal = Number(row.balance || 0);
    return {
      id: `c${i}`,
      clientId: row.account_id,
      clientName: nameById[row.account_id] || row.account_id,
      segment: 'Private Wealth',
      reason: `${(bal).toLocaleString('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 })} held away at ${row.institution || 'external institution'} (${row.acct_type || 'account'})`,
      action: 'Held-away consolidation review',
      score: Math.min(1, bal / 8_000_000),
      severity: severityForBalance(bal),
      source: 'Plaid held-away',
      relationshipValue: bal,
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

  const highValue = callList.filter(c => c.severity === 'high').length;

  return {
    bankerName: 'Alex',
    dateLabel: 'Today',
    aiBriefHeadline: 'held-away assets within reach',
    aiBrief: `${callList.length} clients hold external assets totalling ${totalHeldAway.toLocaleString('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 })}; ${highValue} are $5M+ consolidation opportunities. ${opp?.totalCount ?? 0} open opportunities worth ${pipelineValue.toLocaleString('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 })} in pipeline. ${schedule.length} activities scheduled.`,
    confidencePct: 89,
    dataSourceCount: 26,
    kpis: [
      { key: 'heldAway', label: 'Held-Away in Reach', value: totalHeldAway, format: 'currencyCompact' },
      { key: 'pipeline', label: 'Pipeline', value: pipelineValue, format: 'currencyCompact' },
      { key: 'openOpps', label: 'Open Opportunities', value: opp?.totalCount ?? 0, format: 'number' },
      { key: 'openCases', label: 'Open Cases', value: q?.Case?.totalCount ?? 0, format: 'number' },
      { key: 'topTargets', label: '$5M+ Targets', value: highValue, format: 'number' },
    ],
    callList,
    pipeline,
    bankerGoals,
    lifeEvents: [],
    schedule,
    alerts: callList.slice(0, 4).map((c, i) => ({
      id: `a${i}`, title: `Held-away — ${c.clientName}`, detail: c.reason,
      tone: 'opportunity' as const, severity: c.severity === 'high' ? 'High' as const : 'Medium' as const, when: 'recent',
    })),
    leads: [],
  };
}
