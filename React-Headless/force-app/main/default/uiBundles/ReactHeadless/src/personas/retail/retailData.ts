/**
 * Retail "Daily Book" data — MOCK phase.
 *
 * These functions have the exact signatures the real implementation will use
 * (see docs/superpowers/plans/2026-07-02-retail-daily-book.md). Today each body
 * returns representative Cumulus data via mockResolve; wiring live data means
 * replacing a body with executeGraphQL (Core/FSC) or queryDataCloud (DC bridge)
 * — the cockpit components and useAsyncData call sites do not change.
 */
import type { AttentionItem } from '@shared';
import { mockResolve, series } from '../mock/mockUtil';
import type { Kpi, ActivityItem, PipelineOpp, GoalProgress, RetailClient } from '../types';

// GraphQL (Core/FSC) in production.
export function fetchBookKpis(): Promise<Kpi[]> {
  return mockResolve([
    { key: 'households', label: 'Households', value: 128, format: 'number', trend: series(3, 12, 120, 20), deltaPct: 0.031 },
    { key: 'deposits', label: 'Total Deposits', value: 18420000, format: 'currencyCompact', trend: series(7, 12, 18, 4), deltaPct: 0.058 },
    { key: 'openOpportunities', label: 'Open Opportunities', value: 14, format: 'number', trend: series(11, 12, 12, 6), deltaPct: -0.02 },
    { key: 'openCases', label: 'Open Cases', value: 6, format: 'number', trend: series(5, 12, 8, 5), deltaPct: -0.15 },
    { key: 'atRisk', label: 'At-Risk Households', value: 9, format: 'number', trend: series(9, 12, 10, 4), deltaPct: 0.12 },
  ]);
}

// Data Cloud (Bank_Churner + PERSONAL_PRODUCT_RECOMMENDATION) in production.
export function fetchAttentionItems(): Promise<AttentionItem[]> {
  return mockResolve([
    { id: '001A', clientName: 'Ada Lovelace', title: 'High churn risk — Ada Lovelace', reason: 'Primary balance down 62% over 30 days; direct-deposit stopped', action: 'Retention call + fee waiver', score: 0.91, severity: 'high', source: 'Bank_Churner' },
    { id: '001B', clientName: 'Marcus Chen', title: 'Mortgage rate-shopping detected', reason: 'Web sessions on refi calculator ×5 this week', action: 'Offer HELOC refinance', score: 0.84, severity: 'high', source: 'Web + NBA' },
    { id: '001C', clientName: 'Priya Natarajan', title: 'Life event — new child', reason: 'Life-event signal; eligible for 529 + term life', action: 'Open 529 plan', score: 0.77, severity: 'medium', source: 'PersonLifeEvent' },
    { id: '001D', clientName: 'Diego Ramirez', title: 'Upsell — savings sweep', reason: 'Idle $48k in checking >90 days', action: 'Move to high-yield savings', score: 0.63, severity: 'medium', source: 'PRODUCT_REC' },
    { id: '001E', clientName: 'Sofia Rossi', title: 'CSAT dip after branch visit', reason: 'Last NPS 6 (was 9); complaint logged', action: 'Service recovery outreach', score: 0.55, severity: 'medium', source: 'CSAT_NPS' },
    { id: '001F', clientName: 'Tom Becker', title: 'Cross-sell — auto loan', reason: 'Large recurring auto-related spend, no auto loan on file', action: 'Pre-approved auto offer', score: 0.41, severity: 'low', source: 'PRODUCT_REC' },
  ]);
}

// GraphQL (Account + Contact + FinServ__FinancialAccount__c) in production.
export function fetchClient(accountId: string | null): Promise<RetailClient | null> {
  if (!accountId) return Promise.resolve(null);
  const catalog: Record<string, RetailClient> = {
    '001A': {
      id: '001A', name: 'Ada Lovelace', segment: 'Mass Affluent', email: 'ada.lovelace@example.com', phone: '(415) 555-0142',
      tenureYears: 7, lifeEvent: null,
      accounts: [
        { id: 'a1', name: 'Everyday Checking', type: 'Checking', balance: 4210 },
        { id: 'a2', name: 'High-Yield Savings', type: 'Savings', balance: 28900 },
        { id: 'a3', name: 'Platinum Card', type: 'Credit Card', balance: -3120 },
      ],
    },
    '001C': {
      id: '001C', name: 'Priya Natarajan', segment: 'Emerging Affluent', email: 'priya.n@example.com', phone: '(408) 555-0199',
      tenureYears: 3, lifeEvent: 'New child (Apr 2026)',
      accounts: [
        { id: 'b1', name: 'Joint Checking', type: 'Checking', balance: 9600 },
        { id: 'b2', name: 'Savings', type: 'Savings', balance: 15400 },
      ],
    },
  };
  return mockResolve(catalog[accountId] ?? {
    id: accountId, name: 'Selected Client', segment: 'Retail', email: 'client@example.com', phone: '(555) 555-0100',
    tenureYears: 2, lifeEvent: null,
    accounts: [{ id: 'x1', name: 'Checking', type: 'Checking', balance: 5200 }],
  }, 300);
}

// GraphQL (Task + Event) in production.
export function fetchActivity(): Promise<ActivityItem[]> {
  return mockResolve([
    { id: 't1', kind: 'CALL', subject: 'Retention call — Ada Lovelace', when: 'Today 9:30 AM' },
    { id: 'e1', kind: 'MEETING', subject: 'Portfolio review — Marcus Chen', when: 'Today 2:00 PM' },
    { id: 't2', kind: 'TASK', subject: 'Send 529 packet to Priya Natarajan', when: 'Tomorrow' },
    { id: 't3', kind: 'EMAIL', subject: 'Follow up on auto pre-approval — Tom Becker', when: 'Jul 3' },
    { id: 'e2', kind: 'EVENT', subject: 'Branch community event', when: 'Jul 5' },
  ]);
}

// GraphQL (Opportunity) in production.
export function fetchPipeline(): Promise<PipelineOpp[]> {
  return mockResolve([
    { id: 'o1', name: 'HELOC — Marcus Chen', stage: 'Proposal', amount: 120000, closeDate: 'Jul 18' },
    { id: 'o2', name: '529 Plan — Priya Natarajan', stage: 'Qualification', amount: 24000, closeDate: 'Jul 22' },
    { id: 'o3', name: 'Auto Loan — Tom Becker', stage: 'Negotiation', amount: 38000, closeDate: 'Jul 30' },
    { id: 'o4', name: 'Mortgage Refi — Sofia Rossi', stage: 'Prospecting', amount: 410000, closeDate: 'Aug 12' },
  ]);
}

// GraphQL (FinancialGoal) in production.
export function fetchGoals(): Promise<GoalProgress[]> {
  return mockResolve([
    { id: 'g1', name: 'Q3 Deposit Growth', target: 2000000, current: 1360000 },
    { id: 'g2', name: 'New Households', target: 20, current: 13 },
    { id: 'g3', name: 'Cross-Sell Ratio', target: 100, current: 68 },
  ]);
}
