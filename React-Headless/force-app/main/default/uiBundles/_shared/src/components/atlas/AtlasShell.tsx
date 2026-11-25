import { setAtlasReadScope, invalidateAtlasReads } from '../../data/atlasReadCache';
import { AtlasGreeting } from './AtlasGreeting';
import { chatContext } from './atlasChatContext';
import { agentDirectory } from '../../data/atlasAgents';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { atlasAccents, AtlasAccentContext } from './AtlasAccentContext';
import { Modal } from '../Modal';
import { lexRecordUrl } from '../../data/orgEnv';
import { useStageDrafts, useWorkspaceDrafts } from './atlasDrafts';
import { AgentforceChat } from '../AgentforceChat';
import { AppLauncher } from '../AppLauncher';
import { GlobalSearch } from '../GlobalSearch';
import { NotificationBell } from '../NotificationBell';
import { UserMenu } from '../UserMenu';
import { Icon, type IconKey } from '../iconMap';
import { ThemeProvider } from '../../theme/ThemeProvider';
import type { PersonaKey } from '../../theme/themes';
import { readableTextOn } from '../../theme/brandThemes';
import { useBrandOverride } from '../../theme/activeBrand';
import { fetchCurrentUser, type CurrentUser } from '../../data/crmWriteClient';
import { fetchBankers, setViewAs, useViewAs } from '../../data/viewAs';
import { useAsyncData } from '../../hooks/useAsyncData';
import '../../../../../../../../docs/design-studies/2026-11-12-directions/atlas-shell.css';
import './atlasToday.css';
import './atlasShellLive.css';

