import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Icon, type IconKey } from './iconMap';
import { useWorkspaceSelection } from './home/WorkspaceSelection';
import { useBrandOverride, useBrandName } from '../theme/activeBrand';

export interface CommandRailSection {
  id: string;
  label: string;
  icon: IconKey;
  count?: number;
  tone?: 'default' | 'warn' | 'risk' | 'ai';
}

/** A quick-access account pinned to the sidebar; clicking it selects the
 *  client into the workspace's right context panel. */
export interface CommandRailPinned {
  id?: string;
  name: string;
  sub?: string;
}

export interface CommandRailArcStep {
  label: string;
  time: string;
  state: 'done' | 'now' | 'todo';
}

const BADGE_TONE: Record<NonNullable<CommandRailSection['tone']>, string> = {
  default: 'bg-track text-muted',
  warn: 'bg-warn-bg text-warn',
  risk: 'bg-risk-bg text-risk',
  ai: 'bg-ai-bg text-ai',
};

/**
 * The signature command-center sidebar. A full-height sticky navigator with
 * live count badges, IntersectionObserver scroll-spy that highlights the
 * section in view, smooth-scroll on click, a collapse toggle, a "Today's arc"
 * footer, and a user chip. Persona-agnostic — the active accent comes from the
 * theme's `--wp-accent`.
 */
