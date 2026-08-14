/**
 * Pure canvas-pixel palette extraction for the brand theming "grab a logo,
 * pull an accent color" flow. No DOM/canvas access here — the caller reads
 * the pixels via `CanvasRenderingContext2D.getImageData().data` and passes
 * them in.
 *
 * Approach: frequency-bucket quantization. Each channel is quantized to 16
 * levels (>> 4), skipping near-transparent / near-white / near-black pixels
 * (those are typically letterboxing or line art, not brand color). The most
 * frequent qualifying bucket becomes `accent`; `accentSoft` is a lightened
 * version of `accent` (mixed ~40% toward white), rather than the
 * second-most-frequent bucket, so the pair always reads as a coherent
 * accent/highlight duo even for a near-monochrome logo.
 */

const NEUTRAL_DEFAULT = { accent: '#14b8a6', accentSoft: '#5eead4' } as const;

function toHex(channel: number): string {
  return Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0');
}

function lighten(channel: number, amount: number): number {
  return channel + (255 - channel) * amount;
}

/** `{r,g,b}` (0..255) → `#rrggbb`. */
function rgbToHex(r: number, g: number, b: number): string {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** `#rrggbb` → `{r,g,b}` (0..255); tolerant of a missing leading '#'. */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** RGB (0..255) → HSL with h in [0,360), s/l in [0,1]. */
function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, l };
}

/** HSL (h in [0,360), s/l in [0,1]) → `#rrggbb`. */
function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

/**
 * A harmonious partner color for `accent`, used as the suggested "accent soft"
 * / secondary. Rotates hue by +150° (split-complementary — reads as a designed
 * pairing rather than the harsh 180° direct opposite) and nudges toward a
 * mid-light, saturated tone so it stays usable as a highlight even when the
 * source accent is very dark or very desaturated. Pure — never throws.
 */
export function complementOf(accent: string): string {
  const { r, g, b } = hexToRgb(accent);
  const { h, s, l } = rgbToHsl(r, g, b);
  const s2 = Math.min(1, Math.max(0.5, s));
  const l2 = Math.min(0.68, Math.max(0.5, l));
  return hslToHex(h + 150, s2, l2);
}

/** Euclidean RGB distance — used to drop near-duplicate palette candidates. */
function rgbDistance(a: { r: number; g: number; b: number }, c: string): number {
  const o = hexToRgb(c);
  return Math.sqrt((a.r - o.r) ** 2 + (a.g - o.g) ** 2 + (a.b - o.b) ** 2);
}

/**
 * Ranked list of the logo's dominant colors (most frequent first), deduped by
 * perceptual distance so a near-monochrome logo doesn't return six shades of
 * the same hue. Returns up to `max` `#rrggbb` strings; empty when the image is
 * all neutral/transparent. Same bucketing + skip rules as `extractPalette`.
 */
export function extractPaletteCandidates(pixels: Uint8ClampedArray, max = 6): string[] {
  const buckets = new Map<string, { r: number; g: number; b: number; count: number }>();

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const a = pixels[i + 3];
    if (a < 16) continue;
    if (r > 240 && g > 240 && b > 240) continue;
    if (r < 16 && g < 16 && b < 16) continue;
    const key = `${r >> 4},${g >> 4},${b >> 4}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      bucket.count += 1;
    } else {
      buckets.set(key, { r, g, b, count: 1 });
    }
  }

  const ranked = [...buckets.values()].sort((a, b) => b.count - a.count);
  const out: string[] = [];
  // ~48 in RGB space ≈ visibly distinct; keeps the strip to real brand hues.
  const MIN_DISTANCE = 48;
  for (const bucket of ranked) {
    const avg = { r: bucket.r / bucket.count, g: bucket.g / bucket.count, b: bucket.b / bucket.count };
    const hex = rgbToHex(avg.r, avg.g, avg.b);
    if (out.every((c) => rgbDistance(avg, c) >= MIN_DISTANCE)) {
      out.push(hex);
      if (out.length >= max) break;
    }
  }
  return out;
}

export function extractPalette(pixels: Uint8ClampedArray): { accent: string; accentSoft: string } {
  const buckets = new Map<string, { r: number; g: number; b: number; count: number }>();

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const a = pixels[i + 3];

    if (a < 16) continue; // near-transparent
    if (r > 240 && g > 240 && b > 240) continue; // near-white
    if (r < 16 && g < 16 && b < 16) continue; // near-black

    // Quantize each channel to 16 coarse levels.
    const qr = r >> 4;
    const qg = g >> 4;
    const qb = b >> 4;
    const key = `${qr},${qg},${qb}`;

    const bucket = buckets.get(key);
    if (bucket) {
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      bucket.count += 1;
    } else {
      buckets.set(key, { r, g, b, count: 1 });
    }
  }

  let best: { r: number; g: number; b: number; count: number } | null = null;
  for (const bucket of buckets.values()) {
    if (!best || bucket.count > best.count) best = bucket;
  }

  if (!best) return { ...NEUTRAL_DEFAULT };

  const r = best.r / best.count;
  const g = best.g / best.count;
  const b = best.b / best.count;
  const accent = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  const accentSoft = `#${toHex(lighten(r, 0.4))}${toHex(lighten(g, 0.4))}${toHex(lighten(b, 0.4))}`;

  return { accent, accentSoft };
}
