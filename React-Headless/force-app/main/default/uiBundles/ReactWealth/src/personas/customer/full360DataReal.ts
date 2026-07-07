/**
 * Full Customer 360 — REAL data implementation (§3b of the inventory doc).
 *
 * Verified live against jdo-1lrnov (storm-16a17dc388fbe6, 2026-07-07). Sources:
 *   · Account, Case, Opportunity, FinServ__FinancialAccount__c        → GraphQL (uiapi)
 *   · ssot__FinancialAccountTransaction__dlm (transactions)           → Data Cloud
 *   · Financial_Trades__dlm (trades)                                  → Data Cloud
 *   · InteractionSummary_Home__dlm (interactions)                     → Data Cloud
 *   · Meeting_Note_c_Home__dlm (meeting notes)                        → Data Cloud
 *   · CSAT_Snowflake__dlm (CSAT/NPS + trend + verbatims)              → Data Cloud
 *   · Marketing_Campaigns__dlm (campaigns)                            → Data Cloud
 *   · CumulusGongCallSentiment__dlm (call sentiment summaries)        → Data Cloud
 *   · CumulusWorldCheckAml__dlm (KYC / AML card)                      → Data Cloud
 *   · Attrition_Prediction__dlm + Predicted_CSAT_Output__dlm (ML)     → Data Cloud
 *   · Agentforce summaries are composed deterministically from the above
 *     live values (no LLM call is wired) — per-account correct, not hardcoded.
 *
 * Join keys (probed): FinancialAccountTransaction=SFAccountID__c, Trades=AccountID__c,
 * InteractionSummary=AccountId__c, MeetingNote=Account_c__c, CSAT=accountid__c,
 * Campaigns=AccountID__c, Gong/AML=ssot__AccountId__c, Attrition=PrimaryObjectPk__c,
 * PredictedCSAT=accountid__c.
 */
import { executeGraphQL, queryDataCloud } from '@shared';
import type {
  Full360, DetailField, FinAccount, Transaction, Trade, Interaction, CaseRow,
  CsatNps, Opportunity, Campaign, MeetingNote, CallSummary, KycSummary,
  MlPrediction, AgentforceSummary,
} from './full360Types';

/* ------------------------------- helpers -------------------------------- */
type GNode = Record<string, { value?: unknown } | undefined | string>;
const gv = (n: GNode, k: string): unknown => {
  const f = n[k];
  return typeof f === 'object' && f !== null ? (f as { value?: unknown }).value : f;
};
const gs = (n: GNode, k: string) => String(gv(n, k) ?? '');
const gn = (n: GNode, k: string) => Number(gv(n, k) ?? 0);

const dcNum = (v: unknown) => Number(v ?? 0);
/** Decode the HTML entities Snowflake text arrives with (&quot; &#39; &amp; …). */
function decode(s: unknown): string {
  return String(s ?? '')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\r\n/g, '\n').trim();
}
/** "2026-07-07 00:00:00.000 UTC" or ISO → "Jul 7, 2026". */
function shortDate(v: unknown): string {
  const raw = String(v ?? '').replace(' UTC', 'Z').replace(' ', 'T');
  const d = new Date(raw);
  if (isNaN(d.getTime())) return String(v ?? '—');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });

