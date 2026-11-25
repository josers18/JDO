import {
  commercialWhoToCallItems, fetchAmlChanges, fetchBusinessInflows, fetchCallSentiment, fetchChampionDepartures,
  fetchCommercialWhoToCall, fetchEsgMovers, fetchFeeSpikes, fetchFundingSignals, fetchIntentSignals,
  executeGraphQL, fetchLeadershipChanges, fetchOutlookWatch, fetchProspectSignals, prospectBadges, queryDataCloudForBook, type ProspectSignals,
} from '@shared';
import { recordKey, str, validId, verifyAccounts, type RecordNode } from './commercialData';

export interface Signal {
  id: string;
  accountId: string;
  company: string;
  family: string;
  source: string;
  title: string;
  detail: string;
  date?: string;
  tier?: string;
  score?: number;
  drivers?: { driver: string; points: number }[];
}
type Observation = Omit<Signal, 'id' | 'company'>;
async function readServiceNow(owner: string): Promise<Observation[]> {
  const result = await queryDataCloudForBook<{ account: string; ref: string; subject: string; status: string; created: string }>(filter => `
    SELECT ssot__AccountId__c AS account, ssot__Id__c AS ref, ssot__Subject__c AS subject,
      ssot__CaseStatusId__c AS status, ssot__CreatedDate__c AS created
    FROM ssot__Case__dlm
    WHERE ssot__DataSourceObjectId__c = 'service_now_cases' AND ssot__CaseStatusId__c IN ('open', 'in_progress')
      AND ssot__AccountId__c ${filter}
    ORDER BY ssot__CreatedDate__c DESC LIMIT 12
  `, owner, 12, true);
  return result.rows.map(row => ({ accountId: row.account, family: 'External service', source: 'ServiceNow', title: row.subject,
    detail: `${row.status} · reference ${row.ref}`, date: row.created }));
}
export async function readServiceAccounts(owner: string): Promise<Signal[]> {
  const observations = await readServiceNow(owner);
  const accounts = await verifyAccounts(owner, observations.map(r => r.accountId));
  return observations.flatMap(row => {
    const a = accounts.get(recordKey(row.accountId));
    return a ? [{ ...row, accountId: a.Id, company: str(a, 'Name'), id: JSON.stringify([row.source, a.Id, row.detail]) }] : [];
  });
}

export async function readSignals(owner: string) {
  const outlook = fetchOutlookWatch(owner,true);
  const leaders = fetchLeadershipChanges(owner,true);
  const esg = fetchEsgMovers(owner,true);
  const jobs: [string, Promise<Observation[]>][] = [
    ['ServiceNow', readServiceNow(owner)],
    ['Demandbase', fetchIntentSignals(owner, true).then(r => r.rows.map(a => ({ ...a, family: a.kind === 'competitor' ? 'Competitor research' : 'Intent surge', source: 'Demandbase', title: a.topic, detail: [a.stage, `${a.intentScore} intent score`, a.competitor].filter(Boolean).join(' · '), date: a.signalDate })))],
    ['Harmonic', fetchFundingSignals(owner, true).then(r => r.rows.map(a => ({ ...a, family: 'Funding', source: 'Harmonic', title: `${a.stage} funding`, detail: [a.status, a.leadInvestor, a.roundUsd == null ? '' : `$${a.roundUsd.toLocaleString()} round`].filter(Boolean).join(' · '), date: a.fundingDate })))],
    ['UserGems', fetchChampionDepartures(owner, true).then(r => r.rows.map(a => ({ ...a, family: 'Champion departure', source: 'UserGems', title: `${a.contactName} left the company`, detail: [a.title, a.newEmployerName].filter(Boolean).join(' · '), date: a.detectedDate })))],
    ['Moody’s', outlook.then(r => r.rows.map(a => ({ ...a, family: 'Credit outlook', source: 'Moody’s', title: `${a.rating} · ${a.outlook}`, detail: `${a.flags} agency flags`, date: a.since })))],
    ['BoardEx', leaders.then(r => r.rows.map(a => ({ ...a, family: 'Leadership', source: 'BoardEx', title: `${a.governance} governance`, detail: [a.director, a.ceoTenureYears == null ? '' : `${a.ceoTenureYears} years CEO tenure`].filter(Boolean).join(' · '), date: a.eventDate })))],
    ['MSCI', esg.then(r => r.rows.map(a => ({ ...a, family: `ESG ${a.direction}`, source: 'MSCI', title: `${a.fromRating} → ${a.rating}`, detail: `${a.score} overall score · ${a.controversies} controversies · ${a.category}` })))],
    ['Financial transactions', fetchBusinessInflows(owner, true).then(r => r.rows.map(a => ({ ...a, family: 'ACH receipts', source: 'Financial transactions', title: `$${a.amount.toLocaleString()} customer receipt`, detail: a.payer || 'Customer receipt', date: a.date })))],
    ['Financial transaction fees', fetchFeeSpikes(owner).then(r => r.rows.filter(a => !a.household).map(a => ({ ...a, family: 'Fee pressure', source: 'Financial transactions', title: `${a.fees} fee observations`, detail: 'NSF, overdraft and late-fee evidence', date: a.lastFee })))],
    ['Gong', fetchCallSentiment(owner, true).then(r => r.rows.map(a => ({ ...a, family: 'Call sentiment', source: 'Gong', title: `${a.sentiment} and declining sentiment`, detail: `Deal risk ${a.dealRisk} · ${a.topics.join(', ')}`, date: a.lastNote })))],
    ['World-Check', fetchAmlChanges(owner, true).then(r => r.rows.map(a => ({ ...a, family: 'Screening change', source: 'World-Check', title: `${a.prevRating ?? 'New screening'} → ${a.rating}`, detail: [a.caseRef, a.jurisdiction].filter(Boolean).join(' · '), date: a.screened })))],
  ];
  const results = await Promise.allSettled(jobs.map(([, promise]) => promise));
  const observations = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  const accounts = await verifyAccounts(owner, observations.map(r => r.accountId));
  const rows = observations.flatMap(r => {
    const company = accounts.get(recordKey(r.accountId));
    return company ? [{ ...r, accountId: company.Id, company: str(company, 'Name'), id: JSON.stringify([r.source, r.family, company.Id, r.date, r.title, r.detail]) }] : [];
  });
  return {
    rows: [...new Map(rows.map(row => [row.id, row])).values()],
    totals: [
      {label:'Negative or watch outlook', family:'Credit outlook', value:await outlook.then(r => r.negative + r.watch).catch(() => null)},
      {label:'Leadership changes', family:'Leadership', value:await leaders.then(r => r.turnover).catch(() => null)},
      {label:'ESG downgrades', family:'ESG Downgrade', value:await esg.then(r => r.down).catch(() => null)},
    ],
    coverage: results.map((result, index) => ({
      name: jobs[index][0], count: result.status === 'fulfilled' ? rows.filter(r => result.value.some(o =>
        recordKey(o.accountId) === recordKey(r.accountId) && o.title === r.title && o.source === r.source)).length : null,
    })),
  };
}

