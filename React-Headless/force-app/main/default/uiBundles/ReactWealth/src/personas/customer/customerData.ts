/**
 * Customer 360 data — MOCK phase, but populated from the REAL live-org values
 * for Julie E Morris (001am00000qvjsAAAQ). Swappable fetchers: replace bodies
 * with executeGraphQL (Account/FSC) + queryDataCloud (AI signals, unified
 * profile) later; components + call sites unchanged.
 */
import { mockResolve, series } from '../mock/mockUtil';
import { resolve } from '../../data/dataSource';
import { fetchCustomer360Real, fetchCustomer360DetailReal } from './customerDataReal';
import type { Customer360, Customer360Detail, BookClient } from './customerTypes';

const JULIE: Customer360 = {
  id: '001am00000qvjsAAAQ',
  name: 'Julie E Morris',
  location: 'San Francisco, CA',
  segment: 'Mass Affluent',
  riskProfile: 'Aggressive',
  customerSince: 'Jul 2024',
  lastInteraction: 'Jun 2026',
  photoInitials: 'JM',
  statusChips: [
    { label: 'Mobile', on: true },
    { label: 'Online', on: true },
    { label: 'KYC', on: true },
    { label: '2FA', on: true },
    { label: 'Paperless', on: false },
    { label: 'Alerts', on: false },
    { label: 'Wire', on: false },
  ],
  money: [
    { label: 'Deposits', amount: 77372, deltaLabel: '+12% YoY', positive: true },
    { label: 'Investments', amount: 72061, deltaLabel: '+4.2%', positive: true },
    { label: 'Lending', amount: 771640, deltaLabel: '−0.8%', positive: false },
  ],
  loanLimit: 1028000,
  opportunitiesValue: 2288469,
  casesCount: 43,
  healthScore: 91,
  healthDimensions: [
    { label: 'Engagement', score: 85, trend: 'up' },
    { label: 'Financial', score: 92, trend: 'up' },
    { label: 'Potential', score: 88, trend: 'up' },
    { label: 'Risk', score: 28, trend: 'down' },
  ],
  unifiedProfiles: [
    { sourceOrg: 'Retail', accountId: '001am00000qvjsAAAQ', name: 'Julie E Morris' },
    { sourceOrg: 'Wealth', accountId: '001al00001ATjgJAAT', name: 'Julie Morris' },
    { sourceOrg: 'Small Business', accountId: '001al00000EkcjqAAB', name: 'Julie Morris' },
    { sourceOrg: 'Mobile Banking', accountId: '7b1ab88d516c4eee', name: 'Julie Morris' },
    { sourceOrg: 'Online Banking', accountId: '3908d464913587cc', name: 'jmorris@example.com' },
    { sourceOrg: 'Trading Platform', accountId: '2f0c9a71e5b8', name: 'Julie Morris' },
  ],
  aiSignals: [
    { label: 'Engagement Sentiment', value: 'Positive', tone: 'positive' },
    { label: 'Next Best Product', value: 'CDs', tone: 'opportunity' },
    { label: 'Attrition Risk', value: 'Medium', tone: 'risk' },
    { label: 'Held-Away Assets', value: '$1.2M detected', tone: 'opportunity' },
  ],
  aiBriefHeadline: 'Strong and gaining momentum',
  aiBrief:
    'Julie’s relationship spans Retail, Wealth, and Small Business. Deposits are up 12% YoY and engagement is trending positive after a recent branch meeting. Einstein flags CDs as the next best product and detects ~$1.2M in held-away assets — a consolidation opportunity. Attrition risk is medium and improving.',
  nextBestActions: [
    { id: 'nba1', title: 'Pitch CD ladder', detail: 'Einstein next-best-product · high propensity', impact: 'High' },
    { id: 'nba2', title: 'Held-away consolidation', detail: '$1.2M detected across outside accounts', impact: 'High' },
    { id: 'nba3', title: 'Schedule portfolio review', detail: 'Aggressive risk profile · last review 90d ago', impact: 'Medium' },
  ],
  highlights: [
    { icon: '💰', label: 'Deposits', value: '+$8,240', sub: '+12% YoY', tone: 'positive' },
    { icon: '📈', label: 'Investments', value: '$72,061', sub: '+4.2%', tone: 'positive' },
    { icon: '🎯', label: 'Next Best Product', value: 'CDs', sub: 'High propensity', tone: 'opportunity' },
    { icon: '⚠️', label: 'Attrition Risk', value: 'Medium', sub: 'Improving', tone: 'risk' },
    { icon: '🔗', label: 'Held-Away', value: '$1.2M', sub: 'Consolidation opp.', tone: 'opportunity' },
  ],
  confidencePct: 87,
  dataSourceCount: 24,
};

export function fetchCustomer360(accountId: string | null): Promise<Customer360 | null> {
  if (!accountId) return Promise.resolve(null);
  return resolve(
    'core',
    () => mockResolve({ ...JULIE, id: accountId }, 350),
    () => fetchCustomer360Real(accountId),
  );
}

