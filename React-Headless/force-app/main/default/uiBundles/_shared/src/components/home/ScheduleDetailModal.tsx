import { useEffect, useState, type ReactNode } from 'react';
import { Modal, CrmNote } from '../Modal';
import { Button } from '../Button';
import { Icon } from '../iconMap';
import { Field, FieldRow, TextInput, TextArea, SelectInput, DisplayRow } from './fields';
import { useCrmAction } from './useCrmAction';
import {
  TASK_STATUS_OPTIONS,
  TASK_PRIORITY_OPTIONS,
  TASK_TYPE_OPTIONS,
  EVENT_TYPE_OPTIONS,
  EVENT_SHOWAS_OPTIONS,
  type ScheduleItem,
} from './types';

/** Split an ISO datetime/date into a date part and (for events) a time part. */
function splitDateTime(iso: string): { date: string; time: string } {
  const d = (iso || '').slice(0, 10);
  const t = iso && iso.length >= 16 ? iso.slice(11, 16) : '';
  return { date: /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '', time: t };
}

/** Locale short date-time for the read-only System Information rows ('' when absent/invalid). */
function fmtDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Combine an actor name and a timestamp into "Name · 7/14/2026, 2:30 PM" (either part optional). */
function byLine(name?: string, iso?: string): string {
  const d = fmtDate(iso);
  if (name && d) return `${name} · ${d}`;
  return name || d || '';
}

