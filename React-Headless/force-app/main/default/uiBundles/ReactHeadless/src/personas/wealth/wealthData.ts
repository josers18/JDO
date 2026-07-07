/**
 * Wealth "Advisory Desk" data — MOCK phase.
 * Signatures match the (forthcoming) wealth plan. Swap bodies for
 * executeGraphQL / queryDataCloud (Financial_Trades, Plaid held-away, MGP
 * plans, MSCI ESG) when wiring live data — call sites unchanged.
 */
import type { AttentionItem } from '@shared';
import { mockResolve, series } from '../mock/mockUtil';
import type { Kpi, WealthClient } from '../types';

// GraphQL (Account/FSC) + Data Cloud (Plaid held-away, MGP plans) in production.
export function fetchDeskKpis(): Promise<Kpi[]> {
  return mockResolve([
    { key: 'aum', label: 'Assets Under Mgmt', value: 342000000, format: 'currencyCompact', trend: series(2, 12, 330, 30), deltaPct: 0.037 },
    { key: 'heldAway', label: 'Held-Away Opportunity', value: 58000000, format: 'currencyCompact', trend: series(6, 12, 55, 12), deltaPct: 0.09 },
    { key: 'households', label: 'Advisory Households', value: 64, format: 'number', trend: series(3, 12, 62, 6), deltaPct: 0.02 },
    { key: 'plansOnTrack', label: 'Plans On Track', value: 0.78, format: 'percent', trend: series(9, 12, 76, 8), deltaPct: 0.05 },
    { key: 'reviewsDue', label: 'Reviews Due', value: 7, format: 'number', trend: series(5, 12, 8, 4), deltaPct: -0.12 },
  ]);
}

// Data Cloud (portfolio-drift + plan-progress + retirement-readiness models) in production.
export function fetchAttentionItems(): Promise<AttentionItem[]> {
  return mockResolve([
    { id: '001M', clientName: 'The Whitfield Family', title: 'Portfolio drift — Whitfield Trust', reason: 'Equity allocation 78% vs 65% target after rally', action: 'Rebalance to policy', score: 0.9, severity: 'high', source: 'Drift model' },
    { id: '001N', clientName: 'Dr. Elaine Park', title: 'Held-away capture — Elaine Park', reason: 'Plaid: $4.2M in outside 401k + brokerage detected', action: 'Consolidation proposal', score: 0.85, severity: 'high', source: 'Plaid' },
    { id: '001O', clientName: 'Robert Osei', title: 'Retirement readiness gap — Osei', reason: 'On track for 71% of goal income; shortfall widening', action: 'Increase contributions + revisit plan', score: 0.72, severity: 'medium', source: 'MGP Plan' },
    { id: '001P', clientName: 'Grace Liu', title: 'Tax-loss harvest window', reason: '3 lots with >$40k unrealized losses; wash-sale clear', action: 'Harvest before quarter-end', score: 0.64, severity: 'medium', source: 'Trades' },
    { id: '001Q', clientName: 'Hoffman Foundation', title: 'ESG mandate drift', reason: 'MSCI: 2 holdings downgraded below mandate floor', action: 'Screen + replace holdings', score: 0.5, severity: 'medium', source: 'MSCI ESG' },
  ]);
}

// GraphQL (Account/FSC holdings) + Data Cloud (trades, plans, ESG) in production.
export function fetchClient(accountId: string | null): Promise<WealthClient | null> {
  if (!accountId) return Promise.resolve(null);
  const catalog: Record<string, WealthClient> = {
    '001M': {
      id: '001M', name: 'The Whitfield Family', segment: 'Ultra High Net Worth', aum: 48200000, heldAway: 6200000,
      retirementReadiness: 0.94, riskProfile: 'Growth',
      holdings: [
        { id: 'h1', symbol: 'VTI', name: 'US Total Market', assetClass: 'Equity', marketValue: 18400000, dayChangePct: 0.6, esgScore: 7.2 },
        { id: 'h2', symbol: 'AGG', name: 'US Aggregate Bond', assetClass: 'Fixed Income', marketValue: 9800000, dayChangePct: -0.1, esgScore: 6.8 },
        { id: 'h3', symbol: 'VXUS', name: 'Intl Ex-US', assetClass: 'Equity', marketValue: 7300000, dayChangePct: 0.9, esgScore: 6.1 },
        { id: 'h4', symbol: 'GLD', name: 'Gold Trust', assetClass: 'Alternative', marketValue: 4200000, dayChangePct: 1.3, esgScore: 4.5 },
      ],
      trades: [
        { id: 'tr1', action: 'SELL', symbol: 'VTI', shares: 2400, amount: 640000, when: 'Today 10:12 AM' },
        { id: 'tr2', action: 'BUY', symbol: 'AGG', shares: 5800, amount: 590000, when: 'Today 10:15 AM' },
        { id: 'tr3', action: 'BUY', symbol: 'VXUS', shares: 3100, amount: 190000, when: 'Jul 1' },
      ],
      plans: [
        { id: 'p1', name: 'Retirement Income', target: 100, current: 94 },
        { id: 'p2', name: 'Legacy / Estate', target: 100, current: 71 },
        { id: 'p3', name: 'Philanthropy Fund', target: 5000000, current: 3200000 },
      ],
    },
  };
  return mockResolve(catalog[accountId] ?? {
    id: accountId, name: 'Selected Client', segment: 'High Net Worth', aum: 8200000, heldAway: 1500000,
    retirementReadiness: 0.71, riskProfile: 'Balanced',
    holdings: [{ id: 'h1', symbol: 'VTI', name: 'US Total Market', assetClass: 'Equity', marketValue: 4200000, dayChangePct: 0.5, esgScore: 7.0 }],
    trades: [{ id: 'tr1', action: 'BUY', symbol: 'VTI', shares: 1000, amount: 260000, when: 'Jul 1' }],
    plans: [{ id: 'p1', name: 'Retirement Income', target: 100, current: 71 }],
  }, 300);
}
