import { useEffect, useMemo, useRef, useState } from 'react';
import { executeGraphQL } from '../data/graphqlClient';
import { lexRecordUrl, lexSearchUrl } from '../data/orgEnv';
import { Icon } from './iconMap';

/**
 * Multi-object global search for the React shell.
 *
 * Core CRM records (Account / Contact / Opportunity) originate in Salesforce,
 * so per the repo data rule they're queried via GraphQL — one `like` query per
 * object, run in parallel and merged (this is the SOSL-style multi-object
 * search expressed in the GraphQL lane, no new Apex endpoint needed).
 *
 * Accounts route in-app to the current bundle's Customer 360 (via the
 * `onSelectAccount` callback the shell wires to react-router). Contacts and
 * Opportunities deep-link to their LEX record page (`<a target="_top">`).
 */

export interface SearchHit {
  id: string;
  label: string;
  sublabel: string;
  object: 'Account' | 'Contact' | 'Opportunity' | 'Lead';
}

type GqlNode = Record<string, { value?: unknown } | undefined> & { Id?: string };
const val = (n: GqlNode, k: string) => String((n[k] as { value?: unknown } | undefined)?.value ?? '');

/**
 * Build the `where` filter as a token-wise AND of `like` clauses on `Name`.
 *
 * A single `Name like "%julie morris%"` fails on Person Accounts and Contacts:
 * their `Name` is the COMPUTED compound ("Mrs. Julie E Morris" — salutation +
 * middle initial), so the contiguous substring "julie morris" never appears.
 * Splitting on whitespace and requiring each token to match independently
 * ("%julie%" AND "%morris%") tolerates interleaved salutations/initials and is
 * what makes people searchable. `extra` appends object-specific clauses
 * (e.g. Lead's IsConverted filter) into the same AND group.
 */
