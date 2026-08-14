import { Outlet, useLocation, useNavigate } from 'react-router';
import {
  ThemeProvider,
  CommandRail,
  HomeViewProvider,
  HomeViewToggle,
  WorkspaceSelectionProvider,
  tagSchedule,
  type CommandRailSection,
  type CommandRailGroup,
  type CommandRailArcStep,
  type CommandRailPinned,
} from '@shared';
import { AppShell } from '../shell/AppShell';
import { APP_PERSONA } from '../shell/appChrome';
import { HomeDataProvider, useHomeData } from './homeDataContext';
import { fetchHomeDashboard } from './homeData';
import type { HomeDashboard, ScheduleItem, CallItem } from './homeTypes';

/**
 * PRIMARY nav — the three top-level route groups. Collapsing the old flat
 * 10-item section list into three pages is the density fix: each page holds an
 * at-a-glance, laptop-fold-sized slice of the book. Counts are filled per-render
 * from the live dashboard (see deriveGroups).
 */
const RAIL_GROUPS: CommandRailGroup[] = [
  { to: '/', label: 'Today', icon: 'sparkle' },
  { to: '/growth', label: 'Growth', icon: 'pipeline', tone: 'ai' },
  { to: '/health', label: 'Health', icon: 'pulse', tone: 'risk' },
];

/** Map the current pathname to the active group's `to` for rail highlighting. */
function activeGroupFor(pathname: string): string {
  if (pathname.startsWith('/growth')) return '/growth';
  if (pathname.startsWith('/health')) return '/health';
  return '/';
}

/**
 * SECONDARY nav — the per-route "On this page" section list. Ids match the
 * section anchors HomePage renders for that mode, so the CommandRail's
 * scroll-spy and smooth-scroll line up. Keyed by route path. Labels/icons/tones
 * are static; badge COUNTS are derived per-render (see deriveSections).
 */
const SECTIONS_BY_PATH: Record<string, CommandRailSection[]> = {
  '/': [
    { id: 'brief', label: 'Daily brief', icon: 'sparkle' },
    { id: 'kpis', label: 'Key metrics', icon: 'metrics' },
    { id: 'schedule', label: 'Tasks & schedule', icon: 'meeting' },
    { id: 'queue', label: 'Priority queue', icon: 'tasks', tone: 'risk' },
    { id: 'actions', label: 'Recommended actions', icon: 'wand', tone: 'ai' },
  ],
  '/growth': [
    { id: 'whitespace', label: 'Cross-sell white-space', icon: 'wand', tone: 'ai' },
    { id: 'pipeline', label: 'Pipeline', icon: 'pipeline' },
    { id: 'leads', label: 'Leads & referrals', icon: 'leads' },
  ],
  '/health': [
    { id: 'kpis', label: 'Key metrics', icon: 'metrics' },
    { id: 'pulse', label: 'Portfolio pulse', icon: 'pulse' },
    { id: 'alerts', label: 'Risk alerts', icon: 'alerts', tone: 'risk' },
    { id: 'events', label: 'Life events', icon: 'lifeEvent', tone: 'warn' },
  ],
};

/** Section list for the active route (defaults to Today's for unknown paths). */
function sectionsForPath(pathname: string): CommandRailSection[] {
  if (pathname.startsWith('/growth')) return SECTIONS_BY_PATH['/growth'];
  if (pathname.startsWith('/health')) return SECTIONS_BY_PATH['/health'];
  return SECTIONS_BY_PATH['/'];
}

/** Fallback arc shown while the dashboard loads (no meetings resolved yet). */
const FALLBACK_ARC: CommandRailArcStep[] = [
  { label: 'No meetings today', time: '', state: 'todo' },
];

/**
 * Short display label for an arc step's time. ScheduleItem.time is an ISO date
 * (YYYY-MM-DD) or '—'; a meeting also carries startDateTime (full ISO). Prefer
 * the clock time from startDateTime; otherwise a compact "Mon D"; '—' → ''.
 */
