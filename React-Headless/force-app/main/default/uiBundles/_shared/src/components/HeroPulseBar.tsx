import type { ReactNode } from 'react';
import { useTheme } from '../theme';

export interface PulseStat {
  label: string;
  value: string;
}

interface HeroPulseBarProps {
  /** banker greeting name */
  name: string;
  /** e.g. "Tuesday, July 2" */
  dateLabel: string;
  /** one-line agentic summary of the morning */
  summary: string;
  /** compact stat chips on the right */
  stats?: PulseStat[];
  children?: ReactNode;
}

/**
 * Cinematic hero header — persona gradient wash + ambient glow, a personalized
 * greeting, an agentic one-line brief, and quick pulse stats. Sets the "wow"
 * tone the moment the banker logs in.
 */
export function HeroPulseBar({ name, dateLabel, summary, stats = [] }: HeroPulseBarProps) {
  const theme = useTheme();

  return (
    <div
      style={{
        position: 'relative',
        borderRadius: 'var(--wp-radius)',
        overflow: 'hidden',
        border: '1px solid var(--wp-border-strong)',
        background: 'var(--wp-gradient)',
        padding: '1.6rem 1.8rem',
        boxShadow: 'var(--wp-shadow)',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(120% 140% at 100% 0%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 45%)',
          pointerEvents: 'none',
        }}
      />
      <div style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span
              style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: 'rgba(255,255,255,0.85)',
                background: 'rgba(0,0,0,0.22)',
                borderRadius: 999,
                padding: '0.2rem 0.7rem',
              }}
            >
              {theme.tagline}
            </span>
            <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem' }}>{dateLabel}</span>
          </div>
          <h1 style={{ margin: '0.6rem 0 0', fontSize: '2rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
            Good morning, {name}
          </h1>
          <p style={{ margin: '0.4rem 0 0', color: 'rgba(255,255,255,0.9)', fontSize: '0.98rem', maxWidth: 640 }}>
            {summary}
          </p>
        </div>
        {stats.length > 0 && (
          <div style={{ display: 'flex', gap: '0.9rem', flexWrap: 'wrap' }}>
            {stats.map(s => (
              <div
                key={s.label}
                style={{
                  background: 'rgba(0,0,0,0.24)',
                  border: '1px solid rgba(255,255,255,0.18)',
                  borderRadius: 'var(--wp-radius-sm)',
                  padding: '0.7rem 1rem',
                  minWidth: 96,
                }}
              >
                <div style={{ color: '#fff', fontSize: '1.35rem', fontWeight: 800 }}>{s.value}</div>
                <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