function nameWhere(term: string, extra = ''): string {
  const tokens = term
    .replace(/["\\]/g, '') // strip quotes/backslashes for the inline literal
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4); // cap clause count; more tokens rarely help and cost query size
  const clauses = tokens.map(t => `{ Name: { like: "%${t}%" } }`).join(' ');
  return `{ and: [ ${clauses}${extra ? ' ' + extra : ''} ] }`;
}

/** One parallel query per object; token-wise contains-match on the name field. */
function buildQuery(term: string): string {
  return `query GlobalSearch {
    uiapi {
      query {
        Account(first: 6, where: ${nameWhere(term)}) {
          edges { node { Id Name @optional { value } Type @optional { value } } }
        }
        Contact(first: 6, where: ${nameWhere(term)}) {
          edges { node { Id Name @optional { value } Title @optional { value } } }
        }
        Opportunity(first: 6, where: ${nameWhere(term)}) {
          edges { node { Id Name @optional { value } StageName @optional { value } } }
        }
        Lead(first: 6, where: ${nameWhere(term, '{ IsConverted: { eq: false } }')}) {
          edges { node { Id Name @optional { value } Company @optional { value } } }
        }
      }
    }
  }`;
}

interface SearchShape {
  uiapi?: {
    query?: {
      Account?: { edges?: { node: GqlNode }[] };
      Contact?: { edges?: { node: GqlNode }[] };
      Opportunity?: { edges?: { node: GqlNode }[] };
      Lead?: { edges?: { node: GqlNode }[] };
    };
  };
}

async function runSearch(term: string): Promise<SearchHit[]> {
  const data = await executeGraphQL<SearchShape>(buildQuery(term));
  const q = data.uiapi?.query;
  const accounts: SearchHit[] = (q?.Account?.edges ?? []).map(e => ({
    id: e.node.Id ?? '', label: val(e.node, 'Name'), sublabel: val(e.node, 'Type') || 'Account', object: 'Account',
  }));
  const contacts: SearchHit[] = (q?.Contact?.edges ?? []).map(e => ({
    id: e.node.Id ?? '', label: val(e.node, 'Name'), sublabel: val(e.node, 'Title') || 'Contact', object: 'Contact',
  }));
  const opps: SearchHit[] = (q?.Opportunity?.edges ?? []).map(e => ({
    id: e.node.Id ?? '', label: val(e.node, 'Name'), sublabel: val(e.node, 'StageName') || 'Opportunity', object: 'Opportunity',
  }));
  const leads: SearchHit[] = (q?.Lead?.edges ?? []).map(e => ({
    id: e.node.Id ?? '', label: val(e.node, 'Name'), sublabel: val(e.node, 'Company') || 'Lead', object: 'Lead',
  }));
  return [...accounts, ...contacts, ...opps, ...leads].filter(h => h.id && h.label);
}

export function GlobalSearch({
  onSelectAccount,
  placeholder = 'Search clients, accounts, insights…',
}: {
  /** In-app navigation to a Customer 360 page (wired by the shell to react-router). */
  onSelectAccount?: (accountId: string) => void;
  placeholder?: string;
}) {
  const [term, setTerm] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const reqIdRef = useRef(0);

  // Debounced search; a request-id guard drops out-of-order responses.
  useEffect(() => {
    const q = term.trim();
    if (q.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const myReq = ++reqIdRef.current;
    const t = setTimeout(async () => {
      try {
        const results = await runSearch(q);
        if (reqIdRef.current === myReq) {
          setHits(results);
          setOpen(true);
        }
      } catch {
        if (reqIdRef.current === myReq) setHits([]);
      } finally {
        if (reqIdRef.current === myReq) setLoading(false);
      }
    }, 280);
    return () => clearTimeout(t);
  }, [term]);

  useEffect(() => {
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
  }, []);

  const grouped = useMemo(() => {
    const g: Record<SearchHit['object'], SearchHit[]> = { Account: [], Contact: [], Opportunity: [], Lead: [] };
    for (const h of hits) g[h.object].push(h);
    return g;
  }, [hits]);

  function selectHit(h: SearchHit) {
    if (h.object === 'Account' && onSelectAccount) {
      onSelectAccount(h.id);
      setOpen(false);
      setTerm('');
      return;
    }
    // Contact / Opportunity (or Account with no in-app handler) → LEX record.
    window.open(lexRecordUrl(h.object, h.id), '_top');
  }

  const showDropdown = open && term.trim().length >= 2;

  return (
    <div ref={rootRef} style={{ position: 'relative', marginLeft: 'auto', flex: 1, maxWidth: 440 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          background: 'var(--wp-surface)',
          border: '1px solid var(--wp-border)',
          borderRadius: 999,
          padding: '0.45rem 0.9rem',
          color: 'var(--wp-text-faint)',
        }}
      >
        <Icon name="search" size={16} />
        <input
          value={term}
          onChange={e => setTerm(e.target.value)}
          onFocus={() => hits.length && setOpen(true)}
          placeholder={placeholder}
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--wp-text)', fontSize: '0.86rem' }}
        />
        {loading ? (
          <span style={{ fontSize: '0.7rem', color: 'var(--wp-text-faint)' }}>…</span>
        ) : (
          <span style={{ fontSize: '0.7rem', border: '1px solid var(--wp-border)', borderRadius: 5, padding: '0 0.3rem' }}>⌘K</span>
        )}
      </div>

      {showDropdown && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            right: 0,
            zIndex: 60,
            background: 'var(--wp-surface-glass-strong)',
            border: '1px solid var(--wp-border)',
            borderRadius: 'var(--wp-radius)',
            boxShadow: 'var(--wp-shadow, 0 12px 32px rgba(0,0,0,0.18))',
            backdropFilter: 'blur(18px)',
            WebkitBackdropFilter: 'blur(18px)',
            padding: '0.5rem',
            maxHeight: '60vh',
            overflowY: 'auto',
          }}
        >
          {!loading && hits.length === 0 && (
            <div style={{ padding: '0.7rem 0.65rem', fontSize: '0.84rem', color: 'var(--wp-text-muted)' }}>
              No quick matches for “{term.trim()}”.
            </div>
          )}
          {(Object.keys(grouped) as SearchHit['object'][]).map(obj =>
            grouped[obj].length ? (
              <div key={obj}>
                <div
                  style={{
                    fontSize: '0.66rem',
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--wp-text-faint)',
                    padding: '0.5rem 0.65rem 0.25rem',
                  }}
                >
                  {obj === 'Opportunity' ? 'Opportunities' : `${obj}s`}
                </div>
                {grouped[obj].map(h => (
                  <button
                    key={`${obj}-${h.id}`}
                    type="button"
                    role="option"
                    onClick={() => selectHit(h)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: '0.1rem',
                      width: '100%',
                      textAlign: 'left',
                      padding: '0.5rem 0.65rem',
                      borderRadius: 'var(--wp-radius-sm)',
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      color: 'var(--wp-text)',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'color-mix(in srgb, var(--wp-accent) 8%, transparent)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{h.label}</span>
                    <span style={{ fontSize: '0.74rem', color: 'var(--wp-text-muted)' }}>{h.sublabel}</span>
                  </button>
                ))}
              </div>
            ) : null
          )}

          {/* Escape hatch — the quick search only spans Account/Contact/
              Opportunity/Lead by name; hand anything broader to the org's
              full SOSL global search in a new tab. */}
          {!loading && (
            <a
              href={lexSearchUrl(term.trim())}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginTop: '0.35rem',
                padding: '0.55rem 0.65rem',
                borderTop: '1px solid var(--wp-border)',
                borderRadius: 'var(--wp-radius-sm)',
                textDecoration: 'none',
                color: 'var(--wp-accent)',
                fontSize: '0.82rem',
                fontWeight: 600,
              }}
            >
              <Icon name="search" size={14} />
              Search all of Salesforce for “{term.trim()}” →
            </a>
          )}
        </div>
      )}
    </div>
  );
}
