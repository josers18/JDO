import type { CSSProperties } from 'react';

/**
 * Shimmering placeholder block for content that is still loading. Uses the
 * `wp-shimmer` keyframe (tokens.css) — a diagonal highlight sweeping across a
 * muted surface — so a skeleton reads as "loading", distinct from the static
 * "—" empty-state that previously flashed during the Customer 360 phase-2
 * enrichment fetch. Inline-styled against --wp-* tokens so it renders the same
 * in the Tailwind bundles and the inline-style CRM bundle, and tracks light/
 * dark + brand surface automatically.
 *
 * `radius` defaults to the sub-card radius; pass a full pill radius (999) for
 * inline text runs. Respects prefers-reduced-motion via the shared keyframe
 * being a background-position sweep (no transform/opacity flashing).
 */
export function Skeleton({
  width = '100%',
  height = 16,
  radius = 8,
  style,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'block',
        width,
        height,
        borderRadius: radius,
        // A 3-stop gradient wider than the box; wp-shimmer slides its
        // background-position so the light band travels across.
        background:
          'linear-gradient(90deg, var(--wp-surface-muted) 25%, var(--wp-surface-raised) 50%, var(--wp-surface-muted) 75%)',
        backgroundSize: '200% 100%',
        animation: 'wp-shimmer 1.4s ease-in-out infinite',
        ...style,
      }}
    />
  );
}

/**
 * A card-shaped cluster of skeleton lines — the default placeholder for a Panel
 * body while its data resolves. `lines` controls how many text rows render
 * below the title bar.
 */
export function SkeletonCard({ lines = 3, style }: { lines?: number; style?: CSSProperties }) {
  return (
    <div
      style={{
        display: 'grid',
        gap: '0.7rem',
        padding: '1rem',
        borderRadius: 'var(--wp-radius, 16px)',
        background: 'var(--wp-surface-glass)',
        border: '1px solid var(--wp-border)',
        ...style,
      }}
    >
      <Skeleton width="40%" height={12} radius={999} />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? '70%' : '100%'} height={14} />
      ))}
    </div>
  );
}
