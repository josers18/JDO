import { Outlet, useNavigate, useLocation } from 'react-router';
import { ThemeProvider } from '@shared';
import { AppShell } from '../../shell/AppShell';
import { APP_PERSONA, APP_TITLE, buildNav } from '../../shell/appChrome';

/**
 * CLIENT app layout — the Customer 360. These bundles render standalone at the
 * Salesforce App Domain (NOT embedded in a LEX record page), so no Lightning
 * shell supplies the waffle / top-level menus — the app must. Wraps the 360 in
 * the same `AppShell` chrome as the home page (via the shared `appChrome`
 * config) so the waffle, global search, notifications, user menu, left-nav, and
 * Agentforce are identical on every route.
 */
export default function ClientLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <ThemeProvider persona={APP_PERSONA} mode="light">
      <AppShell nav={buildNav(navigate, location.pathname)} title={APP_TITLE} agentforce={false}>
        <Outlet />
      </AppShell>
    </ThemeProvider>
  );
}
