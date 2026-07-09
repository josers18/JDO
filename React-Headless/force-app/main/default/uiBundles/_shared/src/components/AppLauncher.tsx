import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Landmark, Building2, Briefcase, Gem, ShieldCheck, Bot, Sparkles, FlaskConical,
  TrendingUp, Database, Cloud, LayoutGrid, BarChart3, Table2, Megaphone,
  CalendarClock, MapPin, Award, FileText, MessageSquare, Boxes,
  type LucideIcon,
} from 'lucide-react';
import { lexAppUrl, lexHomeUrl, personaAppUrl, currentPersonaDevName } from '../data/orgEnv';

/**
 * Waffle / App Launcher for the React shell.
 *
 * A UI bundle renders standalone at the App Domain (no native LEX chrome), so
 * this reproduces the waffle: it switches between the sibling React persona
 * bundles (same App Domain origin) and deep-links to native org apps (core
 * origin). All org links are real `<a target="_top">` anchors — scripted
 * redirects out of the App Domain are browser-blocked.
 *
 * "Open in Salesforce" is the escape hatch to the org's full, permission-aware
 * app list, so we don't have to hardcode the entire catalog here.
 *
 * ICONS: the native launcher paints each app's real logo, but those assets
 * (`/logos/app/...`) are auth-gated on the CORE origin — a plain <img> from the
 * App Domain 302s to login and fails. So instead of unreliable native logos we
 * render each app as a lucide glyph on a category-tinted rounded tile, which
 * reproduces the colorful-tile look with zero cross-origin/auth risk.
 */

/** Category drives the tile tint, so related apps read as a color family. */
type Category = 'banking' | 'ai' | 'data' | 'core';

interface AppLink {
  label: string;
  /**
   * `AppDefinition.DurableId` (prefix `06m…`) — the ONLY app identifier LEX's
   * router resolves for `/lightning/app/<id>` (same token the native waffle
   * uses). DeveloperName / ApplicationId silently fall back to Home. See
   * `lexAppUrl` in orgEnv.ts. Query: `SELECT DurableId, DeveloperName FROM
   * AppDefinition`.
   */
  durableId: string;
  icon: LucideIcon;
  category: Category;
}

/** Category → tile foreground/background tint (SLDS-ish, works on glass). */
const CATEGORY_TINT: Record<Category, { fg: string; bg: string }> = {
  banking: { fg: '#1b73e8', bg: 'rgba(27,115,232,0.14)' },
  ai: { fg: '#d4188a', bg: 'rgba(212,24,138,0.13)' }, // pink = the AI accent
  data: { fg: '#7c3aed', bg: 'rgba(124,58,237,0.13)' },
  core: { fg: '#0b827c', bg: 'rgba(11,130,124,0.14)' },
};

/** The three React persona bundles (App Domain origin). */
const PERSONA_APPS: { label: string; devName: string }[] = [
  { label: 'React Retail', devName: 'ReactRetail' },
  { label: 'React Wealth', devName: 'ReactWealth' },
  { label: 'React Commercial', devName: 'ReactCommercial' },
];

/** Native org apps (core origin), keyed by `AppDefinition.DurableId` (`06m…`)
 *  — the identifier LEX's router resolves and the native waffle links to.
 *  Harvested live from jdo-1lrnov (2026-07-08); labels match what the org's own
 *  App Launcher shows. Bare DeveloperName / ApplicationId do NOT work here (they
 *  silently redirect to Home — the "invalid or inaccessible" bug). The full,
 *  permission-aware catalog is one click away via "Open in Salesforce". */
