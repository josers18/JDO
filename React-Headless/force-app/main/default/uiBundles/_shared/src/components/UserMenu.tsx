import { useEffect, useRef, useState } from 'react';
import { executeGraphQL } from '../data/graphqlClient';
import { personalSettingsUrl, logoutUrl, lexRecordUrl, setupUrl, dataCloudSetupUrl } from '../data/orgEnv';
import { DisplaySizeControl } from './config/DisplaySizeControl';

/**
 * User menu for the React shell (Profile + Settings + Log Out).
 *
 * Identity comes from the GraphQL `User` object (SalesforceDotCom origin, per
 * the repo data rule). Profile / Settings / Log Out are real `<a target="_top">`
 * links to the core org — scripted navigation out of the App Domain is blocked.
 */

/** Current user, via the special "me"-style query on the User object. */
const CURRENT_USER_QUERY = /* GraphQL */ `
  query CurrentUser {
    uiapi {
      query {
        User(first: 1, where: { Id: { eq: "$USERID" } }) {
          edges { node { Id Name @optional { value } Title @optional { value } SmallPhotoUrl @optional { value } Email @optional { value } } }
        }
      }
    }
  }
`;

interface CurrentUser {
  id: string;
  name: string;
  title: string;
  photoUrl: string;
  email: string;
}

type GqlNode = Record<string, { value?: unknown } | undefined> & { Id?: string };

function readUser(node: GqlNode): CurrentUser {
  const v = (k: string) => String((node[k] as { value?: unknown } | undefined)?.value ?? '');
  return { id: node.Id ?? '', name: v('Name'), title: v('Title'), photoUrl: v('SmallPhotoUrl'), email: v('Email') };
}

/** Initials fallback when there is no photo. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'ME';
  return (parts[0][0] + (parts[parts.length - 1][0] ?? '')).toUpperCase();
}

/**
 * @param onNavigate In-app SPA navigation (from the bundle's router). When
 *   provided, the menu shows an in-frame "Configuration" item that calls it.
 *   Omitted → the item is hidden. _shared stays router-agnostic (it has no
 *   react-router dependency); the bundle supplies navigation.
 */
export function UserMenu({ onNavigate }: { onNavigate?: (path: string) => void } = {}) {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Resolve the current user id from the platform env, then query for details.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const uid = (globalThis as unknown as { SFDC_ENV?: { userId?: string } }).SFDC_ENV?.userId;
      if (!uid) return;
      try {
        const data = await executeGraphQL<{ uiapi?: { query?: { User?: { edges?: { node: GqlNode }[] } } } }>(
          CURRENT_USER_QUERY.replace('$USERID', uid.replace(/[^A-Za-z0-9]/g, ''))
        );
        const node = data.uiapi?.query?.User?.edges?.[0]?.node;
        if (node && !cancelled) setUser(readUser(node));
      } catch {
        /* identity is best-effort; the avatar falls back to initials */
      }
    })();
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

  const displayName = user?.name || 'My Account';

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        aria-label="User menu"
        aria-haspopup="menu"
        aria-expanded={open}
        title={displayName}
        onClick={() => setOpen(o => !o)}
        style={{
          width: 34,
          height: 34,
          borderRadius: '50%',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          overflow: 'hidden',
          background: 'var(--wp-gradient)',
          color: 'var(--wp-on-accent)',
          fontWeight: 800,
          fontSize: '0.8rem',
        }}
      >
        {user?.photoUrl ? (
          <img src={user.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          initials(displayName)
        )}
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: 260,
            zIndex: 60,
            background: 'var(--wp-surface-glass-strong)',
            border: '1px solid var(--wp-border)',
            borderRadius: 'var(--wp-radius)',
            boxShadow: 'var(--wp-shadow, 0 12px 32px rgba(0,0,0,0.18))',
            backdropFilter: 'blur(18px)',
            WebkitBackdropFilter: 'blur(18px)',
            padding: '0.6rem',
          }}
        >
          <div style={{ padding: '0.5rem 0.65rem 0.7rem', borderBottom: '1px solid var(--wp-border)' }}>
            <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--wp-text)' }}>{displayName}</div>
            {user?.title && <div style={{ fontSize: '0.78rem', color: 'var(--wp-text-muted)' }}>{user.title}</div>}
            {user?.email && <div style={{ fontSize: '0.74rem', color: 'var(--wp-text-faint)' }}>{user.email}</div>}
          </div>

          {user?.id && (
            <a href={lexRecordUrl('User', user.id)} target="_top" style={menuLink}>
              Profile
            </a>
          )}
          <a href={personalSettingsUrl()} target="_top" style={menuLink}>
            Settings
          </a>

          <div style={menuDivider} />

          {/* Quick per-user display-size (font/UI scale). Same control as the
              Configuration page's card; applies instantly and persists per user. */}
          <div style={{ padding: '0.15rem 0.65rem 0.2rem' }}>
            <div
              style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--wp-text-faint)',
                marginBottom: '0.4rem',
              }}
            >
              Display size
            </div>
            <DisplaySizeControl compact />
          </div>

          <div style={menuDivider} />

          {/* In-app command-center configuration (model per AI action + params).
              A real SPA route, so it navigates in-frame — not a core-org link.
              Only shown when the bundle wires up onNavigate. */}
          {onNavigate && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onNavigate('/config');
              }}
              style={menuButton}
            >
              Configuration
            </button>
          )}

          <div style={menuDivider} />

          {/* Admin escape hatches — mirror the native LEX gear menu. These are
              the two the user asked for; both open in the top frame. */}
          <a href={setupUrl()} target="_top" style={menuLink}>
            Setup
          </a>
          <a href={dataCloudSetupUrl()} target="_top" style={menuLink}>
            Data Cloud Setup
          </a>

          <div style={menuDivider} />

          <a
            href={logoutUrl()}
            target="_top"
            style={{ ...menuLink, color: 'var(--wp-danger, #dc2626)', fontWeight: 600 }}
          >
            Log Out
          </a>
        </div>
      )}
    </div>
  );
}

const menuLink: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.55rem 0.65rem',
  borderRadius: 'var(--wp-radius-sm)',
  textDecoration: 'none',
  color: 'var(--wp-text)',
  fontSize: '0.86rem',
};

// A <button> that visually matches menuLink (for in-app SPA navigation items).
const menuButton: React.CSSProperties = {
  ...menuLink,
  width: '100%',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  textAlign: 'left',
  font: 'inherit',
};

const menuDivider: React.CSSProperties = {
  height: 1,
  background: 'var(--wp-border)',
  margin: '0.35rem 0',
};
