import { Outlet, useNavigate, useLocation } from 'react-router';
import { ThemeProvider } from '@shared';
import { AppShell } from '../shell/AppShell';
import { APP_PERSONA, APP_TITLE, buildNav } from '../shell/appChrome';

/**
 * HOME app layout — the advisor's landing experience that REPLACES the standard
 * Salesforce home page. Full-page chrome (left nav rail + top bar with the
 * waffle, global search, notifications, user menu, and Agentforce) comes from
 * the shared `appChrome` config, so it matches the Customer 360 exactly.
 * Light-mode wealth theme (gold accent).
 */
export default function HomeLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <ThemeProvider persona={APP_PERSONA} mode="light">
      <AppShell nav={buildNav(navigate, location.pathname)} title={APP_TITLE}>
        <Outlet />
      </AppShell>
    </ThemeProvider>
  );
}