/** A native-style section header: mono uppercase label over an underline. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-5">
      <h4 className="mb-3 border-b border-line pb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
        {title}
      </h4>
      {children}
    </div>
  );
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
  // Events carry the full clock time in startDateTime; `time` is date-only (for
  // the table + bucketing). Seed the edit form from startDateTime so a
  // subject-only save doesn't silently reschedule the meeting.
  const init = splitDateTime(item.startDateTime || item.time || '');

  const [subject, setSubject] = useState(item.title ?? '');
  const [date, setDate] = useState(init.date);
  const [time, setTime] = useState(init.time || '14:30');
  const [status, setStatus] = useState(item.status ?? 'Not Started');
  const [priority, setPriority] = useState(item.priority ?? 'Normal');
  const [type, setType] = useState(item.type ?? (isEvent ? 'Meeting' : 'Call'));
  const [description, setDescription] = useState(item.description ?? '');
  const [location, setLocation] = useState(item.location ?? '');
  const [showAs, setShowAs] = useState(item.showAs ?? 'Busy');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reseed local fields whenever a different row is opened.
  useEffect(() => {
    const s = splitDateTime(item.startDateTime || item.time || '');
    setSubject(item.title);
    setDate(s.date);
    setTime(s.time || '14:30');
    setStatus(item.status ?? 'Not Started');
    setPriority(item.priority ?? 'Normal');
    setType(item.type ?? (item.sobjectType === 'Event' ? 'Meeting' : 'Call'));
    setDescription(item.description ?? '');
    setLocation(item.location ?? '');
    setShowAs(item.showAs ?? 'Busy');
    setConfirmDelete(false);
  }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { submit, loading, error } = useCrmAction(() => {
    onSaved?.();
    onClose();
  });

  const save = () => {
    if (!editable) return;
    const base = { action: 'update' as const, sobjectType: item.sobjectType, recordId: item.recordId, subject };
    if (isEvent) {
      // A meeting must have a date; a blank one would make `new Date(...)`
      // invalid and toISOString() throw. Only send the datetime when we have a
      // real date, so a bad state surfaces as an inline validation, not a crash.
      const parsed = date ? new Date(`${date}T${time || '00:00'}`) : null;
      const activityDateTime =
        parsed && !isNaN(parsed.getTime()) ? parsed.toISOString() : undefined;
      void submit(
        { ...base, activityDateTime, type, description, location, showAs },
        'Meeting updated',
        `${item.title} · Salesforce Event`,
      );
    } else {
      void submit(
        { ...base, dueDate: date || undefined, status, priority, type, description },
        'Task updated',
        `${item.title} · Salesforce Task`,
      );
    }
  };

  // Quick actions — each writes through the bridge, then submit's onDone
  // (onSaved + onClose) refetches the list and dismisses the modal.
  const markComplete = () => {
    if (!editable) return;
    void submit(
      { action: 'update', sobjectType: 'Task', recordId: item.recordId, status: 'Completed' },
      'Task completed',
      item.title,
    );
  };
  const del = () => {
    if (!editable) return;
    void submit(
      { action: 'delete', sobjectType: item.sobjectType, recordId: item.recordId },
      isEvent ? 'Event deleted' : 'Task deleted',
      `${item.title} · removed`,
    );
  };
  const followUpTask = () => {
    void submit(
      { action: 'task', subject: `Follow up: ${item.title}`, whatId: item.whatId },
      'Follow-up task created',
      item.title,
    );
  };
  const followUpEvent = () => {
    void submit(
      { action: 'event', subject: `Follow up: ${item.title}`, whatId: item.whatId },
      'Follow-up event created',
      item.title,
    );
  };

  const infoTitle = isEvent ? 'Event Information' : 'Task Information';

  return (
    <Modal
      open={open}
      onClose={onClose}
      tone="accent"
      icon={<Icon name={isEvent ? 'call' : 'task'} size={17} />}
      title={isEvent ? 'Meeting details' : 'Task details'}
      subtitle={item.clientName ? `${item.title} · ${item.clientName}` : item.title}
      footer={
        <div className="flex w-full flex-col gap-3">
          <CrmNote>{editable ? `Writes to Salesforce ${item.sobjectType}` : 'Demo record — read only'}</CrmNote>
          <div className="flex flex-wrap items-center gap-2.5">
            {editable && !isEvent && status !== 'Completed' && (
              <Button size="sm" variant="ghost" onClick={markComplete} disabled={loading}>
                ✓ Mark Complete
              </Button>
            )}
            {editable && (
              <>
                <Button size="sm" variant="ghost" onClick={followUpTask} disabled={loading}>
                  + Follow-Up Task
                </Button>
                <Button size="sm" variant="ghost" onClick={followUpEvent} disabled={loading}>
                  + Follow-Up Event
                </Button>
                {!confirmDelete ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmDelete(true)}
                    disabled={loading}
                    className="text-risk hover:border-risk"
                  >
                    🗑 Delete
                  </Button>
                ) : (
                  <span className="inline-flex items-center gap-2 font-mono text-[11px] text-muted">
                    Delete this {isEvent ? 'event' : 'task'}?
                    <Button size="sm" variant="ghost" onClick={del} disabled={loading} className="text-risk hover:border-risk">
                      Confirm
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)} disabled={loading}>
                      Keep
                    </Button>
                  </span>
                )}
              </>
            )}
            <span className="ml-auto flex items-center gap-2.5">
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button variant="accent" onClick={save} disabled={!editable || loading}>
                {loading ? 'Saving…' : 'Save'}
              </Button>
            </span>
          </div>
        </div>
      }
    >
      <Section title={infoTitle}>
        <Field label="Subject">
          <TextInput value={subject} onChange={e => setSubject(e.target.value)} disabled={!editable} />
        </Field>
        <DisplayRow label="Related To" value={item.clientName} />
        <FieldRow>
          <Field label={isEvent ? 'Date' : 'Due Date'}>
            <TextInput type="date" value={date} onChange={e => setDate(e.target.value)} disabled={!editable} />
          </Field>
          {isEvent ? (
            <Field label="Time">
              <TextInput type="time" value={time} onChange={e => setTime(e.target.value)} disabled={!editable} />
            </Field>
          ) : (
            <Field label="Type">
              <SelectInput value={type} onChange={e => setType(e.target.value)} disabled={!editable}>
                {TASK_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </SelectInput>
            </Field>
          )}
        </FieldRow>
        {isEvent && (
          <Field label="Type">
            <SelectInput value={type} onChange={e => setType(e.target.value)} disabled={!editable}>
              {EVENT_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </SelectInput>
          </Field>
        )}
        <Field label="Comments">
          <TextArea value={description} onChange={e => setDescription(e.target.value)} disabled={!editable} />
        </Field>
      </Section>

      <Section title="Additional Information">
        {isEvent ? (
          <FieldRow>
            <Field label="Location">
              <TextInput value={location} onChange={e => setLocation(e.target.value)} disabled={!editable} />
            </Field>
            <Field label="Show As">
              <SelectInput value={showAs} onChange={e => setShowAs(e.target.value)} disabled={!editable}>
                {EVENT_SHOWAS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </SelectInput>
            </Field>
          </FieldRow>
        ) : (
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
      </Section>

      {(item.ownerName || item.createdByName || item.createdDate || item.lastModifiedByName || item.lastModifiedDate) && (
        <Section title="System Information">
          <DisplayRow label="Assigned To" value={item.ownerName} />
          <DisplayRow label="Created By" value={byLine(item.createdByName, item.createdDate)} />
          <DisplayRow label="Last Modified By" value={byLine(item.lastModifiedByName, item.lastModifiedDate)} />
        </Section>
      )}

      {error && <p className="mt-1 text-[12px] text-risk">{error}</p>}
    </Modal>
  );
}
