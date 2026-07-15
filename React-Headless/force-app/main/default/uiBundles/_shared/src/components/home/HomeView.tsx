import { createContext, useContext, useState, type ReactNode } from 'react';

/**
 * Home layout mode. "current" = the classic stacked sections; "cockpit" = a
 * compact, column-dense grid. The two views render the SAME section bodies —
 * only the arrangement differs.
 */
export type HomeView = 'current' | 'cockpit';

interface HomeViewCtx {
  view: HomeView;
  setView: (v: HomeView) => void;
}

const Ctx = createContext<HomeViewCtx | null>(null);

/**
 * Lifts the Current/Cockpit selection ABOVE the router so it can be driven from
 * app chrome (the top bar) while the page content reads it. Wrap the layout
 * (`<HomeViewProvider persona="retail"><AppShell …>`) so both the header slot
 * that renders `<HomeViewToggle/>` and the `<Outlet/>` page share one source of
 * truth.
 *
 * The choice is persisted per-persona in sessionStorage — it survives a refresh
 * but doesn't leak across browser sessions; a locked-down browser degrades to
 * the default rather than throwing.
 */
export function HomeViewProvider({
  persona,
  defaultView = 'current',
  children,
}: {
  persona: string;
  defaultView?: HomeView;
  children: ReactNode;
}) {
  const storageKey = `home-view-${persona}`;
  const [view, setViewState] = useState<HomeView>(() => {
    try {
      return (sessionStorage.getItem(storageKey) as HomeView) || defaultView;
    } catch {
      return defaultView;
    }
  });
  const setView = (v: HomeView) => {
    setViewState(v);
    try {
      sessionStorage.setItem(storageKey, v);
    } catch {
      /* sessionStorage unavailable — keep the in-memory choice, skip persistence */
    }
  };
  return <Ctx.Provider value={{ view, setView }}>{children}</Ctx.Provider>;
}

/** Read the current home view. Throws if used outside a `HomeViewProvider`. */
export function useHomeView(): HomeViewCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useHomeView must be used within a HomeViewProvider');
  return ctx;
}

const VIEWS: { key: HomeView; label: string }[] = [
  { key: 'current', label: 'Current' },
  { key: 'cockpit', label: 'Cockpit' },
];

/**
 * The segmented Current/Cockpit control, sized to sit in the app top bar. Reads
 * and writes the shared view via context, so it can live in chrome while the
 * page it controls lives under the router.
 */
export function HomeViewToggle() {
  const { view, setView } = useHomeView();
  return (
    <div className="inline-flex items-center rounded-full border border-line bg-surface p-0.5 shadow-card">
      {VIEWS.map(v => (
        <button
          key={v.key}
          type="button"
          onClick={() => setView(v.key)}
          aria-pressed={view === v.key}
          className={`rounded-full px-3.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.12em] transition ${
            view === v.key ? 'bg-fg text-bg' : 'text-muted hover:text-fg'
          }`}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}
