/**
 * "After the call" — turns the latest call transcript into the banker's
 * post-call work: summary, follow-up Tasks, a client email draft and a KYC gap
 * list, all approved in one click.
 *
 * Sources:
 *   · Meeting_Note__c (latest transcript), Account KYC fields, Contacts → GraphQL
 *     (read from CRM directly so a just-logged note shows before the Data Cloud
 *     stream refresh lands)
 *   · BT_Gong_Call_Sentiment__dlm, BT_WorldCheck_AML__dlm → Data Cloud
 *
 * The draft is composed deterministically from those sources; when the Models
 * API is on, AiGenerateRest rewrites it and any field the model gets wrong
 * falls back to the composed value.
 */
import { executeGraphQL, queryDataCloud, generateText, crmWrite } from '@shared';

export interface AfterCallContext {
  accountId: string;
  accountName: string;
  kycStatus: string;
  note: { title: string; date: string; body: string } | null;
  contacts: { id: string; name: string; title: string; email: string }[];
  gong: { sentiment: string; trend: string; topics: string[]; actionItems: number; nextCall: string; rm: string } | null;
  sanctions: boolean;
  adverseMedia: boolean;
}

export interface FollowUpTask { subject: string; dueDate: string }

export interface AfterCallDraft {
  summary: string;
  tasks: FollowUpTask[];
  email: { to: string; contactId: string; subject: string; body: string };
  kycGaps: string[];
  source: 'model' | 'composed';
}

type GNode = Record<string, { value?: unknown } | undefined | string>;
const gs = (n: GNode | undefined, k: string): string => {
  const f = n?.[k];
  return String((typeof f === 'object' && f !== null ? f.value : f) ?? '');
};
const isoDay = (v: unknown) => String(v ?? '').slice(0, 10);
const dcTrue = (v: unknown) => v === true || String(v) === 'true';

const contextQuery = (acct: string) => `query AfterCall {
  uiapi { query {
    Account(first: 1, where: { Id: { eq: "${acct}" } }) {
      edges { node { Id Name @optional { value } FinServ__KYCStatus__c @optional { value } } }
    }
    Meeting_Note__c(first: 10, where: { Account__c: { eq: "${acct}" } }, orderBy: { Date__c: { order: DESC } }) {
      edges { node { Id Title__c @optional { value } Date__c @optional { value } Notes__c @optional { value } } }
    }
    Contact(first: 10, where: { AccountId: { eq: "${acct}" } }) {
      edges { node { Id Name @optional { value } Title @optional { value } Email @optional { value } } }
    }
  } }
}`;

interface ContextShape {
  uiapi?: { query?: Record<string, { edges?: { node: GNode }[] } | undefined> };
}

export async function fetchAfterCallContext(accountId: string): Promise<AfterCallContext | null> {
  const acct = accountId.replace(/[^A-Za-z0-9]/g, '');
  const rows = (sql: string) => queryDataCloud<Record<string, unknown>>(sql, 1).then(r => r.rows).catch((): Record<string, unknown>[] => []);
  const [core, gongRows, amlRows] = await Promise.all([
    executeGraphQL<ContextShape>(contextQuery(acct)),
    rows(`SELECT overall_sentiment__c sent, sentiment_trend__c trend, key_topics_flags__c topics, action_items_count__c items, next_scheduled_call_date__c nxt, rm_name__c rm FROM BT_Gong_Call_Sentiment__dlm WHERE account_id__c = '${acct}' ORDER BY profile_week__c DESC LIMIT 1`),
    rows(`SELECT sanctions_hit__c sanc, adverse_media_hit__c media FROM BT_WorldCheck_AML__dlm WHERE account_id__c = '${acct}' ORDER BY profile_date__c DESC LIMIT 1`),
  ]);
  const q = core.uiapi?.query;
  const a = q?.Account?.edges?.[0]?.node;
  if (!a) return null;
  // The panel's own "Call summary — …" notes are newer than the call; always draft from the call itself.
  const n = q?.Meeting_Note__c?.edges?.map(e => e.node).find(node => !/^call summary\s*[—–-]/i.test(gs(node, 'Title__c')));
  const g = gongRows[0];
  const w = amlRows[0];
  return {
    accountId: acct,
    accountName: gs(a, 'Name'),
    kycStatus: gs(a, 'FinServ__KYCStatus__c'),
    note: n ? { title: gs(n, 'Title__c'), date: gs(n, 'Date__c'), body: gs(n, 'Notes__c') } : null,
    contacts: (q?.Contact?.edges ?? []).map(({ node }) => ({
      id: String(node.Id ?? ''), name: gs(node, 'Name'), title: gs(node, 'Title'), email: gs(node, 'Email'),
    })),
    gong: g ? {
      sentiment: String(g.sent ?? ''), trend: String(g.trend ?? ''),
      topics: String(g.topics ?? '').split('|').map(s => s.trim()).filter(Boolean),
      actionItems: Number(g.items) || 0, nextCall: isoDay(g.nxt), rm: String(g.rm ?? ''),
    } : null,
    sanctions: dcTrue(w?.sanc), adverseMedia: dcTrue(w?.media),
  };
}

