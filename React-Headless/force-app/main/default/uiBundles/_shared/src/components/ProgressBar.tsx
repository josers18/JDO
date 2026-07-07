import { useCountUp } from './useCountUp';

interface ProgressBarProps {
  /** 0..1 */
  value: number;
  label?: string;
  /** right-side caption, e.g. "$42k / $100k" */
  caption?: string;
  color?: string;
}

/** Labeled progress bar with an animated accent fill. Used for goals/plans. */
export function ProgressBar({ value, label, caption, color = 'var(--wp-accent)' }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(1, value));
  const animated = useCountUp(clamped, 900);

  return (
    <div style={{ display: 'grid', gap: '0.35rem' }}>
      {(label || caption) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
          {label && <span style={{ color: 'var(--wp-text)' }}>{label}</span>}
          {caption && <span style={{ color: 'var(--wp-text-muted)' }}>{caption}</span>}
        </div>
      )}
      <div
        style={{
          height: 8,
          borderRadius: 999,
          background: 'var(--wp-border-strong)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${animated * 100}%`,
            borderRadius: 999,
            background: color,
            boxShadow: `0 0 12px ${color}`,
          }}
        />
      </div>
    </div>
  );
}
