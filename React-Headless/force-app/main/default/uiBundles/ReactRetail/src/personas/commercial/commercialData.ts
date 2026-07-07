/**
 * Commercial "Relationship Command" data — MOCK phase.
 * Signatures match docs/superpowers/plans/2026-07-02-commercial-relationship-command.md.
 * Swap bodies for executeGraphQL / queryDataCloud (DnB, ZoomInfo, BoardEx, SEC,
 * relationship graph) when wiring live data — call sites unchanged.
 */
import type { AttentionItem } from '@shared';
import { mockResolve, series } from '../mock/mockUtil';
import type { Kpi, PipelineOpp, CommercialAccount } from '../types';

// GraphQL (Account + Opportunity + Case) in production.
export function fetchPortfolioKpis(): Promise<Kpi[]> {
  return mockResolve([
    { key: 'accounts', label: 'Portfolio Accounts', value: 42, format: 'number', trend: series(2, 12, 40, 8), deltaPct: 0.05 },
    { key: 'exposure', label: 'Total Exposure', value: 284000000, format: 'currencyCompact', trend: series(6, 12, 280, 30), deltaPct: 0.021 },
    { key: 'pipelineValue', label: 'Pipeline Value', value: 61500000, format: 'currencyCompact', trend: series(8, 12, 55, 20), deltaPct: 0.14 },
    { key: 'atRisk', label: 'Covenant Watch', value: 4, format: 'number', trend: series(4, 12, 5, 3), deltaPct: 0.33 },
    { key: 'openCases', label: 'Open Cases', value: 3, format: 'number', trend: series(10, 12, 4, 3), deltaPct: -0.2 },
  ]);
}

// Data Cloud (DnB credit + Moody's + covenant/delinquency prediction) in production.
export function fetchAttentionItems(): Promise<AttentionItem[]> {
  return mockResolve([
    { id: '001X', clientName: 'Acme Manufacturing', title: 'Credit deterioration — Acme Mfg', reason: 'PAYDEX 68→52 in 60 days; Moody’s outlook negative', action: 'Review LOC covenants', score: 0.89, severity: 'high', source: 'DnB + Moody’s' },
    { id: '001Y', clientName: 'Northwind Logistics', title: 'Covenant breach risk — Northwind', reason: 'Projected DSCR 1.05x vs 1.25x minimum next quarter', action: 'Pre-emptive waiver discussion', score: 0.82, severity: 'high', source: 'Covenant model' },
    { id: '001Z', clientName: 'Blue Ridge Foods', title: 'Expansion signal — Blue Ridge', reason: 'ZoomInfo: +120 hires, new facility permit filed', action: 'Pitch equipment financing', score: 0.74, severity: 'medium', source: 'ZoomInfo' },
    { id: '001W', clientName: 'Summit Health Group', title: 'M&A activity — Summit Health', reason: 'SEC 8-K: acquisition announced; treasury needs shift', action: 'Treasury restructuring review', score: 0.66, severity: 'medium', source: 'SEC_Filings' },
    { id: '001V', clientName: 'Cedar Realty Partners', title: 'Deposit concentration risk', reason: '78% of deposits in one operating account', action: 'Propose sweep + laddering', score: 0.48, severity: 'low', source: 'Deposits' },
  ]);
}

// GraphQL (Account + FinServ) + Data Cloud (firmographics/relationships) in production.
export function fetchAccount(accountId: string | null): Promise<CommercialAccount | null> {
  if (!accountId) return Promise.resolve(null);
  const catalog: Record<string, CommercialAccount> = {
    '001X': {
      id: '001X', name: 'Acme Manufacturing', industry: 'Industrial Manufacturing', annualRevenue: 128000000,
      website: 'acme-mfg.com', employees: 4200, paydex: 52, creditRating: 'BBB-', secLastFiling: '10-Q · May 2026',
      execs: [
        { name: 'Jane Roe', title: 'Chief Financial Officer' },
        { name: 'Victor Hale', title: 'Treasurer' },
        { name: 'Dana Kim', title: 'VP Finance' },
      ],
      accounts: [
        { id: 'c1', name: 'Operating Account', type: 'Commercial Checking', balance: 8400000 },
        { id: 'c2', name: 'Revolving LOC', type: 'Line of Credit', balance: -32000000 },
        { id: 'c3', name: 'Term Loan A', type: 'Term Loan', balance: -54000000 },
      ],
      relationships: [
        { id: 'r0', name: 'Acme Global Holdings', relation: 'Parent', depth: 0 },
        { id: 'r1', name: 'Acme Manufacturing', relation: 'Self', depth: 1 },
        { id: 'r2', name: 'Acme West LLC', relation: 'Subsidiary', depth: 2 },
        { id: 'r3', name: 'Acme Logistics Inc', relation: 'Subsidiary', depth: 2 },
        { id: 'r4', name: 'Acme Parts Co', relation: 'Affiliate', depth: 2 },
      ],
    },
  };
  return mockResolve(catalog[accountId] ?? {
    id: accountId, name: 'Selected Account', industry: 'Commercial', annualRevenue: 50000000,
    website: 'example.com', employees: 800, paydex: 70, creditRating: 'BBB', secLastFiling: 'n/a',
    execs: [{ name: 'CFO', title: 'Chief Financial Officer' }],
    accounts: [{ id: 'x1', name: 'Operating Account', type: 'Commercial Checking', balance: 2400000 }],
    relationships: [{ id: 'r1', name: 'Selected Account', relation: 'Self', depth: 0 }],
  }, 300);
}

// GraphQL (Opportunity) in production.
export function fetchPipeline(): Promise<PipelineOpp[]> {
  return mockResolve([
    { id: 'o1', name: 'Equipment Financing — Blue Ridge', stage: 'Proposal', amount: 18000000, closeDate: 'Aug 5' },
    { id: 'o2', name: 'Treasury Mgmt — Summit Health', stage: 'Discovery', amount: 9500000, closeDate: 'Aug 20' },
    { id: 'o3', name: 'Syndicated Loan — Acme Mfg', stage: 'Negotiation', amount: 34000000, closeDate: 'Sep 1' },
  ]);
}
