/**
 * Cross-sell white-space grid — every cell from live data, nothing fixture.
 *
 *   · Owned    — the client holds a matching FSC `FinServ__FinancialAccount__c`
 *                (GraphQL, live; status not Closed), matched on the product name.
 *                Owned always wins over the model.
 *   · Score    — `BT_Offer_Eligibility__dlm.conversion_probability__c` (Snowflake
 *                `OFFER_ELIGIBILITY`, holdings-aware: owned products get no row),
 *                only for rule-eligible offers (`recommended_action_rank__c` set).
 *   · Value    — the model's `expected_value_uplift__c`.
 *   · Reason   — the same product held at another institution this month
 *                (`BT_Plaid_Held_Away__dlm`), else the model's next-best rank.
 *   · Pipeline — an open Opportunity the grid already created for that client
 *                and product (`LeadSource = 'Cross-sell grid'`).
 *
 * Rows: the 12 clients in the banker's book with the most eligible white-space
 * value — except that ranking favors clients who own the least (an owned
 * product has no model row), so every persona reserves the last
 * `HOLDER_ROWS` rows for the book's top clients who already hold the persona's
 * anchor product (Retail: credit card; Commercial: corporate card; Wealth:
 * managed account or Roth). Those rows show the ✓ alongside their remaining white space.
 * A product the model doesn't score and the client doesn't hold renders as a
 * plain empty cell.
 */
import { executeGraphQL } from './graphqlClient';
import { queryDataCloud, queryDataCloudForBook, type BookScope } from './dataCloudClient';
import { ownerScopedQuery } from './viewAs';
import { offerLabel } from './offerModel';
import { crmWrite } from './crmWriteClient';

export type WhitespacePersona = 'retail' | 'wealth' | 'commercial';

/** LeadSource stamped on every grid-created Opportunity (counts pipeline + wins). */
export const WHITESPACE_LEAD_SOURCE = 'Cross-sell grid';
export const WHITESPACE_ROWS = 12;
/** Rows reserved for clients who already hold the persona's reserved product. */
export const HOLDER_ROWS = 3;

/**
 * Per persona: the products whose holders get reserved rows (one CRM FA filter
 * each). With several products the reserved rows alternate between them, so a
 * product with few holders still gets a row (Kim's book: 168 Roth vs 5 Managed).
 */
const HOLDER_FILTER: Partial<Record<WhitespacePersona, string[]>> = {
  retail: ['FinServ__FinancialAccountType__c: { eq: "Credit Cards" }'],
  commercial: ['Name: { like: "%Corporate Card%" }'],
  wealth: ['Name: { like: "%Managed%" }', 'Name: { like: "%Roth%" }'],
};

interface Column {
  key: string;
  label: string;
  /** Offer-model action codes this column covers (best eligible one wins). */
  codes: string[];
  /** FSC FinancialAccount name that means the client already holds it. */
  owned: RegExp;
  /** Plaid `account_type__c` values that are the same product held elsewhere. */
  plaid: string[];
  /** Next step by the model's better channel: [email, call]. */
  act: [string, string];
}

const NOT_BIZ = '(?!.*(?:Business|Commercial|Corporate))';

