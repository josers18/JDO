/**
 * Public entry point for the _shared foundation library.
 * Persona app bundles import from '@shared'. _shared is source-only — NOT a
 * deployable UI bundle (no package.json / meta XML). Vite inlines it into each
 * app's dist at build time.
 *
 * NOTE: the data layer (executeGraphQL / queryDataCloud) is intentionally NOT
 * re-exported here yet — the cockpits currently run on swappable mock fetchers
 * (see each app's data/ dir). When wiring real data, add `export * from './data'`.
 */
export const SHARED_VERSION = '1.0.0';

export * from './theme';
export * from './hooks';
export * from './components';
export * from './charts';
export * from './data';
