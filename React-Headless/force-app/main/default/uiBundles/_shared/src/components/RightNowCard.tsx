import { Button } from './Button';

export interface RightNowCardItem {
  clientName: string;
  headline: string;
  detail: string;
}

/**
 * The "Right now · your first move" card that anchors the hero. Violet-framed
 * (AI-surfaced) with the persona-accent action to schedule the move.
 * Presentational — callbacks are wired by the page.
 */
export function RightNowCard({
  item,
  onPrep,
  onSchedule,
  onSnooze,
  onQuickView,
}: {
  item: RightNowCardItem;
  onPrep: () => void;
  onSchedule: () => void;
  onSnooze: () => void;
  onQuickView: () => void;
}) {
  return (
    <div className="relative flex flex-col overflow-hidden rounded-[20px] border border-ai-border bg-surface-glass p-[22px] shadow-card">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-10 h-[140px] w-[140px] rounded-full bg-ai-bg blur-2xl"
      />
      <div className="relative flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ai">
        <span className="h-1.5 w-1.5 rounded-full bg-ai" />
        Right now · your first move
      </div>
      <h3 className="relative mt-3 font-display text-[20px] font-medium leading-[1.25]">{item.headline}</h3>
      <p className="relative mb-4 mt-2 text-[13px] text-muted">
        {item.detail}{' '}
        <button
          type="button"
          onClick={onQuickView}
          className="border-b border-accent-border text-accent hover:opacity-80"
        >
          Open 360
        </button>
      </p>
      <div className="relative mt-auto flex flex-wrap gap-2.5">
        <Button variant="ai" onClick={onPrep}>✦ Prep me</Button>
        <Button variant="accent" onClick={onSchedule}>Schedule call</Button>
        <Button variant="ghost" onClick={onSnooze}>Snooze</Button>
      </div>
    </div>
  );
}
