import { useEffect, useState } from 'react';
import { Modal } from '../Modal';
import { Button } from '../Button';
import { FactTile, PrepBlock, GenLine } from './fields';
import type { ClientProfile } from './types';
import { runPromptFlow, stripHtml, type PromptFlow } from '../../data/promptClient';

const DEFAULT_FACTS: [string, string][] = [
  ['Segment', 'Retail'],
  ['CSAT', '—'],
  ['Open cases', '—'],
  ['Last contact', '—'],
];
const DEFAULT_RECAP =
  "Relationship summary is generated on open from the client's CRM record, Data Cloud CSAT history, and recent transactions.";
const DEFAULT_TALK =
  'Lead with the open service items to rebuild trust, then reframe the idle opportunity as a simple, guided next step.';
const DEFAULT_NBA = ['Review recent activity', 'Schedule a check-in call', 'Log outreach note'];

/**
 * AI prep sheet — composed instantly (facts, recap, talk track, next-best
 * actions), then best-effort enriched via a prompt flow. Read-only summary;
 * the footer schedules a call and each NBA can spawn a task.
 */
export function PrepModal({
  open,
  onClose,
  clientName,
  clientId,
  profile,
  promptFlow,
  onSchedule,
  onMakeTask,
}: {
  open: boolean;
  onClose: () => void;
  clientName: string;
  clientId?: string;
  profile?: ClientProfile;
  promptFlow?: PromptFlow;
  onSchedule: () => void;
  onMakeTask: (nba: string) => void;
}) {
  const facts = profile?.facts ?? DEFAULT_FACTS;
  const talk = profile?.talk ?? DEFAULT_TALK;
  const nba = profile?.nba ?? DEFAULT_NBA;

  const [recap, setRecap] = useState(profile?.recap ?? DEFAULT_RECAP);
  const [enriching, setEnriching] = useState(false);

  useEffect(() => {
    if (!open || !promptFlow || !clientId) return;
    let cancelled = false;
    setEnriching(true);
    runPromptFlow(promptFlow, clientId)
      .then(raw => {
        const clean = stripHtml(raw);
        if (!cancelled && clean) setRecap(clean);
      })
      .catch(() => {
        /* keep the composed recap */
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
      icon={<span>✦</span>}
      title={`Prep sheet · ${clientName}`}
      subtitle="Generated from CRM · Data Cloud · recent activity"
      footer={
        <>
          <span className="flex-1 font-mono text-[10px] tracking-[0.04em] text-faint">Summary via runPromptFlow (Agentforce)</span>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button variant="accent" onClick={onSchedule}>Schedule call</Button>
        </>
      }
    >
      {enriching && <GenLine>Synthesizing relationship history…</GenLine>}
      <div className="mb-5 grid grid-cols-2 gap-2.5">
        {facts.map(([label, value]) => (
          <FactTile key={label} label={label} value={value} />
        ))}
      </div>
      <PrepBlock title="Relationship recap">
        <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-fg">{recap}</p>
      </PrepBlock>
      <PrepBlock title="Suggested talk track">
        <p className="text-[13.5px] leading-relaxed text-fg">{talk}</p>
      </PrepBlock>
      <PrepBlock title="Next best actions">
        <div className="flex flex-col gap-2">
          {nba.map((n, i) => (
            <div key={n} className="flex items-center gap-3 rounded-[12px] border border-line bg-bg px-3.5 py-3">
              <span className="w-[18px] font-mono text-[11px] text-faint">{i + 1}</span>
              <span className="flex-1 text-[13.5px]">{n}</span>
              <Button size="sm" variant="ghost" onClick={() => onMakeTask(n)}>Make task</Button>
            </div>
          ))}
        </div>
      </PrepBlock>
    </Modal>
  );
}