function arcTimeLabel(s: ScheduleItem): string {
  if (s.startDateTime) {
    const d = new Date(s.startDateTime);
    if (!Number.isNaN(d.getTime())) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  if (s.time && s.time !== '—') {
    const d = new Date(s.time);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  return '';
}

/**
 * Derive the day-arc from the live schedule: today + overdue items become arc
 * steps. Overdue items read `done` (past their date); among the today items the
 * first is `now`, the rest `todo`. An empty schedule collapses to a single
 * "No meetings today" step so the rail never renders a blank arc.
 */
function deriveArc(schedule: ScheduleItem[]): CommandRailArcStep[] {
  // fetchHomeDashboard returns schedule items WITHOUT a `bucket` (the page tags
  // them on demand), so tag here before filtering — otherwise every filter
  // misses and the arc is stuck on the "No meetings today" fallback.
  const tagged = tagSchedule(schedule);
  const overdue = tagged.filter(s => s.bucket === 'overdue');
  const today = tagged.filter(s => s.bucket === 'today');
  const relevant = [...overdue, ...today];
  if (!relevant.length) return FALLBACK_ARC;
  return relevant.map((s, i) => {
    let state: CommandRailArcStep['state'];
    if (s.bucket === 'overdue') state = 'done';
    else if (i === overdue.length) state = 'now'; // first today item
    else state = 'todo';
    return { label: s.title, time: arcTimeLabel(s), state };
  });
}

const countOf = (n: number) => (n > 0 ? n : undefined);

/**
 * Derive rail badge counts from live list lengths for the active route's
 * section list. Labels/icons/tones stay static (persona identity); only `count`
 * is filled — and left `undefined` for an empty list so no "0" badge renders.
 */
function deriveSections(data: HomeDashboard | null, pathname: string): CommandRailSection[] {
  const counts: Record<string, number | undefined> = {
    queue: countOf(data?.callList.length ?? 0),
    actions: countOf(data?.recommendations.length ?? 0),
    events: countOf(data?.lifeEvents.length ?? 0),
    leads: countOf(data?.leads.length ?? 0),
    pipeline: countOf(data?.pipeline.length ?? 0),
    alerts: countOf(data?.alerts.length ?? 0),
  };
  return sectionsForPath(pathname).map(s => (s.id in counts ? { ...s, count: counts[s.id] } : s));
}

/**
 * Derive the top-level group badge counts. Growth carries the total growth
 * surface (pipeline + leads); Health carries the at-risk count. Today stays
 * badge-less — it's the default, not an alert.
 */
function deriveGroups(data: HomeDashboard | null): CommandRailGroup[] {
  const counts: Record<string, number | undefined> = {
    '/growth': countOf((data?.pipeline.length ?? 0) + (data?.leads.length ?? 0)),
    '/health': countOf(data?.alerts.length ?? 0),
  };
  return RAIL_GROUPS.map(g => (g.to in counts ? { ...g, count: counts[g.to] } : g));
}

/**
 * Derive the sidebar's pinned accounts from the top real risk clients
 * (callList is score-ordered). Real Account ids ride along so a pin click
 * resolves through selectClient → buildClientSelection every time.
 */
function derivePins(data: HomeDashboard): CommandRailPinned[] {
  return data.callList.slice(0, 3).map((c: CallItem) => ({
    id: c.clientId,
    name: c.clientName,
    sub: `${c.segment} · ${c.severity === 'high' ? 'at risk' : c.reason}`,
  }));
}

const RAIL_USER = { name: 'Jose Sifontes', sub: 'Retail · Cumulus FS' };

/**
 * HOME app layout — the banker's landing experience that REPLACES the standard
 * Salesforce home page. The signature CommandRail replaces the built-in nav
 * rail; the top bar, Agentforce FAB and aurora wash are unchanged.
 *
 * The outer component only wires providers; HomeLayoutInner consumes the shared
 * HomeData fetch and derives the CommandRail's arc / counts / pins from it, so
 * the rail and the page render off one live snapshot.
 */
export default function HomeLayout() {
  return (
    <ThemeProvider persona="retail" mode="light">
      <HomeViewProvider persona={APP_PERSONA}>
        <HomeDataProvider fetch={fetchHomeDashboard}>
          <HomeLayoutInner />
        </HomeDataProvider>
      </HomeViewProvider>
    </ThemeProvider>
  );
}

function HomeLayoutInner() {
  const { data, loading } = useHomeData();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const groups = deriveGroups(data);
  const activeGroup = activeGroupFor(pathname);

  // Loading gate. The WorkspaceSelectionProvider only reads `initialPinned` in
  // its lazy useState initializer (it does NOT react to later prop changes), so
  // mounting it before the data lands would permanently seed empty pins. Render
  // a skeleton AppShell WITHOUT the provider until data is present; the real
  // tree below then mounts the provider with real pins seeded on its first mount.
  // (CommandRail reads pins via useWorkspaceSelection, which returns a no-op
  // empty list when no provider is mounted — so the skeleton simply shows no
  // pins. HomePage inside <Outlet> shows its own "Loading your book…" guard.)
  if (loading || !data) {
    return (
      <AppShell
        title="Relationship Command Center"
        titleAside={<HomeViewToggle />}
        sidebar={
          <CommandRail
            groups={groups}
            activeGroup={activeGroup}
            onNavigate={navigate}
            sections={deriveSections(null, pathname)}
            arc={FALLBACK_ARC}
            user={RAIL_USER}
          />
        }
      >
        <Outlet />
      </AppShell>
    );
  }

  const arc = deriveArc(data.schedule);
  const sections = deriveSections(data, pathname);
  const pins = derivePins(data);

  return (
    <WorkspaceSelectionProvider initialPinned={pins} storageKey="cumulus.pinned.retail">
      <AppShell
        title="Relationship Command Center"
        titleAside={<HomeViewToggle />}
        sidebar={
          <CommandRail
            groups={groups}
            activeGroup={activeGroup}
            onNavigate={navigate}
            sections={sections}
            arc={arc}
            user={RAIL_USER}
          />
        }
      >
        <Outlet />
      </AppShell>
    </WorkspaceSelectionProvider>
  );
}
