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

/**
 * Command-center sections — ids match the section anchors rendered by HomePage
 * so the CommandRail's scroll-spy and smooth-scroll line up. Labels + icons are
 * persona-static; the per-section counts are derived from the live dashboard
 * (see deriveSections) so they always match the lists on the page.
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
const FALLBACK_ARC: CommandRailArcStep[] = [{ label: 'No meetings today', time: '', state: 'todo' }];

const RAIL_USER = { name: 'Jose Sifontes', sub: 'Wealth · Cumulus FS' };
const PINNED_STORAGE_KEY = 'cumulus.pinned.wealth';

type HomeDashboardData = ReturnType<typeof useHomeData>['data'];

/**
 * Short clock/day label for an arc step. Events carry a full ISO datetime in
 * `startDateTime` — surface the clock time (e.g. "10:30 AM"); tasks only have an
 * ISO date, so show a compact "Mon 4" day. '—' / unparseable → ''.
 */
function arcTime(item: { startDateTime?: string; time: string }): string {
  if (item.startDateTime) {
    const d = new Date(item.startDateTime);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    }
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(item.time)) {
    const d = new Date(`${item.time}T00:00:00`);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
    }
  }
  return '';
}

/**
 * Derive the CommandRail's dated arc from the live schedule: today + overdue
 * items become steps (tagged via the shared bucketer so ordering matches the
 * page's schedule table). Overdue items read as "done", the first item due today
 * is "now", the rest "todo". Empty → a single "No meetings today" step so the
 * arc never renders blank.
 */
function deriveArc(data: HomeDashboardData): CommandRailArcStep[] {
  if (!data) return FALLBACK_ARC;
  const items = tagSchedule(data.schedule).filter(s => s.bucket === 'today' || s.bucket === 'overdue');
  if (!items.length) return FALLBACK_ARC;
  let markedNow = false;
  return items.map(s => {
    let state: CommandRailArcStep['state'];
    if (s.bucket === 'overdue') {
      state = 'done';
    } else if (!markedNow) {
      state = 'now';
      markedNow = true;
    } else {
      state = 'todo';
    }
    return { label: s.title, time: arcTime(s), state };
  });
}

/**
 * Keep the persona-static section labels/icons/ids/tones, but attach a live
 * count to the four list-backed sections (queue / actions / events / leads).
 * A count is OMITTED (undefined) when its list is empty, so the rail shows no
 * "0" badge — matching the CommandRail's `count != null` badge rule.
 */
function deriveSections(data: HomeDashboardData): CommandRailSection[] {
  if (!data) return RAIL_SECTIONS;
  const counts: Record<string, number> = {
    queue: data.callList.length,
    actions: data.recommendations.length,
    events: data.lifeEvents.length,
    leads: data.leads.length,
  };
  return RAIL_SECTIONS.map(s =>
    s.id in counts ? { ...s, count: counts[s.id] || undefined } : s,
  );
}

/**
 * Pinned accounts — the top real risk accounts from the live queue. Clicking one
 * selects it into the workspace right panel; the real Account id (clientId) makes
 * the pin resolve through selectClient → buildClientSelection every time.
 */
function derivePins(data: HomeDashboardData): CommandRailPinned[] {
  if (!data) return [];
  return data.callList.slice(0, 3).map(c => ({
    id: c.clientId,
    name: c.clientName,
    sub: [c.segment, c.severity === 'high' ? 'High risk' : c.reason].filter(Boolean).join(' · '),
  }));
}

/**
 * HOME app layout — the advisor's landing experience that REPLACES the standard
 * Salesforce home page. The signature CommandRail replaces the built-in nav
 * rail; the top bar, Agentforce FAB and aurora wash are unchanged. A single
 * HomeDataProvider fetch feeds both this layout (rail arc/counts/pins) and the
 * page below (via useHomeData) — one fetch, two consumers.
 */
export default function HomeLayout() {
  return (
    <ThemeProvider persona="wealth" mode="light">
      <HomeViewProvider persona={APP_PERSONA}>
        <HomeDataProvider fetch={fetchHomeDashboard}>
          <HomeLayoutInner />
        </HomeDataProvider>
      </HomeViewProvider>
    </ThemeProvider>
  );
}

/**
 * Consumes the shared HomeData. The pins depend on data that lands after mount,
 * and WorkspaceSelectionProvider only reads `initialPinned` in its lazy
 * initializer (it does NOT react to later prop changes). So we GATE the
 * provider: while data loads we render a lightweight AppShell + static
 * CommandRail with no provider (CommandRail falls back to an empty pinned list),
 * and only mount WorkspaceSelectionProvider once `data` is present — its
 * initializer then seeds the real pins on first mount.
 */
function HomeLayoutInner() {
  const { data, loading } = useHomeData();

  if (loading || !data) {
    return (
      <AppShell
        title="Advisory Desk"
        titleAside={<HomeViewToggle />}
        sidebar={<CommandRail sections={RAIL_SECTIONS} arc={FALLBACK_ARC} user={RAIL_USER} />}
      >
        <Outlet />
      </AppShell>
    );
  }

  return (
    <WorkspaceSelectionProvider initialPinned={derivePins(data)} storageKey={PINNED_STORAGE_KEY}>
      <AppShell
        title="Advisory Desk"
        titleAside={<HomeViewToggle />}
        sidebar={
          <CommandRail sections={deriveSections(data)} arc={deriveArc(data)} user={RAIL_USER} />
        }
      >
        <Outlet />
      </AppShell>
    </WorkspaceSelectionProvider>
  );
}