/**
 * Identify & Acquire: a prospect company's "why now", from its UserGems champion move, Demandbase intent
 * and Harmonic funding (all keyed on this Account). `focus` leads the company page; `evidence` lists
 * each source with its date. Both are empty when the company has no prospect signals.
 */
export function prospectFocus(accountId: string, company: string, s: ProspectSignals | undefined, fromName = '') {
  const c = s?.champion, intent = s?.intent, funding = s?.funding;
  const row = (source: string, family: string, title: string, detail: string, date?: string): Signal =>
    ({ id: JSON.stringify([family, source, accountId]), accountId, company, family, source, title, detail, date });
  const evidence = [
    c && row('UserGems', 'Champion joined', `${c.contactName} joined as ${c.newTitle || 'a new leader'}`,
      `Former champion${fromName ? ` at ${fromName}` : ''} · opportunity score ${c.opportunityScore}`, c.detectedDate),
    intent && row('Demandbase', 'Intent surge', `${intent.topic} intent`,
      [intent.stage && `${intent.stage} stage`, `${intent.score} intent score`].filter(Boolean).join(' · '), intent.signalDate),
  ].filter((r): r is Signal => !!r);
  if (!c && !intent && !funding) return { focus: undefined, evidence };
  const focus: Signal = {
    ...row([c && 'UserGems', intent && 'Demandbase', funding && 'Harmonic'].filter(Boolean).join(' · '), 'Prospect signals',
      c ? `Call ${c.contactName}${c.newTitle ? `, new ${c.newTitle}` : ''}` : intent ? `${intent.topic} intent` : `${funding!.stage} funding`,
      [c && `Former champion${fromName ? ` at ${fromName}` : ''}`,
        intent && `${intent.topic} intent ${intent.score}`,
        funding && prospectBadges({ funding })[0]].filter(Boolean).join(' · '),
      c?.detectedDate ?? intent?.signalDate),
  };
  return { focus, evidence };
}

/** The champion's former employer is usually a client in another book, so look its name up unscoped. */
export async function accountName(id: string) {
  if (!validId(id)) return '';
  const r = await executeGraphQL<{ uiapi?: { query?: { Account?: { edges?: { node: RecordNode }[] } } } }>(
    `query ProspectFrom { uiapi { query { Account(first: 1, where: { Id: { eq: ${JSON.stringify(id)} } }) { edges { node { Id Name @optional { value } } } } } } }`);
  const node = r.uiapi?.query?.Account?.edges?.[0]?.node;
  return node ? str(node, 'Name') : '';
}

export async function readProspectFocus(accountId: string, company: string) {
  const s = (await fetchProspectSignals([accountId]))[accountId];
  const fromName = s?.champion ? await accountName(s.champion.fromAccountId).catch(() => '') : '';
  return prospectFocus(accountId, company, s, fromName);
}

export async function readPriorities(owner: string) {
  const result = await fetchCommercialWhoToCall(owner, true);
  const accounts = await verifyAccounts(owner, result.rows.map(r => r.accountId));
  const names = Object.fromEntries(result.rows.map(r => [r.accountId, str(accounts.get(recordKey(r.accountId)) ?? { Id: r.accountId }, 'Name')]));
  const items = commercialWhoToCallItems(result, names);
  const rows = result.rows.flatMap((r, i): Signal[] => {
    const account = accounts.get(recordKey(r.accountId));
    if (!account) return [];
    const selected = items[i];
    return [{
      id: `priority:${account.Id}`, accountId: account.Id, company: str(account, 'Name'), family: 'Prioritized relationship',
      source: 'Data 360', title: selected?.action ?? 'Review payment and credit evidence',
      detail: selected?.reason ?? [r.tier, r.paydex == null ? '' : `PAYDEX ${r.paydex}`].filter(Boolean).join(' · '),
      score: r.score, drivers: r.drivers, tier: selected?.tier,
    }];
  });
  return { rows, clients: result.clients, multi: result.multiSignal };
}
