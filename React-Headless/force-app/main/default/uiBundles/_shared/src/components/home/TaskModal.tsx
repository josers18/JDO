import { useState } from 'react';
import { Modal, CrmNote } from '../Modal';
import { Button } from '../Button';
import { Icon } from '../iconMap';
import { Field, FieldRow, TextInput, TextArea, SelectInput } from './fields';
import { useCrmAction } from './useCrmAction';

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Create-Task modal → writes a Salesforce Task via the CRM bridge. */
export function TaskModal({
  open,
  onClose,
  clientName,
  clientId,
  subjectDefault,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  clientName: string;
  clientId?: string;
  subjectDefault?: string;
  /** Fired only after a successful write (before close) — e.g. to refetch. */
  onSaved?: () => void;
}) {
  const { submit, loading, error } = useCrmAction(() => {
    onSaved?.();
    onClose();
  });
  const [subject, setSubject] = useState(subjectDefault ?? `Follow up — ${clientName}`);
  const [dueDate, setDueDate] = useState(tomorrow());
  const [priority, setPriority] = useState('High');
  const [comments, setComments] = useState('Discuss next steps and confirm outstanding items.');

  const create = () =>
    void submit(
      { action: 'task', subject, description: comments, whatId: clientId, dueDate, priority },
      'Task created',
      `${clientName} · Salesforce Task`,
    );

  return (
    <Modal
      open={open}
      onClose={onClose}
      tone="accent"
      icon={<Icon name="task" size={17} />}
      title="Create task"
      subtitle={clientName}
      footer={
        <>
          <CrmNote>Writes to Salesforce Task</CrmNote>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="accent" onClick={create} disabled={loading}>
            {loading ? 'Creating…' : 'Create task'}
          </Button>
        </>
      }
    >
      <Field label="Subject">
        <TextInput value={subject} onChange={e => setSubject(e.target.value)} />
      </Field>
      <FieldRow>
        <Field label="Due date">
          <TextInput type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
        </Field>
        <Field label="Priority">
          <SelectInput value={priority} onChange={e => setPriority(e.target.value)}>
            <option>High</option>
            <option>Normal</option>
            <option>Low</option>
          </SelectInput>
        </Field>
      </FieldRow>
      <Field label="Comments">
        <TextArea value={comments} onChange={e => setComments(e.target.value)} />
      </Field>
      {error && <p className="mt-1 text-[12px] text-risk">{error}</p>}
    </Modal>
  );
}
