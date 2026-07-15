import { Outlet } from 'react-router';
import {
  ThemeProvider,
  CommandRail,
  HomeViewProvider,
  HomeViewToggle,
  type CommandRailSection,
  type CommandRailArcStep,
} from '@shared';
import { AppShell } from '../shell/AppShell';
import { APP_PERSONA } from '../shell/appChrome';

/**
 * Command-center sections — ids match the section anchors rendered by HomePage
 * so the CommandRail's scroll-spy and smooth-scroll line up. Counts are
 * representative of the advisory book.
 */
const RAIL_SECTIONS: CommandRailSection[] = [
  { id: 'brief', label: 'Daily brief', icon: 'sparkle' },
  { id: 'queue', label: 'Priority queue', icon: 'tasks', count: 5, tone: 'risk' },
  { id: 'actions', label: 'Recommended actions', icon: 'wand', count: 4, tone: 'ai' },
  { id: 'kpis', label: 'Pulse metrics', icon: 'metrics' },
  { id: 'events', label: 'Life events', icon: 'lifeEvent', count: 4, tone: 'warn' },
  { id: 'pipeline', label: 'Pipeline', icon: 'pipeline' },
  { id: 'leads', label: 'Leads & referrals', icon: 'leads', count: 4 },
  { id: 'pulse', label: 'Portfolio pulse', icon: 'pulse' },
];

const RAIL_ARC: CommandRailArcStep[] = [
  { label: 'Whitfield rebalance review', time: '9:00', state: 'done' },
  { label: 'Morris held-away call', time: '10:30', state: 'now' },
  { label: 'Kessler MGP plan', time: '13:00', state: 'todo' },
  { label: 'Priya ESG proposal', time: '16:00', state: 'todo' },
];

/**
 * HOME app layout — the advisor's landing experience that REPLACES the standard
 * Salesforce home page. The signature CommandRail replaces the built-in nav
 * rail; the top bar, Agentforce FAB and aurora wash are unchanged.
 */
export default function HomeLayout() {
  return (
    <ThemeProvider persona="wealth" mode="light">
      <HomeViewProvider persona={APP_PERSONA}>
        <AppShell
          title="Advisory Desk"
          titleAside={<HomeViewToggle />}
          sidebar={
            <CommandRail
              sections={RAIL_SECTIONS}
              arc={RAIL_ARC}
              user={{ name: 'Jose Sifontes', sub: 'Wealth · Cumulus FS' }}
            />
          }
        >
          <Outlet />
        </AppShell>
      </HomeViewProvider>
    </ThemeProvider>
  );
}
