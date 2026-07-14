import { Outlet } from 'react-router';
import { ThemeProvider, CommandRail, type CommandRailSection, type CommandRailArcStep } from '@shared';
import { AppShell } from '../shell/AppShell';

/**
 * Command-center sections — ids match the section anchors rendered by HomePage
 * so the CommandRail's scroll-spy and smooth-scroll line up. Counts are
 * representative of the middle-market book.
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
  { label: 'Acme covenant review', time: '9:00', state: 'done' },
  { label: 'Northwind treasury pitch', time: '10:30', state: 'now' },
  { label: 'Sterling credit memo', time: '13:00', state: 'todo' },
  { label: 'Cascade renewal terms', time: '16:00', state: 'todo' },
];

/**
 * HOME app layout — the relationship manager's landing experience that REPLACES
 * the standard Salesforce home page. The signature CommandRail replaces the
 * built-in nav rail; the top bar, Agentforce FAB and aurora wash are unchanged.
 */
export default function HomeLayout() {
  return (
    <ThemeProvider persona="commercial" mode="light">
      <AppShell
        title="Relationship Command"
        sidebar={
          <CommandRail
            sections={RAIL_SECTIONS}
            arc={RAIL_ARC}
            user={{ name: 'Jose Sifontes', sub: 'Commercial · Cumulus FS' }}
          />
        }
      >
        <Outlet />
      </AppShell>
    </ThemeProvider>
  );
}
