import { describe, it, expect } from 'vitest';
import { extractPalette } from '@shared';

/** Builds a flat RGBA Uint8ClampedArray of `count` pixels, each [r,g,b,a]. */
function solid(count: number, r: number, g: number, b: number, a = 255): Uint8ClampedArray {
  const px = new Uint8ClampedArray(count * 4);
  for (let i = 0; i < count; i++) {
    px[i * 4] = r;
    px[i * 4 + 1] = g;
    px[i * 4 + 2] = b;
    px[i * 4 + 3] = a;
  }
  return px;
}

describe('extractPalette', () => {
  it('extracts the dominant color from a solid-color pixel array (retail teal #14b8a6 = rgb(20,184,166))', () => {
    const pixels = solid(100, 20, 184, 166, 255);
    const { accent } = extractPalette(pixels);
    expect(accent.toLowerCase()).toBe('#14b8a6');
  });

  it('falls back to the neutral default when all pixels are transparent', () => {
    const pixels = solid(100, 20, 184, 166, 0);
    const result = extractPalette(pixels);
    expect(result).toEqual({ accent: '#14b8a6', accentSoft: '#5eead4' });
  });

  it('picks the dominant color out of two, weighted by pixel count', () => {
    // 80 px of teal (dominant) + 20 px of a distinct opaque color.
    const dominant = solid(80, 20, 184, 166, 255);
    const minority = solid(20, 217, 119, 6, 255); // amber/copper
    const pixels = new Uint8ClampedArray(dominant.length + minority.length);
    pixels.set(dominant, 0);
    pixels.set(minority, dominant.length);

    const { accent } = extractPalette(pixels);
    expect(accent.toLowerCase()).toBe('#14b8a6');
  });
});