const USER_ID = /^005[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$/;

const brands: Record<PersonaKey, string> = {
  retail: 'Cumulus Retail',
  wealth: 'Cumulus Private Wealth',
  commercial: 'Cumulus Commercial',
};

const nav: { path: string; label: string; icon: IconKey }[] = [
  { path: '/', label: 'Today', icon: 'home' },
  { path: '/relationships', label: 'Relationships', icon: 'clients' },
  { path: '/pipeline', label: 'Pipeline', icon: 'pipeline' },
  { path: '/journey', label: 'Life & goals', icon: 'lifeEvent' },
  { path: '/prospecting', label: 'Prospecting', icon: 'leads' },
  { path: '/growth', label: 'Growth', icon: 'pulse' },
  { path: '/intelligence', label: 'Intelligence', icon: 'sparkle' },
  { path: '/health', label: 'Book health', icon: 'metrics' },
  { path: '/work', label: 'Workbench', icon: 'tasks' },
  { path: '/config', label: 'Configuration', icon: 'goal' },
];

const navTitles: Record<PersonaKey, Record<string, string>> = {
  retail: { '/health': 'Relationship health' },
  wealth: {
    '/journey': 'Plans & goals',
    '/growth': 'Capital & Acquisition',
    '/health': 'Review horizon',
    '/work': 'My workbench',
  },
  commercial: {
    '/relationships': 'Companies',
    '/journey': 'Activity & plans',
    '/growth': 'Treasury & origination',
    '/intelligence': 'Company intelligence',
    '/health': 'Credit & coverage',
  },
};

export function atlasAccountPath(persona: PersonaKey, id: string) {
  const key = encodeURIComponent(id);
  if (persona === 'wealth') return '/relationships?client=' + key;
  return '/client/' + key;
}

export type AtlasLink = (path: string, content: ReactNode, className?: string) => ReactNode;

interface Props {
  persona: PersonaKey;
  path: string;
  search: string;
  link: AtlasLink;
  navigate: (path: string) => void;
  workspace: (owner: CurrentUser | null, actor: CurrentUser | null) => ReactNode;
}

export default function AtlasShell({ persona, path, search, link, navigate, workspace }: Props) {
  const [attempt, setAttempt] = useState(0);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const launcher = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const main = useRef<HTMLElement>(null);
  const header = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selection, setSelection] = useState({ scope: '', record: '', label: '', section: '' });
  const [directoryRevision, setDirectoryRevision] = useState(0);
  const [assistantMounted, setAssistantMounted] = useState(false);
  const brand = useBrandOverride();
  const { data: actor, loading, error } = useAsyncData(fetchCurrentUser, [attempt]);
  const actorScope = actor && !loading && !error && USER_ID.test(actor.userId) ? actor.userId : null;
  const accent = brand?.accent ?? atlasAccents[persona];
  const softenAccent = brand?.mode !== 'dark' && readableTextOn(accent) !== '#ffffff';
  const { data: bankers, loading: loadingBankers } = useAsyncData(() => fetchBankers().catch(() => []), [attempt]);
  const viewAs = useViewAs();
  const selectedBanker = viewAs ? bankers?.find(banker => banker.userId === viewAs.userId) : null;
  const pendingBook = loading || Boolean(viewAs && loadingBankers);
  const candidate = actor && (viewAs ? selectedBanker : actor);
  const owner = !pendingBook && !error && candidate && USER_ID.test(candidate.userId) ? candidate : null;
  const readScope = actorScope && owner ? [persona, actorScope, owner.userId].join('/') : '';
  useLayoutEffect(() => {
    setAtlasReadScope(readScope);
    const onRestore = (event: PageTransitionEvent) => { if (event.persisted) invalidateAtlasReads(); };
    window.addEventListener('pageshow', onRestore);
    return () => {
      window.removeEventListener('pageshow', onRestore);
      setAtlasReadScope('');
    };
  }, [readScope]);
  const drafts = useStageDrafts(persona, actor?.userId, owner?.userId);
  const workspaceDrafts = useWorkspaceDrafts(persona, actor?.userId, owner?.userId);
  const draftCount = drafts.rows.length + workspaceDrafts.length;
  useEffect(() => { window.scrollTo(0, 0); }, [path]);
  const options = bankers ?? [];

  const directory = useAsyncData(() => agentDirectory(persona), [persona, directoryRevision]);
  const available = directory.data?.selected.flatMap(id => directory.data?.agents.find(a => a.id === id) ?? []) ?? [];
  const page = path.startsWith('/client/') ? (persona === 'commercial' ? 'Company 360' : 'Customer 360')
    : navTitles[persona][path] ?? nav.find(item => item.path === path)?.label ?? 'Workspace';
  const appName = brand?.brandName ? brands[persona].replace('Cumulus', brand.brandName) : brands[persona];
  const scope = JSON.stringify([persona, owner?.userId, path, search]);
  const record = selection.scope === scope ? selection.record : '';
  const section = selection.scope === scope ? selection.section : '';
  const context = useMemo(() => chatContext(appName, path, search, record), [appName, path, search, record]);
  useEffect(() => {
    const refresh = (e: Event) => { if ((e as CustomEvent).detail === persona) setDirectoryRevision(n => n + 1); };
    window.addEventListener('atlas-agent-settings', refresh);
    return () => window.removeEventListener('atlas-agent-settings', refresh);
  }, [persona]);
  useEffect(() => {
    const el = main.current;
    if (!el || !assistantMounted) return;
    function readSelection() {
      const target = el?.querySelector<HTMLElement>('[role="dialog"] [data-agent-record],dialog[open] [data-agent-record]') ?? el?.querySelector<HTMLElement>('[data-agent-record]');
      const tab = el?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"], nav button[aria-pressed="true"], [data-agent-section]');
      const record = target?.dataset.agentRecord ?? '';
      const section = (tab?.dataset.agentSection || tab?.textContent || '').trim().slice(0,80);
      const label = target?.dataset.agentLabel || '';
      setSelection(old => old.scope === scope && old.record === record && old.section === section && old.label === label
        ? old : { scope, record, label, section });
    }
    readSelection();
    const observer = new MutationObserver(readSelection);
    observer.observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-agent-record','data-agent-label','data-agent-section','aria-selected','aria-pressed'] });
    return () => observer.disconnect();
  }, [assistantMounted, scope]);
  useEffect(() => {
    const el = header.current;
    if (!el || !open) return;
    const measure = () => el.parentElement?.style.setProperty('--atlas-agent-top', Math.max(0, el.getBoundingClientRect().bottom) + 'px');
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener('scroll', measure, { passive: true, capture: true });
    return () => { observer.disconnect(); window.removeEventListener('scroll', measure, true); };
  }, [open]);
  function closeAgent() { setOpen(false); setDetailsOpen(false); launcher.current?.focus({ preventScroll: true }); }
  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus({ preventScroll: true });
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) closeAgent();
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open]);

  return (
    <ThemeProvider persona={persona} mode="light"
      brandOverride={{ accentSoft: accent, logoBase64: null, ...brand, accent }}>
      <div className="atlas-app" data-agent-open={open} data-persona={persona} data-brand={brand ? 'active' : undefined}
        style={{ '--m-accent': softenAccent ? `color-mix(in srgb, ${accent} 38%, #343745)` : accent,
          '--m-bg': brand?.structural?.surface,
          '--m-line': brand?.structural?.borderStrong,
          '--atlas-on-accent': softenAccent ? '#fff' : readableTextOn(accent),
        } as CSSProperties}>
        <header ref={header} className="as-header atlas-shell-header">
          <div className="atlas-launcher"><AppLauncher showAtlas /></div>
          {link('/', <>{brand?.logoBase64 ? <img className="atlas-brand-logo" alt="" src={`data:${brand.logoContentType || 'image/png'};base64,${brand.logoBase64}`} /> : (!brand?.brandName || brand.brandName.trim().toLowerCase() === 'cumulus') && <span className="as-cumulus-mark" aria-hidden="true" />}{brand?.brandName ? brands[persona].replace('Cumulus', brand.brandName) : brands[persona]}</>, 'mock-brand as-brand')}
          <GlobalSearch placeholder="Search Salesforce…" appearance="atlas" onSelectAccount={id => navigate(atlasAccountPath(persona,id))} />
          <label className="as-view-as">
            <span>{viewAs ? 'Viewing as' : 'View as'}</span>
            <select aria-label="View the cockpit as" value={viewAs?.userId ?? ''}
              onChange={e => setViewAs(options.find(banker => banker.userId === e.target.value) ?? null)}>
              <option value="">My book{actor?.name ? ` · ${actor.name}` : ''}</option>
              {viewAs && !selectedBanker && <option value={viewAs.userId} disabled>
                {loadingBankers ? 'Verifying selected book…' : 'Selected book unavailable'}
              </option>}
              {options.map(banker => (
                <option key={banker.userId} value={banker.userId}>
                  {banker.name}{banker.accounts ? ` · ${banker.accounts.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 1 })} accts` : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="as-header-actions">
            <button type="button" className="atlas-agent-trigger" aria-label="Agentforce" title="Agentforce" aria-controls="atlas-agent-panel" aria-expanded={open} ref={launcher}
              onClick={() => { setOpen(!open); setDetailsOpen(false); setAssistantMounted(true); }}>
              <span className="atlas-agent-glyph" aria-hidden="true" />
            </button>
            <NotificationBell onOpenTasks={() => navigate(persona === 'retail' ? '/work?view=tasks' : '/work?tab=tasks')} />
            <button type="button" className="as-drafts" aria-label="Review local drafts" onClick={() => setDraftsOpen(true)}>
              <Icon name="tasks" /><span>{draftCount} {draftCount === 1 ? 'draft' : 'drafts'}</span>
            </button>
            <UserMenu onNavigate={navigate} />
          </div>
        </header>
        <div className="atlas-layout" data-persona={persona}>
          <nav className="atlas-rail" aria-label="Main navigation" style={brand?.sidebar ? {
            '--m-shell': brand.sidebar.surface, '--m-shell-ink': brand.sidebar.text,
            '--atlas-line': brand.sidebar.border, '--atlas-nav-active': brand.sidebar.surfaceMuted ?? brand.sidebar.accentSoft,
            '--atlas-nav-ink': brand.sidebar.accent
              ? `color-mix(in srgb, ${brand.sidebar.accent} 30%, ${brand.sidebar.text ?? 'var(--m-shell-ink)'})`
              : brand.sidebar.text,
          } as CSSProperties : undefined}>
            {nav.filter(item => item.path !== '/prospecting' || persona === 'retail').map(item => (
              <div key={item.path}>
                {link(item.path, <><Icon name={item.icon} />{navTitles[persona][item.path] ?? item.label}</>,
                  path === item.path || (item.path === '/relationships' && path.startsWith('/client/')) ? 'atlas-nav-entry atlas-nav-active' : 'atlas-nav-entry')}
              </div>
            ))}
          </nav>
          <main ref={main} id="atlas-main" className="atlas-content" data-atlas-page={path.split('/')[1] || 'today'} tabIndex={-1}>
            {pendingBook && path !== '/config' && <p role="status">Resolving your Salesforce session and book…</p>}
            {!pendingBook && !owner && path !== '/config' && (
              <div role="alert">
                <p>Couldn’t verify your Salesforce session and book.</p>
                <button type="button" className="atlas-text-link" onClick={() => setAttempt(a => a + 1)}>Retry</button>
              </div>
            )}
            {(owner || path === '/config') && (
              <div key={path === '/config' ? 'configuration' : `${actor?.userId ?? ''}:${owner?.userId ?? ''}`} className="atlas-workspace">
                <AtlasAccentContext.Provider value={{ actorScope }}>
                  {path === '/' && persona !== 'commercial' && <AtlasGreeting name={actor?.name} />}
                  {workspace(owner, actor)}
                </AtlasAccentContext.Provider>
              </div>
            )}
            {owner && <footer className="atlas-footer">{owner.name} · Salesforce CRM and Data 360</footer>}
          </main>
        </div>
        {draftsOpen && <Modal open onClose={() => setDraftsOpen(false)} title="Local drafts">
          <p>Your proposals are saved in this tab for the selected book.</p>
          {drafts.rows.map(draft => <article key={draft.id} className="atlas-draft-card">
            <strong>{draft.label}</strong><p>{draft.recorded} → {draft.proposed}</p>
            <a href={lexRecordUrl('Opportunity', draft.recordId)} target="_top">Open opportunity</a>
            <button type="button" onClick={() => drafts.remove(draft.id)}>Remove draft</button>
          </article>)}
          {workspaceDrafts.map(draft => <article key={draft.id} className="atlas-draft-card">
            <strong>{draft.title}</strong><p>{draft.kind}</p>
          </article>)}
          {workspaceDrafts.length > 0 && <button className="secondary" type="button" onClick={() => {setDraftsOpen(false); navigate(persona==='retail'?'/work?view=drafts':'/work?tab=drafts');}}>Open workbench</button>}
          {!draftCount && <p>No drafts for this book.</p>}
        </Modal>}
        <aside id="atlas-agent-panel" className="atlas-chat-dock" aria-labelledby="atlas-chat-title" inert={!open} aria-hidden={!open}>
          <header><span className="atlas-agent-glyph" aria-hidden="true"/><h2 id="atlas-chat-title">Agentforce</h2>
            {assistantMounted && available.length > 0 && !directory.error && <button type="button" className="atlas-chat-toggle" aria-expanded={detailsOpen} aria-controls="atlas-chat-details" onClick={() => setDetailsOpen(value => !value)}>Details</button>}
            <button type="button" className="atlas-chat-close" ref={closeButton} aria-label="Close Agentforce" onClick={closeAgent}>×</button>
          </header>

          {assistantMounted && (directory.loading && !directory.data ? <p role="status">Loading agents…</p> : directory.error
            ? <p role="alert">Could not load agents. <button onClick={() => setDirectoryRevision(n => n + 1)}>Retry</button></p>
            : available.length ? <AgentforceChat inline key={readScope} agentId={available[0].id} agents={available} agentScope={persona}
                pageContext={context} baselineAccent={accent} detailsOpen={detailsOpen}
                workspaceDetails={<div className="atlas-chat-view"><strong>{page}</strong>{section && <span>{section}</span>}{selection.scope === scope && selection.label && <span>{selection.label}</span>}{owner && <span>{owner.name}’s book</span>}</div>} />
            : <p>No agents selected. {link('/config', 'Open Configuration', 'atlas-text-link')}</p>)}
        </aside>
      </div>
    </ThemeProvider>
  );
}
