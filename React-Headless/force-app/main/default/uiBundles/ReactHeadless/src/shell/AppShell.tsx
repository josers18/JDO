import { useState, type ReactNode } from 'react';
import { AgentforceChat } from '@shared';

/** Cumulus Assistant — the main Agentforce agent in jdo-1lrnov. */
const CUMULUS_AGENT_ID = '0Xxam000000tfCDCAY';

export interface NavItem {
  id: string;
  label: string;
  icon: string;
  active?: boolean;
  onClick?: () => void;
}

interface AppShellProps {
  nav: NavItem[];
  /** breadcrumb / page title shown in the top bar */
  title: string;
  /** optional right-of-title slot (e.g. persona pill) */
  titleAside?: ReactNode;
  children: ReactNode;
}

/**
 * Full-page application shell — fixed left nav rail + sticky top bar (global
 * search, Agentforce launcher, notifications, user) + scrollable content.
 * This is the seamless full-app frame the cockpit lives inside.
 *
 * The Agentforce button here is the NATIVE header entry point (mirrors the
 * in-org `sentos_common-ask-agentforce-button`) — no floating dock.
 */
export function AppShell({ nav, title, titleAside, children }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState('');
  const railW = collapsed ? 64 : 232;

  return (
    <div style={{ position: 'relative', minHeight: '100vh', background: 'var(--wp-surface)', color: 'var(--wp-text)', display: 'flex' }}>
      {/* AURORA WASH — one ambient gradient behind the whole app */}
      <div aria-hidden="true" style={{ position: 'fixed', inset: 0, background: 'var(--wp-aurora)', pointerEvents: 'none', zIndex: 0 }} />
      {/* LEFT NAV RAIL */}
      <aside
        style={{
          width: railW,
          flexShrink: 0,
          zIndex: 1,
          background: 'var(--wp-surface-glass)',
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
          borderRight: '1px solid var(--wp-border-strong)',
          display: 'flex',
          flexDirection: 'column',
          position: 'sticky',
          top: 0,
          height: '100vh',
          transition: 'width 0.18s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '1rem 1.1rem', height: 60 }}>
          <span
            aria-hidden="true"
            style={{ width: 28, height: 28, borderRadius: 9, background: 'var(--wp-gradient)', flexShrink: 0, boxShadow: '0 0 14px var(--wp-accent)' }}
          />
          {!collapsed && <span style={{ fontWeight: 800, fontSize: '1.05rem', letterSpacing: '-0.01em' }}>Cumulus</span>}
        </div>

        <nav style={{ flex: 1, padding: '0.5rem', display: 'grid', gap: '0.15rem', alignContent: 'start' }}>
          {nav.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              title={item.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.8rem',
                padding: '0.6rem 0.75rem',
                borderRadius: 'var(--wp-radius-sm)',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: '0.9rem',
                fontWeight: item.active ? 700 : 500,
                color: item.active ? 'var(--wp-accent)' : 'var(--wp-text-muted)',
                background: item.active ? 'color-mix(in srgb, var(--wp-accent) 12%, transparent)' : 'transparent',
              }}
            >
              <span aria-hidden="true" style={{ fontSize: '1.05rem', width: 20, textAlign: 'center', flexShrink: 0 }}>
                {item.icon}
              </span>
              {!collapsed && <span>{item.label}</span>}
            </button>
          ))}
        </nav>

        <button
          type="button"
          onClick={() => setCollapsed(c => !c)}
          aria-label="Toggle navigation"
          style={{ margin: '0.5rem', padding: '0.5rem', borderRadius: 'var(--wp-radius-sm)', border: '1px solid var(--wp-border)', background: 'transparent', color: 'var(--wp-text-muted)', cursor: 'pointer' }}
        >
          {collapsed ? '»' : '«'}
        </button>
      </aside>

      {/* MAIN COLUMN */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1 }}>
        {/* TOP BAR */}
        <header
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 30,
            height: 60,
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            padding: '0 1.25rem',
            background: 'var(--wp-surface-glass-strong)',
            borderBottom: '1px solid var(--wp-border)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', minWidth: 0 }}>
            <span style={{ fontWeight: 800, fontSize: '1.05rem', whiteSpace: 'nowrap' }}>{title}</span>
            {titleAside}
          </div>

          <div
            style={{
              marginLeft: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              flex: 1,
              maxWidth: 440,
              background: 'var(--wp-surface)',
              border: '1px solid var(--wp-border)',
              borderRadius: 999,
              padding: '0.45rem 0.9rem',
              color: 'var(--wp-text-faint)',
            }}
          >
            <span aria-hidden="true">⌕</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search clients, accounts, insights…"
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--wp-text)', fontSize: '0.86rem' }}
            />
            <span style={{ fontSize: '0.7rem', border: '1px solid var(--wp-border)', borderRadius: 5, padding: '0 0.3rem' }}>⌘K</span>
          </div>

          {/* The pink AI entry point is the Agentforce Conversation Client's
              own floating FAB (mounted below via <AgentforceChat/>), so the
              header no longer carries a duplicate Agentforce button. */}

          <button type="button" aria-label="Notifications" style={iconBtn}>
            <span aria-hidden="true">🔔</span>
          </button>
          <div
            style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--wp-gradient)', color: 'var(--wp-on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.8rem' }}
          >
            AM
          </div>
        </header>

        <main style={{ flex: 1, padding: '1.5rem', maxWidth: 1600, width: '100%', margin: '0 auto' }}>{children}</main>
      </div>

      {/* Real Agentforce chat (Lightning Out 2.0) — self-managed pink FAB. */}
      <AgentforceChat agentId={CUMULUS_AGENT_ID} agentLabel="Cumulus Assistant" />
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: '50%',
  border: '1px solid var(--wp-border)',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: '0.9rem',
};
