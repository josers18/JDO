/**
 * HOME app view models — the banker's morning landing page (replaces the
 * standard Salesforce home). Banker-centric, across the whole book. Mock now,
 * swappable to executeGraphQL / queryDataCloud later.
 */

export interface HomeKpi {
  key: string;
  label: string;
  value: number;
  format: 'currency' | 'currencyCompact' | 'number' | 'percent' | 'plain';
  trend?: number[];
  deltaPct?: number;
  /** Short sub-line under the value (e.g. "632 closing 30d"). */
  note?: string;
}

/** "Who to call today & why" — the centerpiece ranked action list. */
export interface CallItem {
  id: string;
  clientId: string;
  clientName: string;
  segment: string;
  reason: string;
  action: string;
  score: number; // 0..1 AI priority
  severity: 'high' | 'medium' | 'low';
  source: string;
  relationshipValue: number;
  /** Priority-queue grouping used by the command-center home. */
  tier?: 'today' | 'week' | 'watch';
}

/**
 * A pre-drafted next move the banker can approve/edit/dismiss. Maps 1:1 to a
 * CRM write (Task / Email / Event / Case).
 */
export interface Recommendation {
  id: string;
  kind: 'task' | 'email' | 'call' | 'case';
  /** SObject label surfaced on the card (Task / Account / Opportunity / Case). */
  objectLabel: string;
  title: string;
  body: string;
  /** The evidence line the model cites (rendered after the AI mark). */
  evidence: string;
  clientName: string;
  clientId: string;
}

/** The single "your first move right now" item that anchors the hero. */
export interface RightNowItem {
  clientId: string;
  clientName: string;
  headline: string;
  detail: string;
  /** Subject to pre-fill when scheduling the first move. */
  taskSubject: string;
}

export interface PipelineItem {
  id: string;
  clientName: string;
  name: string;
  stage: string;
  amount: number;
  closeDate: string;
  propensity: number; // 0..1
}

/** Banker quota / goal attainment. */
export interface BankerGoal {
  id: string;
  name: string;
  current: number;
  target: number;
  format: 'currency' | 'currencyCompact' | 'number' | 'percent';
}

/** A life-event signal across the book → opportunity. */
export interface LifeEventSignal {
  id: string;
  clientId: string;
  clientName: string;
  event: string;
  when: string;
  opportunity: string;
  icon: string;
}

import type { ScheduleItem } from '@shared';
export type { ScheduleItem };

export interface AlertSignal {
  id: string;
  title: string;
  detail: string;
  tone: 'positive' | 'opportunity' | 'risk' | 'neutral';
  severity: 'High' | 'Medium' | 'Low';
  when: string;
}

export interface LeadReferral {
  id: string;
  name: string;
  source: string;
  status: string;
  value: number;
  /** Lead.Email — the recipient for the "email this lead" action. A Lead is
   *  not an Account, so the EmailModal's Account-email lookup can't resolve it;
   *  the address must ride along on the referral itself. '' when the Lead has none. */
  email: string;
}

/** Book-level loan delinquency aggregate (NOT client-joinable — a book metric). */
export interface DelinquencyWatch {
  totalDelinquentBalance: number;
  totalRecovered: number;
  byStatus: { status: string; count: number; balance: number }[];
  asOf: string;
}

export interface HomeDashboard {
  bankerName: string;
  dateLabel: string;
  aiBriefHeadline: string;
  aiBrief: string;
  kpis: HomeKpi[];
  callList: CallItem[];
  pipeline: PipelineItem[];
  bankerGoals: BankerGoal[];
  lifeEvents: LifeEventSignal[];
  schedule: ScheduleItem[];
  alerts: AlertSignal[];
  leads: LeadReferral[];
  recommendations: Recommendation[];
  rightNow?: RightNowItem;
  confidencePct: number;
  dataSourceCount: number;
  /** Book-level delinquency aggregate (null when not wired for this persona). */
  delinquency: DelinquencyWatch | null;
}
