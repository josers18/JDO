import { useState } from 'react';
import type { DetailField } from './full360Types';

/**
 * Editable Details panel — view fields grouped by section; toggle Edit to make
 * editable fields into inputs/pickers, then Save/Cancel. Mock persists to local
 * state (real impl → GraphQL mutation).
 */
export function DetailsPanel({ fields }: { fields: DetailField[] }) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(fields.map(f => [f.key, f.value])));
  const [draft, setDraft] = useState(values);

  const groups = Array.from(new Set(fields.map(f => f.group)));

  const startEdit = () => { setDraft(values); setEditing(true); };
  const save = () => { setValues(draft); setEditing(false); };
  const cancel = () => { setDraft(values); setEditing(false); };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginBottom: '0.75rem' }}>
        {editing ? (
          <>
            <button type="button" onClick={cancel} style={btn(false)}>Cancel</button>
            <button type="button" onClick={save} style={btn(true)}>Save</button>
          </>
        ) : (
          <button type="button" onClick={startEdit} style={btn(true)}>✎ Edit</button>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.5rem' }}>
        {groups.map(g => (
          <div key={g}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--wp-accent)', marginBottom: '0.6rem' }}>{g}</div>
            <div style={{ display: 'grid', gap: '0.7rem' }}>
              {fields.filter(f => f.group === g).map(f => (
                <div key={f.key} style={{ display: 'grid', gap: '0.2rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--wp-text-muted)' }}>{f.label}</span>
                  {editing && f.editable ? (
                    f.type === 'picklist' ? (
                      <select value={draft[f.key]} onChange={e => setDraft({ ...draft, [f.key]: e.target.value })} style={input}>
                        {(f.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input value={draft[f.key]} onChange={e => setDraft({ ...draft, [f.key]: e.target.value })} style={input} />
                    )
                  ) : (
                    <span style={{ fontSize: '0.92rem', fontWeight: 600, color: f.editable ? 'var(--wp-text)' : 'var(--wp-text-muted)' }}>
                      {values[f.key]}{!f.editable && <span style={{ fontSize: '0.66rem', color: 'var(--wp-text-faint)', marginLeft: 6 }}>read-only</span>}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const input: React.CSSProperties = {
  background: 'var(--wp-surface-raised)',
  border: '1px solid var(--wp-border-strong)',
  borderRadius: 8,
  color: 'var(--wp-text)',
  padding: '0.4rem 0.6rem',
  fontSize: '0.9rem',
  fontFamily: 'inherit',
};

function btn(primary: boolean): React.CSSProperties {
  return {
    fontSize: '0.8rem',
    fontWeight: 700,
    padding: '0.4rem 0.9rem',
    borderRadius: 999,
    cursor: 'pointer',
    border: primary ? 'none' : '1px solid var(--wp-border-strong)',
    background: primary ? 'var(--wp-gradient)' : 'transparent',
    color: primary ? 'var(--wp-on-accent)' : 'var(--wp-text-muted)',
  };
}
