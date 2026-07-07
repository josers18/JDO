import { useState } from 'react';
import { useTheme } from '../theme';

export interface AssistantMessage {
  id: string;
  role: 'user' | 'agent';
  text: string;
}

interface AssistantDockProps {
  /** transcript to render */
  messages: AssistantMessage[];
  /** called when the banker submits a prompt */
  onSend: (text: string) => void;
  sending?: boolean;
  /** suggested prompt chips */
  suggestions?: string[];
  /** dock header label, e.g. "Cumulus Retail Assistant" */
  title?: string;
}

/**
 * Persistent Cumulus Assistant dock — collapsible bottom-right panel. Presents
 * the transcript, suggestion chips, and an input. In the mock phase it's driven
 * by a mock send handler; the same props bind to the live Agentforce hook later.
 */
export function AssistantDock({
  messages,
  onSend,
  sending = false,
  suggestions = [],
  title = 'Cumulus Assistant',
}: AssistantDockProps) {
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState('');
  const theme = useTheme();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    onSend(draft.trim());
    setDraft('');
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open assistant"
        style={{
          position: 'fixed',
          right: '1.5rem',
          bottom: '1.5rem',
          width: 56,
          height: 56,
          borderRadius: '50%',
          border: 'none',
          background: 'var(--wp-gradient)',
          color: '#fff',
          fontSize: '1.4rem',
          boxShadow: 'var(--wp-shadow)',
          cursor: 'pointer',
          zIndex: 50,
        }}
      >
        ✦
      </button>
    );
  }

  return (
    <aside
      style={{
        position: 'fixed',
        right: '1.5rem',
        bottom: '1.5rem',
        width: 360,
        maxHeight: '64vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--wp-surface-glass-strong)',
        border: '1px solid var(--wp-border-strong)',
        borderRadius: 'var(--wp-radius)',
        boxShadow: 'var(--wp-shadow)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        overflow: 'hidden',
        zIndex: 50,
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 1rem',
          background: 'var(--wp-gradient)',
          color: '#fff',
        }}
      >
        <span style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <span aria-hidden="true">✦</span> {title}
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Minimize assistant"
          style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1.1rem' }}
        >
          ▾
        </button>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0.85rem', display: 'grid', gap: '0.55rem', alignContent: 'start' }}>
        {messages.map(m => (
          <div
            key={m.id}
            style={{
              justifySelf: m.role === 'user' ? 'end' : 'start',
              maxWidth: '86%',
              background: m.role === 'user' ? 'var(--wp-accent)' : 'var(--wp-surface-raised)',
              color: m.role === 'user' ? '#04121a' : 'var(--wp-text)',
              padding: '0.5rem 0.8rem',
              borderRadius: 14,
              fontSize: '0.88rem',
              lineHeight: 1.4,
              fontWeight: m.role === 'user' ? 600 : 400,
            }}
          >
            {m.text}
          </div>
        ))}
        {sending && (
          <div style={{ color: 'var(--wp-text-muted)', fontSize: '0.82rem', animation: 'wp-pulse 1.2s ease infinite' }}>
            {theme.label} assistant is thinking…
          </div>
        )}
      </div>

      {suggestions.length > 0 && (
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', padding: '0 0.85rem 0.5rem' }}>
          {suggestions.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => onSend(s)}
              style={{
                fontSize: '0.72rem',
                color: 'var(--wp-accent)',
                background: 'color-mix(in srgb, var(--wp-accent) 12%, transparent)',
                border: '1px solid color-mix(in srgb, var(--wp-accent) 35%, transparent)',
                borderRadius: 999,
                padding: '0.2rem 0.6rem',
                cursor: 'pointer',
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        data-testid="assistant-form"
        onSubmit={submit}
        style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem', borderTop: '1px solid var(--wp-border)' }}
      >
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Ask the assistant…"
          style={{
            flex: 1,
            background: 'var(--wp-surface)',
            border: '1px solid var(--wp-border)',
            borderRadius: 10,
            color: 'var(--wp-text)',
            padding: '0.45rem 0.7rem',
            fontSize: '0.88rem',
          }}
        />
        <button
          type="submit"
          disabled={sending}
          style={{
            background: 'var(--wp-accent)',
            color: '#04121a',
            border: 'none',
            borderRadius: 10,
            padding: '0.45rem 0.9rem',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {sending ? '…' : 'Send'}
        </button>
      </form>
    </aside>
  );
}