const TEAL = '#0d9488';
const BLUE = '#3b82f6';
const VIOLET = '#8b5cf6';
const AMBER = '#f59e0b';
const GREEN = '#10b981';
const ROSE = '#f43f5e';

const JULIE_DETAIL: Customer360Detail = {
  journey: [
    { id: 'j1', year: 1993, name: 'Born', date: 'May 31, 1993', status: 'done', icon: '👤' },
    { id: 'j2', year: 2015, name: 'Graduation', date: 'Jun 2015', status: 'done', icon: '🎓' },
    { id: 'j3', year: 2018, name: 'Purchased Home', date: 'May 2, 2018', status: 'done', icon: '🏠' },
    { id: 'j4', year: 2018, name: 'Moved to San Francisco', date: 'Apr 9, 2018', status: 'done', icon: '📍' },
    { id: 'j5', year: 2021, name: 'Bought Audi Q7', date: 'Jan 4, 2021', status: 'done', icon: '🚗' },
    { id: 'j6', year: 2026, name: 'Appointed CEO — Morris Roasters', date: 'May 4, 2026', status: 'now', icon: '💼' },
  ],
  goalRings: [
    { id: 'gr1', name: 'Retirement', amount: 6750000, pct: 96, priority: 'low', date: 'May 2047', color: GREEN },
    { id: 'gr2', name: 'Estate Planning', amount: 1500000, pct: 100, priority: 'medium', date: 'Nov 2027', color: TEAL },
    { id: 'gr3', name: "Jack's College", amount: 175000, pct: 61, priority: 'high', date: 'Jul 2030', color: ROSE },
    { id: 'gr4', name: 'Vacation Home', amount: 208000, pct: 32, priority: 'medium', date: 'Jun 2045', color: AMBER },
    { id: 'gr5', name: "Rachel's Wedding", amount: 85000, pct: 71, priority: 'high', date: 'Jul 2027', color: ROSE },
  ],
  webEngagements: [
    { id: 'w1', when: '2h ago', channel: 'Web', action: 'Viewed CD rates page', intent: 'high' },
    { id: 'w2', when: 'Yesterday', channel: 'Mobile App', action: 'Checked savings balance ×3', intent: 'medium' },
    { id: 'w3', when: '2 days ago', channel: 'Web', action: 'Opened held-away linking flow', intent: 'high' },
    { id: 'w4', when: '4 days ago', channel: 'Email', action: 'Clicked "consolidate accounts" CTA', intent: 'high' },
    { id: 'w5', when: 'Last week', channel: 'Web', action: 'Downloaded retirement guide', intent: 'medium' },
  ],
  productMix: [
    { label: 'Deposits', value: 77372, color: TEAL },
    { label: 'Investments', value: 72061, color: BLUE },
    { label: 'Lending', value: 771640, color: VIOLET },
  ],
  aumTrend: [
    { label: 'AUM', color: TEAL, points: series(3, 14, 320, 40) },
    { label: 'Deposits', color: BLUE, points: series(8, 14, 70, 12) },
  ],
  cashFlowIn: [
    { id: 'inc', label: 'Income', value: 28450, side: 'in', color: GREEN },
    { id: 'oth-in', label: 'Other In', value: 6200, side: 'in', color: BLUE },
  ],
  cashFlowOut: [
    { id: 'sav', label: 'Savings', value: 8246, side: 'out', color: TEAL },
    { id: 'inv', label: 'Investments', value: 7400, side: 'out', color: BLUE },
    { id: 'mtg', label: 'Mortgage', value: 3200, side: 'out', color: VIOLET },
    { id: 'liv', label: 'Living', value: 2872, side: 'out', color: AMBER },
    { id: 'oth-out', label: 'Other Out', value: 1900, side: 'out', color: ROSE },
  ],
  holdings: [
    { id: 'h1', name: 'Everyday Checking', category: 'Deposit', balance: 42109, changePct: 3.1 },
    { id: 'h2', name: 'High-Yield Savings', category: 'Deposit', balance: 35263, changePct: 12.0 },
    { id: 'h3', name: 'Brokerage — Growth', category: 'Investment', balance: 51840, changePct: 4.2 },
    { id: 'h4', name: 'IRA', category: 'Investment', balance: 20221, changePct: 2.8 },
    { id: 'h5', name: 'Mortgage', category: 'Lending', balance: -650000, changePct: -0.8 },
    { id: 'h6', name: 'HELOC', category: 'Lending', balance: -121640, changePct: -1.2 },
  ],
  interactions: [
    { label: 'Feb', value: 6 },
    { label: 'Mar', value: 9 },
    { label: 'Apr', value: 7 },
    { label: 'May', value: 14 },
    { label: 'Jun', value: 18 },
  ],
  timeline: [
    { id: 'e1', when: 'Jun 28', title: 'Deposits increased +$8,240', detail: 'Checking ••••1234', tone: 'positive', icon: '💰' },
    { id: 'e2', when: 'Jun 20', title: 'New life event detected', detail: 'Data Cloud signal — new child', tone: 'opportunity', icon: '🎉' },
    { id: 'e3', when: 'Jun 12', title: 'Branch meeting', detail: 'Discussed mortgage options', tone: 'neutral', icon: '🤝' },
    { id: 'e4', when: 'Jun 03', title: 'CSAT improved +24 pts', detail: 'After service resolution', tone: 'positive', icon: '⭐' },
    { id: 'e5', when: 'May 21', title: 'Visited mortgage calculator ×4', detail: 'Web engagement (Data Cloud)', tone: 'opportunity', icon: '🌐' },
  ],
  opportunities: [
    { id: 'o1', name: 'CD Ladder', stage: 'Proposal', amount: 120000, closeDate: 'Jul 18' },
    { id: 'o2', name: 'Held-Away Consolidation', stage: 'Qualification', amount: 1200000, closeDate: 'Aug 02' },
    { id: 'o3', name: 'Mortgage Refi', stage: 'Prospecting', amount: 650000, closeDate: 'Aug 30' },
  ],
  goals: [
    { id: 'g1', name: 'Retirement', target: 1500000, current: 1080000 },
    { id: 'g2', name: 'College Fund', target: 250000, current: 96000 },
    { id: 'g3', name: 'Home Renovation', target: 80000, current: 61000 },
  ],
  predictions: [
    {
      id: 'churn', title: 'Attrition Risk', score: 0.42, scoreLabel: 'Churn', outcome: 'Medium · improving', tone: 'risk',
      drivers: [
        { label: 'Deposit growth', impact: -0.6 },
        { label: 'Engagement ↑', impact: -0.4 },
        { label: 'Rate shopping', impact: 0.5 },
        { label: 'Held-away assets', impact: 0.3 },
      ],
    },
    {
      id: 'nbp', title: 'Next Best Product', score: 0.81, scoreLabel: 'Propensity', outcome: 'CDs', tone: 'opportunity',
      drivers: [
        { label: 'Idle cash', impact: 0.7 },
        { label: 'Rate sensitivity', impact: 0.5 },
        { label: 'Age / stage', impact: 0.35 },
      ],
    },
  ],
  network: [
    { id: 'n1', label: 'James Morris', sublabel: 'Spouse', weight: 0.7, color: BLUE },
    { id: 'n2', label: 'Emma (6)', sublabel: 'Daughter', weight: 0.4, color: VIOLET },
    { id: 'n3', label: 'Morris Trust', sublabel: 'Entity', weight: 0.6, color: AMBER },
    { id: 'n4', label: 'Investment', sublabel: '$1.2M', weight: 0.8, color: GREEN },
    { id: 'n5', label: 'Mortgage', sublabel: '$650K', weight: 0.7, color: ROSE },
    { id: 'n6', label: 'Business', sublabel: 'Morris Roasters', weight: 0.5, color: TEAL },
  ],
};

