import { useState } from 'react';
import type { AgentforceSummary } from './full360Types';

/**
 * Agentforce summary card — a prompt-generated narrative with the ✦ mark, a
 * "generated" affordance, and a regenerate action. The reusable unit behind
 * every "Agentforce <X> Summary" in the right sidebar.
 */
export function AgentforceSummaryCard({ summary, defaultOpen = true }: { summary: AgentforceSummary; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      style={{
        borderRadius: 'var(--wp-radius-sm)',
        border: '1px solid color-mix(in srgb, var(--wp-accent) 28%, var(--wp-border))',
        background: 'linear-gradient(160deg, color-mix(in srgb, var(--wp-accent) 8%, transparent), color-mix(in srgb, var(--wp-accent-2) 6%, transparent)), var(--wp-surface-glass)',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.7rem 0.85rem', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--wp-text)' }}
      >
        <span aria-hidden="true" style={{ color: 'var(--wp-accent)' }}>✦</span>
        <span style={{ fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.03em' }}>{summary.title}</span>
        <span style={{ marginLeft: 'auto', fontSize: '0.68rem', color: 'var(--wp-text-faint)' }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 0.85rem 0.85rem' }}>
          <p style={{ margin: 0, fontSize: '0.84rem', lineHeight: 1.5, color: 'var(--wp-text-muted)' }}>{summary.text}</p>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
            <button type="button" style={miniBtn}>↻ Regenerate</button>
            <button type="button" style={miniBtn}>⧉ Copy</button>
          </div>
        </div>
      )}
    </div>
  );
}

const miniBtn: React.CSSProperties = {
  fontSize: '0.7rem',
  fontWeight: 600,
  color: 'var(--wp-accent)',
  background: 'color-mix(in srgb, var(--wp-accent) 10%, transparent)',
  border: '1px solid color-mix(in srgb, var(--wp-accent) 30%, transparent)',
  borderRadius: 999,
  padding: '0.2rem 0.6rem',
  cursor: 'pointer',
};
