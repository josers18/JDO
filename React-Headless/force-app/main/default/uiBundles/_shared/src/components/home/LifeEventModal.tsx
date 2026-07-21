import { useEffect, useState } from 'react';
import { Modal, CrmNote } from '../Modal';
import { Button } from '../Button';
import { Icon } from '../iconMap';
import { Field, TextInput, SelectInput, DisplayRow, LookupField } from './fields';
import { useCrmAction } from './useCrmAction';
import { searchContacts, type LookupHit } from '../../data/lookupSearch';
import { LIFE_EVENT_TYPE_OPTIONS, type LifeEventItem } from './types';

export function LifeEventModal({
  open,
  onClose,
  event,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  event: LifeEventItem | null;
  onSaved?: () => void;
}) {
  // Defer to an inner component once `event` is non-null so the hooks that need
  // Salesforce context (useCrmAction → useToast) never run for the empty state.
  if (!event) return null;
  return <LifeEventModalContent open={open} onClose={onClose} event={event} onSaved={onSaved} />;
}

function LifeEventModalContent({
  open,
  onClose,
  event,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  event: LifeEventItem;
  onSaved?: () => void;
}) {
  const creating = !!event.create;
  // Both create and edit write; a life event surfaced from CRM always has a
  // recordId. (Unlike goals, life events have no demo read-only state — the
  // card is live — but the guard mirrors the goal modal for symmetry.)
  const editable = creating || !!event.recordId;

  const [name, setName] = useState(event.name ?? '');
  const [eventType, setEventType] = useState(event.eventType || LIFE_EVENT_TYPE_OPTIONS[0]);
  const [eventDate, setEventDate] = useState(event.eventDate ?? '');
  // Create-mode only: the customer link is a Contact (PersonLifeEvent has no
  // Account field). For person accounts the contact name is the account name,
  // so this IS the "select the customer" control.
  const [person, setPerson] = useState<LookupHit>({ id: '', name: '' });

  // Reseed whenever a different event is opened. In create mode the incoming
  // item is a blank template, so this also resets the form between "New" opens.
  useEffect(() => {
    setName(event.name ?? '');
    setEventType(event.eventType || LIFE_EVENT_TYPE_OPTIONS[0]);
    setEventDate(event.eventDate ?? '');
    setPerson({ id: '', name: '' });
  }, [event.recordId, event.create]); // eslint-disable-line react-hooks/exhaustive-deps

  const { submit, loading, error } = useCrmAction(() => {
    onSaved?.();
    onClose();
  });

  // Create needs a name, a type, a date, and a chosen person before insert.
  const canCreate = creating && name.trim() !== '' && !!eventType && !!eventDate && !!person.id;

  const save = () => {
    if (!editable) return;

    if (creating) {
      if (!canCreate) return;
      void submit(
        {
          action: 'lifeEvent',
          name,
          eventType,
          eventDate,
          primaryPersonId: person.id,
        },
        'Life event created',
        `${name} · ${person.name}`,
      );
      return;
    }

    // EventType is set-once (not updateable) — omit it from the edit payload;
    // Apex only writes Name and EventDate on update.
    void submit(
      {
        action: 'update',
        sobjectType: 'PersonLifeEvent',
        recordId: event.recordId,
        name,
        eventDate: eventDate || undefined,
      },
      'Life event updated',
      `${event.name} · PersonLifeEvent`,
    );
  };

  // Attribution line: in create mode it follows the chosen person; otherwise
  // the client (account) the event is about.
  const attribution = creating ? person.name : event.clientName || '';

  return (
    <Modal
      open={open}
      onClose={onClose}
      tone="accent"
      icon={<Icon name="lifeEvent" size={17} />}
      title={creating ? 'New life event' : 'Life event details'}
      subtitle={
        creating
          ? attribution ? `${name || 'New life event'} · ${attribution}` : 'Log a customer life event'
          : attribution ? `${event.name} · ${attribution}` : event.name
      }
      footer={
        <div className="flex w-full flex-col gap-3">
          <CrmNote>Writes to Salesforce PersonLifeEvent</CrmNote>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="ml-auto flex items-center gap-2.5">
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button
                variant="accent"
                onClick={save}
                disabled={loading || (creating ? !canCreate : !editable)}
              >
                {loading ? 'Saving…' : creating ? 'Create life event' : 'Save'}
              </Button>
            </span>
          </div>
        </div>
      }
    >
      <div className="mb-5">
        <h4 className="mb-3 border-b border-line pb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          Life Event
        </h4>
        {creating && (
          <Field label="Customer (Contact)">
            <LookupField
              value={person}
              onChange={setPerson}
              search={searchContacts}
              placeholder="Search customers by name…"
            />
          </Field>
        )}
        {!creating && attribution && <DisplayRow label="Client" value={attribution} />}
        <Field label="Event Name">
          <TextInput value={name} onChange={e => setName(e.target.value)} disabled={!editable} />
        </Field>
        {/* Event Type and the customer link are set-once on PersonLifeEvent
            (createable but NOT updateable — the platform rejects the write).
            So the type is an editable picklist only while creating; on edit it
            renders read-only rather than letting the user change something that
            silently won't save. */}
        {creating ? (
          <Field label="Event Type">
            <SelectInput value={eventType} onChange={e => setEventType(e.target.value)} disabled={!editable}>
              {LIFE_EVENT_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </SelectInput>
          </Field>
        ) : (
          eventType && <DisplayRow label="Event Type" value={eventType} />
        )}
        <Field label="Event Date">
          <TextInput type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} disabled={!editable} />
        </Field>
      </div>

      {error && <p className="mt-1 text-[12px] text-risk">{error}</p>}
    </Modal>
  );
}
