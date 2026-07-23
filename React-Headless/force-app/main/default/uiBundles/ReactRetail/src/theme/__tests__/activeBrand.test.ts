import { describe, it, expect, beforeEach } from 'vitest';
import { setBrandOverride, getBrandOverride, type BrandOverride } from '@shared';

const override: BrandOverride = {
  accent: '#123456',
  accentSoft: '#654321',
  logoBase64: null,
};

beforeEach(() => {
  setBrandOverride(null);
});

describe('getBrandOverride / setBrandOverride', () => {
  it('starts null', () => {
    expect(getBrandOverride()).toBeNull();
  });

  it('returns the override object set via setBrandOverride', () => {
    setBrandOverride(override);
    expect(getBrandOverride()).toEqual(override);
  });

  it('returns the SAME object reference across calls when nothing changed (snapshot stability)', () => {
    setBrandOverride(override);
    expect(getBrandOverride()).toBe(getBrandOverride());
  });

  it('resets back to null when cleared', () => {
    setBrandOverride(override);
    setBrandOverride(null);
    expect(getBrandOverride()).toBeNull();
  });
});
