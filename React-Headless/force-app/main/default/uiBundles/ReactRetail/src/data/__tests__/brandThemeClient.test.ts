import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BrandTheme } from '@shared';

const mockFetch = vi.fn();
vi.mock('@salesforce/platform-sdk', () => ({
  createDataSDK: vi.fn(async () => ({ fetch: mockFetch })),
}));

import { fetchBrandLogo, listThemes, saveTheme, deleteTheme, setActiveTheme } from '@shared';

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as unknown as Response;
}

const t: BrandTheme = {
  id: 'id1',
  name: 'Acme',
  sourceUrl: 'acme.com',
  logoBase64: 'base64data',
  logoContentType: 'image/png',
  accent: '#336699',
  accentSoft: '#a9c4de',
};

beforeEach(() => {
  mockFetch.mockReset();
});

describe('listThemes', () => {
  it('GETs the themes endpoint and returns the normalized result', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ themes: [t], activeThemeId: 'x' }));

    const result = await listThemes();

    expect(mockFetch).toHaveBeenCalledWith('/services/apexrest/config/themes', expect.objectContaining({ method: 'GET' }));
    expect(result.themes).toHaveLength(1);
    expect(result.activeThemeId).toBe('x');
  });

  it('rejects with the server error message on !res.ok', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: 'boom' }, false, 500));

    await expect(listThemes()).rejects.toThrow('boom');
  });
});

describe('saveTheme', () => {
  it('POSTs an upsert op with the theme body and returns normalized result', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ themes: [t], activeThemeId: 'id1' }));

    const result = await saveTheme(t);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/services/apexrest/config/themes');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ op: 'upsert', theme: t });
    expect(result).toEqual({ themes: [t], activeThemeId: 'id1' });
  });
});

describe('deleteTheme', () => {
  it('POSTs a delete op with the id body', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ themes: [], activeThemeId: null }));

    const result = await deleteTheme('id1');

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/services/apexrest/config/themes');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ op: 'delete', id: 'id1' });
    expect(result).toEqual({ themes: [], activeThemeId: null });
  });
});

describe('setActiveTheme', () => {
  it('POSTs the themeId to the active-theme endpoint', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ activeThemeId: 'id2' }));

    const result = await setActiveTheme('id2');

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/services/apexrest/config/active-theme');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ themeId: 'id2' });
    expect(result).toEqual({ activeThemeId: 'id2' });
  });
});

describe('fetchBrandLogo', () => {
  it('GETs the brand-logo endpoint with an encoded url and returns the result', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ logoBase64: 'abc', logoContentType: 'image/png' }));

    const result = await fetchBrandLogo('acme.com');

    expect(mockFetch).toHaveBeenCalledWith(
      '/services/apexrest/config/brand-logo?url=acme.com',
      expect.objectContaining({ method: 'GET' })
    );
    expect(result).toEqual({ logoBase64: 'abc', logoContentType: 'image/png' });
  });

  it('degrades to a null result instead of rejecting on !res.ok', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, false, 500));

    const result = await fetchBrandLogo('acme.com');

    expect(result).toEqual({ logoBase64: null, logoContentType: '' });
  });

  it('degrades to a null result instead of rejecting on a network throw', async () => {
    mockFetch.mockRejectedValue(new Error('net'));

    const result = await fetchBrandLogo('acme.com');

    expect(result).toEqual({ logoBase64: null, logoContentType: '' });
  });
});
