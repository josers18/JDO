import { useEffect, useState } from 'react';
import type { PersonaKey } from '../../theme/themes';
import { agentDirectory, type AgentDirectory } from '../../data/atlasAgents';

export function AtlasAgentSettings({ center }: { center: PersonaKey }) {
  const [data, setData] = useState<AgentDirectory>();
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setData(undefined); setError('');
    agentDirectory(center).then(result => {
      if (alive) { setData(result); setSelected(result.selected); }
    }).catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [center, attempt]);
  async function save() {
    setSaving(true); setError(''); setNotice('');
    try {
      const result = await agentDirectory(center, selected);
      setData(result); setSelected(result.selected); setNotice('Agent selection saved.');
      window.dispatchEvent(new CustomEvent('atlas-agent-settings', { detail: center }));
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save agents.'); }
    finally { setSaving(false); }
  }
  return <section className="atlas-config-card atlas-agent-settings">
    <h2>Available agents</h2><p>Choose the active employee agents bankers can switch between in this app.</p>
    {error && <p role="alert">{error} <button onClick={() => setAttempt(n => n + 1)}>Reload agents</button></p>}
    {!data && !error && <p role="status">Loading agents…</p>}
    {data && <><fieldset disabled={!data.canEdit || saving}><legend>Employee agents</legend>
      {data.agents.map(agent => <label key={agent.id}><input type="checkbox" checked={selected.includes(agent.id)}
        onChange={event => { setNotice(''); setSelected(event.target.checked ? [...selected, agent.id] : selected.filter(id => id !== agent.id)); }} />
        {agent.label}</label>)}
      {!data.agents.length && <p>No active employee agents are available.</p>}
    </fieldset>
    <div className="atlas-config-actions">{data.canEdit ? <button className="primary" disabled={saving || selected.join() === data.selected.join()} onClick={save}>{saving ? 'Saving…' : 'Save agents'}</button>
      : <p>Contact your configuration administrator to change these selections.</p>}<span>{selected.length} selected</span></div></>}
    {notice && <p role="status">{notice}</p>}
  </section>;
}
