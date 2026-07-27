import { Outlet } from 'react-router';
import {
  ThemeProvider,
  CommandRail,
  HomeViewProvider,
  HomeViewToggle,
  WorkspaceSelectionProvider,
  tagSchedule,
  type CommandRailSection,
  type CommandRailArcStep,
  type CommandRailPinned,
} from '@shared';
import { AppShell } from '../shell/AppShell';
import { APP_PERSONA } from '../shell/appChrome';
import { HomeDataProvider, useHomeData } from './homeDataContext';
import { fetchHomeDashboard } from './homeData';
import type { HomeDashboard, ScheduleItem, CallItem } from './homeTypes';

/**
 * Command-center sections — ids match the section anchors rendered by HomePage
 * so the CommandRail's scroll-spy and smooth-scroll line up. Labels + icons +
 * tones are persona-static; the badge COUNTS are derived per-render from the
 * live dashboard (see deriveSections), so this list carries no hard counts.
 */
const RAIL_SECTIONS: CommandRailSection[] = [
  { id: 'brief', label: 'Daily brief', icon: 'sparkle' },
  { id: 'kpis', label: 'Key metrics', icon: 'metrics' },
  { id: 'schedule', label: 'Tasks & schedule', icon: 'meeting' },
  { id: 'queue', label: 'Priority queue', icon: 'tasks', tone: 'risk' },
  { id: 'actions', label: 'Recommended actions', icon: 'wand', tone: 'ai' },
  { id: 'events', label: 'Life events', icon: 'lifeEvent', tone: 'warn' },
  { id: 'alerts', label: 'Risk alerts', icon: 'alerts', tone: 'risk' },
  { id: 'pipeline', label: 'Pipeline', icon: 'pipeline' },
  { id: 'leads', label: 'Leads & referrals', icon: 'leads' },
  { id: 'pulse', label: 'Portfolio pulse', icon: 'pulse' },
];

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

/**
 * Derive rail badge counts from live list lengths. Labels/icons/tones stay
 * static (persona identity); only `count` is filled — and left `undefined` for
 * an empty list so no "0" badge renders.
 */
function deriveSections(data: HomeDashboard | null): CommandRailSection[] {
  const countOf = (n: number) => (n > 0 ? n : undefined);
  const counts: Record<string, number | undefined> = {
    queue: countOf(data?.callList.length ?? 0),
    actions: countOf(data?.recommendations.length ?? 0),
    events: countOf(data?.lifeEvents.length ?? 0),
    leads: countOf(data?.leads.length ?? 0),
  };
  return RAIL_SECTIONS.map(s => (s.id in counts ? { ...s, count: counts[s.id] } : s));
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
          <CommandRail sections={deriveSections(null)} arc={FALLBACK_ARC} user={RAIL_USER} />
        }
      >
        <Outlet />
      </AppShell>
    );
  }

  const arc = deriveArc(data.schedule);
  const sections = deriveSections(data);
  const pins = derivePins(data);

  return (
    <WorkspaceSelectionProvider initialPinned={pins} storageKey="cumulus.pinned.retail">
      <AppShell
        title="Relationship Command Center"
        titleAside={<HomeViewToggle />}
        sidebar={<CommandRail sections={sections} arc={arc} user={RAIL_USER} />}
      >
        <Outlet />
      </AppShell>
    </WorkspaceSelectionProvider>
  );
}
