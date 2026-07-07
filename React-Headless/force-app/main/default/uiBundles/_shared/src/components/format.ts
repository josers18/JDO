/** Shared value formatters used across cockpit primitives. */

export type ValueFormat = 'currency' | 'currencyCompact' | 'number' | 'percent' | 'plain';

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const usdCompact = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});

const num = new Intl.NumberFormat('en-US');

export function formatValue(value: number, format: ValueFormat): string {
  switch (format) {
    case 'currency':
      return usd.format(value);
    case 'currencyCompact':
      return usdCompact.format(value);
    case 'percent':
      return `${(value * 100).toFixed(1)}%`;
    case 'number':
      return num.format(Math.round(value));
    case 'plain':
    default:
      return String(value);
  }
}
