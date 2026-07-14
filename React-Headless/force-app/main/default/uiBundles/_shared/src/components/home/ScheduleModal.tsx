import { useState } from 'react';
import { Modal, CrmNote } from '../Modal';
import { Button } from '../Button';
import { Icon } from '../iconMap';
import { Field, FieldRow, TextInput, TextArea } from './fields';
import { useCrmAction } from './useCrmAction';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Schedule-Event modal → writes a Salesforce Event via the CRM bridge. */
export function ScheduleModal({
  open,
  onClose,
  clientName,
  clientId,
  subjectDefault = 'Call',
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
  const isCall = subjectDefault.toLowerCase().includes('call');
  const [subject, setSubject] = useState(`${subjectDefault} — ${clientName}`);
  const [date, setDate] = useState(today());
  const [time, setTime] = useState('14:30');
  const [agenda, setAgenda] = useState('Resolve open items, review opportunity, set next step.');

  const add = () => {
    const activityDateTime = new Date(`${date}T${time || '00:00'}`).toISOString();
    void submit(
      { action: 'event', subject, description: agenda, whatId: clientId, activityDateTime, durationMinutes: 30 },
      isCall ? 'Call scheduled' : 'Meeting scheduled',
      `${clientName} · Salesforce Event`,
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      tone="accent"
      icon={<Icon name="call" size={17} />}
      title={`Schedule ${isCall ? 'call' : 'meeting'}`}
      subtitle={`${clientName} · ${subjectDefault}`}
      footer={
        <>
          <CrmNote>Writes to Salesforce Event</CrmNote>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="accent" onClick={add} disabled={loading}>
            {loading ? 'Adding…' : 'Add to calendar'}
          </Button>
        </>
      }
    >
      <Field label="Subject">
        <TextInput value={subject} onChange={e => setSubject(e.target.value)} />
      </Field>
      <FieldRow>
        <Field label="Date">
          <TextInput type="date" value={date} onChange={e => setDate(e.target.value)} />
        </Field>
        <Field label="Time">
          <TextInput type="time" value={time} onChange={e => setTime(e.target.value)} />
        </Field>
      </FieldRow>
      <Field label="Agenda">
        <TextArea value={agenda} onChange={e => setAgenda(e.target.value)} />
      </Field>
      {error && <p className="mt-1 text-[12px] text-risk">{error}</p>}
    </Modal>
  );
}
