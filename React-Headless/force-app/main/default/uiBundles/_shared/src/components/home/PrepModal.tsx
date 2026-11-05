import { useEffect, useState } from 'react';
import { Modal } from '../Modal';
import { Button } from '../Button';
import { FactTile, PrepBlock, GenLine } from './fields';
import type { ClientProfile } from './types';
import { runPromptFlow, stripHtml, type PromptFlow } from '../../data/promptClient';

type RecapSource = 'agentforce' | 'live' | null;

/**
 * Prep sheet — the client's real facts, recap, talk track and next-best
 * actions from the selection's live data, with the recap enriched by an
 * Agentforce prompt flow when one is wired. Nothing is filled with generic
 * placeholder copy: a missing section is omitted, and a recap that neither the
 * live data nor the flow could produce shows an unavailable state with Retry.
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
  const facts = profile?.facts ?? [];
  const talk = profile?.talk;
  const nba = profile?.nba ?? [];
  const liveRecap = profile?.recap?.trim() || '';

  const [aiRecap, setAiRecap] = useState('');
  const [enriching, setEnriching] = useState(false);
  const [flowFailed, setFlowFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open || !promptFlow || !clientId) return;
    let cancelled = false;
    setEnriching(true);
    setFlowFailed(false);
    runPromptFlow(promptFlow, clientId)
      .then(raw => {
        if (cancelled) return;
        const clean = stripHtml(raw);
        if (clean) setAiRecap(clean);
        else setFlowFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFlowFailed(true);
      })
      .finally(() => {
        if (!cancelled) setEnriching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, promptFlow, clientId, attempt]);

  const recap = aiRecap || liveRecap;
  const recapSource: RecapSource = aiRecap ? 'agentforce' : liveRecap ? 'live' : null;
  const canRetry = Boolean(promptFlow && clientId);
  const attribution =
    recapSource === 'agentforce' ? 'Recap via Agentforce prompt flow'
    : recapSource === 'live' ? 'Recap from live CRM · Data Cloud data'
    : enriching ? 'Generating recap…'
    : 'Recap unavailable';

  return (
    <Modal
      open={open}
      onClose={onClose}
      tone="ai"
      icon={<span>✦</span>}
      title={`Prep sheet · ${clientName}`}
      subtitle="From CRM · Data Cloud · recent activity"
      footer={
        <>
          <span className="flex-1 font-mono text-[10px] tracking-[0.04em] text-faint">{attribution}</span>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button variant="accent" onClick={onSchedule}>Schedule call</Button>
        </>
      }
    >
      {enriching && <GenLine>Synthesizing relationship history…</GenLine>}
      {facts.length > 0 && (
        <div className="mb-5 grid grid-cols-2 gap-2.5">
          {facts.map(([label, value]) => (
            <FactTile key={label} label={label} value={value} />
          ))}
        </div>
      )}
      <PrepBlock title="Relationship recap">
        {recap ? (
          <>
            <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-fg">{recap}</p>
            {recapSource === 'live' && flowFailed && canRetry && (
              <div className="mt-2 flex items-center gap-3 text-[12px] text-muted">
                <span>Agentforce summary didn't return; showing the live-data recap.</span>
                <Button size="sm" variant="ghost" onClick={() => setAttempt(a => a + 1)}>Retry</Button>
              </div>
            )}
          </>
        ) : enriching ? null : (
          <div className="flex items-center gap-3 rounded-[12px] border border-dashed border-line px-3.5 py-3 text-[13px] text-muted">
            <span className="flex-1">
              {canRetry
                ? "The relationship recap couldn't be generated right now."
                : 'No relationship recap is available for this client.'}
            </span>
            {canRetry && (
              <Button size="sm" variant="ghost" onClick={() => setAttempt(a => a + 1)}>Retry</Button>
            )}
          </div>
        )}
      </PrepBlock>
      {talk && (
        <PrepBlock title="Suggested talk track">
          <p className="text-[13.5px] leading-relaxed text-fg">{talk}</p>
        </PrepBlock>
      )}
      <PrepBlock title="Next best actions">
        {nba.length > 0 ? (
          <div className="flex flex-col gap-2">
            {nba.map((n, i) => (
              <div key={n} className="flex items-center gap-3 rounded-[12px] border border-line bg-bg px-3.5 py-3">
                <span className="w-[18px] font-mono text-[11px] text-faint">{i + 1}</span>
                <span className="flex-1 text-[13.5px]">{n}</span>
                <Button size="sm" variant="ghost" onClick={() => onMakeTask(n)}>Make task</Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-muted">No next-best actions on record for this client.</p>
        )}
      </PrepBlock>
    </Modal>
  );
}