const COLUMNS: Record<WhitespacePersona, Column[]> = {
  retail: [
    { key: 'chk', label: 'Checking', codes: ['CHK-ACQ'], owned: new RegExp(`^${NOT_BIZ}.*Checking`, 'i'), plaid: ['Checking'], act: ['Email switch kit', 'Call about direct deposit'] },
    { key: 'sav', label: 'Savings', codes: ['HYS-ACQ'], owned: new RegExp(`^${NOT_BIZ}.*(?:Savings|Money Market|\\bCD\\b)`, 'i'), plaid: ['Savings', 'Money Market'], act: ['Email high-yield rate', 'Call with rate offer'] },
    { key: 'card', label: 'Credit Card', codes: ['CRC-ACQ'], owned: new RegExp(`^${NOT_BIZ}.*Card`, 'i'), plaid: ['Credit Card'], act: ['Send card pre-approval', 'Call with card pre-approval'] },
    { key: 'auto', label: 'Auto Loan', codes: ['AUTO-ACQ'], owned: /Auto Loan/i, plaid: ['Auto Loan'], act: ['Email refinance quote', 'Call with refinance quote'] },
    { key: 'mtg', label: 'Mortgage', codes: ['MTG-30'], owned: /Mortgage|\bARM\b/i, plaid: ['Mortgage'], act: ['Email rate-lock consult', 'Book rate-lock consult'] },
    { key: 'heloc', label: 'HELOC', codes: ['HEL-ACQ'], owned: /HELOC/i, plaid: ['Line of Credit'], act: ['Email equity estimate', 'Call about home equity'] },
    { key: 'pl', label: 'Personal Loan', codes: ['PL-ACQ'], owned: /Personal Loan/i, plaid: [], act: ['Email loan pre-qualification', 'Call with loan pre-qualification'] },
    { key: 'inv', label: 'Investing', codes: ['INV-ACQ'], owned: /Brokerage|\bIRA\b|Managed|529/i, plaid: ['Brokerage', 'IRA', '401k', 'Managed Portfolio'], act: ['Email investing intro', 'Book advisor intro'] },
  ],
  wealth: [
    { key: 'pchk', label: 'Premier Checking', codes: ['PCHK-ACQ'], owned: /Premier Checking/i, plaid: ['Checking'], act: ['Email Premier benefits', 'Call about Premier'] },
    { key: 'cash', label: 'High-Yield Cash', codes: ['WM-CASH'], owned: /High-Yield|Money Market|\bCD\b/i, plaid: ['Savings', 'Money Market'], act: ['Email cash-yield proposal', 'Call with cash-yield proposal'] },
    { key: 'mas', label: 'Managed Account', codes: ['WM-MAS'], owned: /Managed/i, plaid: ['Managed Portfolio', 'Brokerage'], act: ['Send portfolio review', 'Book portfolio review'] },
    { key: 'roth', label: 'Roth / IRA', codes: ['IRA-RTH'], owned: /Roth/i, plaid: ['IRA'], act: ['Email Roth contribution note', 'Call about Roth contribution'] },
    { key: 'rollover', label: '401k Rollover', codes: ['IRA-ROL'], owned: /Traditional IRA|Rollover/i, plaid: ['401k'], act: ['Email rollover checklist', 'Book rollover consult'] },
    { key: 'jumbo', label: 'Jumbo Mortgage', codes: ['MTG-JMB'], owned: /Mortgage|\bARM\b/i, plaid: ['Mortgage'], act: ['Email jumbo rate sheet', 'Book jumbo rate consult'] },
    { key: 'heloc', label: 'HELOC', codes: ['HEL-ACQ'], owned: /HELOC/i, plaid: ['Line of Credit'], act: ['Email equity estimate', 'Call about home equity'] },
  ],
  commercial: [
    { key: 'bchk', label: 'Business Checking', codes: ['BIZ-CHK'], owned: /Business.*Checking|Analyzed Checking/i, plaid: ['Business Checking'], act: ['Email operating-account offer', 'Call about operating account'] },
    { key: 'tm', label: 'Treasury', codes: ['BIZ-TM-ACH', 'BIZ-TM-RDC', 'BIZ-TM-PP'], owned: /Treasury|Positive Pay|Remote Deposit|\bACH\b/i, plaid: [], act: ['Email treasury proposal', 'Book treasury review'] },
    { key: 'sweep', label: 'Sweep', codes: ['BIZ-TM-SWP'], owned: /Sweep/i, plaid: ['Sweep Account', 'Business Savings'], act: ['Email sweep proposal', 'Call about liquidity sweep'] },
    { key: 'ccard', label: 'Commercial Card', codes: ['BIZ-CARD'], owned: /Corporate Card|Commercial Card/i, plaid: ['Commercial Card'], act: ['Send card program proposal', 'Call about card program'] },
    { key: 'loc', label: 'Line of Credit', codes: ['BIZ-LOC'], owned: /Line of Credit/i, plaid: ['Line of Credit'], act: ['Email credit-line term sheet', 'Book credit-line review'] },
    { key: 'tl', label: 'Term Loan', codes: ['BIZ-TL'], owned: /Term Loan/i, plaid: ['Commercial Loan'], act: ['Email term-loan indication', 'Book term-loan review'] },
    { key: 'cre', label: 'CRE', codes: ['BIZ-CRE'], owned: /\bCRE\b|Commercial Real Estate/i, plaid: ['Commercial Loan'], act: ['Email CRE indication', 'Book CRE review'] },
    { key: 'eqsba', label: 'Equipment / SBA', codes: ['BIZ-EQF', 'BIZ-SBA'], owned: /Equipment|\bSBA\b/i, plaid: [], act: ['Email financing options', 'Call about financing options'] },
  ],
};

