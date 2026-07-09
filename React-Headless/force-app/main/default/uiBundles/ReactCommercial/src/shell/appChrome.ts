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
export const APP_PERSONA: PersonaKey = 'commercial';
export const APP_TITLE = 'Relationship Command';

/** Build the left-nav rail. `pathname` drives the active-item highlight. */
export function buildNav(navigate: NavigateFunction, pathname: string): NavItem[] {
  return [
    { id: 'home', label: 'Home', icon: 'home', active: pathname === '/', onClick: () => navigate('/') },
    { id: 'relationships', label: 'Relationships', icon: 'clients', active: pathname.startsWith('/client'), onClick: () => navigate('/client/001am00000qvjsAAAQ') },
    { id: 'credit', label: 'Credit', icon: 'pipeline', onClick: () => navigate('/') },
    { id: 'treasury', label: 'Treasury', icon: 'tasks', onClick: () => navigate('/') },
    { id: 'alerts', label: 'Alerts', icon: 'alerts', onClick: () => navigate('/') },
  ];
}
