/**
 * R4 — life-stage mix of the book from Claritas (`BT_Claritas_Demographics__dlm`,
 * latest `profile_month__c`): clients per `life_stage__c` with the average
 * mortgage / investment / wealth propensity (0–100) and how many score 70+ on
 * mortgage or investment. Each stage's "lean" is its strongest propensity —
 * how a banker plans the month ("Young Families: high mortgage, low wealth").
 *
 * Verified live 2026-10-22: Sarah Smith ~10.5K profiled — Established Families
 * 2,794, Young Families 2,536 (mortgage 80, every one 70+), Empty Nesters 2,441
 * (investment 45); Adam Watson's book is Empty Nesters at investment 92 / wealth 77.
 *
 * Mortgage leads: Young Families scoring 70+ on mortgage propensity, placed on
 * CoreLogic (`BT_Corelogic_Property__dlm`, latest quarter) — renters first (a
 * first-home purchase), then free-and-clear owners (move-up), then mortgaged
 * owners (move-up / rate review); propensity breaks ties. Sarah Smith 2,536 →
 * 903 renters / 475 free-and-clear / 1,158 mortgaged. Each tenure is fetched as
 * its own bucket so the three can be one of each — a renter, a free-and-clear
 * owner, a mortgaged owner — over-fetched so exclusions still leave three.
 */
import { queryDataCloud, queryDataCloudForBook, type BookScope } from './dataCloudClient';
import type { QueueSignalItem } from './priorityQueue';

/** Propensity at or above which a client counts as ready for the product. */
export const PROPENSITY_READY = 70;

const mixSql = (accountFilter: string) => `
  SELECT life_stage__c AS life_stage, COUNT(*) AS n,
         AVG(mortgage_propensity_score__c) AS mortgage,
         AVG(investment_propensity_score__c) AS invest,
         AVG(wealth_propensity_score__c) AS wealth,
         SUM(CASE WHEN mortgage_propensity_score__c >= ${PROPENSITY_READY} THEN 1 ELSE 0 END) AS mortgage_ready,
         SUM(CASE WHEN investment_propensity_score__c >= ${PROPENSITY_READY} THEN 1 ELSE 0 END) AS invest_ready
  FROM BT_Claritas_Demographics__dlm
  WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Claritas_Demographics__dlm)
    AND account_id__c ${accountFilter}
  GROUP BY life_stage__c
  ORDER BY n DESC
`;

/** Leads fetched per tenure bucket: the queue shows three, the rest absorb
 *  exclusions (up to eight R1 home-equity clients — all owners), so three still survive. */
const LEAD_FETCH = 11;

// Renter → 0, free-and-clear owner → 1, mortgaged owner → 2 (ranked in that order).
const TENURE = `CASE WHEN p.is_owner__c = true AND p.outstanding_mortgage_balance__c > 0 THEN 2
                     WHEN p.is_owner__c = true THEN 1 ELSE 0 END`;

// l = every lead with its tenure; r ranks each tenure as its own bucket.
const mortgageLeadSql = (accountFilter: string) => `
  WITH l AS (
    SELECT c.account_id__c AS account_id, c.mortgage_propensity_score__c AS score,
           ${TENURE} AS tenure, p.outstanding_mortgage_balance__c AS balance, p.mortgage_rate_pct__c AS rate
    FROM BT_Claritas_Demographics__dlm c
    LEFT JOIN BT_Corelogic_Property__dlm p ON p.account_id__c = c.account_id__c
      AND p.profile_quarter__c = (SELECT MAX(profile_quarter__c) FROM BT_Corelogic_Property__dlm)
    WHERE c.profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Claritas_Demographics__dlm)
      AND c.life_stage__c = 'Young Families' AND c.mortgage_propensity_score__c >= ${PROPENSITY_READY}
      AND c.account_id__c ${accountFilter}
  ),
  r AS (
    SELECT l.*, ROW_NUMBER() OVER (PARTITION BY tenure ORDER BY score DESC) AS rn
    FROM l
  )
  SELECT account_id, score, tenure, balance, rate FROM r
  WHERE rn <= ${LEAD_FETCH}
  ORDER BY tenure, score DESC
`;

export type MortgageLeadTenure = 'renter' | 'owner' | 'mortgaged';

export interface MortgageLead {
  accountId: string;
  score: number;
  tenure: MortgageLeadTenure;
  balance: number;
  ratePct: number | null;
  clientName?: string;
}

export type PropensityLean = 'mortgage' | 'invest' | 'wealth';

export interface LifeStageRow {
  stage: string;
  clients: number;
  mortgage: number;
  invest: number;
  wealth: number;
  mortgageReady: number;
  investReady: number;
  /** The stage's strongest average propensity. */
  lean: PropensityLean;
}

export interface LifeStageMixResult {
  /** Largest stage first. */
  rows: LifeStageRow[];
  clients: number;
  mortgageReady: number;
  investReady: number;
  /** Top Young Families mortgage 70+ clients, renters first (up to eleven per tenure; the queue shows three). */
  mortgageLeads: MortgageLead[];
  scope: BookScope;
}

export const LEAN_LABEL: Record<PropensityLean, string> = {
  mortgage: 'Mortgage',
  invest: 'Investment',
  wealth: 'Wealth',
};

const leanOf = (m: number, i: number, w: number): PropensityLean =>
  m >= i && m >= w ? 'mortgage' : i >= w ? 'invest' : 'wealth';

