/**
 * HOME app — REAL data implementation for the Wealth "Advisory Desk".
 *   · Core/FSC (Opportunity, Case, Task, Event, FinancialGoal) → GraphQL
 *   · Data Cloud held-away capture (CumulusPlaidHeldAway__dlm) → DcBridgeRest
 *
 * The persona signal is HELD-AWAY: the advisor's "who to call" ranks accounts
 * by the largest active held-away balances (the biggest consolidation
 * opportunities). Field names + DMO columns verified live against jdo-1lrnov
 * (storm-16a17dc388fbe6, 2026-07-07) via uiapi + ssot/queryv2 probes.
 */
import { executeGraphQL, queryDataCloud, fetchCurrentUser } from '@shared';
import type { HomeDashboard, CallItem, CaseItem, CustomerGoal, ScheduleItem, BankerGoal, LeadReferral, PipelineItem, Recommendation, RightNowItem, LifeEventSignal, ActivityItem, PipelineMovement } from './homeTypes';

/** Deterministic pseudo-trend for a sparkline (no Math.random — it breaks
 *  SSR/replay). Wobbles around `end` using the seed's char codes. */
function seedTrend(seed: string, end: number, n = 8): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    const wobble = ((h % 1000) / 1000 - 0.5) * 0.25; // ±12.5%
    const ramp = 0.8 + (0.2 * i) / (n - 1); // trend upward into `end`
    out.push(Math.max(0, Math.round(end * ramp * (1 + wobble))));
  }
  out[n - 1] = end;
  return out;
}

/* ── Life-event signals ───────────────────────────────────────────
   Now LIVE against the org's native PersonLifeEvent object (see the
   PersonLifeEvent block in HOME_CORE_QUERY). The banker's book carries
   thousands of these; we window to the 200 most-recent by EventDate and map
   each to a signal row. EventType drives a per-type icon + a suggested
   next-best-action ("opportunity"); the primary person's Account name is the
   client. recordId/contactId power the edit modal. */

/** PersonLifeEvent.EventType → display icon. Falls back to a generic marker. */
const LIFE_EVENT_ICONS: Record<string, string> = {
  Birth: '👶', Baby: '👶', Graduation: '🎓', Job: '💼', Marriage: '💍',
  Relocation: '📦', Home: '🏡', Car: '🚗', Diagnosis: '🩺', Retirement: '🌅',
};
const lifeEventIcon = (type: string): string => LIFE_EVENT_ICONS[type] ?? '📌';

/** PersonLifeEvent.EventType → a banker's suggested next-best-action line. */
const LIFE_EVENT_PLAYS: Record<string, string> = {
  Birth: 'Review education savings (529) & guardianship coverage.',
  Baby: 'Review education savings (529) & guardianship coverage.',
  Graduation: 'Coordinate 529 final distribution & next steps.',
  Job: 'Align income transition & benefits rollover.',
  Marriage: 'Revisit joint accounts, beneficiaries & coverage.',
  Relocation: 'Reassess mortgage, local banking & insurance.',
  Home: 'Explore mortgage, HELOC & homeowner coverage.',
  Car: 'Review financing options & insurance.',
  Diagnosis: 'Check emergency reserves & protection coverage.',
  Retirement: 'Build the income-drawdown & rollover plan.',
};
const lifeEventPlay = (type: string): string =>
  LIFE_EVENT_PLAYS[type] ?? 'Reach out to discuss what this means for their plan.';

/** Datetime 'YYYY-MM-DDThh:mm:ss…' or date-only → 'YYYY-MM-DD' for the modal. */
const dateOnly = (dt: string): string => (dt ? dt.slice(0, 10) : '');

