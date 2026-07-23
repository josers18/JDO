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