/** R4 — the book's clients by life stage, with each stage's propensities. */
export async function fetchLifeStageMix(ownerId: string | null | undefined): Promise<LifeStageMixResult> {
  const res = await queryDataCloudForBook<Record<string, unknown>>(mixSql, ownerId, 20);
  const leads = await queryDataCloud<Record<string, unknown>>(mortgageLeadSql(res.accountFilter), LEAD_FETCH * 3)
    .then(r => r.rows)
    .catch((): Record<string, unknown>[] => []);
  const rows = res.rows.map(r => {
    const mortgage = Number(r.mortgage) || 0;
    const invest = Number(r.invest) || 0;
    const wealth = Number(r.wealth) || 0;
    return {
      stage: String(r.life_stage ?? '') || 'Unknown',
      clients: Number(r.n) || 0,
      mortgage,
      invest,
      wealth,
      mortgageReady: Number(r.mortgage_ready) || 0,
      investReady: Number(r.invest_ready) || 0,
      lean: leanOf(mortgage, invest, wealth),
    };
  });
  return {
    scope: res.scope,
    rows,
    clients: rows.reduce((s, r) => s + r.clients, 0),
    mortgageReady: rows.reduce((s, r) => s + r.mortgageReady, 0),
    investReady: rows.reduce((s, r) => s + r.investReady, 0),
    mortgageLeads: leads.map(r => {
      const tenure = Number(r.tenure) || 0;
      return {
        accountId: String(r.account_id ?? ''),
        score: Number(r.score) || 0,
        tenure: tenure === 2 ? 'mortgaged' as const : tenure === 1 ? 'owner' as const : 'renter' as const,
        balance: Number(r.balance) || 0,
        ratePct: r.rate == null ? null : Number(r.rate),
      };
    }),
  };
}

const MORTGAGE_ANGLE: Record<MortgageLeadTenure, { why: string; action: string; tag: string }> = {
  renter: { why: 'renting', action: 'Mortgage lead — first-home pre-approval', tag: 'First home' },
  owner: { why: 'owns free and clear', action: 'Mortgage lead — move-up purchase', tag: 'Move-up' },
  mortgaged: { why: 'has a mortgage', action: 'Mortgage lead — move-up / rate review', tag: 'Move-up · rate' },
};

/** Short angle label for the card's lead rows. */
export const mortgageLeadTag = (r: MortgageLead) => MORTGAGE_ANGLE[r.tenure].tag;

const TENURES: readonly MortgageLeadTenure[] = ['renter', 'owner', 'mortgaged'];

/** The three leads the queue shows — and the card lists — after exclusions: the top
 *  lead of each tenure the book has, any open slots filled by rank (renters first). */
export function selectMortgageLeads(res: LifeStageMixResult, exclude?: ReadonlySet<string>): MortgageLead[] {
  const kept = res.mortgageLeads.filter(r => !exclude?.has(r.accountId));
  const firsts = TENURES
    .map(t => kept.find(r => r.tenure === t))
    .filter((r): r is MortgageLead => r !== undefined);
  const fill = kept.filter(r => !firsts.includes(r)).slice(0, 3 - firsts.length);
  return [...firsts, ...fill].sort((a, b) => kept.indexOf(a) - kept.indexOf(b));
}

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });

/** A mortgaged lead's loan — "$412K at 6.25%" — for the queue reason and the card row; '' otherwise. */
export const mortgageLeadLoan = (r: MortgageLead) =>
  r.tenure === 'mortgaged' && r.balance
    ? `${money(r.balance)}${r.ratePct != null ? ` at ${r.ratePct.toFixed(2)}%` : ''}`
    : '';

/** The lead's next step — the queue action and the card's Task subject. */
export const mortgageLeadAction = (r: MortgageLead) => MORTGAGE_ANGLE[r.tenure].action;

/** Why the client is a lead — the queue reason and the card's Task comments. */
export const mortgageLeadReason = (r: MortgageLead) => {
  const loan = mortgageLeadLoan(r);
  return `Young family · mortgage propensity ${Math.round(r.score)} · ${MORTGAGE_ANGLE[r.tenure].why}${loan && ` (${loan})`}`;
};

/** Mortgage leads are due in 7 days — the queue item and the card's Task prefill. */
export const mortgageLeadDue = (now = new Date()) =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7).toISOString().slice(0, 10);

/** Renters (a first-home purchase) → medium; owners → low — the queue severity behind the Task priority. */
export const mortgageLeadSeverity = (r: MortgageLead): 'medium' | 'low' =>
  r.tenure === 'renter' ? 'medium' : 'low';

/** Task priority for the card's prefill: medium → High, low → Normal. */
export const mortgageLeadPriority = (r: MortgageLead) =>
  mortgageLeadSeverity(r) === 'medium' ? 'High' as const : 'Normal' as const;

/** R4 Young Families mortgage 70+ → queue: a mortgage lead. `exclude` drops
 *  clients another queue item already covers (Retail passes its R1 home-equity clients). */
export function mortgageLeadQueueItems(
  res: LifeStageMixResult,
  nameById: Record<string, string>,
  opts: { segment: string; now?: Date; exclude?: ReadonlySet<string> },
): QueueSignalItem[] {
  const due = mortgageLeadDue(opts.now);
  const src = `Claritas propensity${res.scope === 'org' ? ' · org-wide' : ''}`;
  return selectMortgageLeads(res, opts.exclude).map((r, i) => ({
    id: `ml${i}`,
    clientId: r.accountId,
    clientName: nameById[r.accountId] || r.accountId,
    segment: opts.segment,
    reason: mortgageLeadReason(r),
    action: mortgageLeadAction(r),
    score: Math.min(0.8, 0.3 + r.score / 200),
    severity: mortgageLeadSeverity(r),
    source: src,
    relationshipValue: 0,
    dueDate: due,
  }));
}
