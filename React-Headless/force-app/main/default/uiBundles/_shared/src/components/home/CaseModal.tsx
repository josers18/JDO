import { useState } from 'react';
import { Modal, CrmNote } from '../Modal';
import { Button } from '../Button';
import { Icon } from '../iconMap';
import { Field, FieldRow, TextInput, TextArea, SelectInput } from './fields';
import { useCrmAction } from './useCrmAction';

/** Log-Case modal → writes a Salesforce Case via the CRM bridge. */
export function CaseModal({
  open,
  onClose,
  clientName,
  clientId,
  subjectDefault,
}: {
  open: boolean;
  onClose: () => void;
  clientName: string;
  clientId?: string;
  subjectDefault?: string;
}) {
  const { submit, loading, error } = useCrmAction(onClose);
  const [subject, setSubject] = useState(subjectDefault ?? `Service-recovery — ${clientName}`);
  const [priority, setPriority] = useState('High');
  const [status, setStatus] = useState('New');
  const [description, setDescription] = useState('Escalate to priority handling and log a service-recovery outreach.');

  const log = () =>
    void submit(
      { action: 'case', subject, description, accountId: clientId, priority, status },
      'Case logged',
      `${clientName} · Salesforce Case`,
    );

  return (
    <Modal
      open={open}
      onClose={onClose}
      tone="accent"
      icon={<Icon name="alerts" size={17} />}
      title="Log case"
      subtitle={clientName}
      footer={
        <>
          <CrmNote>Writes to Salesforce Case</CrmNote>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="accent" onClick={log} disabled={loading}>
            {loading ? 'Logging…' : 'Log case'}
          </Button>
        </>
      }
    >
      <Field label="Subject">
        <TextInput value={subject} onChange={e => setSubject(e.target.value)} />
      </Field>
      <FieldRow>
        <Field label="Priority">
          <SelectInput value={priority} onChange={e => setPriority(e.target.value)}>
            <option>High</option>
            <option>Medium</option>
            <option>Low</option>
          </SelectInput>
        </Field>
        <Field label="Status">
          <SelectInput value={status} onChange={e => setStatus(e.target.value)}>
            <option>New</option>
            <option>Working</option>
            <option>Escalated</option>
          </SelectInput>
        </Field>
      </FieldRow>
      <Field label="Description">
        <TextArea value={description} onChange={e => setDescription(e.target.value)} />
      </Field>
      {error && <p className="mt-1 text-[12px] text-risk">{error}</p>}
    </Modal>
  );
}
