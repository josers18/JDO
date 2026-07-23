/**
 * Brand theming client for React UI bundles.
 *
 * Same apexrest-bridge constraint as configClient / crmWriteClient: the
 * bundle's app-domain session can only reach /services/apexrest/*. So the
 * theming config UI reads/writes custom brand themes through
 * CommandCenterConfigRest's brand-theming endpoints:
 *
 *   GET  /services/apexrest/config/brand-logo?url=<url>  → { logoBase64, logoContentType }
 *   GET  /services/apexrest/config/themes                → { themes, activeThemeId }
 *   POST /services/apexrest/config/themes                → { themes, activeThemeId }
 *   POST /services/apexrest/config/active-theme          → { activeThemeId }
 */
import { createDataSDK } from '@salesforce/platform-sdk';
import type { BrandTheme } from '../theme/brandThemes';

/** The themes list plus which one (if any) is currently active. */
export interface ThemesResult {
  themes: BrandTheme[];
  activeThemeId: string | null;
}

/** The logo fetched for a given source URL, base64-encoded. */
export interface BrandLogoResult {
  logoBase64: string | null;
  logoContentType: string;
}

async function sdkFetch(): Promise<(input: string, init?: RequestInit) => Promise<Response>> {
  const sdk = await createDataSDK();
  if (!sdk.fetch) {
    throw new Error('fetch is not available on this surface');
  }
  return sdk.fetch.bind(sdk);
}

/** Coerce an arbitrary server payload into a well-formed ThemesResult so the
 *  UI never has to null-check nested fields. */
function normalizeThemesResult(raw: unknown): ThemesResult {
  const r = (raw ?? {}) as Partial<ThemesResult>;
  return {
    themes: Array.isArray(r.themes) ? r.themes : [],
    activeThemeId: r.activeThemeId ?? null,
  };
}

/**
 * Fetch a favicon/logo for a candidate brand source URL.
 *
 * NEVER rejects — on any failure (server error or network throw) this
 * degrades to `{ logoBase64: null, logoContentType: '' }` so the "couldn't
 * fetch logo, continue with colors" UI flow is never blocked.
 */
export async function fetchBrandLogo(url: string): Promise<BrandLogoResult> {
  try {
    const fetch = await sdkFetch();
    const res = await fetch(`/services/apexrest/config/brand-logo?url=${encodeURIComponent(url)}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    const json = (await res.json()) as { logoBase64?: string | null; logoContentType?: string };
    if (!res.ok) {
      return { logoBase64: null, logoContentType: '' };
    }
    return {
      logoBase64: json.logoBase64 ?? null,
      logoContentType: json.logoContentType ?? '',
    };
  } catch {
    return { logoBase64: null, logoContentType: '' };
  }
}

/** Read the saved custom brand themes and which one (if any) is active. */
export async function listThemes(): Promise<ThemesResult> {
  const fetch = await sdkFetch();
  const res = await fetch('/services/apexrest/config/themes', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  const json = (await res.json()) as { themes?: BrandTheme[]; activeThemeId?: string | null; error?: string };
  if (!res.ok) {
    throw new Error(json?.error ?? `Failed to load themes (HTTP ${res.status})`);
  }
  return normalizeThemesResult(json);
}

/** Create or update a custom brand theme. Returns the full updated list. */
export async function saveTheme(theme: BrandTheme): Promise<ThemesResult> {
  const fetch = await sdkFetch();
  const res = await fetch('/services/apexrest/config/themes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op: 'upsert', theme }),
  });
  const json = (await res.json()) as { themes?: BrandTheme[]; activeThemeId?: string | null; error?: string };
  if (!res.ok) {
    throw new Error(json?.error ?? `Failed to save theme (HTTP ${res.status})`);
  }
  return normalizeThemesResult(json);
}

/** Delete a custom brand theme by id. Returns the full updated list. */
export async function deleteTheme(id: string): Promise<ThemesResult> {
  const fetch = await sdkFetch();
  const res = await fetch('/services/apexrest/config/themes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op: 'delete', id }),
  });
  const json = (await res.json()) as { themes?: BrandTheme[]; activeThemeId?: string | null; error?: string };
  if (!res.ok) {
    throw new Error(json?.error ?? `Failed to delete theme (HTTP ${res.status})`);
  }
  return normalizeThemesResult(json);
}

/** Set (or clear, when `id` is null) the org's active custom brand theme. */
export async function setActiveTheme(id: string | null): Promise<{ activeThemeId: string | null }> {
  const fetch = await sdkFetch();
  const res = await fetch('/services/apexrest/config/active-theme', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ themeId: id }),
  });
  const json = (await res.json()) as { activeThemeId?: string | null; error?: string };
  if (!res.ok) {
    throw new Error(json?.error ?? `Failed to set active theme (HTTP ${res.status})`);
  }
  return { activeThemeId: json.activeThemeId ?? null };
}
