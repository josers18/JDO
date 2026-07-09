import { Outlet, useNavigate, useLocation } from 'react-router';
import { ThemeProvider } from '@shared';
import { AppShell, type NavItem } from '../shell/AppShell';

/**
 * HOME app layout — the banker's landing experience that REPLACES the standard
 * Salesforce home page. Full-page chrome: left nav rail + top bar with the
 * native Agentforce launcher. Light-mode retail theme.
 */
export default function HomeLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const nav: NavItem[] = [
    { id: 'home', label: 'Home', icon: 'home', active: location.pathname === '/', onClick: () => navigate('/') },
    { id: 'clients', label: 'Clients', icon: 'clients', onClick: () => navigate('/client/001am00000qvjsAAAQ') },
    { id: 'pipeline', label: 'Pipeline', icon: 'pipeline', onClick: () => navigate('/') },
    { id: 'tasks', label: 'Tasks', icon: 'tasks', onClick: () => navigate('/') },
    { id: 'alerts', label: 'Alerts', icon: 'alerts', onClick: () => navigate('/') },
  ];

  return (
    <ThemeProvider persona="retail" mode="light">
      <AppShell nav={nav} title="Relationship Command Center">
        <Outlet />
      </AppShell>
    </ThemeProvider>
  );
}