const ORG_APPS: AppLink[] = [
  // Banking / FSC consoles (the demo's primary cockpits)
  { label: 'Retail Banking Console', durableId: '06mam000002JhGVAA0', icon: Landmark, category: 'banking' },
  { label: 'Retail Banking', durableId: '06mam000002JhGZAA0', icon: Landmark, category: 'banking' },
  { label: 'Banking - Console', durableId: '06mam000002JhElAAK', icon: Landmark, category: 'banking' },
  { label: 'Commercial Banking', durableId: '06mam000002Jjl4AAC', icon: Building2, category: 'banking' },
  { label: 'Commercial Banking Console', durableId: '06mam000002JhGWAA0', icon: Building2, category: 'banking' },
  { label: 'Commercial Banking - Sales', durableId: '06mam000002JhEmAAK', icon: Briefcase, category: 'banking' },
  { label: 'Commercial Banking - Treasury', durableId: '06mam000002JhEnAAK', icon: Briefcase, category: 'banking' },
  { label: 'Wealth Management - Console', durableId: '06mam000004LE8vAAG', icon: Gem, category: 'banking' },
  { label: 'Insurance Console', durableId: '06mam000002JhGaAAK', icon: ShieldCheck, category: 'banking' },
  // Agentforce / AI
  { label: 'Agentforce Studio', durableId: '06mam000005cVazAAE', icon: Bot, category: 'ai' },
  { label: 'Agentforce Grid', durableId: '06mam000005cVb0AAE', icon: LayoutGrid, category: 'ai' },
  { label: 'Agent Creator', durableId: '06mam000003sBuPAAU', icon: Bot, category: 'ai' },
  { label: 'Einstein GPT', durableId: '06mam000002JhGhAAK', icon: Sparkles, category: 'ai' },
  { label: 'Einstein Playground', durableId: '06mam000002JhG0AAK', icon: Sparkles, category: 'ai' },
  { label: 'Prediction Builder', durableId: '06mam000002JhG9AAK', icon: TrendingUp, category: 'ai' },
  // Data + analytics
  { label: 'Data Cloud', durableId: '06mam000002JhF6AAK', icon: Database, category: 'data' },
  { label: 'Customer Data Cloud', durableId: '06mam000003XF6bAAG', icon: Cloud, category: 'data' },
  { label: 'Data Manager', durableId: '06mam000002JhFsAAK', icon: FlaskConical, category: 'data' },
  { label: 'Tableau Next', durableId: '06mam000003m5q5AAA', icon: Table2, category: 'data' },
  { label: 'Analytics Studio', durableId: '06mam000002JhFrAAK', icon: BarChart3, category: 'data' },
  // Core clouds
  { label: 'Sales', durableId: '06mam000002JhFuAAK', icon: TrendingUp, category: 'core' },
  { label: 'Sales - Console', durableId: '06mam000002JhFvAAK', icon: TrendingUp, category: 'core' },
  { label: 'Sales Engagement', durableId: '06mam000002JhFyAAK', icon: Megaphone, category: 'core' },
  { label: 'Service Console', durableId: '06mam000002JhFcAAK', icon: MessageSquare, category: 'core' },
  { label: 'Service - Console', durableId: '06mam000002JhEpAAK', icon: MessageSquare, category: 'core' },
  { label: 'Field Service', durableId: '06mam000002JhFoAAK', icon: MapPin, category: 'core' },
  { label: 'Marketing', durableId: '06mam000002JhG6AAK', icon: Megaphone, category: 'core' },
  { label: 'Salesforce Scheduler', durableId: '06mam000002JhG5AAK', icon: CalendarClock, category: 'core' },
  { label: 'Salesforce Maps', durableId: '06mam000002JhFxAAK', icon: MapPin, category: 'core' },
  { label: 'Loyalty Management', durableId: '06mam000002JhFSAA0', icon: Award, category: 'core' },
  { label: 'Salesforce CPQ', durableId: '06mam000002JhGBAA0', icon: FileText, category: 'core' },
  { label: 'Digital Experiences', durableId: '06mam000002JhFDAA0', icon: Boxes, category: 'core' },
  { label: 'Chatter', durableId: '06mam000002JhFAAA0', icon: MessageSquare, category: 'core' },
];

