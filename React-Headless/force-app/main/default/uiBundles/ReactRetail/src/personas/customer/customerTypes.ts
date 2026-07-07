/**
 * Customer 360 view model — mirrors the REAL fields on the live Salesforce
 * Retail account (Julie E Morris, 001am00000qvjsAAAQ) so swapping mock → live
 * data is 1:1. Sourced from c-customer-profile-widget + Einstein AI Signals +
 * the Unified Relationships (Data Cloud identity resolution) panel.
 */

export interface StatusChip {
  label: string;
  on: boolean;
}

export interface MoneyLine {
  label: string;
  amount: number;
  deltaLabel: string;
  positive: boolean;
}

/** One node in the unified cross-org identity graph (Data Cloud). */
export interface UnifiedProfile {
  sourceOrg: string;
  accountId: string;
  name: string;
}

export interface HealthDimension {
  label: string;
  score: number; // 0..100
  trend: 'up' | 'down' | 'flat';
}

export interface AiSignal {
  label: string;
  value: string;
  tone: 'positive' | 'opportunity' | 'risk' | 'neutral';
}

export interface NextBestAction {
  id: string;
  title: string;
  detail: string;
  impact: 'High' | 'Medium' | 'Low';
}

/** A single highlight chip in the "what's changed" strip. */
export interface Highlight {
  icon: string;
  label: string;
  value: string;
  sub: string;
  tone: 'positive' | 'opportunity' | 'risk' | 'neutral';
}

export interface Customer360 {
  id: string;
  name: string;
  location: string;
  segment: string;
  riskProfile: string;
  customerSince: string;
  lastInteraction: string;
  photoInitials: string;
  statusChips: StatusChip[];
  money: MoneyLine[];
  loanLimit: number;
  opportunitiesValue: number;
  casesCount: number;
  healthScore: number;
  healthDimensions: HealthDimension[];
  unifiedProfiles: UnifiedProfile[];
  aiSignals: AiSignal[];
  /** prompt-generated relationship narrative */
  aiBrief: string;
  aiBriefHeadline: string;
  nextBestActions: NextBestAction[];
  highlights: Highlight[];
  confidencePct: number;
  dataSourceCount: number;
}

/** Holdings/portfolio row for the Money/Portfolio tab table. */
export interface HoldingRow {
  id: string;
  name: string;
  category: string;
  balance: number;
  changePct: number;
}

/** Opportunity/referral row for the Planning tab table. */
export interface OpportunityRow {
  id: string;
  name: string;
  stage: string;
  amount: number;
  closeDate: string;
}

/** An ML prediction (churn, propensity, etc.) with SHAP-style drivers. */
export interface Prediction {
  id: string;
  title: string;
  score: number; // 0..1
  scoreLabel: string;
  outcome: string;
  tone: 'positive' | 'opportunity' | 'risk' | 'neutral';
  drivers: { label: string; impact: number }[];
}

/** A life-event / milestone on the journey filmstrip. */
export interface JourneyEvent {
  id: string;
  year: number;
  name: string;
  date: string;
  status: 'done' | 'now';
  icon: string;
}

/** A goal ring (target + % complete + priority). */
export interface GoalRing {
  id: string;
  name: string;
  amount: number;
  pct: number;
  priority: 'high' | 'medium' | 'low';
  date: string;
  color: string;
}

/** A web/behavioral engagement event (Data Cloud real-time). */
export interface WebEngagement {
  id: string;
  when: string;
  channel: string;
  action: string;
  intent: 'high' | 'medium' | 'low';
}

/** Everything the tabbed body of the 360 needs — grouped by tab. */
export interface Customer360Detail {
  /** Journey tab */
  journey: JourneyEvent[];
  goalRings: GoalRing[];
  /** Engagement tab — web/behavioral (Data Cloud) */
  webEngagements: WebEngagement[];
  /** Money tab */
  productMix: { label: string; value: number; color: string }[];
  aumTrend: { label: string; color: string; points: number[] }[];
  cashFlowIn: { id: string; label: string; value: number; side: 'in'; color: string }[];
  cashFlowOut: { id: string; label: string; value: number; side: 'out'; color: string }[];
  holdings: HoldingRow[];
  /** Engagement tab */
  interactions: { label: string; value: number }[];
  timeline: { id: string; when: string; title: string; detail?: string; tone?: 'positive' | 'opportunity' | 'risk' | 'neutral'; icon?: string }[];
  /** Planning tab */
  opportunities: OpportunityRow[];
  goals: { id: string; name: string; target: number; current: number }[];
  /** Risk tab */
  predictions: Prediction[];
  /** Network tab */
  network: { id: string; label: string; sublabel?: string; weight?: number; color?: string }[];
}

/** A row in the book-landing priority list (drills into a Customer360). */
export interface BookClient {
  id: string;
  name: string;
  segment: string;
  headline: string;
  reason: string;
  score: number;
  severity: 'high' | 'medium' | 'low';
  relationshipValue: number;
}