/** Short human date for the row's "when", e.g. "Nov 16". '' → '—'. */
const shortWhen = (dt: string): string => {
  const d = dateOnly(dt);
  if (!d) return '—';
  const parsed = new Date(`${d}T00:00:00`);
  if (isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

/* ── Core/FSC via GraphQL (verified fields) ────────────────── */
const HOME_CORE_QUERY = /* GraphQL */ `
  query WealthBook {
    uiapi {
      query {
        Opportunity(first: 200, where: { IsClosed: { eq: false } }, orderBy: { Amount: { order: DESC } }) {
          totalCount
          edges { node { Id Name @optional { value } StageName @optional { value } Amount @optional { value } CloseDate @optional { value } Probability @optional { value } Account @optional { Name @optional { value } } } }
        }
        Case(first: 8, where: { IsClosed: { eq: false } }, orderBy: { CreatedDate: { order: DESC } }) {
          totalCount
          edges { node { Id CaseNumber @optional { value } Subject @optional { value } Priority @optional { value } Status @optional { value } CreatedDate @optional { value } AccountId @optional { value } Account @optional { Name @optional { value } } } }
        }
        TaskOverdue: Task(first: 15, where: { IsClosed: { eq: false }, ActivityDate: { lt: { literal: TODAY } } }, orderBy: { ActivityDate: { order: DESC } }) {
          edges { node { Id Subject @optional { value } ActivityDate @optional { value } Status @optional { value } Priority @optional { value } Type @optional { value } Description @optional { value } WhatId @optional { value } OwnerId @optional { value } CreatedBy @optional { Name @optional { value } } CreatedDate @optional { value } LastModifiedBy @optional { Name @optional { value } } LastModifiedDate @optional { value } } }
        }
        TaskUpcoming: Task(first: 25, where: { IsClosed: { eq: false }, ActivityDate: { gte: { literal: TODAY } } }, orderBy: { ActivityDate: { order: ASC } }) {
          edges { node { Id Subject @optional { value } ActivityDate @optional { value } Status @optional { value } Priority @optional { value } Type @optional { value } Description @optional { value } WhatId @optional { value } OwnerId @optional { value } CreatedBy @optional { Name @optional { value } } CreatedDate @optional { value } LastModifiedBy @optional { Name @optional { value } } LastModifiedDate @optional { value } } }
        }
        Event(first: 15, where: { ActivityDateTime: { gte: { literal: TODAY } } }, orderBy: { ActivityDateTime: { order: ASC } }) {
          edges { node { Id Subject @optional { value } ActivityDateTime @optional { value } Type @optional { value } Description @optional { value } WhatId @optional { value } OwnerId @optional { value } Location @optional { value } ShowAs @optional { value } CreatedBy @optional { Name @optional { value } } CreatedDate @optional { value } LastModifiedBy @optional { Name @optional { value } } LastModifiedDate @optional { value } } }
        }
        FinancialGoal(first: 6) {
          edges { node { Id Name @optional { value } TargetAmount @optional { value } ActualAmount @optional { value } } }
        }
        CustomerGoal: FinancialGoal(first: 8, where: { and: [ { TargetDate: { gte: { literal: TODAY } } }, { Status: { ne: "COMPLETED" } }, { FinancialPlanId: { ne: null } } ] }, orderBy: { TargetDate: { order: ASC } }) {
          edges { node { Id Name @optional { value } Status @optional { value } Priority @optional { value } Type @optional { value } Description @optional { value } TargetDate @optional { value } TargetAmount @optional { value } ActualAmount @optional { value } FinancialPlan @optional { Name @optional { value } AccountId @optional { value } Account @optional { Name @optional { value } } } } }
        }
        Lead(first: 6, where: { IsConverted: { eq: false } }) {
          edges { node { Id Name @optional { value } Company @optional { value } Status @optional { value } LeadSource @optional { value } AnnualRevenue @optional { value } Email @optional { value } } }
        }
        PersonLifeEvent(first: 200, orderBy: { EventDate: { order: DESC } }) {
          edges { node { Id Name @optional { value } EventType @optional { value } EventDate @optional { value } PrimaryPersonId @optional { value } PrimaryPerson @optional { Name @optional { value } Account @optional { Name @optional { value } } } } }
        }
      }
    }
  }
`;

/* ── Account name lookup (IDs → names). Id is a PLAIN string on nodes;
   Name is wrapped in { value }. IDs are org-generated alphanumerics (safe). */
function accountNamesQuery(ids: string[]): string {
  const list = ids.map(id => `"${id.replace(/[^A-Za-z0-9]/g, '')}"`).join(', ');
  return `query AccountNames {
    uiapi {
      query {
        Account(first: 50, where: { Id: { in: [${list}] } }) {
          edges { node { Id Name @optional { value } } }
        }
      }
    }
  }`;
}

/** Batch User-name lookup for Owner Ids → "Assigned To". Same inline-literal
 *  approach as accountNamesQuery (SDK list-variable forwarding is unreliable). */
function userNamesQuery(ids: string[]): string {
  const list = ids.map(id => `"${id.replace(/[^A-Za-z0-9]/g, '')}"`).join(', ');
  return `query UserNames {
    uiapi {
      query {
        User(first: 50, where: { Id: { in: [${list}] } }) {
          edges { node { Id Name @optional { value } } }
        }
      }
    }
  }`;
}

/* ── Data Cloud: largest active held-away balances = "who to call" ──
   Scope to this org's account prefix (001am%) so every row resolves to a local
   Account name (the unified profile spans multiple source orgs). */
const HELD_AWAY_SQL = `
  SELECT ssot__AccountId__c AS account_id, balanceUsd__c AS balance,
         institutionName__c AS institution, accountType__c AS acct_type,
         monthlyNetFlowUsd__c AS net_flow
  FROM CumulusPlaidHeldAway__dlm
  WHERE isActive__c = true AND balanceUsd__c IS NOT NULL AND ssot__AccountId__c LIKE '001am%'
  ORDER BY balanceUsd__c DESC
  LIMIT 8
`;

interface HeldAwayRow { account_id: string; balance: number; institution: string; acct_type: string; net_flow: number; }
type Node = Record<string, { value?: unknown } | undefined>;
const v = (n: Node, k: string) => (n[k] as { value?: unknown } | undefined)?.value;
const s = (n: Node, k: string) => String(v(n, k) ?? '');
const num = (n: Node, k: string) => Number(v(n, k) ?? 0);
/** Decode the HTML entities uiapi returns in string values (e.g. "Olivia&#39;s
 *  College" → "Olivia's College"). Handles the numeric + named entities that
 *  appear in free-text FSC fields; leaves plain text untouched. */
const decodeHtml = (str: string): string =>
  str.replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
/** String field, HTML-decoded — for human-facing free text. */
const sd = (n: Node, k: string) => decodeHtml(s(n, k));
/** Extract a relationship's Name.value (CreatedBy/LastModifiedBy) — '' if absent. */
const relName = (n: Node, k: string): string =>
  String((n as Record<string, { Name?: { value?: unknown } } | undefined>)[k]?.Name?.value ?? '');

function severityForBalance(balance: number): CallItem['severity'] {
  if (balance >= 5_000_000) return 'high';
  if (balance >= 1_000_000) return 'medium';
  return 'low';
}

/** Map a call item's severity to its priority-queue tier. */
function tierForSeverity(sev: CallItem['severity']): CallItem['tier'] {
  return sev === 'high' ? 'today' : sev === 'medium' ? 'week' : 'watch';
}

interface CoreShape {
  uiapi?: { query?: {
    Opportunity?: { totalCount?: number; edges?: { node: Node & { Account?: { Name?: { value?: string } } } }[] };
    Case?: { totalCount?: number; edges?: { node: Node & { Account?: { Name?: { value?: string } } } }[] };
    TaskOverdue?: { edges?: { node: Node }[] };
    TaskUpcoming?: { edges?: { node: Node }[] };
    Event?: { edges?: { node: Node }[] };
    FinancialGoal?: { edges?: { node: Node }[] };
    CustomerGoal?: { edges?: { node: Node & { FinancialPlan?: { Name?: { value?: string }; AccountId?: { value?: string }; Account?: { Name?: { value?: string } } } } }[] };
    Lead?: { edges?: { node: Node }[] };
    PersonLifeEvent?: { edges?: { node: Node & { PrimaryPerson?: { Name?: { value?: string }; Account?: { Name?: { value?: string } } } } }[] };
  } };
}

export async function fetchHomeDashboardReal(): Promise<HomeDashboard> {
  const [core, held, currentUser] = await Promise.all([
    executeGraphQL<CoreShape>(HOME_CORE_QUERY),
    queryDataCloud<HeldAwayRow>(HELD_AWAY_SQL, 8),
    fetchCurrentUser(),
  ]);
  // Greet the logged-in banker by first name; fall back to full name, then a
  // demo default if the identity call is unavailable (e.g. mock/offline).
  const bankerName = currentUser?.firstName || currentUser?.name || 'Alex';
  const q = core.uiapi?.query;
  const opp = q?.Opportunity;

  // resolve held-away account IDs → names
  const ids = [...new Set(held.rows.map(r => r.account_id).filter(Boolean))];
  const nameById: Record<string, string> = {};
  if (ids.length) {
    try {
      const names = await executeGraphQL<{ uiapi?: { query?: { Account?: { edges?: { node: Node }[] } } } }>(accountNamesQuery(ids));
      for (const e of names.uiapi?.query?.Account?.edges ?? []) {
        const id = (e.node as { Id?: string }).Id ?? '';
        if (id) nameById[id] = s(e.node, 'Name');
      }
    } catch { /* names best-effort; fall back to raw ID */ }
  }

  const totalHeldAway = held.rows.reduce((sum, r) => sum + Number(r.balance || 0), 0);
  const pipelineValue = (opp?.edges ?? []).reduce((sum, e) => sum + num(e.node, 'Amount'), 0);

  const callList: CallItem[] = held.rows.map((row, i) => {
    const bal = Number(row.balance || 0);
    return {
      id: `c${i}`,
      clientId: row.account_id,
      clientName: nameById[row.account_id] || row.account_id,
      segment: 'Private Wealth',
      reason: `${(bal).toLocaleString('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 })} held away at ${row.institution || 'external institution'} (${row.acct_type || 'account'})`,
      action: 'Held-away consolidation review',
      score: Math.min(1, bal / 8_000_000),
      severity: severityForBalance(bal),
      source: 'Plaid held-away',
      relationshipValue: bal,
      tier: tierForSeverity(severityForBalance(bal)),
    };
  });

  // Two Task windows (overdue DESC + today/future ASC) so a recent task isn't
  // buried under the thousands-deep overdue backlog a single ASC window returns.
  // Events are scoped to today-and-future (a past meeting isn't actionable).
  // bucketSchedule() on the page re-sorts the merged feed into Overdue/Today/Upcoming.
  // Resolve Owner Ids → "Assigned To" names in one batch lookup (best-effort).
  const ownerIds = [...new Set(
    [q?.TaskOverdue, q?.TaskUpcoming, q?.Event]
      .flatMap(feed => feed?.edges ?? [])
      .map(e => s(e.node, 'OwnerId'))
      .filter(Boolean),
  )];
  const ownerNameById: Record<string, string> = {};
  if (ownerIds.length) {
    try {
      const users = await executeGraphQL<{ uiapi?: { query?: { User?: { edges?: { node: Node }[] } } } }>(
        userNamesQuery(ownerIds),
      );
      for (const e of users.uiapi?.query?.User?.edges ?? []) {
        const id = (e.node as { Id?: string }).Id ?? '';
        if (id) ownerNameById[id] = s(e.node, 'Name');
      }
    } catch { /* names are best-effort; fall back to undefined */ }
  }

  // Resolve related Account WhatIds -> "Related To" customer names (Account
  // whats only, 001 prefix). The polymorphic What field can't expose Name in
  // uiapi, so a follow-up Account lookup ties each activity back to its customer.
  const whatAcctIds = [...new Set(
    [q?.TaskOverdue, q?.TaskUpcoming, q?.Event]
      .flatMap(feed => feed?.edges ?? [])
      .map(e => s(e.node, 'WhatId'))
      .filter(id => id.startsWith('001')),
  )];
  const whatNameById: Record<string, string> = {};
  if (whatAcctIds.length) {
    try {
      const accts = await executeGraphQL<{ uiapi?: { query?: { Account?: { edges?: { node: Node }[] } } } }>(
        accountNamesQuery(whatAcctIds),
      );
      for (const e of accts.uiapi?.query?.Account?.edges ?? []) {
        const id = (e.node as { Id?: string }).Id ?? '';
        if (id) whatNameById[id] = s(e.node, 'Name');
      }
    } catch { /* related-to names are best-effort; leave blank on failure */ }
  }

  const schedule: ScheduleItem[] = [
    ...(q?.TaskOverdue?.edges ?? []).map((e, i) => ({
      id: `to${i}`, recordId: (e.node as { Id?: string }).Id ?? '', sobjectType: 'Task' as const,
      time: s(e.node, 'ActivityDate') || '—', title: s(e.node, 'Subject') || 'Task', kind: 'task' as const,
      status: s(e.node, 'Status') || undefined, priority: s(e.node, 'Priority') || undefined,
      type: s(e.node, 'Type') || undefined, description: s(e.node, 'Description') || undefined,
      whatId: s(e.node, 'WhatId') || undefined, clientName: whatNameById[s(e.node, 'WhatId')] || undefined, ownerId: s(e.node, 'OwnerId') || undefined, ownerName: ownerNameById[s(e.node, 'OwnerId')] || undefined,
      createdByName: relName(e.node, 'CreatedBy') || undefined, createdDate: s(e.node, 'CreatedDate') || undefined,
      lastModifiedByName: relName(e.node, 'LastModifiedBy') || undefined, lastModifiedDate: s(e.node, 'LastModifiedDate') || undefined,
    })),
    ...(q?.TaskUpcoming?.edges ?? []).map((e, i) => ({
      id: `tu${i}`, recordId: (e.node as { Id?: string }).Id ?? '', sobjectType: 'Task' as const,
      time: s(e.node, 'ActivityDate') || '—', title: s(e.node, 'Subject') || 'Task', kind: 'task' as const,
      status: s(e.node, 'Status') || undefined, priority: s(e.node, 'Priority') || undefined,
      type: s(e.node, 'Type') || undefined, description: s(e.node, 'Description') || undefined,
      whatId: s(e.node, 'WhatId') || undefined, clientName: whatNameById[s(e.node, 'WhatId')] || undefined, ownerId: s(e.node, 'OwnerId') || undefined, ownerName: ownerNameById[s(e.node, 'OwnerId')] || undefined,
      createdByName: relName(e.node, 'CreatedBy') || undefined, createdDate: s(e.node, 'CreatedDate') || undefined,
      lastModifiedByName: relName(e.node, 'LastModifiedBy') || undefined, lastModifiedDate: s(e.node, 'LastModifiedDate') || undefined,
    })),
    ...(q?.Event?.edges ?? []).map((e, i) => ({
      id: `e${i}`, recordId: (e.node as { Id?: string }).Id ?? '', sobjectType: 'Event' as const,
      time: (s(e.node, 'ActivityDateTime') || '').slice(0, 10) || '—', startDateTime: s(e.node, 'ActivityDateTime') || undefined, title: s(e.node, 'Subject') || 'Event', kind: 'meeting' as const,
      type: s(e.node, 'Type') || undefined, description: s(e.node, 'Description') || undefined,
      whatId: s(e.node, 'WhatId') || undefined, clientName: whatNameById[s(e.node, 'WhatId')] || undefined, location: s(e.node, 'Location') || undefined,
      showAs: s(e.node, 'ShowAs') || undefined, ownerId: s(e.node, 'OwnerId') || undefined, ownerName: ownerNameById[s(e.node, 'OwnerId')] || undefined,
      createdByName: relName(e.node, 'CreatedBy') || undefined, createdDate: s(e.node, 'CreatedDate') || undefined,
      lastModifiedByName: relName(e.node, 'LastModifiedBy') || undefined, lastModifiedDate: s(e.node, 'LastModifiedDate') || undefined,
    })),
  ];

  const bankerGoals: BankerGoal[] = (q?.FinancialGoal?.edges ?? []).map((e, i) => ({
    id: `g${i}`, name: s(e.node, 'Name') || 'Goal',
    current: num(e.node, 'ActualAmount'), target: num(e.node, 'TargetAmount') || 1,
    format: 'currencyCompact' as const,
  }));

  // Upcoming customer goals → the supporting-band Customer Goals card + explorer.
  // Plan-linked only (FinancialPlanId ≠ null), TargetDate ≥ TODAY, not COMPLETED,
  // soonest first. Attribution: clientName from FinancialPlan → Account when the
  // plan has an account; planName (FinancialPlan.Name, e.g. "Rachel Morris - Home
  // Ownership Plan") always carries the household. recordId powers the edit modal.
  const customerGoals: CustomerGoal[] = (q?.CustomerGoal?.edges ?? []).map((e, i) => {
    const targetDate = s(e.node, 'TargetDate');
    const daysUntil = targetDate
      ? Math.round((new Date(targetDate).getTime() - Date.now()) / 86_400_000)
      : null;
    const fp = e.node.FinancialPlan;
    return {
      id: `cg${i}`,
      recordId: (e.node as { Id?: string }).Id || undefined,
      name: sd(e.node, 'Name') || 'Goal',
      clientName: decodeHtml(fp?.Account?.Name?.value ?? ''),
      clientId: fp?.AccountId?.value || undefined,
      planName: decodeHtml(fp?.Name?.value ?? '') || undefined,
      status: s(e.node, 'Status'),
      priority: s(e.node, 'Priority') || undefined,
      type: s(e.node, 'Type') || undefined,
      description: sd(e.node, 'Description') || undefined,
      targetDate,
      daysUntil,
      target: num(e.node, 'TargetAmount'),
      current: num(e.node, 'ActualAmount'),
    };
  });

  // Live life events → the supporting-band Life Events panel + explorer. The
  // primary person is a Contact; for person accounts its Account.Name is the
  // client. EventType drives icon + next-best-action. recordId/contactId let
  // the modal edit the record; eventType/eventDate seed its fields.
  const lifeEvents: LifeEventSignal[] = (q?.PersonLifeEvent?.edges ?? []).map((e, i) => {
    const type = s(e.node, 'EventType');
    const pp = e.node.PrimaryPerson;
    const clientName = decodeHtml(pp?.Account?.Name?.value ?? pp?.Name?.value ?? '');
    const rawDate = s(e.node, 'EventDate');
    return {
      id: `le${i}`,
      clientId: s(e.node, 'PrimaryPersonId'),
      clientName: clientName || 'Client',
      event: type || 'Life event',
      when: shortWhen(rawDate),
      opportunity: lifeEventPlay(type),
      icon: lifeEventIcon(type),
      recordId: (e.node as { Id?: string }).Id || undefined,
      eventType: type || undefined,
      eventDate: dateOnly(rawDate) || undefined,
      contactId: s(e.node, 'PrimaryPersonId') || undefined,
    };
  });

  const leads: LeadReferral[] = (q?.Lead?.edges ?? []).map((e, i) => ({
    id: `l${i}`, name: s(e.node, 'Name') || s(e.node, 'Company') || 'Lead',
    source: s(e.node, 'LeadSource') || '—', status: s(e.node, 'Status') || 'New',
    value: num(e.node, 'AnnualRevenue'),
    email: s(e.node, 'Email'),
  }));

  const pipeline: PipelineItem[] = (opp?.edges ?? []).slice(0, 8).map((e, i) => ({
    id: `o${i}`,
    clientName: e.node.Account?.Name?.value ?? '—',
    name: s(e.node, 'Name'), stage: s(e.node, 'StageName'),
    amount: num(e.node, 'Amount'), closeDate: s(e.node, 'CloseDate'),
    propensity: Math.min(1, num(e.node, 'Probability') / 100) || 0.5,
  }));

  // Open service cases → the supporting-band Cases card + explorer. CaseNumber,
  // Subject, Priority, Status are standard Case fields (present in every org);
  // age is whole days since CreatedDate. Account name rides along via the
  // Case → Account relationship (falls back to '' when the case has no account).
  const cases: CaseItem[] = (q?.Case?.edges ?? []).map((e, i) => {
    const created = s(e.node, 'CreatedDate');
    const ageDays = created ? Math.max(0, Math.floor((Date.now() - new Date(created).getTime()) / 86_400_000)) : 0;
    return {
      id: (e.node as { Id?: string }).Id ?? `cs${i}`,
      caseNumber: s(e.node, 'CaseNumber') || '—',
      subject: s(e.node, 'Subject') || 'Case',
      priority: s(e.node, 'Priority') || '',
      status: s(e.node, 'Status') || '',
      clientName: e.node.Account?.Name?.value ?? '',
      clientId: s(e.node, 'AccountId') || undefined,
      ageDays,
    };
  });

  const highValue = callList.filter(c => c.severity === 'high').length;

  // ── Recommendations — derived defensively (never throws). Sources:
  //   open Task · top Opportunity · highest-value Account · largest held-away.
  const recommendations: Recommendation[] = [];
  const firstTask = q?.TaskOverdue?.edges?.[0]?.node;
  if (firstTask) {
    const subj = s(firstTask, 'Subject') || 'Follow-up task';
    const due = s(firstTask, 'ActivityDate');
    recommendations.push({
      id: 'rec-task', kind: 'task', objectLabel: 'Task', clientName: subj, clientId: '',
      title: `Complete open task: ${subj}`,
      body: `This planning task${due ? ` (due ${due})` : ''} is still open. Close the loop with the client and confirm the next review step.`,
      evidence: `Open Task${due ? ` with ActivityDate ${due}` : ''} — from your overdue advisory queue`,
    });
  }
  const topOpp = opp?.edges?.[0]?.node;
  if (topOpp) {
    const oppName = s(topOpp, 'Name') || 'Opportunity';
    const acct = topOpp.Account?.Name?.value ?? oppName;
    recommendations.push({
      id: 'rec-call', kind: 'call', objectLabel: 'Opportunity', clientName: acct, clientId: '',
      title: `Advance ${acct} toward close`,
      body: `Your largest open opportunity (${oppName}, ${num(topOpp, 'Amount').toLocaleString('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 })}) needs a next step. Schedule a planning call to confirm scope and lock a date.`,
      evidence: `Highest-value open opportunity at ${Math.round(num(topOpp, 'Probability'))}% probability`,
    });
  }
  const topAcct = (opp?.edges ?? []).find(e => e.node.Account?.Name?.value)?.node.Account?.Name?.value;
  if (topAcct) {
    recommendations.push({
      id: 'rec-email', kind: 'email', objectLabel: 'Account', clientName: topAcct, clientId: '',
      title: `Re-engage ${topAcct} on their plan`,
      body: 'A top relationship has limited recent activity. Reach out to schedule a portfolio review and explore held-away consolidation.',
      evidence: 'High-value household with sparse recent engagement history',
    });
  }
  const topHeldAway = callList[0];
  if (topHeldAway) {
    recommendations.push({
      id: 'rec-case', kind: 'case', objectLabel: 'Case', clientName: topHeldAway.clientName, clientId: topHeldAway.clientId,
      title: `Open a consolidation case for ${topHeldAway.clientName}`,
      body: 'The largest held-away balance in your book is a live consolidation opportunity. Log a case to track the outreach and required paperwork.',
      evidence: topHeldAway.reason,
    });
  }

  // ── Right Now — the single first move, from the top-priority call item.
  const top = callList[0];
  const rightNow: RightNowItem | undefined = top
    ? {
        clientId: top.clientId,
        clientName: top.clientName,
        headline: `Reach out to ${top.clientName} — ${top.action.toLowerCase()}.`,
        detail: top.reason,
        taskSubject: top.action,
      }
    : undefined;

  // ── Recent activity — derived from the merged schedule feed (most recent
  //    real Task/Event touches), tinted by kind. Empty book → graceful empty note.
  const ACT_ICON: Record<string, ActivityItem['icon']> = { task: 'task', meeting: 'event', call: 'call', event: 'event' };
  const activity: ActivityItem[] = schedule.slice(0, 6).map((it, i) => ({
    id: `act${i}`,
    clientName: it.clientName || it.title,
    clientId: it.whatId,
    title: it.title,
    when: it.time,
    icon: ACT_ICON[it.kind] ?? 'task',
    tone: 'neutral' as const,
  }));

  // ── Pipeline movement — group open opportunities by stage, summing amount.
  //    A real, live-derived roll-up (deltaPct is a flat placeholder — no
  //    historical snapshot is wired yet).
  const byStage = new Map<string, number>();
  for (const e of opp?.edges ?? []) {
    const stage = s(e.node, 'StageName') || 'Other';
    byStage.set(stage, (byStage.get(stage) ?? 0) + num(e.node, 'Amount'));
  }
  const pipelineMovement: PipelineMovement[] = [...byStage.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([label, amount], i) => ({
      id: `pm${i}`,
      label,
      amount,
      deltaPct: 0.06,
      trend: seedTrend(label, amount),
    }));

  return {
    bankerName,
    dateLabel: 'Today',
    aiBriefHeadline: 'held-away assets within reach',
    aiBrief: `${callList.length} clients hold external assets totalling ${totalHeldAway.toLocaleString('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 })}; ${highValue} are $5M+ consolidation opportunities. ${opp?.totalCount ?? 0} open opportunities worth ${pipelineValue.toLocaleString('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 })} in pipeline. ${schedule.length} activities scheduled.`,
    confidencePct: 89,
    dataSourceCount: 26,
    kpis: [
      { key: 'pipeline', label: 'Pipeline', value: pipelineValue, format: 'currencyCompact', trend: seedTrend('pipeline', Math.round(pipelineValue / 1e6)), deltaPct: 0.061, note: `${(opp?.totalCount ?? 0).toLocaleString('en-US')} open opportunities` },
      { key: 'openOpps', label: 'Opportunities', value: opp?.totalCount ?? 0, format: 'number', trend: seedTrend('opps', opp?.totalCount ?? 0), deltaPct: 0.03, note: 'In progress' },
      { key: 'leads', label: 'Leads & Referrals', value: leads.length, format: 'number', trend: seedTrend('leads', Math.max(1, leads.length)), deltaPct: 0.08, note: 'Open leads' },
      { key: 'openCases', label: 'Open Cases', value: q?.Case?.totalCount ?? 0, format: 'number', trend: seedTrend('cases', q?.Case?.totalCount ?? 0), note: 'Open cases' },
      { key: 'atRisk', label: '$5M+ Targets', value: highValue, format: 'number', trend: seedTrend('targets', Math.max(1, highValue)), deltaPct: 0.11, note: 'Consolidation' },
      { key: 'goals', label: 'Active Goals', value: bankerGoals.length, format: 'number', trend: seedTrend('goals', Math.max(1, bankerGoals.length)), deltaPct: 0.02, note: 'On track' },
    ],
    callList,
    pipeline,
    bankerGoals,
    lifeEvents,
    schedule,
    alerts: callList.slice(0, 4).map((c, i) => ({
      id: `a${i}`, title: `Held-away — ${c.clientName}`, detail: c.reason,
      tone: 'opportunity' as const, severity: c.severity === 'high' ? 'High' as const : 'Medium' as const, when: 'recent',
    })),
    leads,
    recommendations,
    activity,
    pipelineMovement,
    cases,
    customerGoals,
    rightNow,
  };
}
