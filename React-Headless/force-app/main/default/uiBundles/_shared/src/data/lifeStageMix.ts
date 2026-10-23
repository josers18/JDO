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
 */
import { queryDataCloudForBook, type BookScope } from './dataCloudClient';

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
  };
}
