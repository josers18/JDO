import { Gauge } from '../components/Gauge';

export interface PredictionDriver {
  label: string;
  /** signed contribution, -1..1; positive pushes the prediction up */
  impact: number;
}

interface PredictionCardProps {
  title: string;
  /** 0..1 model score */
  score: number;
  scoreLabel?: string;
  /** predicted class/outcome, e.g. "Medium risk", "CDs" */
  outcome: string;
  drivers: PredictionDriver[];
  /** color for the gauge, defaults to accent; pass risk color if applicable */
  color?: string;
}

/**
 * ML prediction card — a gauge for the model score plus SHAP-style signed
 * driver bars explaining the prediction (mirrors DC_Prediction_Model_LWC).
 */
export function PredictionCard({ title, score, scoreLabel, outcome, drivers, color }: PredictionCardProps) {
  const maxAbs = Math.max(...drivers.map(d => Math.abs(d.impact)), 0.0001);

  return (
    <div style={{ display: 'flex', gap: '1.1rem', alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ textAlign: 'center' }}>
        <Gauge value={score} caption={scoreLabel ?? title} size={116} color={color} />
        <div style={{ marginTop: '0.4rem', fontSize: '0.8rem' }}>
          <span style={{ color: 'var(--wp-text-muted)' }}>Predicted: </span>
          <span style={{ fontWeight: 700 }}>{outcome}</span>
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 180, display: 'grid', gap: '0.4rem' }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--wp-text-muted)' }}>
          Top drivers
        </div>
        {drivers.map(d => {
          const pct = (Math.abs(d.impact) / maxAbs) * 100;
          const positive = d.impact >= 0;
          return (
            <div key={d.label} style={{ display: 'grid', gridTemplateColumns: '1fr 90px', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--wp-text-muted)' }}>{d.label}</span>
              <div style={{ position: 'relative', height: 8, background: 'var(--wp-border-strong)', borderRadius: 999 }}>
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: positive ? '50%' : `${50 - pct / 2}%`,
                    width: `${pct / 2}%`,
                    background: positive ? 'var(--wp-pos)' : 'var(--wp-neg)',
                    borderRadius: 999,
                  }}
                />
                <span style={{ position: 'absolute', left: '50%', top: -2, bottom: -2, width: 1, background: 'var(--wp-text-faint)' }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
