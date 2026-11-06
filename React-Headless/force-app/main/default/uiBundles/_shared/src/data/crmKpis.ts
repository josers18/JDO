/**
 * CRM KPI tiles: true live totals, plus their weekly history from
 * Cockpit_KPI_Snapshot__c.
 *
 * Live values come from uiapi aggregate queries (SUM / COUNT over every open
 * record), not from summing the first N rows a list query returns. The pipeline
 * tile used to add up only the top 200 opportunities.
 *
 * History: the nightly CockpitKpiSnapshot Apex job (plus its 8-week backfill)
 * writes one row per banker × metric × day, using the same definitions as the
 * live queries below:
 *   pipeline · openOpps · stage:<StageName> · leads · openCases (CRM only) · goals
 * A series is seven weekly points, one at each of today − 7k (the latest
 * snapshot in that week), then the live value as the eighth. So the last point
 * is the tile's value and the delta is week over week.
 *
 * Scope: the banker's own book (owner = the effective user) when viewing as a
 * banker, or when the signed-in user has snapshots (they own a book). Otherwise
 * everything the user can see, with no history: snapshots are per banker, so an
 * org-wide view has nothing to compare against.
 */
import { executeGraphQL } from './graphqlClient';
import { getViewAs } from './viewAs';
import { toKpiTrend, TREND_POINTS, type KpiTrend } from './kpiTrend';

export interface CrmKpiValue extends KpiTrend {
  value: number;
}

export interface CrmStageValue extends CrmKpiValue {
  label: string;
}

export interface CrmKpis {
  scope: 'book' | 'visible';
  pipeline: CrmKpiValue;
  openOpps: CrmKpiValue;
  leads: CrmKpiValue;
  /** CRM cases only (the tile adds ServiceNow on top). */
  openCases: CrmKpiValue;
  goals: CrmKpiValue;
  /** open pipeline by stage, largest first */
  stages: CrmStageValue[];
}

const SF_ID = /^005[a-zA-Z0-9]{12}(?:[a-zA-Z0-9]{3})?$/;

type Agg = { edges?: { node: { aggregate?: Record<string, { value?: unknown; sum?: { value?: unknown }; count?: { value?: unknown } }> } }[] };
interface Shape {
  uiapi?: {
    aggregate?: { Opp?: Agg; ByStage?: Agg; Lead?: Agg; Case?: Agg; FinancialGoal?: Agg };
    query?: { Cockpit_KPI_Snapshot__c?: { edges?: { node: Record<string, { value?: unknown }> }[] } };
  };
}

const where = (...parts: (string | false)[]) => {
  const p = parts.filter(Boolean);
  return p.length ? `(where: { ${p.join(', ')} })` : '';
};

function liveQuery(ownerId: string | null, since: string | null): string {
  const eq = ownerId ? `{ eq: "${ownerId}" }` : '';
  const owner = !!ownerId && `OwnerId: ${eq}`;
  const openOpp = where(owner, 'IsClosed: { eq: false }');
  return `
    query CrmKpis {
      uiapi {
        aggregate {
          Opp: Opportunity${openOpp} { edges { node { aggregate { Amount { sum { value } } Id { count { value } } } } } }
          ByStage: Opportunity${openOpp.replace(/\)$/, ', groupBy: { StageName: { group: true } })')} {
            edges { node { aggregate { StageName { value } Amount { sum { value } } } } }
          }
          Lead${where(owner, 'IsConverted: { eq: false }')} { edges { node { aggregate { Id { count { value } } } } } }
          Case${where(!!ownerId && `Account: { OwnerId: ${eq} }`, 'IsClosed: { eq: false }')} { edges { node { aggregate { Id { count { value } } } } } }
          FinancialGoal${where(owner)} { edges { node { aggregate { Id { count { value } } } } } }
        }
        ${ownerId && since ? `query {
          Cockpit_KPI_Snapshot__c(first: 2000, where: { Banker__c: ${eq}, Snapshot_Date__c: { gte: { value: "${since}" } } }, orderBy: { Snapshot_Date__c: { order: ASC } }) {
            edges { node { Metric_Key__c { value } Value__c { value } Snapshot_Date__c { value } } }
          }
        }` : ''}
      }
    }`;
}

const n = (v: unknown) => Number(v) || 0;
const one = (a: Agg | undefined, field: string, op: 'sum' | 'count') => n(a?.edges?.[0]?.node.aggregate?.[field]?.[op]?.value);

/** Local calendar date as YYYY-MM-DD. */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const daysAgo = (today: Date, k: number) => ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() - k));

/**
 * Weekly points from daily snapshots, then the live value. For each target
 * today − 7k (k = weeks…1) take the newest snapshot in (target − 7, target];
 * a week without one is skipped, never filled in.
 */
export function weeklySeries(snaps: Map<string, number> | undefined, live: number, today: Date, weeks = TREND_POINTS - 1): number[] {
  const out: number[] = [];
  if (snaps?.size) {
    const dates = [...snaps.keys()].sort();
    for (let k = weeks; k >= 1; k--) {
      const hi = daysAgo(today, 7 * k);
      const lo = daysAgo(today, 7 * k + 7);
      let pick: string | undefined;
      for (const d of dates) if (d > lo && d <= hi) pick = d;
      if (pick) out.push(snaps.get(pick)!);
    }
  }
  out.push(live);
  return out;
}

export async function fetchCrmKpis(effectiveUserId: string | null | undefined, today = new Date()): Promise<CrmKpis> {
  const ownerId = effectiveUserId && SF_ID.test(effectiveUserId) ? effectiveUserId : null;
  const since = daysAgo(today, 7 * TREND_POINTS + 7);
  let res = await executeGraphQL<Shape>(liveQuery(ownerId, since));
  const snapEdges = res.uiapi?.query?.Cockpit_KPI_Snapshot__c?.edges ?? [];
  const book = !!ownerId && (!!getViewAs() || snapEdges.length > 0);
  if (ownerId && !book) res = await executeGraphQL<Shape>(liveQuery(null, null));

  // metric → date → value
  const hist = new Map<string, Map<string, number>>();
  if (book) {
    for (const { node } of snapEdges) {
      const key = String(node.Metric_Key__c?.value ?? '');
      const date = String(node.Snapshot_Date__c?.value ?? '').slice(0, 10);
      if (!key || !date) continue;
      if (!hist.has(key)) hist.set(key, new Map());
      hist.get(key)!.set(date, n(node.Value__c?.value));
    }
  }
  const metric = (key: string, value: number): CrmKpiValue =>
    ({ value, ...(book ? toKpiTrend(weeklySeries(hist.get(key), value, today)) : {}) });

  const a = res.uiapi?.aggregate;
  const stages = (a?.ByStage?.edges ?? [])
    .map(({ node }) => ({ label: String(node.aggregate?.StageName?.value ?? 'Other'), amount: n(node.aggregate?.Amount?.sum?.value) }))
    .sort((x, y) => y.amount - x.amount)
    .map(({ label, amount }) => ({ label, ...metric(`stage:${label}`, amount) }));

  return {
    scope: book ? 'book' : 'visible',
    pipeline: metric('pipeline', one(a?.Opp, 'Amount', 'sum')),
    openOpps: metric('openOpps', one(a?.Opp, 'Id', 'count')),
    leads: metric('leads', one(a?.Lead, 'Id', 'count')),
    openCases: metric('openCases', one(a?.Case, 'Id', 'count')),
    goals: metric('goals', one(a?.FinancialGoal, 'Id', 'count')),
    stages,
  };
}