export function AppLauncher() {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const activePersona = currentPersonaDevName();

  // Case-insensitive substring filter across both sections.
  const q = filter.trim().toLowerCase();
  const personas = useMemo(
    () => (q ? PERSONA_APPS.filter(p => p.label.toLowerCase().includes(q)) : PERSONA_APPS),
    [q],
  );
  const orgApps = useMemo(
    () => (q ? ORG_APPS.filter(a => a.label.toLowerCase().includes(q)) : ORG_APPS),
    [q],
  );

  // Close on outside-click / Escape; reset the filter when the menu closes.
  useEffect(() => {
    if (!open) {
      setFilter('');
      return;
    }
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        aria-label="App Launcher"
        aria-haspopup="menu"
        aria-expanded={open}
        title="App Launcher"
        onClick={() => setOpen(o => !o)}
        style={{
          width: 34,
          height: 34,
          borderRadius: 'var(--wp-radius-sm)',
          border: '1px solid var(--wp-border)',
          background: open ? 'color-mix(in srgb, var(--wp-accent) 12%, transparent)' : 'transparent',
          color: 'var(--wp-text-muted)',
          cursor: 'pointer',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <Waffle />
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            width: 300,
            zIndex: 60,
            background: 'var(--wp-surface-glass-strong)',
            border: '1px solid var(--wp-border)',
            borderRadius: 'var(--wp-radius)',
            boxShadow: 'var(--wp-shadow, 0 12px 32px rgba(0,0,0,0.18))',
            backdropFilter: 'blur(18px)',
            WebkitBackdropFilter: 'blur(18px)',
            padding: '0.6rem',
            maxHeight: '70vh',
            overflowY: 'auto',
          }}
        >
          <input
            autoFocus
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Search apps…"
            aria-label="Search apps"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              background: 'var(--wp-surface)',
              border: '1px solid var(--wp-border)',
              borderRadius: 999,
              padding: '0.45rem 0.85rem',
              marginBottom: '0.4rem',
              color: 'var(--wp-text)',
              fontSize: '0.84rem',
              outline: 'none',
            }}
          />

          <a
            href={lexHomeUrl()}
            target="_top"
            style={{ ...launcherLink, fontWeight: 700, color: 'var(--wp-accent)' }}
          >
            Open in Salesforce →
          </a>

          {personas.length > 0 && <SectionLabel>Cumulus Cockpits</SectionLabel>}
          {personas.map(p => {
            const isActive = activePersona?.toLowerCase() === p.devName.toLowerCase();
            return (
              <a
                key={p.devName}
                href={personaAppUrl(p.devName)}
                target="_top"
                aria-current={isActive ? 'page' : undefined}
                style={{
                  ...launcherLink,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? 'var(--wp-accent)' : 'var(--wp-text)',
                  background: isActive ? 'color-mix(in srgb, var(--wp-accent) 10%, transparent)' : 'transparent',
                }}
              >
                <Tile icon={Sparkles} category="ai" />
                {p.label}
                {isActive && <span style={{ marginLeft: 'auto', fontSize: '0.72rem' }}>current</span>}
              </a>
            );
          })}

          {orgApps.length > 0 && <SectionLabel>Salesforce Apps</SectionLabel>}
          {orgApps.map(a => (
            <a key={a.durableId} href={lexAppUrl(a.durableId)} target="_top" style={launcherLink}>
              <Tile icon={a.icon} category={a.category} />
              {a.label}
            </a>
          ))}

          {personas.length === 0 && orgApps.length === 0 && (
            <div style={{ padding: '0.7rem 0.65rem', fontSize: '0.82rem', color: 'var(--wp-text-muted)' }}>
              No apps match “{filter.trim()}”. Try{' '}
              <a href={lexHomeUrl()} target="_top" style={{ color: 'var(--wp-accent)' }}>
                the full org
              </a>
              .
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const launcherLink: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.5rem 0.65rem',
  borderRadius: 'var(--wp-radius-sm)',
  textDecoration: 'none',
  color: 'var(--wp-text)',
  fontSize: '0.86rem',
};

/** Colored rounded-square app tile — lucide glyph on a category tint, echoing
 *  the native App Launcher's colorful logos without cross-origin auth risk. */
function Tile({ icon: Glyph, category }: { icon: LucideIcon; category: Category }) {
  const { fg, bg } = CATEGORY_TINT[category];
  return (
    <span
      aria-hidden="true"
      style={{
        width: 30,
        height: 30,
        flexShrink: 0,
        borderRadius: 8,
        background: bg,
        color: fg,
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <Glyph size={17} strokeWidth={2} />
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: '0.66rem',
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--wp-text-faint)',
        padding: '0.6rem 0.65rem 0.3rem',
      }}
    >
      {children}
    </div>
  );
}

/** 3×3 dot grid — the universal waffle glyph. */
function Waffle() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" fill="currentColor">
      {[3, 9, 15].flatMap(y => [3, 9, 15].map(x => <circle key={`${x}-${y}`} cx={x} cy={y} r={1.7} />))}
    </svg>
  );
}
