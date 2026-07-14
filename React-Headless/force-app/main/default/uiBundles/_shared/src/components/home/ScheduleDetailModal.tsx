import { useEffect, useState } from 'react';
import { Modal, CrmNote } from '../Modal';
import { Button } from '../Button';
import { Icon } from '../iconMap';
import { Field, FieldRow, TextInput, SelectInput } from './fields';
import { useCrmAction } from './useCrmAction';
import { TASK_STATUS_OPTIONS, TASK_PRIORITY_OPTIONS, type ScheduleItem } from './types';

/** Split an ISO datetime/date into a date part and (for events) a time part. */
function splitDateTime(iso: string): { date: string; time: string } {
  const d = (iso || '').slice(0, 10);
  const t = iso && iso.length >= 16 ? iso.slice(11, 16) : '';
  return { date: /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '', time: t };
}

export function ScheduleDetailModal({
  open,
  onClose,
  item,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  item: ScheduleItem | null;
  onSaved?: () => void;
}) {
  // Delegate to an inner component once `item` is known non-null so hooks
  // that depend on Salesforce context (useCrmAction → useToast) are never
  // called for the "nothing selected" state — avoids requiring a
  // ToastProvider ancestor just to render null.
  if (!item) return null;
  return <ScheduleDetailModalContent open={open} onClose={onClose} item={item} onSaved={onSaved} />;
}

function ScheduleDetailModalContent({
  open,
  onClose,
  item,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  item: ScheduleItem;
  onSaved?: () => void;
}) {
  const editable = !!item.recordId && !!item.sobjectType;
  const isEvent = item.sobjectType === 'Event';
  const init = splitDateTime(item.time ?? '');

  const [subject, setSubject] = useState(item.title ?? '');
  const [date, setDate] = useState(init.date);
  const [time, setTime] = useState(init.time || '14:30');
  const [status, setStatus] = useState(item.status ?? 'Not Started');
  const [priority, setPriority] = useState(item.priority ?? 'Normal');

  // Reseed local fields whenever a different row is opened.
  useEffect(() => {
    const s = splitDateTime(item.time);
    setSubject(item.title);
    setDate(s.date);
    setTime(s.time || '14:30');
    setStatus(item.status ?? 'Not Started');
    setPriority(item.priority ?? 'Normal');
  }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { submit, loading, error } = useCrmAction(() => {
    onSaved?.();
    onClose();
  });

  const save = () => {
    if (!editable) return;
    const base = { action: 'update' as const, sobjectType: item.sobjectType, recordId: item.recordId, subject };
    if (isEvent) {
      const activityDateTime = new Date(`${date}T${time || '00:00'}`).toISOString();
      void submit({ ...base, activityDateTime }, 'Meeting updated', `${item.title} · Salesforce Event`);
    } else {
      void submit({ ...base, dueDate: date || undefined, status, priority }, 'Task updated', `${item.title} · Salesforce Task`);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      tone="accent"
      icon={<Icon name={isEvent ? 'call' : 'task'} size={17} />}
      title={isEvent ? 'Meeting details' : 'Task details'}
      subtitle={item.clientName ? `${item.title} · ${item.clientName}` : item.title}
      footer={
        <>
          <CrmNote>{editable ? `Writes to Salesforce ${item.sobjectType}` : 'Demo record — read only'}</CrmNote>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="accent" onClick={save} disabled={!editable || loading}>
            {loading ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <Field label="Subject">
        <TextInput value={subject} onChange={e => setSubject(e.target.value)} disabled={!editable} />
      </Field>
      <FieldRow>
        <Field label="Date">
          <TextInput type="date" value={date} onChange={e => setDate(e.target.value)} disabled={!editable} />
        </Field>
        {isEvent && (
          <Field label="Time">
            <TextInput type="time" value={time} onChange={e => setTime(e.target.value)} disabled={!editable} />
          </Field>
        )}
      </FieldRow>
      {!isEvent && (
        <FieldRow>
          <Field label="Status">
            <SelectInput value={status} onChange={e => setStatus(e.target.value)} disabled={!editable}>
              {TASK_STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </SelectInput>
          </Field>
          <Field label="Priority">
            <SelectInput value={priority} onChange={e => setPriority(e.target.value)} disabled={!editable}>
              {TASK_PRIORITY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </SelectInput>
          </Field>
        </FieldRow>
      )}
      {error && <p className="mt-1 text-[12px] text-risk">{error}</p>}
    </Modal>
  );
}
