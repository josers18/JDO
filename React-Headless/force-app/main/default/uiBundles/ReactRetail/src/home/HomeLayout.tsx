import { Outlet } from 'react-router';
import {
  ThemeProvider,
  CommandRail,
  HomeViewProvider,
  HomeViewToggle,
  WorkspaceSelectionProvider,
  type CommandRailSection,
  type CommandRailArcStep,
  type CommandRailPinned,
} from '@shared';
import { AppShell } from '../shell/AppShell';
import { APP_PERSONA } from '../shell/appChrome';

/**
 * Command-center sections — ids match the section anchors rendered by HomePage
 * so the CommandRail's scroll-spy and smooth-scroll line up. Counts are
 * representative of the retail book.
 */
const RAIL_SECTIONS: CommandRailSection[] = [
  { id: 'brief', label: 'Daily brief', icon: 'sparkle' },
  { id: 'queue', label: 'Priority queue', icon: 'tasks', count: 5, tone: 'risk' },
  { id: 'actions', label: 'Recommended actions', icon: 'wand', count: 4, tone: 'ai' },
  { id: 'kpis', label: 'Pulse metrics', icon: 'metrics' },
  { id: 'events', label: 'Life events', icon: 'lifeEvent', count: 3, tone: 'warn' },
  { id: 'pipeline', label: 'Pipeline', icon: 'pipeline' },
  { id: 'leads', label: 'Leads & referrals', icon: 'leads', count: 6 },
  { id: 'pulse', label: 'Portfolio pulse', icon: 'pulse' },
];

const RAIL_ARC: CommandRailArcStep[] = [
  { label: 'Morning review', time: 'done', state: 'done' },
  { label: 'Morris rollover call', time: '2:30', state: 'now' },
  { label: 'Bennett mortgage', time: '3:15', state: 'todo' },
  { label: 'Prep Omega close', time: '4:00', state: 'todo' },
];

/** Pinned accounts — clicking one selects it into the workspace right panel. */
const RAIL_PINNED: CommandRailPinned[] = [
  { name: 'Julie E Morris', sub: 'Retail household · $1.24M' },
  { name: 'Cooper Household', sub: 'Retail · at risk' },
  { name: 'Bennett Family', sub: 'Mortgage · in progress' },
];

/**
 * HOME app layout — the banker's landing experience that REPLACES the standard
 * Salesforce home page. The signature CommandRail replaces the built-in nav
 * rail; the top bar, Agentforce FAB and aurora wash are unchanged.
 */
export default function HomeLayout() {
  return (
    <ThemeProvider persona="retail" mode="light">
      <HomeViewProvider persona={APP_PERSONA}>
        <WorkspaceSelectionProvider>
          <AppShell
            title="Relationship Command Center"
            titleAside={<HomeViewToggle />}
            sidebar={
              <CommandRail
                sections={RAIL_SECTIONS}
                arc={RAIL_ARC}
                pinned={RAIL_PINNED}
                user={{ name: 'Jose Sifontes', sub: 'Retail · Cumulus FS' }}
              />
            }
          >
            <Outlet />
          </AppShell>
        </WorkspaceSelectionProvider>
      </HomeViewProvider>
    </ThemeProvider>
  );
}
