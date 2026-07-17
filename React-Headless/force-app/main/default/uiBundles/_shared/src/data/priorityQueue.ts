/**
 * Priority-queue blender — turns a persona's single signature-risk feed into the
 * diverse, dated "who to act on" queue the cockpit shows.
 *
 * WHY THIS EXISTS: each persona mines ONE signal (Retail = CSAT, Commercial =
 * D&B credit, Wealth = held-away balances), so every row shared the same action
 * verb and — worse — its due date was derived purely from severity, making the
 * list impossible to sort into a "mixed" order. This blender merges three signal
 * families, each contributing its own action, reason, and a SIGNAL-NATIVE due
 * date, so High/Medium/Low interleave with real dates:
 *
 *   · primary   — the persona's risk feed (service recovery / credit / consolidation).
 *                 No native date, so it gets an SLA due (high = today, medium = +2d,
 *                 low = +5d) — a real "act by" rule, not a severity echo.
 *   · pipeline  — open opportunities → cross-sell / renewal / funding, due on CloseDate.
 *   · tasks     — overdue tasks → escalations / follow-ups, due on their (past) ActivityDate.
 *
 * All inputs are the ALREADY-PARSED shapes each persona builds, so the blender is
 * pure and identical across bundles.
 */

export type QueueSeverity = 'high' | 'medium' | 'low';
export type QueueDueTier = 'today' | 'week' | 'watch';

/** The blended queue item. Structurally identical to each persona's CallItem
 *  (which now carries the optional `dueDate`), so it assigns straight across. */
export interface QueueSignalItem {
  id: string;
  clientId: string;
  clientName: string;
  segment: string;
  reason: string;
  action: string;
  score: number;
  severity: QueueSeverity;
  source: string;
  relationshipValue: number;
  tier?: QueueDueTier;
  /** ISO date (YYYY-MM-DD) the item is due / actionable. */
  dueDate?: string;
}

export interface QueueOppInput {
  clientName: string;
  name: string;
  stage: string;
  amount: number;
  closeDate: string;
  propensity: number;
}

export interface QueueTaskInput {
  title: string;
  /** ActivityDate (past = overdue) or '—'. */
  time: string;
  clientName?: string;
  priority?: string;
  whatId?: string;
  bucket?: string;
}

const DAY = 86_400_000;

/** Add whole days to an ISO date, returning ISO (YYYY-MM-DD). */
function addDays(base: Date, days: number): string {
  const d = new Date(base.getTime() + days * DAY);
  return d.toISOString().slice(0, 10);
}

const SEV_SLA_DAYS: Record<QueueSeverity, number> = { high: 0, medium: 2, low: 5 };

/** Map an ISO due date to the coarse tier the older UI still reads. */
function tierForDate(iso: string | undefined, today: Date): QueueDueTier {
  if (!iso) return 'watch';
  const diff = Math.round((new Date(iso + 'T00:00:00').getTime() - startOfDay(today).getTime()) / DAY);
  if (diff <= 0) return 'today';
  if (diff <= 7) return 'week';
  return 'watch';
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Opportunity → severity from close-ability (propensity) and size. */
function severityForOpp(propensity: number, amount: number): QueueSeverity {
  if (propensity >= 0.7 || amount >= 1_000_000) return 'high';
  if (propensity >= 0.4 || amount >= 250_000) return 'medium';
  return 'low';
}

/** Derive an action verb + source label from an opportunity's stage. */
function oppAction(stage: string): { action: string; kind: string } {
  const st = stage.toLowerCase();
  if (st.includes('renew')) return { action: 'Policy / relationship renewal', kind: 'Renewal' };
  if (st.includes('clos') || st.includes('fund')) return { action: 'Confirm docs & set funding date', kind: 'Closing' };
  if (st.includes('propos') || st.includes('quote')) return { action: 'Follow up to close proposal', kind: 'Proposal' };
  if (st.includes('negoti')) return { action: 'Advance negotiation', kind: 'Negotiation' };
  return { action: `Cross-sell — advance ${stage || 'deal'}`, kind: 'Cross-sell' };
}

const fmtMoney = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });

