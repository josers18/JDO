import { useState, type ReactNode } from 'react';
import { Modal } from '../Modal';
import '../../../../../../../../docs/design-studies/2026-11-12-directions/atlas-expansion.css';
import './atlasRelationshipScenes.css';

export function RelationshipFacts({ values }: { values: readonly (readonly [string, ReactNode])[] }) {
  return <dl className="ax-facts">{values.map(([label, value]) =>
    <div key={label}><dt>{label}</dt><dd>{value ?? '—'}</dd></div>
  )}</dl>;
}

export function RelationshipProfile({ name, type, recordId, location, fields, prepare, children }: {
  name: string;
  type: string;
  recordId: string;
  location: string;
  fields: readonly (readonly [string, ReactNode])[];
  prepare: () => void;
  children?: ReactNode;
}) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('');
  return <div className="ax-scene ax-profile atlas-relationship-scene">
    <div className="ax-profile-cover">
      <span className="ax-monogram" aria-hidden="true">{initials}</span>
      <h2>{name}</h2><p>{type || 'Recorded relationship'}</p>
      <RelationshipFacts values={[[ 'Relationship ID', recordId ], [ 'Location', location ]]} />
      <button className="primary" type="button" onClick={prepare}>Prepare profile changes</button>
    </div>
    <div className="ax-profile-fields">
      <h2>The recorded profile</h2>
      <RelationshipFacts values={fields} />
      <p className="ax-muted">Review the exact Salesforce Account before preparing profile changes.</p>
      {children}
    </div>
  </div>;
}

const packetSections = ['Profile', 'Finances', 'Goals', 'Evidence', 'Notebook', 'Screening'] as const;
export type PacketSection = typeof packetSections[number];

export function RelationshipPacket({ name, renderSection, initialSections = packetSections }: {
  initialSections?: readonly PacketSection[];
  name: string;
  renderSection: (section: PacketSection) => ReactNode;
}) {
  const [sections, setSections] = useState<readonly PacketSection[]>(initialSections);
  const [tone, setTone] = useState('Concise');
  const [preview, setPreview] = useState(false);
  const selected = packetSections.filter(section => sections.includes(section));

  return <section className="ax-scene ax-packet atlas-relationship-scene">
    <header><p>Relationship review packet</p><h2>Preparation options</h2></header>
    <div className="ax-packet-layout">
      <div>
        <fieldset>
          <legend>Include in the packet</legend>
          {packetSections.map(section => <label key={section}>
            <input type="checkbox" checked={sections.includes(section)} onChange={event => {
              const checked = event.target.checked;
              setSections(current => checked ? [...current, section] : current.filter(value => value !== section));
            }} />{section}
          </label>)}
        </fieldset>
        <label className="ax-field">Writing style<select value={tone} onChange={event => setTone(event.target.value)}>
          <option>Concise</option><option>Conversation guide</option><option>Detailed</option>
        </select></label>
        <button className="primary" type="button" disabled={!selected.length} onClick={() => setPreview(true)}>
          Preview review packet
        </button>
      </div>
      <div className="ax-packet-outline">
        <span className="badge">{tone} · Recorded evidence</span>
        <h3>{name}</h3>
        {selected.map(section => <div key={section}><span aria-hidden="true">✓</span>{section}</div>)}
        {!selected.length && <p>Choose at least one section.</p>}
        <p>Built from the current relationship and your local notes.</p>
      </div>
    </div>
    {preview && <Modal open title={`Relationship review packet · ${name}`} onClose={() => setPreview(false)}>
      <div className="atlas-packet-preview" data-writing-style={tone}>
        {selected.map(section => <section key={section}>
          <h3>{section}</h3>
          {tone === 'Conversation guide' && <p>What should we confirm about {section.toLowerCase()}?</p>}
          {renderSection(section)}
        </section>)}
      </div>
    </Modal>}
  </section>;
}
