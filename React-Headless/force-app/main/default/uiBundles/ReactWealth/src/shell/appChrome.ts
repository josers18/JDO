import type { NavigateFunction } from 'react-router';
import type { PersonaKey } from '@shared';
import type { NavItem } from './AppShell';

/**
 * Single source of truth for this cockpit's app chrome — persona theme, top-bar
 * title, and the left-nav rail. BOTH the home layout (`HomeLayout`) and the
 * embedded Customer 360 (`ClientLayout`) consume this so the waffle + top-level
 * menus are identical on every route (these bundles render standalone at the
 * Salesforce App Domain, so no LEX shell supplies the chrome — the app must).
 */
export const APP_PERSONA: PersonaKey = 'wealth';
export const APP_TITLE = 'Advisory Desk';

/** Build the left-nav rail. `pathname` drives the active-item highlight. */
export function buildNav(navigate: NavigateFunction, pathname: string): NavItem[] {
  return [
    { id: 'home', label: 'Home', icon: 'home', active: pathname === '/', onClick: () => navigate('/') },
    { id: 'clients', label: 'Clients', icon: 'clients', active: pathname.startsWith('/client'), onClick: () => navigate('/client/001am00000qvjsAAAQ') },
    { id: 'portfolios', label: 'Portfolios', icon: 'pipeline', onClick: () => navigate('/') },
    { id: 'plans', label: 'Plans', icon: 'tasks', onClick: () => navigate('/') },
    { id: 'alerts', label: 'Alerts', icon: 'alerts', onClick: () => navigate('/') },
  ];
}
