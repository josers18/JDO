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
  /** Signal-native ISO due date (YYYY-MM-DD) — set by the priority-queue
   *  blender so the card can sort/label by real dates, not severity. */
  dueDate?: string;
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

/** A recent-activity feed row for the cockpit supporting band. */
export interface ActivityItem {
  id: string;
  clientName: string;
  clientId?: string;
  /** What happened, e.g. "Payment declined on credit card". */
  title: string;
  /** When, display string, e.g. "May 14, 10:25 AM". */
  when: string;
  /** Row glyph key — reuses the iconMap. */
  icon: 'email' | 'call' | 'alerts' | 'task' | 'pipeline' | 'event';
  tone: 'positive' | 'opportunity' | 'risk' | 'neutral';
}

/** A pipeline-movement row (value by product line + trend) for the supporting band. */
export interface PipelineMovement {
  id: string;
  label: string;
  amount: number;
  /** Signed week-over-week change, e.g. +0.12 or -0.04. */
  deltaPct: number;
  trend: number[];
}

/** An open service Case row for the cockpit supporting band + explorer. */
export interface CaseItem {
  id: string;
  /** Case.CaseNumber, e.g. "00001234". */
  caseNumber: string;
  subject: string;
  /** Case.Priority — 'High' | 'Medium' | 'Low' (or org values); '' when unset. */
  priority: string;
  /** Case.Status, e.g. "New" / "Working" / "Escalated". */
  status: string;
  /** Related Account name; '' when the case has no account. */
  clientName: string;
  clientId?: string;
  /** Whole days since Case.CreatedDate (age). 0 when unknown. */
  ageDays: number;
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
  /** Recent-activity feed for the cockpit supporting band. */
  activity: ActivityItem[];
  /** Pipeline movement by product line for the cockpit supporting band. */
  pipelineMovement: PipelineMovement[];
  /** Open service cases for the cockpit supporting band + explorer. */
  cases: CaseItem[];
  rightNow?: RightNowItem;
  confidencePct: number;
  dataSourceCount: number;
  /** Book-level delinquency aggregate (null when not wired for this persona). */
  delinquency: DelinquencyWatch | null;
}
