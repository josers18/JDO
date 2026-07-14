/**
 * HOME app data — MOCK phase, banker "Alex Morgan" over a Cumulus retail book.
 * Swappable fetcher: replace body with executeGraphQL (Opportunity/Task/Event/
 * FinancialGoal/Lead) + queryDataCloud (churn, NBA, life events, CSAT) later.
 */
import { mockResolve, series } from '../personas/mock/mockUtil';
import { resolve } from '../data/dataSource';
import { fetchHomeDashboardReal } from './homeDataReal';
import type { HomeDashboard } from './homeTypes';

const DASH: HomeDashboard = {
  bankerName: 'Alex',
  dateLabel: 'Monday, July 6',
  aiBriefHeadline: 'a high-opportunity morning',
  aiBrief:
    'Your book is up 8.4% this quarter. 3 clients need a call today — Julie Morris tops the list with a $1.2M held-away consolidation window and a CD-ladder opening. Two life events surfaced over the weekend, and pipeline is healthy at $3.9M with 4 deals closing this month.',
  confidencePct: 87,
  dataSourceCount: 24,
  kpis: [
    { key: 'bookValue', label: 'Book Value', value: 48200000, format: 'currencyCompact', trend: series(2, 12, 46, 5), deltaPct: 0.084 },
    { key: 'deposits', label: 'Deposits', value: 18420000, format: 'currencyCompact', trend: series(7, 12, 18, 3), deltaPct: 0.058 },
    { key: 'households', label: 'Households', value: 128, format: 'number', trend: series(3, 12, 120, 12), deltaPct: 0.031 },
    { key: 'pipeline', label: 'Pipeline', value: 3920000, format: 'currencyCompact', trend: series(8, 12, 3.6, 0.8), deltaPct: 0.14 },
    { key: 'atRisk', label: 'At-Risk', value: 9, format: 'number', trend: series(9, 12, 10, 4), deltaPct: 0.12 },
    { key: 'confidence', label: 'Avg AI Confidence', value: 0.87, format: 'percent', trend: series(5, 12, 84, 6) },
  ],
  callList: [
    { id: 'c1', clientId: '001am00000qvjsAAAQ', clientName: 'Julie E Morris', segment: 'Mass Affluent', reason: '$1.2M held-away detected; CDs flagged as next-best-product; deposits +12% YoY', action: 'Held-away consolidation + CD ladder', score: 0.91, severity: 'high', source: 'Plaid + Agentforce', relationshipValue: 921073 },
    { id: 'c2', clientId: '001B', clientName: 'Marcus Chen', segment: 'Emerging Affluent', reason: 'Visited the refi calculator 5× this week — active rate-shopping', action: 'Offer HELOC / mortgage refi', score: 0.84, severity: 'high', source: 'Web Engagement', relationshipValue: 540000 },
    { id: 'c3', clientId: '001C', clientName: 'Priya Natarajan', segment: 'Mass Affluent', reason: 'New-child life event; eligible for 529 + term life', action: 'Open 529 plan', score: 0.77, severity: 'medium', source: 'PersonLifeEvent', relationshipValue: 310000 },
    { id: 'c4', clientId: '001E', clientName: 'Sofia Rossi', segment: 'Mass Affluent', reason: 'CSAT fell 9→6 after last branch visit; complaint logged', action: 'Service-recovery call', score: 0.62, severity: 'medium', source: 'CSAT / NPS', relationshipValue: 420000 },
    { id: 'c5', clientId: '001D', clientName: 'Diego Ramirez', segment: 'Retail', reason: '$48k idle in checking >90 days', action: 'Move to high-yield savings', score: 0.48, severity: 'low', source: 'PRODUCT_REC', relationshipValue: 190000 },
  ],
  pipeline: [
    { id: 'o1', clientName: 'Julie E Morris', name: 'CD Ladder', stage: 'Proposal', amount: 120000, closeDate: 'Jul 18', propensity: 0.81 },
    { id: 'o2', clientName: 'Marcus Chen', name: 'Mortgage Refi', stage: 'Negotiation', amount: 410000, closeDate: 'Jul 22', propensity: 0.68 },
    { id: 'o3', clientName: 'Priya Natarajan', name: '529 Plan', stage: 'Qualification', amount: 24000, closeDate: 'Jul 25', propensity: 0.72 },
    { id: 'o4', clientName: 'Julie E Morris', name: 'Held-Away Consolidation', stage: 'Discovery', amount: 1200000, closeDate: 'Aug 02', propensity: 0.55 },
    { id: 'o5', clientName: 'Tom Becker', name: 'Auto Loan', stage: 'Negotiation', amount: 38000, closeDate: 'Aug 09', propensity: 0.64 },
  ],
  bankerGoals: [
    { id: 'g1', name: 'Deposit Growth', current: 1360000, target: 2000000, format: 'currencyCompact' },
    { id: 'g2', name: 'New Households', current: 13, target: 20, format: 'number' },
    { id: 'g3', name: 'Cross-Sell Ratio', current: 68, target: 100, format: 'number' },
    { id: 'g4', name: 'Referrals Closed', current: 7, target: 12, format: 'number' },
  ],
  lifeEvents: [
    { id: 'le1', clientId: '001C', clientName: 'Priya Natarajan', event: 'New child', when: '2 days ago', opportunity: '529 college plan + term life', icon: '🎉' },
    { id: 'le2', clientId: '001am00000qvjsAAAQ', clientName: 'Julie E Morris', event: 'Appointed CEO — Morris Roasters', when: '5 days ago', opportunity: 'Business banking + wealth transfer', icon: '💼' },
    { id: 'le3', clientId: '001G', clientName: 'Wei Zhang', event: 'Home purchase', when: 'Last week', opportunity: 'Mortgage + home insurance referral', icon: '🏠' },
    { id: 'le4', clientId: '001H', clientName: 'Aisha Khan', event: 'Job change', when: 'Last week', opportunity: '401k rollover consolidation', icon: '📈' },
  ],
  schedule: [
    { id: 's1', time: '9:00', title: 'Retention call — Julie Morris', kind: 'call', clientName: 'Julie E Morris' },
    { id: 's2', time: '10:30', title: 'Portfolio review — Marcus Chen', kind: 'meeting', clientName: 'Marcus Chen' },
    { id: 's3', time: '13:00', title: 'Send 529 packet — Priya', kind: 'task', clientName: 'Priya Natarajan' },
    { id: 's4', time: '15:00', title: 'Branch community event', kind: 'event' },
    { id: 's5', time: '16:30', title: 'Follow up auto pre-approval — Tom', kind: 'task', clientName: 'Tom Becker' },
  ],
  alerts: [
    { id: 'a1', title: 'Large deposit detected', detail: 'Julie Morris — +$25,000 to checking', tone: 'positive', severity: 'Medium', when: '1h ago' },
    { id: 'a2', title: 'Churn risk rising', detail: 'Ada Lovelace — balance down 62%, DD stopped', tone: 'risk', severity: 'High', when: '3h ago' },
    { id: 'a3', title: 'Digital engagement spike', detail: 'Marcus Chen — 4× mortgage calculator', tone: 'opportunity', severity: 'Medium', when: '6h ago' },
    { id: 'a4', title: 'CSAT dip', detail: 'Sofia Rossi — NPS 9→6 after branch visit', tone: 'risk', severity: 'Medium', when: 'Yesterday' },
  ],
  leads: [
    { id: 'l1', name: 'Ron Abelin', source: 'Inbound Call', status: 'New', value: 85000 },
    { id: 'l2', name: 'Thania Allen', source: 'Referral', status: 'Working', value: 140000 },
    { id: 'l3', name: 'Ron Morris', source: 'Website', status: 'New', value: 60000 },
    { id: 'l4', name: 'Grace Liu', source: 'Marketing Event', status: 'Qualified', value: 220000 },
  ],
};

/**
 * HOME dashboard fetcher. Resolves to mock or live per the dataSource switch.
 * `core` domain covers the GraphQL side; when flipped to 'real' it calls the
 * verified live implementation. Stays mock until org schema is verified.
 */
export function fetchHomeDashboard(): Promise<HomeDashboard> {
  return resolve('core', () => mockResolve(DASH, 400), () => fetchHomeDashboardReal());
}
