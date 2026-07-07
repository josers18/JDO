import { useAsyncData, ThemeProvider, GlassCard, type ThemeMode } from '@shared';
import { fetchCustomer360 } from './customerData';
import { ClientIdentityRail } from './ClientIdentityRail';
import { AIBrief } from './AIBrief';

/**
 * Temporary visual-review harness: renders the two hero Customer 360 panels
 * (identity rail + AI brief) in BOTH dark and light modes, side by side, so the
 * visual direction can be chosen from real rendered output before the full
 * cockpit is committed. Not a production route.
 */
export default function ThemeCompare() {
  const { data: customer } = useAsyncData(() => fetchCustomer360('001am00000qvjsAAAQ'), []);

  return (
    <div style={{ minHeight: '100vh', background: '#020509', padding: '1.5rem' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <h1 style={{ color: '#e6edf6', fontFamily: 'system-ui', fontWeight: 800, fontSize: '1.4rem' }}>
          Customer 360 — visual direction
        </h1>
        <p style={{ color: '#8ea0b8', fontFamily: 'system-ui', marginTop: 0 }}>
          Same components, real Julie Morris data. Dark (left) vs Light (right). Pick one.
        </p>
        {!customer ? (
          <div style={{ color: '#8ea0b8', fontFamily: 'system-ui' }}>Loading…</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginTop: '1rem' }}>
            {(['dark', 'light'] as ThemeMode[]).map(mode => (
              <div key={mode}>
                <div style={{ color: '#8ea0b8', fontFamily: 'system-ui', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.72rem', marginBottom: '0.5rem' }}>
                  {mode}
                </div>
                <ThemeProvider persona="retail" mode={mode}>
                  <div style={{ background: 'var(--wp-surface)', borderRadius: 20, padding: '1.25rem', display: 'grid', gap: '1.25rem', border: '1px solid var(--wp-border)' }}>
                    <GlassCard padded>
                      <ClientIdentityRail customer={customer} />
                    </GlassCard>
                    <GlassCard padded>
                      <AIBrief customer={customer} />
                    </GlassCard>
                  </div>
                </ThemeProvider>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
