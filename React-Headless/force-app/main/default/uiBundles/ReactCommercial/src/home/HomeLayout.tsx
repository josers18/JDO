import { Outlet, useNavigate, useLocation } from 'react-router';
import { ThemeProvider } from '@shared';
import { AppShell, type NavItem } from '../shell/AppShell';

/**
 * HOME app layout — the relationship manager's landing experience that REPLACES
 * the standard Salesforce home page. Full-page chrome: left nav rail + top bar
 * with the native Agentforce launcher. Light-mode commercial theme (copper).
 */
export default function HomeLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const nav: NavItem[] = [
    { id: 'home', label: 'Home', icon: 'home', active: location.pathname === '/', onClick: () => navigate('/') },
    { id: 'relationships', label: 'Relationships', icon: 'clients', onClick: () => navigate('/client/001am00000qvjsAAAQ') },
    { id: 'credit', label: 'Credit', icon: 'pipeline', onClick: () => navigate('/') },
    { id: 'treasury', label: 'Treasury', icon: 'tasks', onClick: () => navigate('/') },
    { id: 'alerts', label: 'Alerts', icon: 'alerts', onClick: () => navigate('/') },
  ];

  return (
    <ThemeProvider persona="commercial" mode="light">
      <AppShell nav={nav} title="Relationship Command">
        <Outlet />
      </AppShell>
    </ThemeProvider>
  );
}
