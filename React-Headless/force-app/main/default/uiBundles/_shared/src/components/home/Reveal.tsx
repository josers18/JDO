import { useMemo, useState } from 'react';

/**
 * Progressive-reveal pagination for long lists. Shows the first `step` rows,
 * then reveals `step` more per "Show more" click, with a "Show less" collapse
 * back to the initial page. Keeps the command center from rendering a 4,700-row
 * schedule inline while never hiding data behind a hard cap — every row is one
 * click away.
 *
 * Returns the slice to render plus a small state bag the `<RevealFooter/>`
 * consumes. Reset happens implicitly: when `total` shrinks below the current
 * `shown` (e.g. a filter narrows the list), the slice just returns fewer rows;
 * the footer hides itself because `hasMore` is false.
 */
export function useReveal<T>(items: T[], step = 5) {
  const [shown, setShown] = useState(step);
  const visible = useMemo(() => items.slice(0, shown), [items, shown]);
  const hasMore = items.length > shown;
  const expanded = shown > step;
  return {
    visible,
    hasMore,
    expanded,
    total: items.length,
    shown: Math.min(shown, items.length),
    remaining: Math.max(0, items.length - shown),
    step,
    showMore: () => setShown(s => s + step),
    showAll: () => setShown(items.length),
    reset: () => setShown(step),
  };
}

export type RevealState = ReturnType<typeof useReveal>;

/**
 * The footer row for a revealed list: "Show N more" (+ "Show all") while more
 * remain, and "Show less" once expanded. Renders nothing when the whole list
 * already fits in the first page. Pass any `useReveal(...)` result.
 */
export function RevealFooter({ reveal, noun = 'more' }: { reveal: RevealState; noun?: string }) {
  if (!reveal.hasMore && !reveal.expanded) return null;
  return (
    <div className="flex items-center gap-3 border-t border-line px-5 py-2.5">
      {reveal.hasMore ? (
        <>
          <button
            type="button"
            onClick={reveal.showMore}
            className="font-mono text-[11px] uppercase tracking-[0.1em] text-accent transition hover:text-fg"
          >
            Show {Math.min(reveal.step, reveal.remaining)} {noun}
          </button>
          <button
            type="button"
            onClick={reveal.showAll}
            className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted transition hover:text-fg"
          >
            Show all {reveal.total}
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={reveal.reset}
          className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted transition hover:text-fg"
        >
          Show less
        </button>
      )}
      <span className="ml-auto font-mono text-[10.5px] uppercase tracking-[0.1em] text-faint">
        {reveal.shown} / {reveal.total}
      </span>
    </div>
  );
}
