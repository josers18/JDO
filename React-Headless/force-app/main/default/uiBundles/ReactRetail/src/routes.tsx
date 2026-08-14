import type { RouteObject } from 'react-router';
import { useNavigate } from 'react-router';
import { ConfigPage, ToastProvider } from '@shared';
import HomeLayout from './home/HomeLayout';
import HomePage from './home/HomePage';
import { APP_PERSONA } from './shell/appChrome';
import ClientLayout from './personas/customer/ClientLayout';
import Customer360Page from './personas/customer/Customer360Page';
import NotFound from './pages/NotFound';

/** Configuration page route — this center's identity comes from APP_PERSONA.
 *  Wrapped in its own ToastProvider (like HomePage) so save toasts render. */
function ConfigRoute() {
  const navigate = useNavigate();
  return (
    <ToastProvider>
      <ConfigPage center={APP_PERSONA} onBack={() => navigate('/')} />
    </ToastProvider>
  );
}

export const routes: RouteObject[] = [

  // CLIENT app — embedded Customer 360 (no in-app chrome; SF shell wraps it).
  {
    path: '/client',
    element: <ClientLayout />,
    children: [{ path: ':id', element: <Customer360Page /> }],
  },

  // HOME app — banker landing that replaces the standard home page (full shell).
  // The 10-section home is split across three grouped routes so a laptop fold
  // isn't a wall of stacked cards: Today (/) · Growth (/growth) · Health
  // (/health). All three share HomeLayout (chrome + CommandRail + sticky
  // Client-360 panel); only HomePage's `mode` prop changes which sections show.
  {
    path: '/',
    element: <HomeLayout />,
    children: [
      { index: true, element: <HomePage mode="today" />, handle: { showInNavigation: true, label: 'Today' } },
      { path: 'growth', element: <HomePage mode="growth" />, handle: { showInNavigation: true, label: 'Growth' } },
      { path: 'health', element: <HomePage mode="health" />, handle: { showInNavigation: true, label: 'Health' } },
      { path: 'config', element: <ConfigRoute />, handle: { showInNavigation: true, label: 'Configuration' } },
      { path: '*', element: <NotFound /> },
    ],
  },
];
