import { useEffect, useRef, useState } from 'react';
import { executeGraphQL } from '../data/graphqlClient';
import { lexRecordUrl } from '../data/orgEnv';
import { Icon } from './iconMap';

/**
 * Notifications bell for the React shell.
 *
 * A UI bundle renders standalone at the App Domain, where the native LEX
 * notification tray (an in-shell overlay with no addressable URL or read API)
 * is unreachable. So instead of a dead icon, this synthesizes an actionable
 * alert feed from records the user genuinely needs to act on — high-priority
 * open Cases and opportunities closing this week — via GraphQL (core CRM →
 * GraphQL, per the repo data rule). Each alert deep-links to its LEX record
 * page (`<a target="_top">`). The badge counts the total.
 */

export interface Alert {
  id: string;
  object: 'Case' | 'Opportunity';
  label: string;
  sublabel: string;
  tone: 'risk' | 'opportunity' | 'neutral';
}

type GqlNode = Record<string, { value?: unknown } | undefined> & { Id?: string };
const val = (n: GqlNode, k: string) => String((n[k] as { value?: unknown } | undefined)?.value ?? '');

interface AlertsShape {
  uiapi?: {
    query?: {
      Case?: { edges?: { node: GqlNode }[] };
      Opportunity?: { edges?: { node: GqlNode }[] };
    };
  };
}

/** High-priority open cases + opportunities closing within the window. */
function buildQuery(closeBefore: string): string {
  return `query ShellAlerts {
    uiapi {
      query {
        Case(first: 6, where: { IsClosed: { eq: false }, Priority: { eq: "High" } }, orderBy: { CreatedDate: { order: DESC } }) {
          edges { node { Id CaseNumber @optional { value } Subject @optional { value } Status @optional { value } } }
        }
        Opportunity(first: 6, where: { IsClosed: { eq: false }, CloseDate: { lte: "${closeBefore}" } }, orderBy: { CloseDate: { order: ASC } }) {
          edges { node { Id Name @optional { value } StageName @optional { value } Amount @optional { value } } }
        }
      }
    }
  }`;
}

async function fetchAlerts(): Promise<Alert[]> {
  // Opportunities closing within the next 7 days (YYYY-MM-DD for the GraphQL date filter).
  const in7 = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const data = await executeGraphQL<AlertsShape>(buildQuery(in7));
  const q = data.uiapi?.query;
  const cases: Alert[] = (q?.Case?.edges ?? []).map(e => ({
    id: e.node.Id ?? '',
    object: 'Case',
    label: `Case ${val(e.node, 'CaseNumber')}${val(e.node, 'Subject') ? ` · ${val(e.node, 'Subject')}` : ''}`,
    sublabel: `High priority · ${val(e.node, 'Status') || 'Open'}`,
    tone: 'risk',
  }));
  const opps: Alert[] = (q?.Opportunity?.edges ?? []).map(e => {
    const amt = Number((e.node['Amount'] as { value?: unknown } | undefined)?.value ?? 0);
    return {
      id: e.node.Id ?? '',
      object: 'Opportunity',
      label: val(e.node, 'Name') || 'Opportunity',
      sublabel: `Closing soon · ${val(e.node, 'StageName') || 'Open'}${amt ? ` · ${amt.toLocaleString('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 })}` : ''}`,
      tone: 'opportunity',
    };
  });
  return [...cases, ...opps].filter(a => a.id && a.label);
}

const TONE_COLOR: Record<Alert['tone'], string> = {
  risk: 'var(--wp-danger, #f43f5e)',
  opportunity: 'var(--wp-accent)',
  neutral: 'var(--wp-text-muted)',
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loaded, setLoaded] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Load once on mount so the badge is populated before the first open.
  useEffect(() => {
    let cancelled = false;
    fetchAlerts()
      .then(a => !cancelled && setAlerts(a))
      .catch(() => !cancelled && setAlerts([]))
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, []);

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

  const count = alerts.length;

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        aria-label={`Notifications${count ? ` (${count})` : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'relative',
          width: 34,
          height: 34,
          borderRadius: '50%',
          border: '1px solid var(--wp-border)',
          background: open ? 'color-mix(in srgb, var(--wp-accent) 12%, transparent)' : 'transparent',
          color: 'var(--wp-text-muted)',
          cursor: 'pointer',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <Icon name="alerts" size={16} />
        {count > 0 && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: -3,
              right: -3,
              minWidth: 16,
              height: 16,
              padding: '0 4px',
              borderRadius: 999,
              background: 'var(--wp-danger, #f43f5e)',
              color: '#fff',
              fontSize: '0.62rem',
              fontWeight: 700,
              lineHeight: '16px',
              textAlign: 'center',
            }}
          >
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: 340,
            zIndex: 60,
            background: 'var(--wp-surface-glass-strong)',
            border: '1px solid var(--wp-border)',
            borderRadius: 'var(--wp-radius)',
            boxShadow: 'var(--wp-shadow, 0 12px 32px rgba(0,0,0,0.18))',
            backdropFilter: 'blur(18px)',
            WebkitBackdropFilter: 'blur(18px)',
            padding: '0.5rem',
            maxHeight: '70vh',
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              fontSize: '0.66rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--wp-text-faint)',
              padding: '0.4rem 0.65rem 0.35rem',
            }}
          >
            Notifications
          </div>

          {!loaded && (
            <div style={{ padding: '0.7rem 0.65rem', fontSize: '0.84rem', color: 'var(--wp-text-muted)' }}>Loading…</div>
          )}
          {loaded && count === 0 && (
            <div style={{ padding: '0.7rem 0.65rem', fontSize: '0.84rem', color: 'var(--wp-text-muted)' }}>
              You’re all caught up.
            </div>
          )}

          {alerts.map(a => (
            <a
              key={`${a.object}-${a.id}`}
              href={lexRecordUrl(a.object, a.id)}
              target="_top"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.6rem',
                padding: '0.55rem 0.65rem',
                borderRadius: 'var(--wp-radius-sm)',
                textDecoration: 'none',
                color: 'var(--wp-text)',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'color-mix(in srgb, var(--wp-accent) 8%, transparent)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span
                aria-hidden="true"
                style={{ width: 8, height: 8, borderRadius: 999, background: TONE_COLOR[a.tone], marginTop: 6, flexShrink: 0 }}
              />
              <span style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', minWidth: 0 }}>
                <span style={{ fontSize: '0.86rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.label}
                </span>
                <span style={{ fontSize: '0.74rem', color: 'var(--wp-text-muted)' }}>{a.sublabel}</span>
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