/** "1. Revised pricing … — due 2026-11-22" / "… — before 2027-01-04" lines under "Action items". */
export function parseActionItems(body: string): FollowUpTask[] {
  const at = body.search(/^action items/im);
  if (at < 0) return [];
  return body.slice(at).split('\n')
    .map(l => l.match(/^\s*\d+[.)]\s*(.+?)\s*[—–-]+\s*(?:due|before|by)\s+(\d{4}-\d{2}-\d{2})\s*$/i))
    .filter((m): m is RegExpMatchArray => !!m)
    .map(m => ({ subject: m[1].trim(), dueDate: m[2] }));
}

/** Entities and owners the client said changed on the call. */
function ownershipChanges(body: string): { entity?: string; owner?: string; pct?: string } {
  const entity = body.match(/\b([A-Z][\w&'.-]*(?:\s+[A-Z][\w&'.-]*)*\s+(?:LLC|Inc\.?|Corp\.?|LP|Ltd\.?))/)?.[1];
  const own = body.match(/([A-Z][a-z]+ [A-Z][a-z]+) (?:came in|joined|was added) as an? (\d+) ?(?:percent|%) owner/);
  return { entity, owner: own?.[1], pct: own?.[2] };
}

/** True when the client said the ownership structure changed on the call (new parent entity or owner). */
export const hasOwnershipChange = (body: string) => { const o = ownershipChanges(body); return !!(o.entity || o.owner); };

const longDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
};

const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
/** A follow-up can't be due in the past: a commitment dated on the (earlier) call day lands today. */
const notPast = (iso: string, today: string) => (iso < today ? today : iso);

