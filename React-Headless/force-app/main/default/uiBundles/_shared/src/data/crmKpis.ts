/**
 * CRM KPI tiles: true live totals, plus their weekly history computed in Data 360.
 *
 * Live values come from uiapi aggregate queries (SUM / COUNT over every open
 * record), not from summing the first N rows a list query returns. The pipeline
 * tile used to add up only the top 200 opportunities.
 *
 * History has no snapshot store. It's computed in Data 360 with one ANSI SQL
 * query (DcBridgeRest → Query API) over the CRM-ingested DMOs, reconstructing
 * "open as of" the end of each of today − 7k (k = 7…0):
 *   pipeline / openOpps  ssot__Opportunity__dlm, owner = banker. Open on D if
 *                        created before D and either still open or closed on/after D.
 *                        The close moment is LEAST(CloseDate, LastModifiedDate),
 *                        since an opp can't close after its last edit; this org has
 *                        no stage-change date or OpportunityHistory DMO.
 *   stage:<S>            currently open opps by stage, as of D (a closed opp's
 *                        earlier stage isn't in Data 360)
 *   openCases            ssot__Case__dlm on accounts the banker owns (ssot__Account__dlm)
 *   leads                ssot__Lead__dlm, unconverted as of D
 * Goals have no history: ssot__FinancialGoal__dlm carries no owner.
 * The whole 8-point series comes from Data 360, today included, so the
 * week-over-week delta compares Data 360 with Data 360. The tile still shows the
 * live CRM total. Mixing the two would turn ingestion lag (a record CRM has but
 * the DMO doesn't yet) into a fake jump.
 *
 * Scope: the banker's book (owner = effective user) when viewing as a banker or
 * when the signed-in user owns CRM records. Otherwise it shows the visible
 * totals with no history.
 */
import { executeGraphQL } from './graphqlClient';
import { queryDataCloud } from './dataCloudClient';
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
  /** live only: the FinancialGoal DMO has no owner to build a banker's history from */
  goals: CrmKpiValue;
  /** open pipeline by stage, largest first */
  stages: CrmStageValue[];
}

const SF_ID = /^005[a-zA-Z0-9]{12}(?:[a-zA-Z0-9]{3})?$/;

type Agg = { edges?: { node: { aggregate?: Record<string, { value?: unknown; sum?: { value?: unknown }; count?: { value?: unknown } }> } }[] };
interface Shape {
  uiapi?: {
    aggregate?: { Opp?: Agg; ByStage?: Agg; Lead?: Agg; Case?: Agg; FinancialGoal?: Agg };
  };
}

const where = (...parts: (string | false)[]) => {
  const p = parts.filter(Boolean);
  return p.length ? `(where: { ${p.join(', ')} })` : '';
};

function liveQuery(ownerId: string | null): string {
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
 * Data 360 SQL: one row per (week k, metric) for the banker's book, as of the
 * start of each date in `ends` (k = index, counting weeks back from today).
 */
export function historySql(ownerId: string, ends: string[]): string {
  const w = ends.map((d, i) => `SELECT ${i} AS k, TIMESTAMP '${d} 00:00:00' AS d`).join(' UNION ALL ');
  const open = (t: string) => `${t}.cr < w.d AND (${t}.x = 'false' OR ${t}.cl >= w.d)`;
  return `WITH w AS (${w}),
o AS (SELECT ssot__TotalAmount__c amt, ssot__OpportunityStageId__c stage, ssot__IsClosed__c x, ssot__CreatedDate__c cr,
             LEAST(ssot__CloseDate__c, ssot__LastModifiedDate__c) cl
      FROM ssot__Opportunity__dlm WHERE ssot__OwnerUserId__c = '${ownerId}'),
cs AS (SELECT c.ssot__IsClosed__c x, c.ssot__CreatedDate__c cr, c.ssot__ClosedDateTime__c cl
       FROM ssot__Case__dlm c JOIN ssot__Account__dlm a ON a.ssot__Id__c = c.ssot__AccountId__c
       WHERE a.ssot__OwnerId__c = '${ownerId}'),
l AS (SELECT ssot__IsConverted__c x, ssot__CreatedDate__c cr, ssot__ConvertedDate__c cl
      FROM ssot__Lead__dlm WHERE ssot__OwnerId__c = '${ownerId}')
SELECT w.k AS k, 'pipeline' AS m, SUM(o.amt) AS v FROM w JOIN o ON ${open('o')} GROUP BY w.k
UNION ALL SELECT w.k, 'openOpps', COUNT(*) FROM w JOIN o ON ${open('o')} GROUP BY w.k
UNION ALL SELECT w.k, CONCAT('stage:', o.stage), SUM(o.amt) FROM w JOIN o ON o.cr < w.d AND o.x = 'false' GROUP BY w.k, o.stage
UNION ALL SELECT w.k, 'openCases', COUNT(*) FROM w JOIN cs ON ${open('cs')} GROUP BY w.k
UNION ALL SELECT w.k, 'leads', COUNT(*) FROM w JOIN l ON ${open('l')} GROUP BY w.k`;
}

/** Oldest → newest points for k = weeks…0. A missing (week, metric) row is 0: nothing open. */
export function weeklySeries(byK: Map<number, number> | undefined, weeks = TREND_POINTS - 1): number[] {
  const out: number[] = [];
  for (let k = weeks; k >= 0; k--) out.push(byK?.get(k) ?? 0);
  return out;
}

export async function fetchCrmKpis(effectiveUserId: string | null | undefined, today = new Date()): Promise<CrmKpis> {
  const ownerId = effectiveUserId && SF_ID.test(effectiveUserId) ? effectiveUserId : null;
  const weeks = TREND_POINTS - 1;
  // Week k's point is "as of the end of today − 7k", i.e. before the start of the next day.
  const ends = Array.from({ length: weeks + 1 }, (_, k) => daysAgo(today, 7 * k - 1));
  const histP = ownerId
    ? queryDataCloud<{ k: unknown; m: unknown; v: unknown }>(historySql(ownerId, ends), 500).catch(() => null)
    : Promise.resolve(null);
  let res = await executeGraphQL<Shape>(liveQuery(ownerId));
  const owns = (x: Shape) => one(x.uiapi?.aggregate?.Opp, 'Id', 'count') + one(x.uiapi?.aggregate?.Lead, 'Id', 'count') > 0;
  const book = !!ownerId && (!!getViewAs() || owns(res));
  if (ownerId && !book) res = await executeGraphQL<Shape>(liveQuery(null));
  const histRows = book ? (await histP)?.rows ?? null : null;

  // metric → k → value
  const hist = new Map<string, Map<number, number>>();
  for (const r of histRows ?? []) {
    const key = String(r.m ?? '');
    if (!key) continue;
    if (!hist.has(key)) hist.set(key, new Map());
    hist.get(key)!.set(n(r.k), n(r.v));
  }
  const metric = (key: string, value: number, withHistory = true): CrmKpiValue =>
    ({ value, ...(histRows && withHistory ? toKpiTrend(weeklySeries(hist.get(key), weeks)) : {}) });

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
    goals: metric('goals', one(a?.FinancialGoal, 'Id', 'count'), false),
    stages,
  };
}
