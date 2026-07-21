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
  bankerName: 'Jose',
  dateLabel: 'Thursday, July 9',
  aiBriefHeadline: 'eight clients need you before the day closes',
  aiBrief:
    "8 clients are flagged at-risk on CSAT and 2 tasks are overdue, including Julie Morris' 401k rollover sitting 270 days idle next to a $150K loan. Pipeline holds $20.3B across 19,011 opportunities; three households have November life events worth planning around now.",
  confidencePct: 87,
  dataSourceCount: 24,
  kpis: [
    { key: 'pipeline', label: 'Pipeline', value: 20_300_000_000, format: 'currencyCompact', trend: series(8, 12, 19, 1.2), deltaPct: 0.041, note: '19,011 open opportunities' },
    { key: 'openOpps', label: 'Open opps', value: 19_011, format: 'number', trend: series(3, 12, 18000, 900), note: '632 closing 30d' },
    { key: 'leads', label: 'Leads & Referrals', value: 6, format: 'number', trend: series(2, 12, 5, 1), deltaPct: 0.08, note: 'Open leads' },
    { key: 'openCases', label: 'Open cases', value: 5_355, format: 'number', trend: series(5, 12, 5200, 200), note: '14 high priority' },
    { key: 'goals', label: 'Active goals', value: 6, format: 'number', note: '2 on track' },
    { key: 'atRisk', label: 'At-risk · CSAT', value: 8, format: 'number', note: 'needs outreach' },
  ],
  callList: [
    { id: 'c1', clientId: '001am00000qvjsAAAQ', clientName: 'Julie E Morris', segment: 'Retail', reason: '270-day overdue task on 401k rollover · $150K personal loan stalled with no activity · 5 open cases including a lost card', action: 'Clear rollover + reopen $150K loan', score: 0.96, severity: 'high', source: 'SALESFORCE_CRM', relationshipValue: 150000, tier: 'today' },
    { id: 'c2', clientId: '001AJC0000000000', clientName: 'AJC Corporation', segment: 'Commercial', reason: '$3M commercial real-estate deal at 80% probability in Closing/Funding with no recent activity logged', action: 'Confirm docs & set funding date', score: 0.88, severity: 'high', source: 'SALESFORCE_CRM', relationshipValue: 3000000, tier: 'week' },
    { id: 'c3', clientId: '001AIMS000000000', clientName: 'Aims Social, Inc.', segment: 'SMB', reason: '$99K corporate-card opportunity at Proposal/Quote with no activity recorded — needs a follow-up to close', action: 'Follow up to close corporate card', score: 0.81, severity: 'medium', source: 'SALESFORCE_CRM', relationshipValue: 99000, tier: 'week' },
    { id: 'c4', clientId: '001COOP000000000', clientName: 'Cooper Household', segment: 'Retail', reason: 'CSAT trending Poor across last 3 surveys — candidate for service-recovery outreach', action: 'Service-recovery outreach', score: 0.79, severity: 'medium', source: 'DATA_CLOUD', relationshipValue: 0, tier: 'watch' },
    { id: 'c5', clientId: '001WANG000000000', clientName: 'Sherry F Wang', segment: 'Retail', reason: 'CSAT flagged Poor · no touchpoint in 90 days', action: 'Reconnect check-in call', score: 0.75, severity: 'low', source: 'DATA_CLOUD', relationshipValue: 0, tier: 'watch' },
  ],
  recommendations: [
    {
      id: 'r1', kind: 'task', objectLabel: 'Task', clientName: 'Julie E Morris', clientId: '001am00000qvjsAAAQ',
      title: 'Complete overdue call: Julie Morris 401k rollover advice',
      body: 'Task from Jul 15, 2024 is 270+ days overdue. Julie has a $150K personal loan opportunity in Interested stage. Call to walk the rollover and cross-sell the loan.',
      evidence: 'Task ActivityDate 2024-07-15 is 270+ days overdue with an open $150K opportunity on the same account',
    },
    {
      id: 'r2', kind: 'email', objectLabel: 'Account', clientName: 'SteelWorks Inc', clientId: '001STEEL00000000',
      title: 'Re-engage SteelWorks Inc — $75M revenue, no recent activity',
      body: 'Your largest account by revenue has zero recorded activity. Reach out on treasury-management needs and explore commercial lending.',
      evidence: 'Highest-revenue account ($75M) with a null LastActivityDate indicates no engagement history',
    },
    {
      id: 'r3', kind: 'call', objectLabel: 'Opportunity', clientName: 'AJC Corporation', clientId: '001AJC0000000000',
      title: 'Push AJC Corporation $3M CRE deal across the finish line',
      body: 'Opportunity is in Closing/Funding with no recent activity. Schedule a call to confirm final docs, clear blockers, and lock a funding date.',
      evidence: 'Largest open opportunity at 80% probability, stalled 12 days with no next step set',
    },
    {
      id: 'r4', kind: 'case', objectLabel: 'Case', clientName: 'Cooper Household', clientId: '001COOP000000000',
      title: 'Escalate Cooper Household lost-card case before churn',
      body: 'Low CSAT plus an open lost-card case is a churn signal. Escalate to priority handling and log a service-recovery outreach.',
      evidence: 'Poor CSAT (3 surveys) co-occurring with an open high-priority case predicts attrition',
    },
  ],
  rightNow: {
    clientId: '001am00000qvjsAAAQ',
    clientName: 'Julie E Morris',
    headline: 'Call Julie Morris — a $150K loan is stalling behind a 270-day-overdue rollover task.',
    detail: 'She also has 5 open cases including a lost card. One call clears the task, de-risks the relationship, and reopens the loan.',
    taskSubject: '401k rollover call',
  },
  pipeline: [
    { id: 'o1', clientName: 'United Partners', name: 'Innovation Pipeline', stage: 'Qualification', amount: 5_300_000_000, closeDate: '', propensity: 0.35 },
    { id: 'o2', clientName: 'Jim Morris Estate', name: 'Innovation Pipeline', stage: 'Qualification', amount: 3_400_000_000, closeDate: '', propensity: 0.40 },
    { id: 'o3', clientName: 'IDO House Account', name: 'Cumulus Syndicated Loan', stage: 'Negotiation', amount: 94_800_000, closeDate: '', propensity: 0.72 },
    { id: 'o4', clientName: 'Frank Household', name: 'Innovation Pipeline', stage: 'Qualification', amount: 1_700_000_000, closeDate: '', propensity: 0.38 },
    { id: 'o5', clientName: 'Wellspring, Inc.', name: 'Innovation Pipeline', stage: 'Qualification', amount: 141_200_000, closeDate: '', propensity: 0.44 },
    { id: 'o6', clientName: 'AJC Corporation', name: 'CRE Term Loan', stage: 'Closing/Funding', amount: 3_000_000, closeDate: '', propensity: 0.80 },
  ],
  bankerGoals: [
    { id: 'g1', name: 'Deposit Growth', current: 1360000, target: 2000000, format: 'currencyCompact' },
    { id: 'g2', name: 'New Households', current: 13, target: 20, format: 'number' },
    { id: 'g3', name: 'Cross-Sell Ratio', current: 68, target: 100, format: 'number' },
    { id: 'g4', name: 'Referrals Closed', current: 7, target: 12, format: 'number' },
  ],
  lifeEvents: [
    { id: 'le1', clientId: '001DENN000000000', clientName: 'Dennis Q Schwartz', event: 'Job change', when: 'Nov 16', opportunity: 'Align income transition & benefits rollover.', icon: '💼' },
    { id: 'le2', clientId: '001CHRI000000000', clientName: 'Christopher N Hernandez', event: 'Graduation', when: 'Nov 16', opportunity: 'Coordinate 529 final distribution & next steps.', icon: '🎓' },
    { id: 'le3', clientId: '001KRIS000000000', clientName: 'Kristine B Moran', event: 'Graduation', when: 'Nov 16', opportunity: 'Finalize education funding & transition plan.', icon: '🎓' },
  ],
  schedule: [
    { id: 's1', time: 'done', title: 'Morning review', kind: 'task' },
    { id: 's2', time: '2:30', title: 'Morris rollover call', kind: 'call', clientName: 'Julie E Morris' },
    { id: 's3', time: '3:15', title: 'Bennett mortgage', kind: 'meeting' },
    { id: 's4', time: '4:00', title: 'Prep Omega close', kind: 'task' },
  ],
  alerts: [
    { id: 'a1', title: 'Low CSAT — Cooper Household', detail: 'Poor · 3 surveys trending down', tone: 'risk', severity: 'High', when: 'recent' },
    { id: 'a2', title: 'Low CSAT — Cervantes-Fowler Retail', detail: 'Poor · service-recovery candidate', tone: 'risk', severity: 'Medium', when: 'recent' },
    { id: 'a3', title: 'Low CSAT — Jaime R Parsons', detail: 'Poor · no touchpoint 90d', tone: 'risk', severity: 'Medium', when: 'recent' },
    { id: 'a4', title: 'Low CSAT — Sherry F Wang', detail: 'Poor · flagged today', tone: 'risk', severity: 'Medium', when: 'recent' },
  ],
  leads: [
    { id: 'l1', name: 'Dan Hawes', source: 'Marketing Event', status: 'New', value: 56_000_000, email: 'dhawes@example.com' },
    { id: 'l2', name: 'Mellissa Lavender', source: 'Social Media', status: 'Unqualified', value: 54_000_000, email: 'mlavender@example.com' },
    { id: 'l3', name: 'Pearl Willson', source: 'Website', status: 'Working', value: 8_000_000, email: 'pwillson@example.com' },
    { id: 'l4', name: 'James Barker', source: 'Sales Bot', status: 'New', value: 0, email: 'james.barker@email.com' },
    { id: 'l5', name: 'Assa Barak', source: 'Sales Bot', status: 'New', value: 0, email: 'assa.barak@gmail.com' },
    { id: 'l6', name: 'Daragh Dennehy', source: '—', status: 'New', value: 0, email: 'ddennehy@salesforce.com' },
  ],
  activity: [
    { id: 'ac1', clientName: 'Cooper Household', clientId: '001COOP000000000', title: 'Payment declined on credit card', when: 'May 14, 10:25 AM', icon: 'alerts', tone: 'risk' },
    { id: 'ac2', clientName: 'United Partners', title: 'Opened secure message', when: 'May 13, 4:05 PM', icon: 'email', tone: 'neutral' },
    { id: 'ac3', clientName: 'Sherry F Wang', clientId: '001WANG000000000', title: 'Website login', when: 'May 12, 10:11 AM', icon: 'event', tone: 'neutral' },
    { id: 'ac4', clientName: 'United Partners', title: 'Direct deposit updated', when: 'May 12, 9:31 AM', icon: 'pipeline', tone: 'positive' },
  ],
  pipelineMovement: [
    { id: 'pm1', label: 'Innovation Pipeline', amount: 2_400_000, deltaPct: 0.12, trend: series(4, 8, 2_000_000, 120_000) },
    { id: 'pm2', label: 'Commercial Lending', amount: 8_700_000, deltaPct: 0.08, trend: series(6, 8, 8_000_000, 300_000) },
    { id: 'pm3', label: 'Treasury Solutions', amount: 4_600_000, deltaPct: 0.16, trend: series(9, 8, 4_000_000, 220_000) },
    { id: 'pm4', label: 'Wealth Management', amount: 3_200_000, deltaPct: -0.04, trend: series(2, 8, 3_400_000, 140_000) },
  ],
  cases: [
    { id: 'cs1', caseNumber: '00001042', subject: 'Disputed card transaction — $2,410', priority: 'High', status: 'Escalated', clientName: 'Cooper Household', clientId: '001COOP000000000', ageDays: 6 },
    { id: 'cs2', caseNumber: '00001038', subject: 'Wire transfer delayed past cutoff', priority: 'High', status: 'Working', clientName: 'Sherry F Wang', clientId: '001WANG000000000', ageDays: 3 },
    { id: 'cs3', caseNumber: '00001031', subject: 'Online banking login lockout', priority: 'Medium', status: 'New', clientName: 'Cervantes-Fowler Retail', ageDays: 2 },
    { id: 'cs4', caseNumber: '00001024', subject: 'Statement address update request', priority: 'Low', status: 'Working', clientName: 'Julie E Morris', ageDays: 9 },
  ],
  customerGoals: [
    { id: 'cg1', name: 'Down payment — first home', clientName: 'Sherry F Wang', clientId: '001WANG000000000', planName: 'Sherry F Wang - Home Ownership Plan', status: 'IN_PROGRESS', priority: 'HIGH', type: 'Home', targetDate: '2026-09-15', daysUntil: 56, target: 80000, current: 61500, description: 'Saving toward a 20% down payment on a first home.' },
    { id: 'cg2', name: 'College fund — 529 top-up', clientName: 'Cooper Household', clientId: '001COOP000000000', planName: 'Cooper Household - Education Plan', status: 'IN_PROGRESS', priority: 'MEDIUM', type: 'Education', targetDate: '2026-10-31', daysUntil: 102, target: 120000, current: 74000, description: 'Annual 529 contribution to reach the four-year tuition target.' },
    { id: 'cg3', name: 'Emergency fund — 6 months', clientName: 'Cervantes-Fowler Retail', planName: 'Cervantes-Fowler - Financial Wellness Plan', status: 'NOT_STARTED', priority: 'MEDIUM', type: 'Emergency', targetDate: '2026-12-31', daysUntil: 163, target: 30000, current: 8200, description: 'Build a six-month expense reserve.' },
    { id: 'cg4', name: 'Debt payoff — auto loan', clientName: 'Julie E Morris', planName: 'Julie E Morris - Debt Reduction Plan', status: 'IN_PROGRESS', priority: 'LOW', type: 'Pay off Debt', targetDate: '2027-02-28', daysUntil: 222, target: 18500, current: 12300, description: 'Accelerated payoff of the remaining auto-loan balance.' },
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
