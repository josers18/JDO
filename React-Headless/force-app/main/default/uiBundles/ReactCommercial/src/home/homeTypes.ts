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

export interface ScheduleItem {
  id: string;
  time: string;
  title: string;
  kind: 'call' | 'meeting' | 'task' | 'event';
  clientName?: string;
}

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
  confidencePct: number;
  dataSourceCount: number;
}