/* ------------------------------- queries -------------------------------- */
function coreQuery(acct: string): string {
  return `query Full360Core {
    uiapi { query {
      Account(first: 1, where: { Id: { eq: "${acct}" } }) {
        edges { node {
          Id Name @optional { value } Phone @optional { value } Website @optional { value }
          Industry @optional { value } AnnualRevenue @optional { value }
          NumberOfEmployees @optional { value } BillingCity @optional { value }
          BillingState @optional { value } Type @optional { value }
        } }
      }
      FinServ__FinancialAccount__c(first: 40, where: { FinServ__PrimaryOwner__c: { eq: "${acct}" } }) {
        edges { node {
          Id Name @optional { value } FinServ__Balance__c @optional { value }
          FinServ__FinancialAccountType__c @optional { value } FinServ__Status__c @optional { value }
        } }
      }
      Opportunity(first: 20, where: { AccountId: { eq: "${acct}" }, IsClosed: { eq: false } }, orderBy: { Amount: { order: DESC } }) {
        edges { node { Id Name @optional { value } StageName @optional { value } Amount @optional { value } CloseDate @optional { value } Probability @optional { value } } }
      }
      Case(first: 12, where: { AccountId: { eq: "${acct}" } }, orderBy: { CreatedDate: { order: DESC } }) {
        totalCount
        edges { node { Id CaseNumber @optional { value } Subject @optional { value } Status @optional { value } Priority @optional { value } CreatedDate @optional { value } } }
      }
    } }
  }`;
}

interface CoreShape {
  uiapi?: { query?: {
    Account?: { edges?: { node: GNode }[] };
    FinServ__FinancialAccount__c?: { edges?: { node: GNode }[] };
    Opportunity?: { edges?: { node: GNode }[] };
    Case?: { totalCount?: number; edges?: { node: GNode }[] };
  } };
}

const rows = <T,>(p: Promise<{ rows: T[] }>): Promise<T[]> => p.then(r => r.rows).catch(() => [] as T[]);
const PRIORITY = (p: string): CaseRow['priority'] => (p === 'High' || p === 'Low' ? p : 'Medium');