export interface WhitespaceProduct { key: string; label: string }

export interface WhitespaceCell {
  owned: boolean;
  /** Model conversion probability 0–100 (eligible white space only). */
  score?: number;
  reason?: string;
  estValue?: number;
  action?: string;
  /** Offer-model action code behind the score. */
  code?: string;
  /** An open grid-created Opportunity already covers this cell. */
  inPipeline?: boolean;
}

export interface WhitespaceClient {
  id: string;
  name: string;
  segment: string;
  cells: Record<string, WhitespaceCell>;
}

export interface WhitespaceStats {
  /** Open grid-created Opportunities in the book, and their total amount. */
  open: number;
  openValue: number;
  /** Grid-created Opportunities Closed Won in the last 30 days. */
  won30: number;
}

export interface WhitespaceData {
  products: WhitespaceProduct[];
  clients: WhitespaceClient[];
  stats?: WhitespaceStats;
  scope?: BookScope;
}

/* -------------------------------- queries -------------------------------- */

const quote = (xs: string[]) => xs.map(x => `'${x.replace(/[^A-Za-z0-9-]/g, '')}'`).join(', ');
const cleanId = (id: string) => id.replace(/[^A-Za-z0-9]/g, '');

// t = the book's top clients by eligible white-space value; then every scored row for them.
const offersSql = (codes: string[], rows = WHITESPACE_ROWS) => (accountFilter: string) => `
  SELECT t.acct AS acct, t.tot AS tot, b.action_code__c AS code, b.recommended_action_rank__c AS action_rank,
         b.conversion_probability__c AS conv, b.expected_value_uplift__c AS ev,
         b.recommended_channels__c AS channels, b.em_probability__c AS em_p, b.cc_probability__c AS cc_p
  FROM (
    SELECT account_id__c AS acct, SUM(expected_value_uplift__c) AS tot
    FROM BT_Offer_Eligibility__dlm
    WHERE action_code__c IN (${quote(codes)})
      AND recommended_action_rank__c IS NOT NULL AND expected_value_uplift__c > 0
      AND account_id__c ${accountFilter}
    GROUP BY account_id__c
    ORDER BY tot DESC
    LIMIT ${rows}
  ) t
  JOIN BT_Offer_Eligibility__dlm b ON b.account_id__c = t.acct
  WHERE b.action_code__c IN (${quote(codes)})
  ORDER BY t.tot DESC`;

const plaidSql = (ids: string[]) => `
  SELECT account_id__c AS acct, account_type__c AS type, institution_name__c AS inst, balance_usd__c AS bal
  FROM BT_Plaid_Held_Away__dlm
  WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Plaid_Held_Away__dlm)
    AND is_active__c = true AND balance_usd__c > 0
    AND account_id__c IN (${quote(ids)})`;

