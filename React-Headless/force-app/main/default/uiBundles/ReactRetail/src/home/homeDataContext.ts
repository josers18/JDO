import { createHomeDataContext } from '@shared';
import type { HomeDashboard } from './homeTypes';

/**
 * Persona-scoped HomeData context — one shared `fetchHomeDashboard` run whose
 * result feeds BOTH the layout (CommandRail arc / section counts / pins) and
 * the page (all the cockpit cards). The generic factory lives in @shared; the
 * `HomeDashboard` type is per-bundle, so it's supplied here as the type arg.
 */
export const { HomeDataProvider, useHomeData } = createHomeDataContext<HomeDashboard>();