export function fetchCustomer360Detail(accountId: string | null): Promise<Customer360Detail | null> {
  if (!accountId) return Promise.resolve(null);
  return resolve(
    'core',
    () => mockResolve(JULIE_DETAIL, 400),
    () => fetchCustomer360DetailReal(accountId),
  );
}

export function fetchBookClients(): Promise<BookClient[]> {
  return mockResolve([
    { id: '001am00000qvjsAAAQ', name: 'Julie E Morris', segment: 'Mass Affluent', headline: 'Held-away consolidation + CD ladder', reason: '$1.2M held-away detected; CDs next-best-product', score: 0.91, severity: 'high', relationshipValue: 921073 },
    { id: '001B', name: 'Marcus Chen', segment: 'Emerging Affluent', headline: 'Mortgage rate-shopping detected', reason: 'Refi calculator visits ×5 this week', score: 0.84, severity: 'high', relationshipValue: 540000 },
    { id: '001C', name: 'Priya Natarajan', segment: 'Mass Affluent', headline: 'Life event — new child', reason: 'Eligible for 529 + term life', score: 0.77, severity: 'medium', relationshipValue: 310000 },
    { id: '001D', name: 'Diego Ramirez', segment: 'Retail', headline: 'Idle cash sweep opportunity', reason: '$48k idle in checking >90 days', score: 0.63, severity: 'medium', relationshipValue: 190000 },
    { id: '001E', name: 'Sofia Rossi', segment: 'Mass Affluent', headline: 'Service recovery needed', reason: 'CSAT dropped 9→6 after branch visit', score: 0.55, severity: 'medium', relationshipValue: 420000 },
    { id: '001F', name: 'Tom Becker', segment: 'Retail', headline: 'Auto loan cross-sell', reason: 'Recurring auto spend, no loan on file', score: 0.41, severity: 'low', relationshipValue: 150000 },
  ]);
}
