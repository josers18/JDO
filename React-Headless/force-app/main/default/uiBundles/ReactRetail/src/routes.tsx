import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import type { RouteObject } from 'react-router';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { ConfigPage, ToastProvider } from '@shared';
import HomeLayout from './home/HomeLayout';
import HomePage from './home/HomePage';
import { APP_PERSONA } from './shell/appChrome';
import ClientLayout from './personas/customer/ClientLayout';
import Customer360Page from './personas/customer/Customer360Page';
import NotFound from './pages/NotFound';

const AtlasShell = lazy(() => import('@shared/components/atlas/AtlasShell'));
const AtlasPipeline = lazy(() => import('@shared/components/atlas/AtlasPipeline'));

const atlasBuild = import.meta.env.MODE === 'atlas';
const atlasPaths = ['/', '/relationships', '/pipeline', '/journey', '/growth', '/intelligence', '/health', '/work', '/config', '/prospecting', '/client/:id'];

type Workspace = ComponentType<{page: string; ownerId: string; ownerName: string; actorScope?: string}>;
const workspaceEntry = import.meta.glob<{ default: Workspace }>('./atlas/*AtlasWorkspace.tsx')['./atlas/RetailAtlasWorkspace.tsx'];
const AtlasWorkspace = workspaceEntry ? lazy(workspaceEntry) : null;

function AtlasRoute() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const link = (path: string, content: ReactNode, className?: string) =>
    <Link to={path} className={className} aria-current={path === pathname ? 'page' : undefined}>{content}</Link>;
  const setPipelineFilter = (key: 'q' | 'stage' | 'deal', value: string) => {
    setParams(current => {
      const next = new URLSearchParams(current);
      if (key !== 'deal') next.delete('deal');
      if (value) next.set(key, value); else next.delete(key);
      return next;
    }, {replace: key !== 'deal'});
  };

  return (
    <ToastProvider>
      <Suspense fallback={<p role="status" className="p-6">Loading Atlas…</p>}>
        <AtlasShell persona={APP_PERSONA} path={pathname} search={params.toString()} link={link} navigate={navigate}
          workspace={(owner, actor) => {
            if (pathname === '/config') return <ConfigPage appearance="atlas" center={APP_PERSONA} onBack={() => navigate('/')} />;
            if (!owner) return null;
            if (pathname === '/pipeline') return <AtlasPipeline ownerId={owner.userId} ownerName={owner.name} actorId={actor?.userId} persona={APP_PERSONA} link={link}
              locationState={{search: params.get('q') ?? '', stage: params.get('stage') ?? '', deal: params.get('deal') ?? '', set: setPipelineFilter}} />;

            return AtlasWorkspace ? <AtlasWorkspace page={pathname === '/' ? 'today' : pathname.startsWith('/client/') ? 'client' : pathname.slice(1)} ownerId={owner.userId}
              ownerName={owner.name} actorScope={actor?.userId} /> : null;
          }} />
      </Suspense>
    </ToastProvider>
  );
}

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
  ...(atlasBuild ? [{ element: <AtlasRoute />, children: atlasPaths.map(path => ({ path, element: null })) }] : []),

  // CLIENT app — embedded Customer 360 (no in-app chrome; SF shell wraps it).
  {
    path: atlasBuild ? '/cockpit/client' : '/client',
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
      { ...(atlasBuild ? { path: 'cockpit' } : { index: true as const }), element: <HomePage mode="today" />, handle: { showInNavigation: true, label: 'Today' } },
      { path: atlasBuild ? 'cockpit/growth' : 'growth', element: <HomePage mode="growth" />, handle: { showInNavigation: true, label: 'Growth' } },
      { path: atlasBuild ? 'cockpit/health' : 'health', element: <HomePage mode="health" />, handle: { showInNavigation: true, label: 'Health' } },
      ...(!atlasBuild ? [{ path: 'config', element: <ConfigRoute />, handle: { showInNavigation: true, label: 'Configuration' } }] : []),
      { path: '*', element: <NotFound /> },
    ],
  },
];