/* ------------------------------- fetcher -------------------------------- */
export async function fetchFull360Real(accountId: string | null): Promise<Full360 | null> {
  if (!accountId) return null;
  const acct = accountId.replace(/[^A-Za-z0-9]/g, '');

  const [core, txns, tradeRows, inters, notes, csatRows, camps, gong, aml, attr, pcsat] = await Promise.all([
    executeGraphQL<CoreShape>(coreQuery(acct)),
    rows(queryDataCloud<Record<string, unknown>>(`SELECT ssot__TransactionDate__c dt, ssot__FinancialTransactionCategory__c cat, ssot__FinancialAccountTransactionType__c typ, ssot__TransactionAmount__c amt FROM ssot__FinancialAccountTransaction__dlm WHERE SFAccountID__c = '${acct}' ORDER BY ssot__TransactionDate__c DESC LIMIT 12`, 12)),
    rows(queryDataCloud<Record<string, unknown>>(`SELECT TradeDate__c dt, TradeSide__c side, InstrumentName__c inst, InstrumentIdentifier__c sym, Quantity__c qty, Price__c px, Total_Trade__c tot FROM Financial_Trades__dlm WHERE AccountID__c = '${acct}' ORDER BY TradeDate__c DESC LIMIT 10`, 10)),
    rows(queryDataCloud<Record<string, unknown>>(`SELECT CreatedDate__c dt, Name__c nm, InteractionPurpose__c purp, MeetingNotes__c notes, NextSteps__c nxt FROM InteractionSummary_Home__dlm WHERE AccountId__c = '${acct}' ORDER BY CreatedDate__c DESC LIMIT 8`, 8)),
    rows(queryDataCloud<Record<string, unknown>>(`SELECT Date_c__c dt, Title_c__c ttl, Notes_c__c notes FROM Meeting_Note_c_Home__dlm WHERE Account_c__c = '${acct}' ORDER BY Date_c__c DESC LIMIT 6`, 6)),
    rows(queryDataCloud<Record<string, unknown>>(`SELECT csat_score__c csat, nps_score__c nps, csat_description__c csatd, nps_description__c npsd, score_date__c dt FROM CSAT_Snowflake__dlm WHERE accountid__c = '${acct}' ORDER BY score_date__c DESC LIMIT 8`, 8)),
    rows(queryDataCloud<Record<string, unknown>>(`SELECT Campaign_Name__c nm, Category__c cat, Product_Name__c prod, Email_Action__c act, Send_Date__c dt FROM Marketing_Campaigns__dlm WHERE AccountID__c = '${acct}' ORDER BY Send_Date__c DESC LIMIT 8`, 8)),
    rows(queryDataCloud<Record<string, unknown>>(`SELECT overallSentiment__c sent, sentimentTrend__c trend, dealRiskScore__c risk, rmName__c rm, lastCallDate__c dt, generatedAt__c gen FROM CumulusGongCallSentiment__dlm WHERE ssot__AccountId__c = '${acct}' ORDER BY generatedAt__c DESC LIMIT 4`, 4)),
    rows(queryDataCloud<Record<string, unknown>>(`SELECT overallRiskRating__c rating, sanctionsHit__c sanc, pepHit__c pep, adverseMediaHit__c media, lastScreenedAt__c dt FROM CumulusWorldCheckAml__dlm WHERE ssot__AccountId__c = '${acct}' ORDER BY profileDate__c DESC LIMIT 1`, 1)),
    rows(queryDataCloud<Record<string, unknown>>(`SELECT Churned_c__c churned FROM Attrition_Prediction__dlm WHERE PrimaryObjectPk__c = '${acct}' LIMIT 1`, 1)),
    rows(queryDataCloud<Record<string, unknown>>(`SELECT CSAT_Score_prediction__c pred, Cross_Sell_Score__c xsell, Digital_Engagement__c dig, Complaint_Count__c comp, Segment__c seg FROM Predicted_CSAT_Output__dlm WHERE accountid__c = '${acct}' LIMIT 1`, 1)),
  ]);

  const q = core.uiapi?.query;
  const acctNode = q?.Account?.edges?.[0]?.node;
  if (!acctNode) return null;
  const finEdges = q?.FinServ__FinancialAccount__c?.edges ?? [];
  const oppEdges = q?.Opportunity?.edges ?? [];
  const caseEdges = q?.Case?.edges ?? [];

  /* ---- Details (editable) ---- */
  const details: DetailField[] = [
    { key: 'name', label: 'Account Name', value: gs(acctNode, 'Name'), editable: true, group: 'Identity', type: 'text' },
    { key: 'type', label: 'Type', value: gs(acctNode, 'Type') || '—', editable: true, group: 'Identity', type: 'picklist', options: ['Client', 'Prospect', 'Partner'] },
    { key: 'phone', label: 'Phone', value: gs(acctNode, 'Phone') || '—', editable: true, group: 'Contact', type: 'phone' },
    { key: 'website', label: 'Website', value: gs(acctNode, 'Website') || '—', editable: true, group: 'Contact', type: 'text' },
    { key: 'address', label: 'Location', value: [gs(acctNode, 'BillingCity'), gs(acctNode, 'BillingState')].filter(Boolean).join(', ') || '—', editable: true, group: 'Contact', type: 'text' },
    { key: 'industry', label: 'Industry', value: gs(acctNode, 'Industry') || '—', editable: true, group: 'Business', type: 'text' },
    { key: 'revenue', label: 'Annual Revenue', value: gn(acctNode, 'AnnualRevenue') ? money(gn(acctNode, 'AnnualRevenue')) : '—', editable: true, group: 'Business', type: 'currency' },
    { key: 'employees', label: 'Employees', value: gn(acctNode, 'NumberOfEmployees') ? String(gn(acctNode, 'NumberOfEmployees')) : '—', editable: true, group: 'Business', type: 'text' },
  ];

  /* ---- Financial Accounts ---- */
  const finAccounts: FinAccount[] = finEdges.map((e, i) => ({
    id: `fa${i}`,
    name: gs(e.node, 'Name') || 'Account',
    type: gs(e.node, 'FinServ__FinancialAccountType__c') || '—',
    number: `••••${String(gs(e.node, 'Id')).slice(-4) || '0000'}`,
    balance: gn(e.node, 'FinServ__Balance__c'),
    status: gs(e.node, 'FinServ__Status__c') || 'Active',
    opened: '—',
  }));

  /* ---- Transactions ---- */
  const transactions: Transaction[] = txns.map((r, i) => {
    const isDebit = String(r.typ).toLowerCase() === 'debit';
    const amt = Math.abs(dcNum(r.amt));
    return {
      id: `t${i}`,
      date: shortDate(r.dt),
      description: decode(r.cat) || 'Transaction',
      category: decode(r.cat) || '—',
      account: String(r.typ ?? '—'),
      amount: isDebit ? -amt : amt,
    };
  });

  /* ---- Trades ---- */
  const trades: Trade[] = tradeRows.map((r, i) => ({
    id: `tr${i}`,
    date: shortDate(r.dt),
    action: (String(r.side).toLowerCase() === 'sell' ? 'SELL' : 'BUY') as 'BUY' | 'SELL',
    symbol: String(r.sym ?? '—'),
    name: decode(r.inst) || '—',
    shares: Math.round(dcNum(r.qty)),
    price: dcNum(r.px),
    amount: dcNum(r.tot),
  }));

  /* ---- Interactions ---- */
  const interactions: Interaction[] = inters.map((r, i) => ({
    id: `i${i}`,
    when: shortDate(r.dt),
    channel: String(r.nm ?? '').replace(/^Summary:\s*/, '').split(' - ')[0] || 'Interaction',
    type: String(r.purp ?? 'Interaction'),
    summary: decode(r.notes) || decode(r.nxt) || '—',
    sentiment: 'neutral',
  }));

  /* ---- Cases ---- */
  const cases: CaseRow[] = caseEdges.map((e, i) => ({
    id: `c${i}`,
    number: gs(e.node, 'CaseNumber') || '—',
    subject: gs(e.node, 'Subject') || '—',
    status: gs(e.node, 'Status') || '—',
    priority: PRIORITY(gs(e.node, 'Priority')),
    opened: shortDate(gv(e.node, 'CreatedDate')),
  }));

  /* ---- CSAT / NPS ---- */
  const csatVals = csatRows.map(r => dcNum(r.csat)).filter(n => n > 0);
  const npsVals = csatRows.map(r => dcNum(r.nps)).filter(n => n >= 0);
  const csatNps: CsatNps = {
    csatScore: csatVals.length ? Math.round(csatVals[0]) : 0,
    npsScore: npsVals.length ? Math.round(npsVals[0]) : 0,
    csatTrend: [...csatVals].reverse(),
    npsTrend: [...npsVals].reverse(),
    recent: csatRows.slice(0, 4).map((r, i) => ({
      id: `s${i}`,
      when: shortDate(r.dt),
      type: (i % 2 === 0 ? 'CSAT' : 'NPS') as 'CSAT' | 'NPS',
      score: Math.round(i % 2 === 0 ? dcNum(r.csat) : dcNum(r.nps)),
      verbatim: `CSAT ${decode(r.csatd) || '—'} · NPS ${decode(r.npsd) || '—'}`,
    })),
  };

  /* ---- Opportunities ---- */
  const opportunities: Opportunity[] = oppEdges.map((e, i) => ({
    id: `o${i}`,
    name: gs(e.node, 'Name') || 'Opportunity',
    stage: gs(e.node, 'StageName') || '—',
    amount: gn(e.node, 'Amount'),
    closeDate: shortDate(gv(e.node, 'CloseDate')),
    probability: gn(e.node, 'Probability') / 100,
  }));

  /* ---- Campaigns ---- */
  const campaigns: Campaign[] = camps.map((r, i) => ({
    id: `cm${i}`,
    name: decode(r.nm) || 'Campaign',
    type: `${decode(r.cat)}${r.prod ? ` · ${decode(r.prod)}` : ''}` || '—',
    status: String(r.act ?? '—'),
    responded: ['Click', 'Open'].includes(String(r.act)),
    memberSince: shortDate(r.dt),
  }));

  /* ---- Meeting Notes ---- */
  const meetingNotes: MeetingNote[] = notes.map((r, i) => ({
    id: `mn${i}`,
    date: shortDate(r.dt),
    title: decode(r.ttl) || 'Note',
    author: 'Relationship Manager',
    body: decode(r.notes),
  }));

  /* ---- Call Summaries (from Gong sentiment) ---- */
  const callSummaries: CallSummary[] = gong.map((r, i) => {
    const sent = String(r.sent ?? 'Neutral');
    return {
      id: `cs${i}`,
      date: shortDate(r.dt ?? r.gen),
      duration: '—',
      channel: 'Call',
      sentiment: sent === 'Positive' ? 'positive' : sent === 'Negative' ? 'negative' : 'neutral',
      summary: `RM ${String(r.rm ?? '—')} · sentiment ${sent} (${String(r.trend ?? '—')}) · deal-risk score ${Math.round(dcNum(r.risk))}.`,
    };
  });

  /* ---- KYC / AML (WorldCheck) ---- */
  const a = aml[0];
  const flags = a
    ? [a.sanc ? 'sanctions' : '', a.pep ? 'PEP' : '', a.media ? 'adverse media' : ''].filter(Boolean)
    : [];
  const kyc: KycSummary = {
    id: 'kyc1',
    status: a ? 'Screened' : 'Not screened',
    lastReview: a ? shortDate(a.dt) : '—',
    riskRating: a ? String(a.rating ?? '—') : '—',
    amlStatus: a ? (flags.length ? `Hits: ${flags.join(', ')}` : 'Clear (WorldCheck)') : '—',
    notes: a
      ? `WorldCheck screening on ${shortDate(a.dt)}: overall risk ${String(a.rating)}. ${flags.length ? `Flags — ${flags.join(', ')}.` : 'No sanctions, PEP, or adverse-media hits.'}`
      : 'No AML screening on file.',
  };

  /* ---- ML predictions ---- */
  const churnPct = attr.length ? dcNum(attr[0].churned) : NaN;
  const pc = pcsat[0];
  const predictions: MlPrediction[] = [];
  if (!isNaN(churnPct)) {
    predictions.push({
      key: 'attrition', title: 'Attrition Risk', score: Math.min(1, churnPct / 100), scoreLabel: 'Churn',
      outcome: churnPct >= 60 ? 'Elevated' : churnPct >= 40 ? 'Medium' : 'Low',
      tone: churnPct >= 60 ? 'risk' : churnPct >= 40 ? 'neutral' : 'positive',
      drivers: pc ? [
        { label: 'Digital engagement', impact: -dcNum(pc.dig) / 100 },
        { label: 'Complaints', impact: dcNum(pc.comp) / 10 },
        { label: 'Cross-sell depth', impact: -dcNum(pc.xsell) / 100 },
      ] : [],
    });
  }
  if (pc) {
    const csatPred = dcNum(pc.pred);
    predictions.push({
      key: 'csat', title: 'Predicted CSAT', score: Math.min(1, csatPred / 100), scoreLabel: 'CSAT',
      outcome: csatPred >= 75 ? 'Satisfied' : csatPred >= 50 ? 'Neutral' : 'At risk',
      tone: csatPred >= 75 ? 'positive' : csatPred >= 50 ? 'neutral' : 'risk',
      drivers: [
        { label: 'Digital engagement', impact: dcNum(pc.dig) / 100 },
        { label: 'Cross-sell score', impact: dcNum(pc.xsell) / 100 },
        { label: 'Complaint count', impact: -dcNum(pc.comp) / 10 },
      ],
    });
    predictions.push({
      key: 'productRec', title: 'Cross-Sell Propensity', score: Math.min(1, dcNum(pc.xsell) / 100), scoreLabel: 'Propensity',
      outcome: dcNum(pc.xsell) >= 50 ? 'High' : dcNum(pc.xsell) >= 25 ? 'Moderate' : 'Low',
      tone: 'opportunity',
      drivers: [
        { label: 'Digital engagement', impact: dcNum(pc.dig) / 100 },
        { label: 'Segment fit', impact: 0.4 },
      ],
    });
  }

  /* ---- Agentforce summaries (composed from live data, per-account) ---- */
  const name = gs(acctNode, 'Name');
  const oppTotal = opportunities.reduce((s, o) => s + o.amount, 0);
  const deposits = finAccounts.filter(f => /deposit|checking|saving/i.test(f.type)).reduce((s, f) => s + Math.abs(f.balance), 0);
  const invest = finAccounts.filter(f => /invest/i.test(f.type)).reduce((s, f) => s + Math.abs(f.balance), 0);
  const debitTotal = transactions.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const creditTotal = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const buys = trades.filter(t => t.action === 'BUY').length;
  const sells = trades.filter(t => t.action === 'SELL').length;
  const responded = campaigns.filter(c => c.responded).length;
  const af = (key: string, title: string, text: string): AgentforceSummary => ({ key, title, text });
  const agentforce: Record<string, AgentforceSummary> = {
    account: af('account', 'Account Summary', `${name} is a ${gs(acctNode, 'Type') || 'client'} in ${gs(acctNode, 'Industry') || '—'} across ${finAccounts.length} financial accounts (${money(deposits)} deposits, ${money(invest)} investments). ${opportunities.length} open opportunities worth ${money(oppTotal)}; ${q?.Case?.totalCount ?? cases.length} cases on file.${!isNaN(churnPct) ? ` Attrition model scores ${Math.round(churnPct)}% churn risk.` : ''}`),
    transaction: af('transaction', 'Transaction Summary', transactions.length ? `Last ${transactions.length} transactions: ${money(creditTotal)} in, ${money(debitTotal)} out. Recent activity spans ${[...new Set(transactions.map(t => t.category))].slice(0, 3).join(', ')}.` : 'No recent transactions on file.'),
    trade: af('trade', 'Trade Summary', trades.length ? `${trades.length} recent trades (${buys} buys / ${sells} sells). Latest: ${trades[0].action} ${trades[0].shares.toLocaleString()} ${trades[0].symbol} at ${money(trades[0].price)}.` : 'No trading activity on file.'),
    interaction: af('interaction', 'Interaction Summary', interactions.length ? `${interactions.length} logged interactions. Most recent (${interactions[0].when}): ${interactions[0].type} — ${interactions[0].summary.slice(0, 120)}${interactions[0].summary.length > 120 ? '…' : ''}` : 'No interactions on file.'),
    csat: af('csat', 'CSAT/NPS Summary', csatVals.length ? `Latest CSAT ${csatNps.csatScore}, NPS ${csatNps.npsScore} across ${csatVals.length} scored periods. Trend is ${csatVals.length > 1 ? (csatVals[0] >= csatVals[csatVals.length - 1] ? 'improving' : 'declining') : 'flat'}.` : 'No CSAT/NPS scores on file.'),
    opportunity: af('opportunity', 'Opportunity Summary', opportunities.length ? `${opportunities.length} open opportunities worth ${money(oppTotal)}. Largest: ${opportunities[0].name} (${money(opportunities[0].amount)}, ${opportunities[0].stage}).` : 'No open opportunities.'),
    case: af('case', 'Case Summary', cases.length ? `${q?.Case?.totalCount ?? cases.length} cases; ${cases.filter(c => /open|working|new|progress/i.test(c.status)).length} still active. Most recent: "${cases[0].subject}" (${cases[0].status}).` : 'No cases on file.'),
    campaign: af('campaign', 'Campaign Summary', campaigns.length ? `${campaigns.length} campaign touches, ${responded} engaged. Recent interest: ${[...new Set(campaigns.filter(c => c.responded).map(c => c.type))].slice(0, 3).join(', ') || 'none yet'}.` : 'No campaign history.'),
  };

  return {
    details, finAccounts, transactions, trades, interactions, cases, csatNps,
    opportunities, campaigns, meetingNotes, callSummaries, kyc, predictions, agentforce,
  };
}
