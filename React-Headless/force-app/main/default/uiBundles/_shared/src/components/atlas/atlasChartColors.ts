export const atlasChartColors = ['var(--m-accent)', 'var(--next-move)', 'var(--series-third)', '#539497', '#c99962', '#6c7486'];

/** Conversion probabilities are percentages on the same scale in each workspace. */
export function atlasProbabilityBand(percent: number) {
  if (percent < 15) return 0;
  if (percent < 30) return 1;
  if (percent < 50) return 2;
  return 3;
}
