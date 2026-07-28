import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Modal } from '../Modal';
import { Button } from '../Button';
import { FactTile, PrepBlock, GenLine } from './fields';
import type { ClientProfile } from './types';
import { runPromptFlow, stripHtml, type PromptFlow } from '../../data/promptClient';

const TABS = ['Overview', 'Opportunities', 'Cases', 'Activity'] as const;
type Tab = (typeof TABS)[number];

/** Section markers the AI relationship summary emits inline (one flowing blob).
 *  Splitting on them lets the modal render labeled subheads AND route each
 *  section to its matching tab, so Opportunities / Cases / Activity carry real
 *  content instead of a dead "open in the full 360 record" stub. */
const SUMMARY_MARKERS = [
  'Account Overview',
  'Opportunities',
  'Open Cases',
  'Activity',
  'Contacts',
  'Recent Purchases',
] as const;

/** Which parsed section headings feed each tab. Overview also absorbs any lead
 *  text before the first marker (heading ''), so nothing is ever dropped. */
const TAB_MARKERS: Record<Tab, readonly string[]> = {
  Overview: ['', 'Account Overview', 'Contacts', 'Recent Purchases'],
  Opportunities: ['Opportunities'],
  Cases: ['Open Cases'],
  Activity: ['Activity'],
};

interface SummarySection {
  heading: string;
  body: string;
}

/** Split the summary blob into {heading, body} on the known markers. Text with
 *  no markers (the seed copy, or a custom prompt-flow result) returns a single
 *  untitled section, so the render path is identical either way. */
function parseSummary(summary: string): SummarySection[] {
  const escaped = SUMMARY_MARKERS.map(h => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`\\s*\\b(${escaped.join('|')})\\b[:.]?\\s*`, 'g');
  const out: SummarySection[] = [];
  let heading = '';
  let from = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(summary)) !== null) {
    const body = summary.slice(from, m.index).trim();
    if (body || heading) out.push({ heading, body });
    heading = m[1];
    from = re.lastIndex;
  }
  const tail = summary.slice(from).trim();
  if (tail || heading) out.push({ heading, body: tail });
  return out;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Client 360 quick view — avatar + headline stats, tabs, an AI summary
 * (composed-first, best-effort enriched), the action rail, and a footer link
 * that navigates to the full /client/:id record.
 */
export function QuickViewModal({
  open,
  onClose,
  clientName,
  clientId,
  profile,
  promptFlow,
  onPrep,
  onSchedule,
  onTask,
  onEmail,
  onOpenFull,
}: {
  open: boolean;
  onClose: () => void;
  clientName: string;
  clientId?: string;
  profile?: ClientProfile;
  promptFlow?: PromptFlow;
  onPrep: () => void;
  onSchedule: () => void;
  onTask: () => void;
  onEmail: () => void;
  onOpenFull: () => void;
}) {
  const [tab, setTab] = useState<Tab>('Overview');
  const [summary, setSummary] = useState(
    profile?.recap ??
      "AI summary is generated on open from the client's CRM record, Data Cloud CSAT history, and recent transactions.",
  );
  const [enriching, setEnriching] = useState(false);

  const sections = useMemo(() => parseSummary(summary), [summary]);
  const tabSections = useMemo(
    () => sections.filter(sec => TAB_MARKERS[tab].includes(sec.heading)),
    [sections, tab],
  );

  useEffect(() => {
    if (!open || !promptFlow || !clientId) return;
    let cancelled = false;
    setEnriching(true);
    runPromptFlow(promptFlow, clientId)
      .then(raw => {
        const clean = stripHtml(raw);
        if (!cancelled && clean) setSummary(clean);
      })
      .catch(() => {
        /* keep composed summary */
      })
      .finally(() => {
        if (!cancelled) setEnriching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, promptFlow, clientId]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      tone="ai"
      title={clientName}
      subtitle={`${profile?.descriptor ?? 'Client'}${profile?.since ? ` · client since ${profile.since}` : ''}`}
      icon={<span>{profile?.initials ?? initialsOf(clientName)}</span>}
      footer={
        <>
          <span className="flex-1 font-mono text-[10px] tracking-[0.04em] text-faint">Quick view · full record at /client/:id</span>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button variant="accent" onClick={onOpenFull}>Open full 360 →</Button>
        </>
      }
    >
      <div className="mb-4 grid grid-cols-3 gap-2.5">
        {profile?.csat ? (
          <FactTile label="CSAT" value={profile.csat} />
        ) : profile?.healthScore != null ? (
          // No CSAT source (typical for commercial books) — surface the live
          // relationship-health score instead of a permanently-blank CSAT tile.
          <FactTile label="Health" value={`${profile.healthScore}${profile.healthLabel ? ` · ${profile.healthLabel}` : ''}`} />
        ) : (
          <FactTile label="CSAT" value="—" />
        )}
        <FactTile label="Value" value={profile?.value ?? '—'} />
        <FactTile label="Open cases" value={profile?.openCases ?? '—'} />
      </div>

      <div className="mb-4 flex gap-1.5 border-b border-line">
        {TABS.map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={clsx(
              '-mb-px border-b-2 px-3 py-2.5 text-[12.5px] transition',
              tab === t ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <PrepBlock title={tab === 'Overview' ? 'AI summary' : tab}>
        {enriching && <GenLine>Synthesizing relationship history…</GenLine>}
        {!enriching && tabSections.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-muted">
            No {tab.toLowerCase()} details in this brief — open the full 360 record.
          </p>
        ) : (
          tabSections.map((sec, i) => (
            <div key={`${sec.heading}-${i}`} className={i > 0 ? 'mt-3.5' : undefined}>
              {sec.heading && (
                <h6 className="mb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
                  {sec.heading}
                </h6>
              )}
              <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-fg">{sec.body}</p>
            </div>
          ))
        )}
      </PrepBlock>

      <div className="mt-4 flex flex-wrap gap-2.5">
        <Button size="sm" variant="ai" onClick={onPrep}>✦ Prep me</Button>
        <Button size="sm" variant="ghost" onClick={onSchedule}>Schedule</Button>
        <Button size="sm" variant="ghost" onClick={onTask}>Task</Button>
        <Button size="sm" variant="ghost" onClick={onEmail}>Email</Button>
      </div>
    </Modal>
  );
}
