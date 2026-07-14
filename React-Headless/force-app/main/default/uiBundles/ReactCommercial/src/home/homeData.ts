/**
 * HOME app data — MOCK phase. Commercial "Relationship Command": the RM "Alex"
 * over a middle-market book. Credit/PAYDEX, covenant monitoring, treasury
 * balances, firmographics, relationship hierarchy. Swappable fetcher: replace
 * body with executeGraphQL (Opportunity/Task/Event/FinancialGoal) +
 * queryDataCloud (DnB credit, ZoomInfo firmographics, BoardEx, delinquency,
 * SEC filings) later.
 */
import { mockResolve, series } from '../personas/mock/mockUtil';
import { resolve } from '../data/dataSource';
import { fetchHomeDashboardReal } from './homeDataReal';
import type { HomeDashboard } from './homeTypes';

const DASH: HomeDashboard = {
  bankerName: 'Alex',
  dateLabel: 'Monday, July 6',
  aiBriefHeadline: 'two covenant reviews and a treasury opportunity',
  aiBrief:
    'Your portfolio commitment stands at $1.24B across 62 relationships. Acme Manufacturing’s PAYDEX slipped to 52 and a debt-service covenant is trending toward breach; Northwind Logistics is carrying $8.4M idle in operating accounts — a treasury sweep opportunity. 2 credit reviews are due this week and one borrower’s D&B credit score was downgraded.',
  confidencePct: 86,
  dataSourceCount: 25,
  kpis: [
    { key: 'commitment', label: 'Total Commitment', value: 1240000000, format: 'currencyCompact', trend: series(2, 12, 1180, 40), deltaPct: 0.051 },
    { key: 'outstanding', label: 'Outstanding', value: 812000000, format: 'currencyCompact', trend: series(4, 12, 780, 25), deltaPct: 0.041 },
    { key: 'relationships', label: 'Relationships', value: 62, format: 'number', trend: series(3, 12, 60, 3), deltaPct: 0.018 },
    { key: 'deposits', label: 'Treasury Deposits', value: 348000000, format: 'currencyCompact', trend: series(8, 12, 320, 20), deltaPct: 0.087 },
    { key: 'atRisk', label: 'Covenant Watch', value: 4, format: 'number', trend: series(9, 12, 3, 2) },
    { key: 'confidence', label: 'Avg AI Confidence', value: 0.86, format: 'percent', trend: series(5, 12, 84, 5) },
  ],
  callList: [
    { id: 'c1', clientId: '001M', clientName: 'Acme Manufacturing', segment: 'Middle Market', reason: 'PAYDEX 52 (was 68); debt-service coverage trending toward covenant breach', action: 'Covenant review + restructure options', score: 0.90, severity: 'high', source: 'D&B + Covenant', relationshipValue: 42000000, tier: 'today' },
    { id: 'c2', clientId: '001N', clientName: 'Northwind Logistics', segment: 'Middle Market', reason: '$8.4M idle in operating accounts >60 days; no sweep in place', action: 'Treasury sweep + liquidity mgmt', score: 0.83, severity: 'high', source: 'Treasury', relationshipValue: 61000000, tier: 'today' },
    { id: 'c3', clientId: '001O', clientName: 'Sterling Foods Group', segment: 'Commercial', reason: 'D&B credit score downgraded one tier after a late-filing signal', action: 'Credit review + covenant check', score: 0.76, severity: 'medium', source: 'D&B Credit', relationshipValue: 28000000, tier: 'week' },
    { id: 'c4', clientId: '001Q', clientName: 'Vertex Industrial', segment: 'Commercial', reason: 'Line utilization at 92% for 3 straight months — capacity constraint', action: 'Discuss facility increase', score: 0.68, severity: 'medium', source: 'Utilization', relationshipValue: 35000000, tier: 'week' },
    { id: 'c5', clientId: '001T', clientName: 'Cascade Retail Co', segment: 'Small Business', reason: 'Maturity in 45 days; renewal not yet initiated', action: 'Begin renewal + repricing', score: 0.57, severity: 'low', source: 'Maturity', relationshipValue: 12000000, tier: 'watch' },
  ],
  recommendations: [
    {
      id: 'r1', kind: 'task', objectLabel: 'Task', clientName: 'Acme Manufacturing', clientId: '001M',
      title: 'Schedule Acme Manufacturing covenant review',
      body: 'PAYDEX slipped to 52 and debt-service coverage is trending toward a breach. Prepare a covenant review with restructure options before the next test date.',
      evidence: 'PAYDEX 52 (was 68) with DSCR approaching the 1.25x covenant minimum on a $42M relationship',
    },
    {
      id: 'r2', kind: 'call', objectLabel: 'Opportunity', clientName: 'Northwind Logistics', clientId: '001N',
      title: 'Pitch a treasury sweep to Northwind Logistics',
      body: '$8.4M has been sitting idle in operating accounts for 60+ days with no sweep in place. Call to propose a liquidity-management + sweep structure.',
      evidence: '$8.4M unswept operating balance >60 days — a live treasury-management opportunity',
    },
    {
      id: 'r3', kind: 'email', objectLabel: 'Account', clientName: 'Vertex Industrial', clientId: '001Q',
      title: 'Reach out to Vertex Industrial on a facility increase',
      body: 'Line utilization has held at 92% for three straight months, signaling a capacity constraint. Email to open a facility-increase conversation.',
      evidence: 'Revolver utilization at 92% for 3 consecutive months on a $35M relationship',
    },
    {
      id: 'r4', kind: 'case', objectLabel: 'Case', clientName: 'Sterling Foods Group', clientId: '001O',
      title: 'Open a credit-review case for Sterling Foods Group',
      body: 'A D&B one-tier downgrade after a late-filing signal warrants a credit review and covenant check. Log a case and pull updated financials.',
      evidence: 'D&B credit downgrade (−1 tier) following a late-filing signal — delinquency risk indicator',
    },
  ],
  rightNow: {
    clientId: '001M',
    clientName: 'Acme Manufacturing',
    headline: 'Call Acme Manufacturing — a debt-service covenant is trending toward breach as PAYDEX drops to 52.',
    detail: 'Coverage is nearing the 1.25x floor on a $42M relationship. One call opens the covenant review and restructure options before the next test date.',
    taskSubject: 'Covenant review call',
  },
  pipeline: [
    { id: 'o1', clientName: 'Northwind Logistics', name: 'Treasury Management', stage: 'Proposal', amount: 8400000, closeDate: 'Jul 21', propensity: 0.72 },
    { id: 'o2', clientName: 'Vertex Industrial', name: 'Facility Increase', stage: 'Negotiation', amount: 15000000, closeDate: 'Jul 26', propensity: 0.66 },
    { id: 'o3', clientName: 'Acme Manufacturing', name: 'Debt Restructure', stage: 'Discovery', amount: 42000000, closeDate: 'Aug 05', propensity: 0.48 },
    { id: 'o4', clientName: 'Meridian Health', name: 'Equipment Finance', stage: 'Qualification', amount: 6200000, closeDate: 'Aug 12', propensity: 0.70 },
    { id: 'o5', clientName: 'Cascade Retail Co', name: 'Line Renewal', stage: 'Negotiation', amount: 12000000, closeDate: 'Aug 18', propensity: 0.63 },
  ],
  bankerGoals: [
    { id: 'g1', name: 'New Commitments', current: 84000000, target: 150000000, format: 'currencyCompact' },
    { id: 'g2', name: 'Treasury Deposits', current: 348000000, target: 500000000, format: 'currencyCompact' },
    { id: 'g3', name: 'Cross-Sell (TM adoption)', current: 41, target: 62, format: 'number' },
    { id: 'g4', name: 'Renewals Completed', current: 18, target: 30, format: 'number' },
  ],
  lifeEvents: [
    { id: 'le1', clientId: '001D', clientName: 'Delta Foods Inc', event: 'Acquired a competitor', when: '4 days ago', opportunity: 'Acquisition financing + integration treasury', icon: '🤝' },
    { id: 'le2', clientId: '001E', clientName: 'Emerald Construction', event: 'Won a major contract', when: '1 week ago', opportunity: 'Working-capital line + performance bonds', icon: '📈' },
    { id: 'le3', clientId: '001F', clientName: 'Frontier Freight', event: 'CFO transition', when: 'Last week', opportunity: 'Re-engage on treasury + refinance', icon: '👔' },
    { id: 'le4', clientId: '001G', clientName: 'Granite Materials', event: 'Opened a new facility', when: '2 weeks ago', opportunity: 'Equipment finance + expansion capital', icon: '🏗️' },
  ],
  schedule: [
    { id: 's1', time: '9:00', title: 'Covenant review — Acme Manufacturing', kind: 'meeting', clientName: 'Acme Manufacturing' },
    { id: 's2', time: '10:30', title: 'Treasury pitch — Northwind Logistics', kind: 'call', clientName: 'Northwind Logistics' },
    { id: 's3', time: '13:00', title: 'Prepare credit memo — Sterling Foods', kind: 'task', clientName: 'Sterling Foods Group' },
    { id: 's4', time: '14:30', title: 'Credit committee', kind: 'event' },
    { id: 's5', time: '16:00', title: 'Renewal terms — Cascade Retail', kind: 'task', clientName: 'Cascade Retail Co' },
  ],
  alerts: [
    { id: 'a1', title: 'Covenant trending to breach', detail: 'Acme Manufacturing — DSCR 1.18x vs 1.25x minimum', tone: 'risk', severity: 'High', when: '2h ago' },
    { id: 'a2', title: 'Idle balances detected', detail: 'Northwind Logistics — $8.4M unswept >60 days', tone: 'opportunity', severity: 'High', when: '5h ago' },
    { id: 'a3', title: 'Credit downgrade', detail: 'Sterling Foods — D&B score −1 tier', tone: 'risk', severity: 'Medium', when: '7h ago' },
    { id: 'a4', title: 'Deposit inflow', detail: 'Meridian Health — +$3.1M operating balance', tone: 'positive', severity: 'Low', when: 'Yesterday' },
  ],
  leads: [
    { id: 'l1', name: 'Halcyon Robotics', source: 'COI — CPA Firm', status: 'Qualified', value: 22000000 },
    { id: 'l2', name: 'Pinnacle Foods', source: 'Referral', status: 'Working', value: 14000000 },
    { id: 'l3', name: 'Summit Aggregates', source: 'RFP', status: 'New', value: 9500000 },
    { id: 'l4', name: 'Orion Freight', source: 'Industry Event', status: 'New', value: 6400000 },
  ],
  delinquency: {
    totalDelinquentBalance: 4820000,
    totalRecovered: 1130000,
    byStatus: [
      { status: '90 days late', count: 38, balance: 2740000 },
      { status: '60 days late', count: 71, balance: 1520000 },
      { status: '30 days late', count: 96, balance: 560000 },
    ],
    asOf: 'Latest',
  },
};

/**
 * HOME dashboard fetcher. Resolves to mock or live per the dataSource switch.
 * `core` domain covers the GraphQL side; when flipped to 'real' it calls the
 * verified live implementation. Stays mock until org schema is verified.
 */
export function fetchHomeDashboard(): Promise<HomeDashboard> {
  return resolve('core', () => mockResolve(DASH, 400), () => fetchHomeDashboardReal());
}