/** Deterministic draft from the transcript + signals. Always available. */
export function composeAfterCall(ctx: AfterCallContext, today = localToday()): AfterCallDraft {
  const body = ctx.note?.body ?? '';
  const tasks = parseActionItems(body).slice(0, 3).map(t => ({ ...t, dueDate: notPast(t.dueDate, today) }));
  const own = ownershipChanges(body);
  const topics = ctx.gong?.topics ?? [];

  const kycGaps: string[] = [];
  if (/expired|overdue|required/i.test(ctx.kycStatus)) kycGaps.push(`KYC review is ${ctx.kycStatus.toLowerCase()} — refresh before onboarding new services`);
  if (ctx.sanctions) kycGaps.push('Sanctions hit on latest compliance screening — escalate to compliance');
  if (ctx.adverseMedia) kycGaps.push('Adverse media on latest compliance screening — review and document');
  if (own.entity) kycGaps.push(`New parent entity ${own.entity} — formation documents and updated org chart`);
  if (own.owner) kycGaps.push(`Beneficial ownership certification for ${own.owner}${own.pct ? ` (${own.pct}% owner)` : ''}`);

  const parts = [
    `${ctx.note?.title || 'Call'} on ${ctx.note?.date ? longDate(ctx.note.date) : 'the latest call'}.`,
    ctx.gong ? `Sentiment ${ctx.gong.sentiment.toLowerCase()} and ${ctx.gong.trend.toLowerCase()}${topics.length ? `; topics flagged: ${topics.join(', ').toLowerCase()}` : ''}.` : '',
    /pric|fee/i.test(body) ? 'Client pushed back on pricing versus another bank.' : '',
    own.entity ? `Client is restructuring under ${own.entity}${own.owner ? `, with ${own.owner} as a new ${own.pct ? `${own.pct}% ` : ''}owner` : ''}.` : '',
    tasks.length ? `Commitments: ${tasks.map(t => `${t.subject.charAt(0).toLowerCase()}${t.subject.slice(1)} (${longDate(t.dueDate)})`).join('; ')}.` : '',
    ctx.gong?.nextCall ? `Next check-in ${longDate(ctx.gong.nextCall)}.` : '',
  ];

  const to = ctx.contacts.find(c => /cfo/i.test(c.title)) ?? ctx.contacts.find(c => c.email) ?? ctx.contacts[0];
  const first = to?.name.split(' ')[0] ?? 'there';
  const emailLines = [
    `Hi ${first},`,
    '',
    `Thank you for the time on ${ctx.note?.date ? longDate(ctx.note.date) : 'our call'}. To recap what we agreed:`,
    ...tasks.map(t => `• ${t.subject} — ${longDate(t.dueDate)}`),
    ...(own.entity || own.owner ? ['', `To set things up under ${own.entity ?? 'the new structure'}, we will need${own.owner ? ` a beneficial ownership certification for ${own.owner},` : ''} the formation documents and an updated org chart.`] : []),
    ...(ctx.gong?.nextCall ? ['', `Looking forward to our check-in on ${longDate(ctx.gong.nextCall)}.`] : []),
    '',
    'Best regards,',
    ctx.gong?.rm || 'Your relationship manager',
  ];

  return {
    summary: parts.filter(Boolean).join(' '),
    tasks,
    email: { to: to?.email ?? '', contactId: to?.id ?? '', subject: `Follow-up: ${ctx.note?.title?.replace(/\s*[—–-]\s*call transcript$/i, '') || 'our call'}`, body: emailLines.join('\n') },
    kycGaps,
    source: 'composed',
  };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Merge a model JSON reply onto the composed draft; anything malformed keeps the composed value. */
export function mergeAiDraft(base: AfterCallDraft, text: string, today = localToday()): AfterCallDraft {
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return base;
  let o: Record<string, unknown>;
  try { o = JSON.parse(json) as Record<string, unknown>; } catch { return base; }
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const tasks = Array.isArray(o.tasks)
    ? (o.tasks as Record<string, unknown>[]).map(t => ({ subject: str(t?.subject), dueDate: str(t?.dueDate) }))
        .filter((t): t is FollowUpTask => !!t.subject && !!t.dueDate && DATE.test(t.dueDate)).slice(0, 3)
        .map(t => ({ ...t, dueDate: notPast(t.dueDate, today) }))
    : [];
  const gaps = Array.isArray(o.kycGaps) ? (o.kycGaps as unknown[]).map(str).filter((g): g is string => !!g) : [];
  const summary = str(o.summary);
  const subject = str(o.emailSubject);
  const emailBody = str(o.emailBody);
  const changed = !!(summary || tasks.length === 3 || subject || emailBody || gaps.length);
  return {
    summary: summary ?? base.summary,
    tasks: tasks.length === 3 ? tasks : base.tasks,
    email: { ...base.email, subject: subject ?? base.email.subject, body: emailBody ?? base.email.body },
    kycGaps: gaps.length ? gaps : base.kycGaps,
    source: changed ? 'model' : 'composed',
  };
}

export async function draftAfterCall(ctx: AfterCallContext): Promise<AfterCallDraft> {
  const base = composeAfterCall(ctx);
  try {
    const r = await generateText({
      task: 'freeform',
      prompt: `You are a commercial banker's assistant. From the call transcript and signals, reply with ONLY a JSON object: {"summary": string (3-4 sentences), "tasks": [{"subject": string, "dueDate": "YYYY-MM-DD"}] (exactly 3, the commitments made on the call; never a date before today, ${localToday()} — use today instead, and any dates in the email must match the task due dates), "emailSubject": string, "emailBody": string (plain text recap to the client, signed by the RM), "kycGaps": string[] (documents or reviews still needed)}.`,
      context: JSON.stringify({ client: ctx.accountName, kycStatus: ctx.kycStatus, screening: { sanctions: ctx.sanctions, adverseMedia: ctx.adverseMedia }, callSentiment: ctx.gong, transcript: ctx.note?.body ?? '', draft: base }),
    });
    return r.source === 'model' && r.text ? mergeAiDraft(base, r.text) : base;
  } catch {
    return base;
  }
}

/** One-click approve: 3 Tasks, the email logged as a completed Email Task (not
 *  sent), the summary as a Meeting Note, and KYC set to Required with the gaps. */
export async function approveAfterCall(ctx: AfterCallContext, d: AfterCallDraft): Promise<number> {
  const writes = [
    ...d.tasks.map(t => crmWrite({ action: 'task', subject: t.subject, dueDate: t.dueDate, type: 'To Do', whatId: ctx.accountId, ...(d.email.contactId ? { whoId: d.email.contactId } : {}), priority: 'High' })),
    crmWrite({ action: 'task', subject: `Email: ${d.email.subject}`, description: `To: ${d.email.to}\n\n${d.email.body}`, type: 'Email', status: 'Completed', whatId: ctx.accountId, ...(d.email.contactId ? { whoId: d.email.contactId } : {}) }),
    crmWrite({ action: 'meetingNote', accountId: ctx.accountId, subject: `Call summary — ${ctx.note?.title?.replace(/\s*[—–-]\s*call transcript$/i, '') || 'latest call'}`, description: d.summary, eventDate: new Date().toISOString().slice(0, 10) }),
    crmWrite({ action: 'kyc', accountId: ctx.accountId, status: 'Required', description: d.kycGaps.map(g => `• ${g}`).join('\n') }),
  ];
  const results = await Promise.allSettled(writes);
  const failed = results.filter(r => r.status === 'rejected');
  if (failed.length) throw new Error(`${failed.length} of ${writes.length} writes failed: ${(failed[0] as PromiseRejectedResult).reason?.message ?? 'unknown error'}`);
  return writes.length;
}

export interface CallRecord {
  kycStatus: string;
  kycSummary: string;
  notes: { id: string; title: string; date: string; body: string }[];
}

/** What CRM holds now (Account KYC + latest Meeting Notes), read directly so a just-approved
 *  draft shows after a reload without waiting for the Data Cloud stream refresh. */
export async function fetchCallRecord(accountId: string): Promise<CallRecord | null> {
  const acct = accountId.replace(/[^A-Za-z0-9]/g, '');
  const data = await executeGraphQL<ContextShape>(`query CallRecord {
  uiapi { query {
    Account(first: 1, where: { Id: { eq: "${acct}" } }) {
      edges { node { Id FinServ__KYCStatus__c @optional { value } KYC_Summary__c @optional { value } } }
    }
    Meeting_Note__c(first: 3, where: { Account__c: { eq: "${acct}" } }, orderBy: { Date__c: { order: DESC } }) {
      edges { node { Id Title__c @optional { value } Date__c @optional { value } Notes__c @optional { value } } }
    }
  } }
}`);
  const q = data.uiapi?.query;
  const a = q?.Account?.edges?.[0]?.node;
  if (!a) return null;
  return {
    kycStatus: gs(a, 'FinServ__KYCStatus__c'),
    kycSummary: gs(a, 'KYC_Summary__c'),
    notes: (q?.Meeting_Note__c?.edges ?? []).map(({ node }) => ({ id: String(node.Id ?? ''), title: gs(node, 'Title__c'), date: gs(node, 'Date__c'), body: gs(node, 'Notes__c') })),
  };
}
