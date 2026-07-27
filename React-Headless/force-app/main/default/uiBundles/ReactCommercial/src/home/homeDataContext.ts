import { createHomeDataContext } from '@shared';
import type { HomeDashboard } from './homeTypes';

/**
 * HomeData context for the Commercial cockpit — one `fetchHomeDashboard` fetch
 * shared by HomeLayout (CommandRail arc/counts/pins) and HomePage (the cards).
 * `HomeDashboard` lives per-bundle in ./homeTypes, so the shared factory is
 * generic and instantiated here against the local type.
 */
export const { HomeDataProvider, useHomeData } = createHomeDataContext<HomeDashboard>();
