import { useState } from 'react';
import type { Full360 } from './full360Types';

/**
 * Tearsheet builder — a prompt-builder UI: the banker toggles which sections to
 * include + a tone, which assembles a live prompt preview; "Generate" produces a
 * one-page tearsheet (mock composes from the 360 data; real impl → Agentforce
 * prompt-template / Einstein LLM).
 */
const SECTIONS = [
  { key: 'summary', label: 'Relationship summary' },
  { key: 'financials', label: 'Financial position' },
  { key: 'opportunities', label: 'Opportunities & next best actions' },
  { key: 'risk', label: 'Risk & attrition' },
  { key: 'engagement', label: 'Engagement & sentiment' },
  { key: 'goals', label: 'Goals & life events' },
];
const TONES = ['Executive brief', 'Detailed', 'Client-facing'];

export function TearsheetBuilder({ data, clientName }: { data: Full360; clientName: string }) {
  const [selected, setSelected] = useState<Record<string, boolean>>({ summary: true, financials: true, opportunities: true, risk: true, engagement: false, goals: false });
  const [tone, setTone] = useState(TONES[0]);
  const [generated, setGenerated] = useState(false);
  const [generating, setGenerating] = useState(false);

  const chosen = SECTIONS.filter(s => selected[s.key]);
  const prompt = `Generate a ${tone.toLowerCase()} tearsheet for ${clientName} covering: ${chosen.map(s => s.label.toLowerCase()).join(', ')}. Use the customer's CRM + Data Cloud profile. Keep it to one page.`;

  const generate = () => {
    setGenerating(true);
    setGenerated(false);
    window.setTimeout(() => { setGenerating(false); setGenerated(true); }, 900);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 340px) minmax(0, 1fr)', gap: '1.5rem', alignItems: 'start' }}>
      {/* builder */}
      <div style={{ display: 'grid', gap: '1rem' }}>
        <div>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--wp-accent)', marginBottom: '0.6rem' }}>Include sections</div>
          <div style={{ display: 'grid', gap: '0.4rem' }}>
            {SECTIONS.map(s => (
              <label key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.88rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={!!selected[s.key]} onChange={e => setSelected({ ...selected, [s.key]: e.target.checked })} style={{ accentColor: 'var(--wp-accent)' }} />
                {s.label}
              </label>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--wp-accent)', marginBottom: '0.5rem' }}>Tone</div>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {TONES.map(t => (
              <button key={t} type="button" onClick={() => setTone(t)} style={{ fontSize: '0.78rem', fontWeight: 600, padding: '0.35rem 0.7rem', borderRadius: 999, cursor: 'pointer', border: `1px solid ${tone === t ? 'transparent' : 'var(--wp-border-strong)'}`, background: tone === t ? 'var(--wp-gradient)' : 'transparent', color: tone === t ? 'var(--wp-on-accent)' : 'var(--wp-text-muted)' }}>{t}</button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--wp-text-muted)', marginBottom: '0.4rem' }}>✦ Prompt preview</div>
          <div style={{ fontSize: '0.8rem', lineHeight: 1.5, color: 'var(--wp-text-muted)', background: 'var(--wp-surface-raised)', border: '1px solid var(--wp-border-strong)', borderRadius: 'var(--wp-radius-sm)', padding: '0.7rem 0.85rem', fontStyle: 'italic' }}>
            {prompt}
          </div>
        </div>
        <button type="button" onClick={generate} disabled={generating} style={{ fontSize: '0.85rem', fontWeight: 700, padding: '0.6rem 1rem', borderRadius: 999, border: 'none', cursor: 'pointer', background: 'var(--wp-gradient)', color: 'var(--wp-on-accent)' }}>
          {generating ? 'Generating…' : '✦ Generate Tearsheet'}
        </button>
      </div>

      {/* output */}
      <div style={{ minHeight: 320, background: 'var(--wp-surface-raised)', border: '1px solid var(--wp-border-strong)', borderRadius: 'var(--wp-radius)', padding: '1.5rem 1.75rem', boxShadow: 'var(--wp-shadow-sm)' }}>
        {!generated && !generating && (
          <div style={{ color: 'var(--wp-text-faint)', fontSize: '0.9rem', textAlign: 'center', paddingTop: '5rem' }}>Configure sections and generate a one-page tearsheet.</div>
        )}
        {generating && (
          <div style={{ color: 'var(--wp-text-muted)', fontSize: '0.9rem', textAlign: 'center', paddingTop: '5rem', animation: 'wp-pulse 1.2s ease infinite' }}>✦ Agentforce is composing the tearsheet…</div>
        )}
        {generated && (
          <div style={{ animation: 'wp-fade-up 0.5s ease both' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '2px solid var(--wp-text)', paddingBottom: 8 }}>
              <span style={{ fontWeight: 800, fontSize: '1.2rem' }}>{clientName} — Tearsheet</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--wp-text-faint)' }}>{tone} · generated now</span>
            </div>
            {selected.summary && <TearBlock title="Relationship Summary">{data.agentforce.account.text}</TearBlock>}
            {selected.financials && (
              <TearBlock title="Financial Position">
                Deposits $77,372 (+12% YoY), Investments $72,061 (+4.2%), Lending $771,640. Held-away $1.2M detected. Net relationship value ~$921K across 7 accounts.
              </TearBlock>
            )}
            {selected.opportunities && <TearBlock title="Opportunities & Next Best Actions">{data.agentforce.opportunity.text}</TearBlock>}
            {selected.risk && <TearBlock title="Risk & Attrition">{data.agentforce.account.text.includes('attrition') ? data.agentforce.account.text : 'Attrition risk is medium and improving; churn model at 42% driven by rate-shopping, offset by deposit growth and rising engagement. AML clear.'}</TearBlock>}
            {selected.engagement && <TearBlock title="Engagement & Sentiment">{data.agentforce.csat.text}</TearBlock>}
            {selected.goals && <TearBlock title="Goals & Life Events">Recently appointed CEO of Morris Roasters. Goals: Retirement 96%, Jack's College 61%, Rachel's Wedding 71%. New-CEO event opens business banking + wealth transfer.</TearBlock>}
          </div>
        )}
      </div>
    </div>
  );
}

function TearBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: '1.1rem' }}>
      <div style={{ fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--wp-accent)' }}>{title}</div>
      <p style={{ margin: '0.3rem 0 0', fontSize: '0.9rem', lineHeight: 1.55, color: 'var(--wp-text)' }}>{children}</p>
    </div>
  );
}
