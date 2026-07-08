import { useEffect, useRef, useState } from 'react';
import { lexAppUrl, personaAppUrl, currentPersonaDevName } from '../data/orgEnv';

/**
 * Waffle / App Launcher for the React shell.
 *
 * A UI bundle renders standalone at the App Domain (no native LEX chrome), so
 * this reproduces the waffle: it switches between the sibling React persona
 * bundles (same App Domain origin) and deep-links to native org apps (core
 * origin). All org links are real `<a target="_top">` anchors — scripted
 * redirects out of the App Domain are browser-blocked.
 *
 * "Open App Launcher" is the escape hatch to the org's full, permission-aware
 * app list, so we don't have to hardcode the entire catalog here.
 */

interface AppLink {
  label: string;
  /** CustomApplication API name for the LEX deep link. */
  appName: string;
}

/** The three React persona bundles (App Domain origin). */
const PERSONA_APPS: { label: string; devName: string }[] = [
  { label: 'React Retail', devName: 'ReactRetail' },
  { label: 'React Wealth', devName: 'ReactWealth' },
  { label: 'React Commercial', devName: 'ReactCommercial' },
];

/** High-traffic native org apps (core origin). Curated — the full,
 *  permission-aware catalog is one click away via "Open App Launcher". */
const ORG_APPS: AppLink[] = [
  { label: 'Sales', appName: 'SDO_Sales_App' },
  { label: 'Sales Console', appName: 'SDO_Sales_Console' },
  { label: 'Service Console', appName: 'SDO_Service_Console' },
  { label: 'Marketing', appName: 'SDO_Marketing_App' },
  { label: 'Analytics Studio', appName: 'Insights' },
  { label: 'Data Manager', appName: 'DataManager' },
];

export function AppLauncher() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const activePersona = currentPersonaDevName();

  // Close on outside-click / Escape.
  useEffect(() => {
    if (!open) return;
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
          <a
            href={lexAppUrl('AppLauncher')}
            target="_top"
            style={{ ...launcherLink, fontWeight: 700, color: 'var(--wp-accent)' }}
          >
            Open App Launcher →
          </a>

          <SectionLabel>Cumulus Cockpits</SectionLabel>
          {PERSONA_APPS.map(p => {
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
                {p.label}
                {isActive && <span style={{ marginLeft: 'auto', fontSize: '0.72rem' }}>current</span>}
              </a>
            );
          })}

          <SectionLabel>Salesforce Apps</SectionLabel>
          {ORG_APPS.map(a => (
            <a key={a.appName} href={lexAppUrl(a.appName)} target="_top" style={launcherLink}>
              {a.label}
            </a>
          ))}
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