const lifeStageSql = (ids: string[]) => `
  SELECT account_id__c AS acct, life_stage__c AS stage
  FROM BT_Claritas_Demographics__dlm
  WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Claritas_Demographics__dlm)
    AND account_id__c IN (${quote(ids)})`;

const idList = (ids: string[]) => ids.map(i => `"${i}"`).join(', ');

const crmQuery = (ids: string[]) => `query WhitespaceCrm {
  uiapi { query {
    Account(first: ${ids.length}, where: { Id: { in: [${idList(ids)}] } }) {
      edges { node { Id Name @optional { value } Industry @optional { value } FinServ__ClientCategory__c @optional { value } } }
    }
    FinServ__FinancialAccount__c(first: 400, where: { FinServ__PrimaryOwner__c: { in: [${idList(ids)}] } }) {
      edges { node { Id Name @optional { value } FinServ__PrimaryOwner__c @optional { value } FinServ__Status__c @optional { value } } }
    }
  } }
}`;

// Open holders of the reserved product in the banker's book. The FA's own
// OwnerId is the integration user, so the book is the primary owner's OwnerId.
const holdersQuery = (filter: string, ownerId: string | null | undefined) => `query WhitespaceHolders {
  uiapi { query {
    FinServ__FinancialAccount__c(first: 200, where: { and: [
      { ${filter} },
      { FinServ__Status__c: { ne: "Closed" } }${ownerId && /^005[A-Za-z0-9]{12,15}$/.test(ownerId) ? `,
      { FinServ__PrimaryOwner__r: { OwnerId: { eq: "${ownerId}" } } }` : ''}
    ] }, orderBy: { FinServ__Balance__c: { order: DESC } }) {
      edges { node { Id FinServ__PrimaryOwner__c @optional { value } } }
    }
  } }
}`;

/** Offer rows for the top holders of each reserved product — one row group per filter. */
async function fetchHolderOffers(persona: WhitespacePersona, codes: string[], ownerId: string | null | undefined) {
  const filters = HOLDER_FILTER[persona] ?? [];
  return Promise.all(filters.map(async filter => {
    const data = await executeGraphQL<{ uiapi?: { query?: { FinServ__FinancialAccount__c?: Conn } } }>(
      holdersQuery(filter, ownerId),
    );
    const ids = [...new Set((data.uiapi?.query?.FinServ__FinancialAccount__c?.edges ?? [])
      .map(e => cleanId(v(e.node, 'FinServ__PrimaryOwner__c'))).filter(Boolean))];
    if (!ids.length) return [] as Record<string, unknown>[];
    const res = await queryDataCloud<Record<string, unknown>>(offersSql(codes, HOLDER_ROWS + WHITESPACE_ROWS)(`IN (${quote(ids)})`), 200);
    return res.rows;
  }));
}

const statsQuery = (since: string) => `query WhitespaceStats {
  uiapi { query {
    Open: Opportunity(first: 200, where: { LeadSource: { eq: "${WHITESPACE_LEAD_SOURCE}" }, IsClosed: { eq: false } }) {
      totalCount
      edges { node { Id Name @optional { value } AccountId @optional { value } Amount @optional { value } } }
    }
    Won: Opportunity(first: 1, where: { LeadSource: { eq: "${WHITESPACE_LEAD_SOURCE}" }, IsWon: { eq: true }, CloseDate: { gte: { value: "${since}" } } }) {
      totalCount
    }
  } }
}`;

type GNode = Record<string, unknown> & { Id?: string };
interface Conn { totalCount?: number; edges?: { node: GNode }[] }
const v = (n: GNode, f: string): string => {
  const x = n[f] as { value?: unknown } | undefined;
  return x?.value == null ? '' : String(x.value);
};
const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });

const NAME_SEP = ' — ';
/** Name of a grid-created Opportunity — also how the grid recognizes it later. */
export const whitespaceOpportunityName = (productLabel: string, clientName: string) =>
  `${productLabel}${NAME_SEP}${clientName}`;

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

