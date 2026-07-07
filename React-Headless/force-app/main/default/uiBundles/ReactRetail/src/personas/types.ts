import type { ValueFormat } from '@shared';

/** A KPI tile's data (shared shape across all three personas). */
export interface Kpi {
  key: string;
  label: string;
  value: number;
  format: ValueFormat;
  trend?: number[];
  deltaPct?: number;
}

/** A financial account line in a client/account drill-in. */
export interface AccountLine {
  id: string;
  name: string;
  type: string;
  balance: number;
}

/** A unified activity item (task/event/note). */
export interface ActivityItem {
  id: string;
  kind: string;
  subject: string;
  when: string;
}

/** An opportunity in a pipeline panel. */
export interface PipelineOpp {
  id: string;
  name: string;
  stage: string;
  amount: number;
  closeDate: string;
}

/** A goal / financial plan progress row. */
export interface GoalProgress {
  id: string;
  name: string;
  target: number;
  current: number;
}

/** ---- Retail client drill-in ---- */
export interface RetailClient {
  id: string;
  name: string;
  segment: string;
  email: string | null;
  phone: string | null;
  tenureYears: number;
  lifeEvent: string | null;
  accounts: AccountLine[];
}

/** ---- Commercial ---- */
export interface RelationshipNode {
  id: string;
  name: string;
  relation: string;
  depth: number;
}

export interface CommercialAccount {
  id: string;
  name: string;
  industry: string;
  annualRevenue: number;
  website: string;
  employees: number;
  paydex: number;
  creditRating: string;
  secLastFiling: string;
  execs: { name: string; title: string }[];
  accounts: AccountLine[];
  relationships: RelationshipNode[];
}

/** ---- Wealth ---- */
export interface Holding {
  id: string;
  symbol: string;
  name: string;
  assetClass: string;
  marketValue: number;
  dayChangePct: number;
  esgScore: number;
}

export interface Trade {
  id: string;
  action: 'BUY' | 'SELL';
  symbol: string;
  shares: number;
  amount: number;
  when: string;
}

export interface WealthClient {
  id: string;
  name: string;
  segment: string;
  aum: number;
  heldAway: number;
  retirementReadiness: number; // 0..1
  riskProfile: string;
  holdings: Holding[];
  trades: Trade[];
  plans: GoalProgress[];
}
