/**
 * Per-bundle HomeData context. The generic factory lives in @shared (it wraps
 * `useAsyncData` and provides `{ data, loading, refetch }`); here we instantiate
 * it over this bundle's local `HomeDashboard` shape so the layout's CommandRail
 * and the page's cards read from a single shared fetch.
 */
import { createHomeDataContext } from '@shared';
import type { HomeDashboard } from './homeTypes';

export const { HomeDataProvider, useHomeData } = createHomeDataContext<HomeDashboard>();
