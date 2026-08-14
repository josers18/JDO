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
 * so the CommandRail's scroll-spy and smooth-scroll line up. Labels + icons +
 * tones are the persona-specific STATIC shape; the badge counts are derived from
 * the live HomeDashboard in HomeLayoutInner (a count is omitted when its list is
 * empty), so these entries carry no hardcoded count.
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

/** Fallback arc shown while the dashboard loads (before the live schedule lands). */
const FALLBACK_ARC: CommandRailArcStep[] = [{ label: 'No meetings today', time: '', state: 'todo' }];

const RAIL_USER = { name: 'Jose Sifontes', sub: 'Commercial · Cumulus FS' };
const PINNED_STORAGE_KEY = 'cumulus.pinned.commercial';

/**
 * HOME app layout — the relationship manager's landing experience that REPLACES
 * the standard Salesforce home page. The signature CommandRail replaces the
 * built-in nav rail; the top bar, Agentforce FAB and aurora wash are unchanged.
 *
 * The providers live here; the actual sidebar/shell (which needs the live
 * dashboard to derive the rail's arc, counts, and pinned accounts) is rendered
 * by HomeLayoutInner under a single shared HomeDataProvider fetch — the same
 * fetch HomePage consumes, so layout + page never double-fetch.
 */
export default function HomeLayout() {
  return (
    <ThemeProvider persona="commercial" mode="light">
      <HomeViewProvider persona={APP_PERSONA}>
        <HomeDataProvider fetch={fetchHomeDashboard}>
          <HomeLayoutInner />
        </HomeDataProvider>
      </HomeViewProvider>
    </ThemeProvider>
  );
}

/**
 * Consumes the shared HomeData fetch and derives the CommandRail's arc, section
 * counts, and pinned accounts from the live dashboard.
 *
 * Pin-seed timing: WorkspaceSelectionProvider reads `initialPinned` only in its
 * lazy useState initializer (it does NOT react to later prop changes), so we
 * GATE its render until `data` is present. While loading we render a skeleton
 * shell whose CommandRail shows static sections and no pins; once data lands the
 * real tree mounts and the provider seeds the derived pins on that first mount.
 */
function HomeLayoutInner() {
  const { data, loading } = useHomeData();

  // ── Loading branch: static shell, no WorkspaceSelectionProvider (CommandRail
  //    falls back to an empty pinned list when no provider is mounted, and
  //    HomePage renders its own "Loading your book…" guard inside the Outlet).
  if (loading || !data) {
    return (
      <AppShell
        title="Relationship Command"
        titleAside={<HomeViewToggle />}
        sidebar={<CommandRail sections={RAIL_SECTIONS} arc={FALLBACK_ARC} user={RAIL_USER} />}
      >
        <Outlet />
      </AppShell>
    );
  }

  // ── Arc: today/overdue schedule items → timeline steps. Past items read as
  //    done; the first not-yet-past item is "now"; the rest are "todo". Empty
  //    schedule collapses to a single "No meetings today" step.
  const dayItems = tagSchedule(data.schedule).filter(s => s.bucket === 'today' || s.bucket === 'overdue');
  let markedNow = false;
  const arc: CommandRailArcStep[] = dayItems.length
    ? dayItems.map(s => {
        let state: CommandRailArcStep['state'];
        if (s.bucket === 'overdue') {
          state = 'done';
        } else if (!markedNow) {
          state = 'now';
          markedNow = true;
        } else {
          state = 'todo';
        }
        return { label: s.title, time: s.time || '', state };
      })
    : FALLBACK_ARC;

  // ── Section counts from live list lengths (omit when empty — never pass 0,
  //    which would render a "0" badge). Labels/icons/tones stay static above.
  const countFor = (n: number) => (n > 0 ? n : undefined);
  const counts: Record<string, number | undefined> = {
    queue: countFor(data.callList.length),
    actions: countFor(data.recommendations.length),
    events: countFor(data.lifeEvents.length),
    leads: countFor(data.leads.length),
  };
  const sections: CommandRailSection[] = RAIL_SECTIONS.map(s =>
    s.id in counts ? { ...s, count: counts[s.id] } : s,
  );

  // ── Pins: top real accounts from the priority queue. Real clientId so a pin
  //    click resolves to a live selection; sub is a short live descriptor.
  const pins: CommandRailPinned[] = data.callList.slice(0, 3).map(c => ({
    id: c.clientId,
    name: c.clientName,
    sub: `${c.segment} · ${c.severity === 'high' ? 'High risk' : c.severity === 'medium' ? 'Watch' : c.reason}`,
  }));

  return (
    <WorkspaceSelectionProvider initialPinned={pins} storageKey={PINNED_STORAGE_KEY}>
      <AppShell
        title="Relationship Command"
        titleAside={<HomeViewToggle />}
        sidebar={<CommandRail sections={sections} arc={arc} user={RAIL_USER} />}
      >
        <Outlet />
      </AppShell>
    </WorkspaceSelectionProvider>
  );
}
