/**
 * Full Customer 360 data — MOCK phase, Julie E Morris. Values consistent with
 * the live-org capture. Each fetcher swaps to executeGraphQL/queryDataCloud
 * later; components + call sites unchanged.
 */
import { mockResolve, series } from '../mock/mockUtil';
import { resolve } from '../../data/dataSource';
import { fetchFull360Real } from './full360DataReal';
import type { Full360 } from './full360Types';

const JULIE_FULL: Full360 = {
  details: [
    { key: 'name', label: 'Full Name', value: 'Mrs. Julie E Morris', editable: true, group: 'Identity', type: 'text' },
    { key: 'segment', label: 'Segment', value: 'Mass Affluent', editable: true, group: 'Identity', type: 'picklist', options: ['Mass Market', 'Mass Affluent', 'Affluent', 'HNW', 'UHNW'] },
    { key: 'email', label: 'Email', value: 'jmorris@example.com', editable: true, group: 'Contact', type: 'email' },
    { key: 'phone', label: 'Phone', value: '(786) 376-6032', editable: true, group: 'Contact', type: 'phone' },
    { key: 'website', label: 'Website', value: 'www.morrisroasters.com', editable: true, group: 'Contact', type: 'text' },
    { key: 'address', label: 'Address', value: 'San Francisco, CA', editable: true, group: 'Contact', type: 'text' },
    { key: 'risk', label: 'Risk Profile', value: 'Aggressive', editable: true, group: 'Profile', type: 'picklist', options: ['Conservative', 'Moderate', 'Growth', 'Aggressive'] },
    { key: 'since', label: 'Customer Since', value: 'Jul 2024', editable: false, group: 'Profile', type: 'text' },
    { key: 'channel', label: 'Preferred Channel', value: 'Call Center', editable: true, group: 'Profile', type: 'picklist', options: ['Branch', 'Call Center', 'Mobile', 'Online'] },
    { key: 'industry', label: 'Industry', value: 'Manufacturing', editable: true, group: 'Business', type: 'text' },
    { key: 'revenue', label: 'Annual Revenue', value: '$1,200,000', editable: true, group: 'Business', type: 'currency' },
    { key: 'employees', label: 'Employees', value: '300', editable: true, group: 'Business', type: 'text' },
  ],
  finAccounts: [
    { id: 'fa1', name: 'Everyday Checking', type: 'Checking', number: '••••1234', balance: 42109, status: 'Active', opened: 'Jul 2024' },
    { id: 'fa2', name: 'High-Yield Savings', type: 'Savings', number: '••••5678', balance: 35263, status: 'Active', opened: 'Aug 2024' },
    { id: 'fa3', name: 'Brokerage — Growth', type: 'Investment', number: '••••9012', balance: 51840, status: 'Active', opened: 'Sep 2024' },
    { id: 'fa4', name: 'IRA', type: 'Investment', number: '••••3456', balance: 20221, status: 'Active', opened: 'Sep 2024' },
    { id: 'fa5', name: 'Mortgage', type: 'Lending', number: '••••7890', balance: -650000, status: 'Active', opened: 'May 2018' },
    { id: 'fa6', name: 'HELOC', type: 'Lending', number: '••••2468', balance: -121640, status: 'Active', opened: 'Jun 2021' },
    { id: 'fa7', name: 'Platinum Card', type: 'Credit Card', number: '••••1357', balance: -3120, status: 'Active', opened: 'Jul 2024' },
  ],
  transactions: [
    { id: 't1', date: 'Jul 05', description: 'Payroll Deposit — Morris Roasters', category: 'Income', account: 'Checking', amount: 12500 },
    { id: 't2', date: 'Jul 03', description: 'Transfer to High-Yield Savings', category: 'Transfer', account: 'Savings', amount: 5000 },
    { id: 't3', date: 'Jul 02', description: 'Mortgage Payment', category: 'Housing', account: 'Mortgage', amount: -3200 },
    { id: 't4', date: 'Jul 01', description: 'Whole Foods', category: 'Groceries', account: 'Platinum Card', amount: -284 },
    { id: 't5', date: 'Jun 29', description: 'Brokerage Buy — VTI', category: 'Investment', account: 'Brokerage', amount: -6400 },
    { id: 't6', date: 'Jun 28', description: 'Large Deposit — Wire', category: 'Income', account: 'Checking', amount: 25000 },
    { id: 't7', date: 'Jun 27', description: 'PG&E Utility', category: 'Utilities', account: 'Checking', amount: -412 },
    { id: 't8', date: 'Jun 25', description: 'Audi Financial', category: 'Auto', account: 'Checking', amount: -890 },
  ],
  trades: [
    { id: 'tr1', date: 'Jul 05', action: 'SELL', symbol: 'VTI', name: 'US Total Market', shares: 2400, price: 267.1, amount: 641040 },
    { id: 'tr2', date: 'Jul 05', action: 'BUY', symbol: 'AGG', name: 'US Aggregate Bond', shares: 5800, price: 101.7, amount: 589860 },
    { id: 'tr3', date: 'Jul 01', action: 'BUY', symbol: 'VXUS', name: 'Intl Ex-US', shares: 3100, price: 61.3, amount: 190030 },
    { id: 'tr4', date: 'Jun 24', action: 'BUY', symbol: 'GLD', name: 'Gold Trust', shares: 900, price: 214.5, amount: 193050 },
    { id: 'tr5', date: 'Jun 18', action: 'SELL', symbol: 'AAPL', name: 'Apple Inc', shares: 400, price: 228.2, amount: 91280 },
  ],
  interactions: [
    { id: 'i1', when: 'Jul 05 · 9:30 AM', channel: 'Phone', type: 'Inbound Call', summary: 'Asked about CD rates and account consolidation options', sentiment: 'positive' },
    { id: 'i2', when: 'Jun 28 · 2:00 PM', channel: 'Branch', type: 'Meeting', summary: 'Reviewed mortgage refinance scenarios', sentiment: 'positive' },
    { id: 'i3', when: 'Jun 20 · 11:15 AM', channel: 'Mobile', type: 'App Session', summary: 'Opened held-away account linking flow', sentiment: 'neutral' },
    { id: 'i4', when: 'Jun 12 · 4:40 PM', channel: 'Email', type: 'Outbound', summary: 'Sent 529 college plan brochure', sentiment: 'neutral' },
    { id: 'i5', when: 'May 30 · 10:05 AM', channel: 'Web', type: 'Chat', summary: 'Questions on wire transfer limits', sentiment: 'negative' },
  ],
  cases: [
    { id: 'c1', number: 'CS-04821', subject: 'Fraudulent charge dispute', status: 'Resolved', priority: 'High', opened: 'Mar 03' },
    { id: 'c2', number: 'CS-05102', subject: 'Debit card replacement', status: 'Closed', priority: 'Medium', opened: 'Apr 21' },
    { id: 'c3', number: 'CS-05490', subject: 'Mobile deposit not posting', status: 'In Progress', priority: 'Medium', opened: 'Jun 30' },
    { id: 'c4', number: 'CS-05512', subject: 'Statement address update', status: 'New', priority: 'Low', opened: 'Jul 02' },
  ],
  csatNps: {
    csatScore: 72,
    npsScore: 48,
    csatTrend: series(4, 10, 68, 12),
    npsTrend: series(9, 10, 44, 16),
    recent: [
      { id: 's1', when: 'Jun 28', type: 'CSAT', score: 9, verbatim: 'Very helpful branch visit, resolved my questions quickly.' },
      { id: 's2', when: 'Jun 03', type: 'NPS', score: 8, verbatim: 'Would recommend — great digital tools.' },
      { id: 's3', when: 'May 30', type: 'CSAT', score: 6, verbatim: 'Wire limit process was confusing.' },
    ],
  },
  opportunities: [
    { id: 'o1', name: 'CD Ladder', stage: 'Proposal', amount: 120000, closeDate: 'Jul 18', probability: 0.75 },
    { id: 'o2', name: 'Held-Away Consolidation', stage: 'Qualification', amount: 1200000, closeDate: 'Aug 02', probability: 0.5 },
    { id: 'o3', name: 'Mortgage Refinance', stage: 'Prospecting', amount: 650000, closeDate: 'Aug 30', probability: 0.35 },
    { id: 'o4', name: '529 College Plan', stage: 'Negotiation', amount: 24000, closeDate: 'Jul 25', probability: 0.68 },
  ],
  campaigns: [
    { id: 'cm1', name: 'Summer CD Rate Promo', type: 'Email', status: 'Sent', responded: true, memberSince: 'Jun 2026' },
    { id: 'cm2', name: 'Wealth Advisory Webinar', type: 'Event', status: 'Invited', responded: false, memberSince: 'May 2026' },
    { id: 'cm3', name: 'Refi Rate Alert', type: 'SMS', status: 'Sent', responded: true, memberSince: 'Jun 2026' },
    { id: 'cm4', name: 'New Parent Financial Guide', type: 'Email', status: 'Scheduled', responded: false, memberSince: 'Jul 2026' },
  ],
  meetingNotes: [
    { id: 'mn1', date: 'Jun 28', title: 'Quarterly Review', author: 'Alex Morgan', body: 'Julie is interested in moving idle cash into CDs. Discussed held-away $1.2M at another institution — strong consolidation opportunity. Follow up with ladder proposal.' },
    { id: 'mn2', date: 'May 04', title: 'CEO Appointment Congrats', author: 'Alex Morgan', body: 'Julie appointed CEO of Morris Roasters. Explore business banking + wealth transfer planning. Introduce commercial RM.' },
  ],
  callSummaries: [
    { id: 'cs1', date: 'Jul 05', duration: '8m 22s', channel: 'Phone', sentiment: 'positive', summary: 'Julie called to ask about CD rates. Agent explained the 12-month ladder. She expressed interest in consolidating outside accounts. Positive tone throughout; flagged for RM follow-up.' },
    { id: 'cs2', date: 'May 30', duration: '5m 10s', channel: 'Chat', sentiment: 'negative', summary: 'Frustration around wire transfer limits and verification steps. Issue resolved but sentiment dipped. Recommend proactive education on limits.' },
  ],
  kyc: {
    id: 'kyc1',
    status: 'Verified',
    lastReview: 'Jan 2026',
    riskRating: 'Low',
    amlStatus: 'Clear (WorldCheck)',
    notes: 'Identity verified, 2FA enabled, KYC current. AML screening clear as of last review. Next periodic review due Jan 2027.',
  },
  predictions: [
    { key: 'attrition', title: 'Attrition Risk', score: 0.42, scoreLabel: 'Churn', outcome: 'Medium · improving', tone: 'risk', drivers: [{ label: 'Deposit growth', impact: -0.6 }, { label: 'Engagement ↑', impact: -0.4 }, { label: 'Rate shopping', impact: 0.5 }, { label: 'Held-away assets', impact: 0.35 }] },
    { key: 'csat', title: 'CSAT Prediction', score: 0.78, scoreLabel: 'CSAT', outcome: 'Satisfied', tone: 'positive', drivers: [{ label: 'Recent resolution', impact: 0.5 }, { label: 'Branch experience', impact: 0.4 }, { label: 'Wire friction', impact: -0.3 }] },
    { key: 'productRec', title: 'Next Best Product', score: 0.81, scoreLabel: 'Propensity', outcome: 'CDs', tone: 'opportunity', drivers: [{ label: 'Idle cash', impact: 0.7 }, { label: 'Rate sensitivity', impact: 0.5 }, { label: 'Life stage', impact: 0.35 }] },
  ],
  agentforce: {
    account: { key: 'account', title: 'Account Summary', text: 'Julie is a Mass Affluent client of 2 years spanning six orgs. Deposits ($77K) and investments ($72K) are growing; lending ($772K) is stable. Health is excellent (91). Primary opportunity: consolidate $1.2M held-away and open a CD ladder.' },
    transaction: { key: 'transaction', title: 'Transaction Summary', text: 'Cash flow is strong and positive. A $25K wire and $12.5K payroll drove June inflows; spending is stable and disciplined. $5K moved to high-yield savings signals a saver profile receptive to CD offers.' },
    trade: { key: 'trade', title: 'Trade Summary', text: 'Recent rebalance sold $641K VTI into $590K AGG — de-risking toward fixed income. Portfolio remains growth-tilted overall. Trading activity is moderate and advisor-aligned.' },
    interaction: { key: 'interaction', title: 'Interaction Summary', text: 'Five interactions in 30 days, mostly positive. A phone inquiry about CD rates and a branch mortgage review indicate active engagement. One negative web chat about wire limits is worth a proactive follow-up.' },
    csat: { key: 'csat', title: 'CSAT/NPS Summary', text: 'CSAT is 72 and recovering after a May dip tied to wire-limit friction. NPS is 48 (promoter-leaning). Recent branch visit scored 9. Sentiment trajectory is improving.' },
    opportunity: { key: 'opportunity', title: 'Opportunity Summary', text: 'Four open opportunities worth ~$2M. The CD Ladder (75%) and 529 Plan (68%) are near-term wins; Held-Away Consolidation ($1.2M) is the high-value play. Prioritize the CD conversation this week.' },
    case: { key: 'case', title: 'Case Summary', text: 'Four cases in the last quarter, mostly resolved. One mobile-deposit issue is in progress. No systemic service risk; fraud dispute was handled well and likely aided the CSAT recovery.' },
    campaign: { key: 'campaign', title: 'Campaign Summary', text: 'Julie responded to the Summer CD Promo and Refi Rate Alert — reinforcing CD and refinance intent. She was invited to the Wealth Advisory Webinar (no response yet) and is queued for the New Parent guide.' },
  },
  property: {
    estimatedValue: 2144601, equity: 2144601, mortgageBalance: 0, helocOpportunityScore: 96,
    propertyType: 'Condo', floodZone: 'X', wildfireRiskScore: 55, isOwner: true, asOf: 'Jul 2026',
  },
  financialPlan: {
    status: 'Stale', retirementTargetAge: 65, monthlyIncomeTarget: 10801, totalGoalAmount: 6408956,
    goalCount: 3, recommendedAllocation: 'Moderate Conservative', nextReviewDate: '—', asOf: 'Jul 2026',
  },
  firmographics: {
    revenueBand: '$10M-$50M', employeeBand: '201-1000', industryNaics: '541511', industrySic: '7372',
    foundedYear: 1998, website: 'omega-inc.example.com', hq: 'CA, US', linkedinFollowers: 48200,
    techStack: ['Salesforce', 'AWS', 'Snowflake', 'Workday'], asOf: 'Jul 2026',
  },
  governance: {
    boardSize: 11, ceoTenureYears: 6, boardAvgTenureYears: 7, governanceRating: 'Adequate',
    keyDirector: 'Morgan Ellery', interlockCount: 3, execTurnover: false, recentEventDate: 'Apr 2026', asOf: 'Jul 2026',
  },
  esg: {
    overall: 6.3, environmental: 5.8, social: 6.9, governance: 6.1, rating: 'BBB',
    carbonIntensity: 142.5, controversyCount: 1, topControversy: 'Labor Management', ratingChangeDirection: 'Upgrade', asOf: 'Jul 2026',
  },
  secFilings: [{
    filingType: '10-Q',
    sections: [
      { id: 'sec0', section: 'Part 1 - Management Discussion and Analysis', text: 'Revenue grew 8% year over year driven by expansion in the commercial segment. Operating margins remained stable amid disciplined cost management.' },
      { id: 'sec1', section: 'Part 2 - Risk Factors', text: 'Macroeconomic conditions and interest-rate volatility present ongoing risk to the loan portfolio and net interest margin.' },
    ],
  }],
};

export function fetchFull360(accountId: string | null): Promise<Full360 | null> {
  if (!accountId) return Promise.resolve(null);
  return resolve(
    'core',
    () => mockResolve(JULIE_FULL, 400),
    () => fetchFull360Real(accountId),
  );
}
