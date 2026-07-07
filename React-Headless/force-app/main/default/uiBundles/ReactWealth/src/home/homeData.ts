/**
 * HOME app data — MOCK phase. Wealth "Advisory Desk": advisor "Alex" over a
 * high-net-worth book. AUM + held-away capture, plan progress, holdings/ESG,
 * trades. Swappable fetcher: replace body with executeGraphQL (Opportunity/
 * Task/Event/FinancialGoal) + queryDataCloud (Plaid held-away, MGP plans,
 * MSCI ESG, Financial_Trades, CSAT) later.
 */
import { mockResolve, series } from '../personas/mock/mockUtil';
import { resolve } from '../data/dataSource';
import { fetchHomeDashboardReal } from './homeDataReal';
import type { HomeDashboard } from './homeTypes';

const DASH: HomeDashboard = {
  bankerName: 'Alex',
  dateLabel: 'Monday, July 6',
  aiBriefHeadline: 'a strong day to capture held-away assets',
  aiBrief:
    'Your book holds $342M AUM with $58M in held-away assets within reach. Whitfield Family Trust has drifted 6% from its target allocation and is due for a rebalance; the Morris CEO liquidity event opens a $1.2M consolidation window. 7 financial-plan reviews are due this week and 2 portfolios breached their ESG floor.',
  confidencePct: 89,
  dataSourceCount: 26,
  kpis: [
    { key: 'aum', label: 'AUM', value: 342000000, format: 'currencyCompact', trend: series(2, 12, 330, 8), deltaPct: 0.061 },
    { key: 'heldAway', label: 'Held-Away in Reach', value: 58000000, format: 'currencyCompact', trend: series(4, 12, 52, 6), deltaPct: 0.112 },
    { key: 'households', label: 'Households', value: 84, format: 'number', trend: series(3, 12, 80, 5), deltaPct: 0.024 },
    { key: 'netFlows', label: 'Net New Flows (QTD)', value: 12400000, format: 'currencyCompact', trend: series(8, 12, 9, 2), deltaPct: 0.18 },
    { key: 'reviews', label: 'Plan Reviews Due', value: 7, format: 'number', trend: series(9, 12, 6, 3) },
    { key: 'confidence', label: 'Avg AI Confidence', value: 0.89, format: 'percent', trend: series(5, 12, 86, 5) },
  ],
  callList: [
    { id: 'c1', clientId: '001am00000qvjsAAAQ', clientName: 'Julie E Morris', segment: 'Private Wealth', reason: '$1.2M held-away detected post-CEO appointment; MGP plan shows a liquidity gap', action: 'Held-away consolidation + wealth-transfer review', score: 0.93, severity: 'high', source: 'Plaid + MGP', relationshipValue: 4210000 },
    { id: 'c2', clientId: '001W', clientName: 'Whitfield Family Trust', segment: 'UHNW', reason: 'Allocation drifted 6% from IPS target; equity overweight after the rally', action: 'Rebalance to policy', score: 0.88, severity: 'high', source: 'Portfolio Drift', relationshipValue: 18600000 },
    { id: 'c3', clientId: '001P', clientName: 'Priya Natarajan', segment: 'Emerging HNW', reason: 'Two holdings breached the ESG floor (MSCI BBB→BB downgrade)', action: 'ESG remediation + tax-loss harvest', score: 0.79, severity: 'medium', source: 'MSCI ESG', relationshipValue: 2300000 },
    { id: 'c4', clientId: '001R', clientName: 'Robert Kessler', segment: 'Retiree', reason: 'Retirement readiness fell to 71%; sequence-of-returns risk flagged', action: 'Revisit drawdown + annuity ladder', score: 0.66, severity: 'medium', source: 'MGP Plan', relationshipValue: 5600000 },
    { id: 'c5', clientId: '001S', clientName: 'Sofia Rossi', segment: 'Private Wealth', reason: 'CSAT fell 9→6 after the last review meeting', action: 'Service-recovery outreach', score: 0.58, severity: 'low', source: 'CSAT / NPS', relationshipValue: 3100000 },
  ],
  pipeline: [
    { id: 'o1', clientName: 'Julie E Morris', name: 'Held-Away Consolidation', stage: 'Discovery', amount: 1200000, closeDate: 'Aug 02', propensity: 0.62 },
    { id: 'o2', clientName: 'Whitfield Family Trust', name: 'Managed Rebalance', stage: 'Proposal', amount: 18600000, closeDate: 'Jul 20', propensity: 0.74 },
    { id: 'o3', clientName: 'Robert Kessler', name: 'Annuity Ladder', stage: 'Negotiation', amount: 900000, closeDate: 'Jul 28', propensity: 0.69 },
    { id: 'o4', clientName: 'Priya Natarajan', name: 'ESG SMA Transition', stage: 'Qualification', amount: 450000, closeDate: 'Aug 09', propensity: 0.71 },
    { id: 'o5', clientName: 'David Osei', name: 'Trust & Estate Plan', stage: 'Discovery', amount: 320000, closeDate: 'Aug 15', propensity: 0.55 },
  ],
  bankerGoals: [
    { id: 'g1', name: 'Net New Assets', current: 12400000, target: 25000000, format: 'currencyCompact' },
    { id: 'g2', name: 'Held-Away Captured', current: 8200000, target: 20000000, format: 'currencyCompact' },
    { id: 'g3', name: 'Plan Reviews Completed', current: 34, target: 60, format: 'number' },
    { id: 'g4', name: 'Managed-Account Adoption', current: 61, target: 100, format: 'number' },
  ],
  lifeEvents: [
    { id: 'le1', clientId: '001am00000qvjsAAAQ', clientName: 'Julie E Morris', event: 'Appointed CEO — Morris Roasters', when: '5 days ago', opportunity: 'Concentrated-stock plan + wealth transfer', icon: '💼' },
    { id: 'le2', clientId: '001R', clientName: 'Robert Kessler', event: 'Reached retirement age', when: '1 week ago', opportunity: 'Drawdown strategy + Social Security timing', icon: '🎓' },
    { id: 'le3', clientId: '001D', clientName: 'David Osei', event: 'Sold a business', when: 'Last week', opportunity: 'Liquidity event → diversified portfolio + trust', icon: '💰' },
    { id: 'le4', clientId: '001A', clientName: 'Aisha Khan', event: 'Inheritance received', when: '2 weeks ago', opportunity: 'Estate consolidation + charitable giving', icon: '🏛️' },
  ],
  schedule: [
    { id: 's1', time: '9:00', title: 'Rebalance review — Whitfield Trust', kind: 'meeting', clientName: 'Whitfield Family Trust' },
    { id: 's2', time: '10:30', title: 'Held-away consolidation call — Julie Morris', kind: 'call', clientName: 'Julie E Morris' },
    { id: 's3', time: '13:00', title: 'Prepare MGP plan update — Kessler', kind: 'task', clientName: 'Robert Kessler' },
    { id: 's4', time: '14:30', title: 'Quarterly investment committee', kind: 'event' },
    { id: 's5', time: '16:00', title: 'ESG remediation proposal — Priya', kind: 'task', clientName: 'Priya Natarajan' },
  ],
  alerts: [
    { id: 'a1', title: 'Portfolio drift breach', detail: 'Whitfield Trust — equity +6% over IPS target', tone: 'risk', severity: 'High', when: '2h ago' },
    { id: 'a2', title: 'Held-away inflow detected', detail: 'Julie Morris — $1.2M external brokerage linked', tone: 'opportunity', severity: 'High', when: '4h ago' },
    { id: 'a3', title: 'ESG downgrade', detail: 'Priya Natarajan — 2 holdings MSCI BBB→BB', tone: 'risk', severity: 'Medium', when: '6h ago' },
    { id: 'a4', title: 'Plan on track', detail: 'David Osei — retirement readiness 94%', tone: 'positive', severity: 'Low', when: 'Yesterday' },
  ],
  leads: [
    { id: 'l1', name: 'Eleanor Vance', source: 'Client Referral', status: 'Qualified', value: 3200000 },
    { id: 'l2', name: 'Grace Liu', source: 'COI — Estate Attorney', status: 'Working', value: 1800000 },
    { id: 'l3', name: 'Marcus Chen', source: 'Liquidity Event', status: 'New', value: 950000 },
    { id: 'l4', name: 'Thomas Ferrand', source: 'Seminar', status: 'New', value: 640000 },
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
