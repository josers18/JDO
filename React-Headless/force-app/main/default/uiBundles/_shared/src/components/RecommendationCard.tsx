import clsx from 'clsx';
import { Button } from './Button';
import { Icon, type IconKey } from './iconMap';

export type RecommendationKind = 'task' | 'email' | 'call' | 'case';

export interface RecommendationCardItem {
  kind: RecommendationKind;
  objectLabel: string;
  title: string;
  body: string;
  evidence: string;
  clientName: string;
}

const KIND_ICON: Record<RecommendationKind, IconKey> = {
  task: 'task',
  email: 'email',
  call: 'call',
  case: 'alerts',
};
const KIND_LABEL: Record<RecommendationKind, string> = {
  task: 'Task',
  email: 'Email',
  call: 'Call',
  case: 'Case',
};
const KIND_CHIP: Record<RecommendationKind, string> = {
  task: 'bg-accent-bg text-accent',
  email: 'bg-ai-bg text-ai',
  call: 'bg-warn-bg text-warn',
  case: 'bg-risk-bg text-risk',
};

/**
 * A pre-drafted "Recommended action" card — kind glyph, object tag, title
 * (client name is clickable), body, the AI-cited evidence line, and the
 * Dismiss / Edit / Approve&execute controls. Presentational.
 */
export function RecommendationCard({
  rec,
  onOpenClient,
  onDismiss,
  onEdit,
  onApprove,
}: {
  rec: RecommendationCardItem;
  onOpenClient: () => void;
  onDismiss: () => void;
  onEdit: () => void;
  onApprove: () => void;
}) {
  // Render the client name inside the title as a link, when present.
  const idx = rec.clientName ? rec.title.indexOf(rec.clientName) : -1;
  const titleNode =
    idx >= 0 ? (
      <>
        {rec.title.slice(0, idx)}
        <button type="button" onClick={onOpenClient} className="text-accent hover:opacity-80">
          {rec.clientName}
        </button>
        {rec.title.slice(idx + rec.clientName.length)}
      </>
    ) : (
      rec.title
    );

  return (
    <div className="rounded-card border border-line bg-surface p-5 shadow-card transition hover:border-ai-border">
      <div className="mb-3 flex items-center gap-3">
        <span className={clsx('grid h-[34px] w-[34px] flex-none place-items-center rounded-[10px]', KIND_CHIP[rec.kind])}>
          <Icon name={KIND_ICON[rec.kind]} size={15} />
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">{KIND_LABEL[rec.kind]}</span>
        <span className="ml-auto border-b border-dotted border-faint font-mono text-[10px] tracking-[0.08em] text-faint">
          {rec.objectLabel}
        </span>
      </div>
      <h4 className="mb-1.5 text-[15.5px] font-semibold">{titleNode}</h4>
      <p className="mb-3 max-w-[80ch] text-[13.5px] text-muted">{rec.body}</p>
      <p className="mb-4 flex items-start gap-2 text-[12px] italic text-faint">
        <span className="not-italic text-ai">✦</span>
        {rec.evidence}
      </p>
      <div className="flex items-center gap-2.5">
        <Button size="sm" variant="ghost" onClick={onDismiss}>✕ Dismiss</Button>
        <Button size="sm" variant="ghost" onClick={onEdit}>Edit</Button>
        <span className="flex-1" />
        <Button size="sm" variant="accent" onClick={onApprove}>✓ Approve &amp; execute</Button>
      </div>
    </div>
  );
}