export function CommandRail({
  sections,
  arc,
  user,
}: {
  sections: CommandRailSection[];
  arc: CommandRailArcStep[];
  user: { name: string; sub: string };
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [active, setActive] = useState(sections[0]?.id ?? '');
  // Pinned accounts + selection both come from the shared bridge; the list is
  // owned there (seeded + persisted per persona) so pin/unpin stays live.
  const { selectClient, pinned, togglePin, requestNav } = useWorkspaceSelection();
  // Brand wordmark + logo come from the active theme (falls back to "Cumulus"
  // and the built-in conic mark when no custom brand is applied).
  const brand = useBrandOverride();
  const brandName = useBrandName();

  useEffect(() => {
    // The observed sections live in the main column and may not be in the DOM
    // yet on first mount (the page can still be loading), so retry briefly
    // until they appear.
    let observer: IntersectionObserver | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let tries = 0;
    const attach = () => {
      const els = sections
        .map(sec => document.getElementById(sec.id))
        .filter((el): el is HTMLElement => el != null);
      if (!els.length) {
        if (tries++ < 25) timer = setTimeout(attach, 200);
        return;
      }
      observer = new IntersectionObserver(
        entries => {
          entries.forEach(entry => {
            if (entry.isIntersecting) setActive(entry.target.id);
          });
        },
        { rootMargin: '-45% 0px -50% 0px' },
      );
      els.forEach(el => observer!.observe(el));
    };
    attach();
    return () => {
      if (timer) clearTimeout(timer);
      observer?.disconnect();
    };
  }, [sections]);

  const go = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      // Classic view (and cockpit sections that still have an on-page anchor):
      // scroll to it.
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActive(id);
    } else {
      // Cockpit view: the section's content lives in a drill-in modal, not an
      // on-page anchor. Raise the nav intent; HomePage opens the matching modal.
      requestNav(id);
    }
  };

  return (
    <aside
      className="sticky top-0 z-10 flex h-screen flex-col gap-4 border-r border-line bg-surface-glass px-3.5 py-5 backdrop-blur transition-[width] duration-300"
      style={{ width: collapsed ? 74 : 264 }}
    >
      <button
        type="button"
        aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        onClick={() => setCollapsed(c => !c)}
        className="absolute -right-3 top-6 z-20 grid h-[22px] w-[22px] place-items-center rounded-full border border-line-strong bg-surface text-[11px] text-muted transition hover:border-accent-border hover:text-fg"
      >
        {collapsed ? '›' : '‹'}
      </button>

      {/* Brand — logo + wordmark come from the active theme. A custom brand
          swaps in its fetched logo and name; baseline shows the conic mark +
          "Cumulus". */}
      <div className="flex min-h-[34px] items-center gap-3 px-2">
        {brand?.logoBase64 ? (
          <img
            src={`data:image/png;base64,${brand.logoBase64}`}
            alt=""
            aria-hidden="true"
            className="h-8 w-8 flex-none rounded-[9px] object-contain"
            style={{ boxShadow: '0 0 14px var(--wp-accent)' }}
          />
        ) : (
          <span
            aria-hidden="true"
            className="relative h-8 w-8 flex-none rounded-[9px]"
            style={{
              // Baseline + fixed Dark/Light defaults (which carry `mode`) keep
              // the signature conic mark; only a CUSTOM brand (no `mode`) with
              // no fetched logo falls back to its themed accent gradient.
              background:
                brand && !brand.mode
                  ? 'var(--wp-gradient)'
                  : 'conic-gradient(from 210deg, #14b8a6, #4f8dff, #7c6cff, #14b8a6)',
            }}
          >
            <span className="absolute inset-[5px] rounded-[5px] bg-surface" />
          </span>
        )}
        {!collapsed && (
          <span className="min-w-0">
            <b className="block truncate text-[15px] font-bold tracking-tight">{brandName}</b>
            <span className="block font-mono text-[9.5px] uppercase tracking-[0.16em] text-faint">Command Center</span>
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
        {!collapsed && (
          <div className="px-3 pb-1.5 pt-3 font-mono text-[9.5px] uppercase tracking-[0.16em] text-faint">Sections</div>
        )}
        {sections.map(sec => {
          const isActive = active === sec.id;
          return (
            <button
              key={sec.id}
              type="button"
              onClick={() => go(sec.id)}
              title={sec.label}
              className={clsx(
                'relative flex items-center gap-3 rounded-[11px] px-3 py-2.5 text-[13.5px] font-medium transition',
                collapsed && 'justify-center px-0',
                isActive ? 'bg-accent-bg text-fg' : 'text-muted hover:bg-surface-muted hover:text-fg',
              )}
            >
              {isActive && (
                <span aria-hidden="true" className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r-[3px] bg-accent" />
              )}
              <span className="grid w-5 flex-none place-items-center">
                <Icon name={sec.icon} size={16} />
              </span>
              {!collapsed && <span className="flex-1 truncate text-left">{sec.label}</span>}
              {sec.count != null && (
                <span
                  className={clsx(
                    'flex-none rounded-full font-mono text-[10.5px] font-semibold',
                    collapsed ? 'absolute right-2 top-1 grid h-4 min-w-4 place-items-center px-1 text-[9px]' : 'px-1.5 py-0.5',
                    BADGE_TONE[sec.tone ?? 'default'],
                  )}
                >
                  {sec.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Pinned accounts — quick jump into the right context panel. Pinning is
          driven from the client panel (togglePin); each row can be unpinned via
          the × that appears on hover. */}
      {!collapsed && pinned.length > 0 && (
        <div className="border-t border-line pt-3.5">
          <h4 className="mb-2 px-2 font-mono text-[9.5px] uppercase tracking-[0.16em] text-faint">Pinned accounts</h4>
          <div className="flex flex-col gap-0.5">
            {pinned.map(p => (
              <div
                key={p.id ?? p.name}
                className="group flex items-center gap-2.5 rounded-[10px] px-2 py-1.5 transition hover:bg-surface-muted"
              >
                <button
                  type="button"
                  onClick={() => selectClient(p.name, p.id)}
                  title={`Open ${p.name}`}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                >
                  <span className="grid h-6 w-6 flex-none place-items-center rounded-[7px] bg-accent-bg text-[10px] font-bold text-accent">
                    {p.name.trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium text-fg">{p.name}</span>
                    {p.sub && <span className="block truncate text-[10.5px] text-faint">{p.sub}</span>}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => togglePin(p)}
                  title={`Unpin ${p.name}`}
                  aria-label={`Unpin ${p.name}`}
                  className="grid h-5 w-5 flex-none place-items-center rounded-[6px] text-[12px] leading-none text-faint opacity-0 transition hover:bg-risk-bg hover:text-risk group-hover:opacity-100"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Today's arc */}
      {!collapsed && (
        <div className="border-t border-line pt-3.5">
          <h4 className="mb-2.5 px-2 font-mono text-[9.5px] uppercase tracking-[0.16em] text-faint">Today's arc</h4>
          <div className="flex flex-col gap-0.5">
            {arc.map((step, i) => (
              <div
                key={`${step.label}-${i}`}
                className={clsx(
                  'flex items-center gap-2.5 px-2 py-1.5 text-[12px]',
                  step.state === 'now' ? 'text-fg' : 'text-muted',
                )}
              >
                <span
                  aria-hidden="true"
                  className={clsx(
                    'h-[9px] w-[9px] flex-none rounded-full border-2',
                    step.state === 'done' && 'border-accent bg-accent',
                    step.state === 'now' && 'border-warn bg-warn shadow-[0_0_0_4px_var(--wp-warn-bg)]',
                    step.state === 'todo' && 'border-faint',
                  )}
                />
                <span className="flex-1 truncate">{step.label}</span>
                <span className="font-mono text-[10px] text-faint">{step.time}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* User chip */}
      <div className={clsx('flex items-center gap-3 rounded-[12px] bg-surface-muted p-2', collapsed && 'justify-center')}>
        <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-[9px] bg-gradient-ai text-[13px] font-bold text-white">
          {user.name.trim().charAt(0).toUpperCase() || '?'}
        </span>
        {!collapsed && (
          <span className="min-w-0">
            <b className="block truncate text-[13px] font-semibold">{user.name}</b>
            <small className="block truncate text-[11px] text-faint">{user.sub}</small>
          </span>
        )}
      </div>
    </aside>
  );
}
