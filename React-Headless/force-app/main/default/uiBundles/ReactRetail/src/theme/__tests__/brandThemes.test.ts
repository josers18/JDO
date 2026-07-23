import { describe, it, expect } from 'vitest';
import { buildGradient, brandThemeToVars, resolveActiveTheme, type BrandTheme } from '@shared';

const themeA: BrandTheme = {
  id: 'theme-a',
  name: 'Acme Corp',
  sourceUrl: 'https://acme.example.com',
  logoBase64: null,
  logoContentType: 'image/png',
  accent: '#14b8a6',
  accentSoft: '#5eead4',
};

describe('brandThemeToVars', () => {
  it('produces the 5 expected --wp-* keys', () => {
    const vars = brandThemeToVars(themeA);
    expect(Object.keys(vars).sort()).toEqual(
      ['--wp-accent', '--wp-accent-2', '--wp-accent-soft', '--wp-glow', '--wp-gradient'].sort()
    );
  });

  it('sets --wp-accent-2 and --wp-accent-soft both to accentSoft', () => {
    const vars = brandThemeToVars(themeA) as Record<string, string>;
    expect(vars['--wp-accent-2']).toBe(themeA.accentSoft);
    expect(vars['--wp-accent-soft']).toBe(themeA.accentSoft);
  });

  it('sets --wp-accent to the theme accent', () => {
    const vars = brandThemeToVars(themeA) as Record<string, string>;
    expect(vars['--wp-accent']).toBe(themeA.accent);
  });

  it('derives --wp-gradient from accent (contains the accent hex)', () => {
    const vars = brandThemeToVars(themeA) as Record<string, string>;
    expect(vars['--wp-gradient']).toContain(themeA.accent);
  });
});

describe('resolveActiveTheme', () => {
  it('returns null when no theme matches the activeThemeId', () => {
    expect(resolveActiveTheme([themeA], 'nope')).toBeNull();
  });

  it('returns null when activeThemeId is null', () => {
    expect(resolveActiveTheme([themeA], null)).toBeNull();
  });

  it('returns the matching theme when activeThemeId matches', () => {
    expect(resolveActiveTheme([themeA], themeA.id)).toBe(themeA);
  });
});

describe('buildGradient', () => {
  it('returns a linear-gradient string containing the accent', () => {
    const gradient = buildGradient('#14b8a6');
    expect(gradient.startsWith('linear-gradient(')).toBe(true);
    expect(gradient).toContain('#14b8a6');
  });
});
