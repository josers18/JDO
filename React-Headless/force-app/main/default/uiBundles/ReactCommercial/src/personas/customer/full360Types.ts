/**
 * Full Customer 360 content contract (§3b of
 * docs/customer-360-inventory-and-gaps.md). One type per content area. Retail
 * (Julie Morris) first. Mock now; each maps 1:1 to a GraphQL/DC source later.
 */

/* ---------- Details (editable) ---------- */
export interface DetailField {
  key: string;
  label: string;
  value: string;
  editable: boolean;
  group: string; // section grouping
  type?: 'text' | 'email' | 'phone' | 'picklist' | 'currency';
  options?: string[];
}

/* ---------- Financial Accounts / Transactions / Trades ---------- */
export interface FinAccount {
  id: string;
  name: string;
  type: string;
  number: string;
  balance: number;
  status: string;
  opened: string;
}
export interface Transaction {
  id: string;
  date: string;
  description: string;
  category: string;
  account: string;
  amount: number;
}
export interface Trade {
  id: string;
  date: string;
  action: 'BUY' | 'SELL';
  symbol: string;
  name: string;
  shares: number;
  price: number;
  amount: number;
}

/* ---------- Interactions & Engagements ---------- */
export interface Interaction {
  id: string;
  when: string;
  channel: string;
  type: string;
  summary: string;
  sentiment: 'positive' | 'neutral' | 'negative';
}

/* ---------- Cases ---------- */
export interface CaseRow {
  id: string;
  number: string;
  subject: string;
  status: string;
  priority: 'High' | 'Medium' | 'Low';
  opened: string;
}

/* ---------- CSAT & NPS ---------- */
export interface CsatNps {
  csatScore: number;
  npsScore: number;
  csatTrend: number[];
  npsTrend: number[];
  recent: { id: string; when: string; type: 'CSAT' | 'NPS'; score: number; verbatim: string }[];
}

/* ---------- Opportunities ---------- */
export interface Opportunity {
  id: string;
  name: string;
  stage: string;
  amount: number;
  closeDate: string;
  probability: number;
}

/* ---------- Campaigns ---------- */
export interface Campaign {
  id: string;
  name: string;
  type: string;
  status: string;
  responded: boolean;
  memberSince: string;
}

/* ---------- Meeting Notes / Call Summaries / KYC ---------- */
export interface MeetingNote {
  id: string;
  date: string;
  title: string;
  author: string;
  body: string;
}
export interface CallSummary {
  id: string;
  date: string;
  duration: string;
  channel: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  summary: string;
}
export interface KycSummary {
  id: string;
  status: string;
  lastReview: string;
  riskRating: string;
  amlStatus: string;
  notes: string;
}

/* ---------- Sidebar: ML predictions + Agentforce summaries ---------- */
export interface MlPrediction {
  key: 'attrition' | 'csat' | 'productRec';
  title: string;
  score: number; // 0..1
  scoreLabel: string;
  outcome: string;
  tone: 'positive' | 'opportunity' | 'risk' | 'neutral';
  drivers: { label: string; impact: number }[];
}
export interface AgentforceSummary {
  key: string; // account | transaction | trade | interaction | csat | opportunity | case | campaign
  title: string;
  text: string;
}

/* ---------- Property (CoreLogic) & Financial Plan (MoneyGuidePro) ---------- */
export interface PropertyInfo {
  estimatedValue: number;
  equity: number;
  mortgageBalance: number;
  helocOpportunityScore: number; // 0..100
  propertyType: string;
  floodZone: string;
  wildfireRiskScore: number; // 0..100
  isOwner: boolean;
  asOf: string;
}
export interface FinancialPlan {
  status: string;            // e.g. Active / Stale
  retirementTargetAge: number;
  monthlyIncomeTarget: number;
  totalGoalAmount: number;
  goalCount: number;
  recommendedAllocation: string;
  nextReviewDate: string;
  asOf: string;
}

/* ---------- Company Intel (ZoomInfo / BoardEx / MSCI / SEC) ---------- */
export interface Firmographics {
  revenueBand: string;
  employeeBand: string;
  industryNaics: string;
  industrySic: string;
  foundedYear: number;
  website: string;
  hq: string;
  linkedinFollowers: number;
  techStack: string[];
  asOf: string;
}
export interface Governance {
  boardSize: number;
  ceoTenureYears: number;
  boardAvgTenureYears: number;
  governanceRating: string;
  keyDirector: string;
  interlockCount: number;
  execTurnover: boolean;
  recentEventDate: string;
  asOf: string;
}
export interface EsgProfile {
  overall: number;
  environmental: number;
  social: number;
  governance: number;
  rating: string;
  carbonIntensity: number;
  controversyCount: number;
  topControversy: string;
  ratingChangeDirection: string;
  asOf: string;
}
export interface SecFiling {
  filingType: string;
  sections: { id: string; section: string; text: string }[];
}

/* ---------- The full bundle ---------- */
export interface Full360 {
  details: DetailField[];
  finAccounts: FinAccount[];
  transactions: Transaction[];
  trades: Trade[];
  interactions: Interaction[];
  cases: CaseRow[];
  csatNps: CsatNps;
  opportunities: Opportunity[];
  campaigns: Campaign[];
  meetingNotes: MeetingNote[];
  callSummaries: CallSummary[];
  kyc: KycSummary;
  predictions: MlPrediction[];
  agentforce: Record<string, AgentforceSummary>;
  /** CoreLogic property enrichment (null when the account has no property row). */
  property: PropertyInfo | null;
  /** MoneyGuidePro financial plan (null when no plan on file). */
  financialPlan: FinancialPlan | null;
  /** ZoomInfo firmographics (null when the account has no firmographic row). */
  firmographics: Firmographics | null;
  /** BoardEx governance / exec intel (null when none). */
  governance: Governance | null;
  /** MSCI corporate ESG profile (null when none). */
  esg: EsgProfile | null;
  /** SEC filings grouped by filing type (empty array when none). */
  secFilings: SecFiling[];
}
