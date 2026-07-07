import { useEffect, useState } from 'react';
import { runPromptFlow, stripHtml } from '@shared';
import { modeFor } from '../../data/dataSource';
import { AGENTFORCE_FLOWS } from './agentforceFlows';
import type { AgentforceSummary } from './full360Types';

/**
 * Agentforce summary card. Renders the locally-composed summary instantly, then
 * (when the org has a live Einstein prompt flow for this slot and the data mode
 * is 'real') fetches the genuine generated narrative and swaps it in. The ✦ mark
 * turns solid once real AI text is showing. Regenerate re-runs the flow; Copy
 * copies the current text.
 */
export function AgentforceSummaryCard({
  summary,
  accountId,
  defaultOpen = true,
}: {
  summary: AgentforceSummary;
  accountId?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const flow = AGENTFORCE_FLOWS[summary.key];
  const canLive = !!flow && !!accountId && modeFor('agentforce') === 'real';

  const [text, setText] = useState(summary.text);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped to (re)trigger a live fetch: on slot/account change and on Regenerate.
  const [runId, setRunId] = useState(0);

  // Reset to the composed fallback during render when the slot/account changes
  // (adjusting state during render is the React-blessed alternative to a
  // setState-in-effect, and avoids a flash of the previous account's summary).
  const srcKey = `${summary.key}:${accountId ?? ''}`;
  const [seenKey, setSeenKey] = useState(srcKey);
  if (seenKey !== srcKey) {
    setSeenKey(srcKey);
    setText(summary.text);
    setLive(false);
    setError(null);
    setLoading(canLive);
    setRunId(r => r + 1);
  }

  // Fetch the real summary whenever runId changes (mount, account/slot change,
  // Regenerate). setState happens only inside async callbacks (cancel-guarded),
  // matching the shared useAsyncData pattern.
  useEffect(() => {
    if (!canLive || !flow || !accountId) return;
    let cancelled = false;
    runPromptFlow(flow, accountId)
      .then(raw => {
        if (cancelled) return;
        const clean = stripHtml(raw);
        if (clean) { setText(clean); setLive(true); }
      })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Generation failed'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const regenerate = () => { setError(null); setLoading(true); setRunId(r => r + 1); };
  const copy = () => { void navigator.clipboard?.writeText(text); };

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
        <span aria-hidden="true" style={{ color: 'var(--wp-accent)', opacity: live ? 1 : 0.55 }}>✦</span>
        <span style={{ fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.03em' }}>{summary.title}</span>
        {loading && <span style={{ fontSize: '0.62rem', color: 'var(--wp-text-faint)', animation: 'wp-pulse 1.2s ease infinite' }}>generating…</span>}
        {live && !loading && <span style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--wp-accent)', letterSpacing: '0.04em' }}>LIVE</span>}
        <span style={{ marginLeft: 'auto', fontSize: '0.68rem', color: 'var(--wp-text-faint)' }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 0.85rem 0.85rem' }}>
          <p style={{ margin: 0, fontSize: '0.84rem', lineHeight: 1.5, color: 'var(--wp-text-muted)', whiteSpace: 'pre-line' }}>{text}</p>
          {error && <p style={{ margin: '0.4rem 0 0', fontSize: '0.68rem', color: 'var(--wp-text-faint)' }}>Showing composed summary (live generation unavailable).</p>}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
            {canLive && (
              <button type="button" style={miniBtn} onClick={regenerate} disabled={loading}>↻ Regenerate</button>
            )}
            <button type="button" style={miniBtn} onClick={copy}>⧉ Copy</button>
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