async function fetchStats(ownerId: string | null | undefined) {
  const data = await executeGraphQL<{ uiapi?: { query?: { Open?: Conn; Won?: Conn } } }>(
    ownerScopedQuery(statsQuery(isoDaysAgo(30)), ownerId),
  );
  const open = data.uiapi?.query?.Open;
  const nodes = (open?.edges ?? []).map(e => e.node);
  const stats: WhitespaceStats = {
    open: open?.totalCount ?? nodes.length,
    openValue: nodes.reduce((s, n) => s + (Number(v(n, 'Amount')) || 0), 0),
    won30: data.uiapi?.query?.Won?.totalCount ?? 0,
  };
  return { stats, openKeys: new Set(nodes.map(n => `${v(n, 'AccountId')}|${v(n, 'Name').split(NAME_SEP)[0]}`)) };
}

/** Live white-space matrix for the banker's book (view-as aware via ownerId). */
export async function fetchWhitespace(
  persona: WhitespacePersona,
  ownerId: string | null | undefined,
): Promise<WhitespaceData> {
  const cols = COLUMNS[persona];
  const codes = cols.flatMap(c => c.codes);
  const products = cols.map(c => ({ key: c.key, label: c.label }));

  const [offers, statsRes, holderGroups] = await Promise.all([
    queryDataCloudForBook<Record<string, unknown>>(offersSql(codes), ownerId, 400),
    fetchStats(ownerId).catch(() => null),
    fetchHolderOffers(persona, codes, ownerId).catch(() => [] as Record<string, unknown>[][]),
  ]);

  const orderedIds = (rows: Record<string, unknown>[]) => {
    const out: string[] = [];
    for (const r of rows) {
      const id = cleanId(String(r.acct ?? ''));
      if (id && !out.includes(id)) out.push(id);
    }
    return out;
  };
  // Holders the value ranking didn't already pick fill the reserved rows (book scope only).
  const top = orderedIds(offers.rows);
  // With several reserved products, take holders round-robin across them.
  const holders: string[] = [];
  if (offers.scope === 'book') {
    const queues = holderGroups.map(g => orderedIds(g).filter(id => !top.includes(id)));
    while (holders.length < HOLDER_ROWS && queues.some(q => q.length)) {
      for (const q of queues) {
        while (q.length && holders.includes(q[0])) q.shift();
        const id = q.shift();
        if (id && holders.length < HOLDER_ROWS) holders.push(id);
      }
    }
  }
  const holderRows = holderGroups.flat();
  const ids = [...top.slice(0, WHITESPACE_ROWS - holders.length), ...holders];
  if (!ids.length) return { products, clients: [], stats: statsRes?.stats, scope: offers.scope };

  const [crm, plaid, stages] = await Promise.all([
    executeGraphQL<{ uiapi?: { query?: { Account?: Conn; FinServ__FinancialAccount__c?: Conn } } }>(crmQuery(ids)),
    queryDataCloud<Record<string, unknown>>(plaidSql(ids), 1000).then(r => r.rows).catch(() => []),
    persona === 'commercial'
      ? Promise.resolve([] as Record<string, unknown>[])
      : queryDataCloud<Record<string, unknown>>(lifeStageSql(ids), 100).then(r => r.rows).catch(() => []),
  ]);

  const acctNodes = (crm.uiapi?.query?.Account?.edges ?? []).map(e => e.node);
  const faNodes = (crm.uiapi?.query?.FinServ__FinancialAccount__c?.edges ?? []).map(e => e.node);
  const stageBy = new Map(stages.map(s => [String(s.acct), String(s.stage ?? '')]));

  const holdings = new Map<string, string[]>();
  for (const n of faNodes) {
    if (/closed/i.test(v(n, 'FinServ__Status__c'))) continue;
    const owner = v(n, 'FinServ__PrimaryOwner__c');
    holdings.set(owner, [...(holdings.get(owner) ?? []), v(n, 'Name')]);
  }

  // Largest held-away balance per client × Plaid account type.
  const heldAway = new Map<string, { inst: string; bal: number }>();
  for (const p of plaid) {
    const k = `${p.acct}|${p.type}`;
    const bal = Number(p.bal) || 0;
    if (bal > (heldAway.get(k)?.bal ?? 0)) heldAway.set(k, { inst: String(p.inst ?? 'another institution'), bal });
  }

  const offerBy = new Map<string, Record<string, unknown>>();
  for (const r of [...offers.rows, ...holderRows]) offerBy.set(`${cleanId(String(r.acct))}|${r.code}`, r);

  const clients: WhitespaceClient[] = ids.map(id => {
    const a = acctNodes.find(n => n.Id === id);
    const name = (a && v(a, 'Name')) || id;
    const category = a ? v(a, 'FinServ__ClientCategory__c') : '';
    const segment = persona === 'commercial'
      ? [a ? v(a, 'Industry') : '', category].filter(Boolean).join(' · ')
      : stageBy.get(id) || category;
    const held = holdings.get(id) ?? [];

    const cells: Record<string, WhitespaceCell> = {};
    for (const c of cols) {
      if (held.some(h => c.owned.test(h))) {
        cells[c.key] = { owned: true };
        continue;
      }
      // Best eligible code in this column by expected value.
      const best = c.codes
        .map(code => offerBy.get(`${id}|${code}`))
        .filter((r): r is Record<string, unknown> => !!r && r.action_rank != null && Number(r.ev) > 0)
        .sort((x, y) => Number(y.ev) - Number(x.ev))[0];
      if (!best) continue;
      const code = String(best.code);
      const away = c.plaid
        .map(t => heldAway.get(`${id}|${t}`))
        .filter((h): h is { inst: string; bal: number } => !!h)
        .sort((x, y) => y.bal - x.bal)[0];
      const rank = Math.round(Number(best.action_rank));
      const reason = away
        ? `Holds this at ${away.inst} · ${money(away.bal)} balance`
        : `Model next-best action #${rank}${c.codes.length > 1 ? ` · ${offerLabel(code)}` : ''}`;
      const chans = String(best.channels ?? '').split(',').map(s => s.trim());
      const em = chans.includes('EM') ? Number(best.em_p) || 0 : 0;
      const cc = chans.includes('CC') ? Number(best.cc_p) || 0 : 0;
      cells[c.key] = {
        owned: false,
        code,
        score: Math.round(Number(best.conv) || 0),
        estValue: Math.round(Number(best.ev) || 0),
        reason,
        action: cc > em ? c.act[1] : c.act[0],
        inPipeline: statsRes?.openKeys.has(`${id}|${c.label}`) ?? false,
      };
    }
    return { id, name, segment, cells };
  });

  return { products, clients, stats: statsRes?.stats, scope: offers.scope };
}

/**
 * The grid's "make it happen": a real Opportunity on the client's Account —
 * product + client in the name (how the grid recognizes it on reload), the
 * modeled value as Amount, the signal and next step in the description.
 * Owned by the book's banker (view-as aware); Prospecting, close in 60 days.
 */
export async function createWhitespaceOpportunity(
  row: { clientId: string; clientName: string; productLabel: string; action: string; reason: string; estValue: number; code?: string },
  ownerId?: string | null,
): Promise<string | null> {
  const res = await crmWrite({
    action: 'opportunity',
    accountId: row.clientId,
    name: whitespaceOpportunityName(row.productLabel, row.clientName),
    amount: row.estValue > 0 ? row.estValue : undefined,
    leadSource: WHITESPACE_LEAD_SOURCE,
    description: [row.reason, `Next step: ${row.action}`, row.code ? `Offer model: ${row.code}` : '']
      .filter(Boolean).join('\n'),
    ownerId: ownerId || undefined,
  });
  return res.id;
}
