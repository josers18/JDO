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
    { id: 'l1', name: 'Halcyon Robotics', source: 'COI — CPA Firm', status: 'Qualified', value: 22000000, email: 'treasury@halcyonrobotics.com' },
    { id: 'l2', name: 'Pinnacle Foods', source: 'Referral', status: 'Working', value: 14000000, email: 'cfo@pinnaclefoods.com' },
    { id: 'l3', name: 'Summit Aggregates', source: 'RFP', status: 'New', value: 9500000, email: 'finance@summitaggregates.com' },
    { id: 'l4', name: 'Orion Freight', source: 'Industry Event', status: 'New', value: 6400000, email: 'ap@orionfreight.com' },
  ],
  activity: [
    { id: 'ac1', clientName: 'Acme Manufacturing', clientId: '001C', title: 'Covenant DSCR breached threshold', when: 'May 14, 10:25 AM', icon: 'alerts', tone: 'risk' },
    { id: 'ac2', clientName: 'Northwind Logistics', title: 'Treasury proposal opened', when: 'May 13, 4:05 PM', icon: 'email', tone: 'opportunity' },
    { id: 'ac3', clientName: 'Meridian Health', title: 'Operating balance +$3.1M', when: 'May 12, 10:11 AM', icon: 'pipeline', tone: 'positive' },
    { id: 'ac4', clientName: 'Sterling Foods Group', title: 'D&B score downgraded 1 tier', when: 'May 12, 9:31 AM', icon: 'alerts', tone: 'risk' },
  ],
  pipelineMovement: [
    { id: 'pm1', label: 'Treasury Management', amount: 18_400_000, deltaPct: 0.14, trend: series(4, 8, 16_000_000, 700_000) },
    { id: 'pm2', label: 'Commercial Lending', amount: 69_000_000, deltaPct: 0.09, trend: series(6, 8, 64_000_000, 2_400_000) },
    { id: 'pm3', label: 'Equipment Finance', amount: 12_600_000, deltaPct: 0.18, trend: series(9, 8, 10_500_000, 620_000) },
    { id: 'pm4', label: 'Debt Restructure', amount: 42_000_000, deltaPct: -0.05, trend: series(2, 8, 45_000_000, 1_800_000) },
  ],
  cases: [
    { id: 'cs1', caseNumber: '00002087', subject: 'Covenant breach review — Q3 filing', priority: 'High', status: 'Escalated', clientName: 'Delta Foods Inc', clientId: '001D', ageDays: 5 },
    { id: 'cs2', caseNumber: '00002081', subject: 'ACH batch rejected — treasury portal', priority: 'High', status: 'Working', clientName: 'Frontier Freight', clientId: '001F', ageDays: 2 },
    { id: 'cs3', caseNumber: '00002074', subject: 'Line-of-credit draw dispute', priority: 'Medium', status: 'New', clientName: 'Granite Materials', clientId: '001G', ageDays: 4 },
    { id: 'cs4', caseNumber: '00002066', subject: 'Lockbox remittance mismatch', priority: 'Low', status: 'Working', clientName: 'Emerald Construction', clientId: '001E', ageDays: 11 },
  ],
  customerGoals: [
    { id: 'cg1', name: 'Working-capital reserve target', clientName: 'Frontier Freight', clientId: '001F', status: 'IN_PROGRESS', targetDate: '2026-09-30', daysUntil: 71, target: 12000000, current: 8400000 },
    { id: 'cg2', name: 'Expansion capex — new facility', clientName: 'Granite Materials', clientId: '001G', status: 'IN_PROGRESS', targetDate: '2026-11-30', daysUntil: 132, target: 25000000, current: 9600000 },
    { id: 'cg3', name: 'Debt-to-EBITDA below 3.0x', clientName: 'Delta Foods Inc', clientId: '001D', status: 'NOT_STARTED', targetDate: '2026-12-31', daysUntil: 163, target: 3, current: 4.1 },
    { id: 'cg4', name: 'Treasury sweep automation', clientName: 'Emerald Construction', clientId: '001E', status: 'IN_PROGRESS', targetDate: '2027-01-31', daysUntil: 194, target: 40000000, current: 22000000 },
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
