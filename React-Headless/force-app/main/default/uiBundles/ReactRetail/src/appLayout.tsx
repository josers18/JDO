import { Outlet, useNavigate, useLocation } from 'react-router';
import { ThemeProvider } from '@shared';
import { AppShell, type NavItem } from './shell/AppShell';

/**
 * Full-page application frame. Wraps every route in the light-mode retail theme
 * and the AppShell (left nav + top bar with native Agentforce launcher). The
 * cockpit content renders in the shell's <Outlet/>.
 */
export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const isClient = location.pathname.startsWith('/client');
  const nav: NavItem[] = [
    { id: 'home', label: 'Home', icon: '⌂', active: location.pathname === '/', onClick: () => navigate('/') },
    { id: 'clients', label: 'Clients', icon: '👥', active: isClient, onClick: () => navigate('/client/001am00000qvjsAAAQ') },
    { id: 'analytics', label: 'Analytics', icon: '📊', onClick: () => navigate('/') },
    { id: 'tasks', label: 'Tasks', icon: '✓', onClick: () => navigate('/') },
    { id: 'alerts', label: 'Alerts', icon: '🔔', onClick: () => navigate('/') },
  ];

  const title = isClient ? 'Customer 360' : 'Relationship Command Center';

  return (
    <ThemeProvider persona="retail" mode="light">
      <AppShell nav={nav} title={title}>
        <Outlet />
      </AppShell>
    </ThemeProvider>
  );
}
