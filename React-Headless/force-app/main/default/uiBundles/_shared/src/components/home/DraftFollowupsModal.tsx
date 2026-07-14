import { useEffect, useState } from 'react';
import { Modal } from '../Modal';
import { Button } from '../Button';
import { GenLine } from './fields';
import { useToast } from '../Toast';
import { crmWrite } from '../../data/crmWriteClient';
import type { AiGenerateResult } from '../../data/aiGenerateClient';

export interface DraftRow {
  clientId?: string;
  clientName: string;
  subject: string;
  body: string;
}

interface EditableRow extends DraftRow {
  checked: boolean;
}

/**
 * Review-then-create follow-up drafts. Composed drafts come in via `drafts`;
 * `enrich` (optional) best-effort rewrites the bodies via Agentforce. The banker
 * edits subjects, unchecks any to skip, then "Create N tasks" writes a real
 * Task per checked row through crmWrite. Per-row try/catch → reports
 * created/failed counts, never a half-state.
 */
export function DraftFollowupsModal({
  open,
  onClose,
  drafts,
  enrich,
}: {
  open: boolean;
  onClose: () => void;
  drafts: DraftRow[];
  enrich?: () => Promise<AiGenerateResult>;
}) {
  const { toast } = useToast();
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [enriching, setEnriching] = useState(false);
  const [creating, setCreating] = useState(false);

  // Seed rows from composed drafts each time the modal OPENS. Keyed on `open`
  // only: `drafts` is rebuilt every parent render, so including it would reseed
  // (wiping the banker's edits and re-checking skipped rows) on any HomePage
  // re-render — a toast firing, speech toggling — while the modal is open.
  useEffect(() => {
    if (!open) return;
    setRows(drafts.map(d => ({ ...d, checked: true })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Best-effort enrichment: rewrite each body if Agentforce returns per-line text.
  useEffect(() => {
    if (!open || !enrich) return;
    let cancelled = false;
    setEnriching(true);
    enrich()
      .then(r => {
        if (cancelled || r.source !== 'model' || !r.text.trim()) return;
        const lines = r.text.split('\n').map(l => l.trim()).filter(Boolean);
        setRows(prev => prev.map((row, i) => (lines[i] ? { ...row, body: lines[i] } : row)));
      })
      .catch(() => {
        /* keep composed drafts */
      })
      .finally(() => {
        if (!cancelled) setEnriching(false);
      });
    return () => {
      cancelled = true;
    };
    // `enrich` is a fresh closure each parent render; key on `open` only so
    // enrichment runs once per open, not on every re-render (which would also
    // clobber edits made after the first enrichment landed).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const setSubject = (i: number, subject: string) =>
    setRows(prev => prev.map((r, idx) => (idx === i ? { ...r, subject } : r)));
  const toggle = (i: number) =>
    setRows(prev => prev.map((r, idx) => (idx === i ? { ...r, checked: !r.checked } : r)));

  const selected = rows.filter(r => r.checked);

  const create = async () => {
    setCreating(true);
    let created = 0;
    let failed = 0;
    for (const r of selected) {
      try {
        await crmWrite({
          action: 'task',
          subject: r.subject,
          description: r.body,
          whatId: r.clientId || undefined,
        });
        created += 1;
      } catch {
        failed += 1;
      }
    }
    setCreating(false);
    toast(
      failed ? `Created ${created}, ${failed} failed` : `Created ${created} follow-up task${created === 1 ? '' : 's'}`,
      failed ? 'Some writes failed — retry from the queue' : 'Tasks are on your activity list',
    );
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      tone="ai"
      wide
      icon={<span>✦</span>}
      title="Draft follow-ups"
      subtitle="Review and edit — nothing is created until you confirm"
      footer={
        <>
          <span className="flex-1 font-mono text-[10px] tracking-[0.04em] text-faint">{selected.length} selected</span>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="accent" onClick={() => void create()} disabled={creating || selected.length === 0}>
            {creating ? 'Creating…' : `Create ${selected.length} task${selected.length === 1 ? '' : 's'}`}
          </Button>
        </>
      }
    >
      {enriching && <GenLine>Refining drafts…</GenLine>}
      <div className="flex flex-col gap-2.5">
        {rows.map((r, i) => (
          <div key={`${r.clientName}-${i}`} className="rounded-[12px] border border-line bg-bg px-3.5 py-3">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={r.checked}
                onChange={() => toggle(i)}
                className="h-4 w-4 flex-none accent-[var(--wp-accent)]"
                aria-label={`Include ${r.clientName}`}
              />
              <span className="w-[150px] flex-none truncate text-[12.5px] font-semibold text-fg">{r.clientName}</span>
              <input
                value={r.subject}
                onChange={e => setSubject(i, e.target.value)}
                className="flex-1 rounded-[8px] border border-line bg-surface px-2.5 py-1.5 text-[13px] text-fg outline-none focus:border-accent-border"
              />
            </div>
            <p className="mt-2 pl-7 text-[12.5px] leading-relaxed text-muted">{r.body}</p>
          </div>
        ))}
        {rows.length === 0 && <p className="text-[13px] text-muted">No queued clients to follow up on.</p>}
      </div>
    </Modal>
  );
}
