import type { CSSProperties, ReactNode } from 'react';

interface GlassCardProps {
  children: ReactNode;
  /** optional section title rendered in the card header */
  title?: string;
  /** optional right-aligned header slot (badge, action, count) */
  action?: ReactNode;
  /** stagger index for fade-up entrance animation */
  index?: number;
  padded?: boolean;
  style?: CSSProperties;
  className?: string;
}

/**
 * Glassmorphic surface — the base container for every cockpit panel. Frosted
 * translucent background, hairline border, soft shadow, and a staggered
 * fade-up entrance keyed off `index`.
 */
export function GlassCard({
  children,
  title,
  action,
  index = 0,
  padded = true,
  style,
  className,
}: GlassCardProps) {
  return (
    <section
      className={className}
      style={{
        background: 'var(--wp-surface-glass)',
        border: '1px solid var(--wp-border)',
        borderRadius: 'var(--wp-radius)',
        boxShadow: 'var(--wp-shadow)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        overflow: 'hidden',
        animation: `wp-fade-up 0.5s ease ${index * 0.06}s both`,
        ...style,
      }}
    >
      {(title || action) && (
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.9rem 1.1rem',
            borderBottom: '1px solid var(--wp-border)',
          }}
        >
          {title && (
            <h2
              style={{
                margin: 0,
                fontSize: '0.82rem',
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--wp-text-muted)',
              }}
            >
              {title}
            </h2>
          )}
          {action}
        </header>
      )}
      <div style={{ padding: padded ? '1.1rem' : 0 }}>{children}</div>
    </section>
  );
}
