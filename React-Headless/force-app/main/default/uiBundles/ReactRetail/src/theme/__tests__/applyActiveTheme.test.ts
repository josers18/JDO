import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BrandTheme } from '@shared';

// applyActiveTheme.ts (inside _shared) imports `listThemes` from the
// relative path `../data/brandThemeClient`. Mock that module directly by
// its path AS SEEN FROM THIS TEST FILE (vi.mock resolves relative to the
// test file, not the module under test) so setBrandOverride/getBrandOverride/
// resolveActiveTheme stay real and the test exercises the actual store.
const listThemes = vi.fn();
vi.mock('../../../../_shared/src/data/brandThemeClient', () => ({
  listThemes: (...args: unknown[]) => listThemes(...args),
}));

import { applyActiveThemeOnLoad, setBrandOverride, getBrandOverride } from '@shared';

const t: BrandTheme = {
  id: 'theme-a',
  name: 'Acme Corp',
  sourceUrl: 'https://acme.example.com',
  logoBase64: 'abc123',
  logoContentType: 'image/png',
  accent: '#14b8a6',
  accentSoft: '#5eead4',
};

beforeEach(() => {
  listThemes.mockReset();
  setBrandOverride(null);
});

describe('applyActiveThemeOnLoad', () => {
  it('applies the resolved active theme colors + logo to the override store', async () => {
    listThemes.mockResolvedValue({ themes: [t], activeThemeId: t.id });

    await applyActiveThemeOnLoad();

    expect(getBrandOverride()).toEqual({
      accent: t.accent,
      accentSoft: t.accentSoft,
      logoBase64: t.logoBase64,
      // A saved theme with no explicit brandName falls back to its `name`.
      brandName: t.name,
    });
  });

  it('leaves the override null when the active id does not match any theme', async () => {
    listThemes.mockResolvedValue({ themes: [t], activeThemeId: 'missing' });

    await applyActiveThemeOnLoad();

    expect(getBrandOverride()).toBeNull();
  });

  it('never throws and leaves the override null when listThemes rejects', async () => {
    listThemes.mockRejectedValue(new Error('network down'));

    await expect(applyActiveThemeOnLoad()).resolves.toBeUndefined();
    expect(getBrandOverride()).toBeNull();
  });

  it('resolves the fixed Dark default sentinel with its structural mode', async () => {
    // Default is NOT in the library, yet must still resolve (sentinel id).
    listThemes.mockResolvedValue({ themes: [], activeThemeId: '__default_dark__' });

    await applyActiveThemeOnLoad();

    expect(getBrandOverride()).toEqual({
      accent: '#14b8a6',
      accentSoft: '#5eead4',
      logoBase64: null,
      mode: 'dark',
    });
  });

  it('resolves the fixed Light default sentinel with its structural mode', async () => {
    listThemes.mockResolvedValue({ themes: [], activeThemeId: '__default_light__' });

    await applyActiveThemeOnLoad();

    expect(getBrandOverride()).toEqual({
      accent: '#5b8def',
      accentSoft: '#a9c4fb',
      logoBase64: null,
      mode: 'light',
    });
  });
});