/** Is this overdue task an escalation (vs. a routine follow-up)? */
function isEscalation(title: string, priority?: string): boolean {
  const t = title.toLowerCase();
  return (
    (priority ?? '').toLowerCase() === 'high' ||
    /escalat|declin|complaint|dispute|fraud|urgent|overdue|breach|churn/.test(t)
  );
}

/**
 * Blend the persona's primary risk feed with opportunity- and task-derived items
 * into a single diverse, dated queue. Deduplicates by client+action, caps at
 * `limit`, and returns items sorted by composite priority score (desc).
 */
export function buildPriorityQueue(input: {
  primary: QueueSignalItem[];
  opportunities?: QueueOppInput[];
  tasks?: QueueTaskInput[];
  /** Injected so callers can pin "today" (tests / SSR); defaults to now. */
  now?: Date;
  limit?: number;
}): QueueSignalItem[] {
  const today = startOfDay(input.now ?? new Date());
  const limit = input.limit ?? 8;
  const out: QueueSignalItem[] = [];

  // 1) Primary risk feed — give each an SLA due date (real "act by" rule).
  input.primary.forEach((p, i) => {
    const sev = p.severity;
    // Stagger within a severity band by index so same-severity items don't all
    // collapse onto one date (keeps the sort visibly mixed).
    const sla = SEV_SLA_DAYS[sev] + (i % 2);
    const dueDate = p.dueDate ?? addDays(today, sla);
    out.push({ ...p, dueDate, tier: tierForDate(dueDate, today) });
  });

  // 2) Opportunity-derived items — cross-sell / renewal / funding, due on CloseDate.
  (input.opportunities ?? [])
    .filter(o => o.clientName && o.clientName !== '—')
    .slice(0, 5)
    .forEach((o, i) => {
      const sev = severityForOpp(o.propensity, o.amount);
      const { action, kind } = oppAction(o.stage);
      out.push({
        id: `qo${i}`,
        clientId: '',
        clientName: o.clientName,
        segment: kind,
        reason: `${fmtMoney(o.amount)} ${o.stage || 'open'} · ${Math.round(o.propensity * 100)}% likely`,
        action,
        score: Math.min(1, o.propensity * 0.7 + Math.min(o.amount / 3_000_000, 1) * 0.3),
        severity: sev,
        source: 'Open opportunity',
        relationshipValue: o.amount,
        dueDate: o.closeDate || addDays(today, 14),
        tier: tierForDate(o.closeDate || addDays(today, 14), today),
      });
    });

  // 3) Overdue-task items — escalations / follow-ups, due on their past ActivityDate.
  (input.tasks ?? [])
    .filter(t => t.title && /^\d{4}-\d{2}-\d{2}/.test(t.time)) // has a real date
    .slice(0, 4)
    .forEach((t, i) => {
      const esc = isEscalation(t.title, t.priority);
      out.push({
        id: `qt${i}`,
        clientId: t.whatId ?? '',
        clientName: t.clientName || t.title,
        segment: esc ? 'Escalation' : 'Follow-up',
        reason: t.title,
        action: esc ? 'Escalation — resolve today' : 'Complete overdue follow-up',
        score: esc ? 0.9 : 0.55,
        severity: esc ? 'high' : 'medium',
        source: 'Overdue task',
        relationshipValue: 0,
        dueDate: t.time.slice(0, 10),
        tier: 'today',
      });
    });

  // Dedupe by client + action (a client can appear for two distinct reasons).
  const seen = new Set<string>();
  const deduped = out.filter(it => {
    const key = `${it.clientName}|${it.action}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Composite priority: score first (blends severity + urgency), then severity as
  // a tiebreak. Renumbered ids keep React keys stable after the sort.
  const SEV_RANK: Record<QueueSeverity, number> = { high: 0, medium: 1, low: 2 };
  deduped.sort((a, b) => (b.score - a.score) || (SEV_RANK[a.severity] - SEV_RANK[b.severity]));

  return deduped.slice(0, limit).map((it, i) => ({ ...it, id: it.id || `q${i}` }));
}
