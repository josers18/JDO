import { useEffect, useState } from 'react';
import { Modal, CrmNote } from '../Modal';
import { Button } from '../Button';
import { Icon } from '../iconMap';
import { Field, FieldRow, TextInput, SelectInput, DisplayRow } from './fields';
import { useCrmAction } from './useCrmAction';
import { LEAD_STATUS_OPTIONS, LEAD_SOURCE_OPTIONS, type LeadItem } from './types';

export function LeadModal({
  open,
  onClose,
  lead,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  lead: LeadItem | null;
  onSaved?: () => void;
}) {
  // Defer to an inner component once `lead` is non-null so the hooks that need
  // Salesforce context (useCrmAction → useToast) never run for the empty state.
  if (!lead) return null;
  return <LeadModalContent open={open} onClose={onClose} lead={lead} onSaved={onSaved} />;
}

function LeadModalContent({
  open,
  onClose,
  lead,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  lead: LeadItem;
  onSaved?: () => void;
}) {
  const creating = !!lead.create;
  // Both create and edit write; a lead surfaced from CRM always has a recordId.
  // Unlike PersonLifeEvent, Lead has no set-once fields — every field below is
  // freely editable on update.
  const editable = creating || !!lead.recordId;

  const [firstName, setFirstName] = useState(lead.firstName ?? '');
  const [lastName, setLastName] = useState(lead.lastName ?? '');
  const [company, setCompany] = useState(lead.company ?? '');
  const [status, setStatus] = useState(lead.status || LEAD_STATUS_OPTIONS[0]);
  const [leadSource, setLeadSource] = useState(lead.leadSource ?? '');
  const [email, setEmail] = useState(lead.email ?? '');
  const [value, setValue] = useState(lead.annualRevenue != null ? String(lead.annualRevenue) : '');

  // Reseed whenever a different lead is opened. In create mode the incoming item
  // is a blank template, so this also resets the form between "New" opens.
  useEffect(() => {
    setFirstName(lead.firstName ?? '');
    setLastName(lead.lastName ?? '');
    setCompany(lead.company ?? '');
    setStatus(lead.status || LEAD_STATUS_OPTIONS[0]);
    setLeadSource(lead.leadSource ?? '');
    setEmail(lead.email ?? '');
    setValue(lead.annualRevenue != null ? String(lead.annualRevenue) : '');
  }, [lead.recordId, lead.create]); // eslint-disable-line react-hooks/exhaustive-deps

  const { submit, loading, error } = useCrmAction(() => {
    onSaved?.();
    onClose();
  });

  // Lead.LastName and Lead.Company are the two create-required fields.
  const canCreate = creating && lastName.trim() !== '' && company.trim() !== '';

  // Parse the est-value box to a number; blank/garbage → undefined (leaves the
  // field untouched on update, unset on create).
  const parsedRevenue = () => {
    const n = Number(value.replace(/[^0-9.]/g, ''));
    return value.trim() !== '' && !Number.isNaN(n) ? n : undefined;
  };

  const displayName = `${firstName} ${lastName}`.trim();

  const save = () => {
    if (!editable) return;

    if (creating) {
      if (!canCreate) return;
      void submit(
        {
          action: 'lead',
          lastName,
          firstName: firstName || undefined,
          company,
          status,
          leadSource: leadSource || undefined,
          email: email || undefined,
          annualRevenue: parsedRevenue(),
        },
        'Lead created',
        `${displayName || lastName} · ${company}`,
      );
      return;
    }

    void submit(
      {
        action: 'update',
        sobjectType: 'Lead',
        recordId: lead.recordId,
        lastName: lastName || undefined,
        firstName: firstName || undefined,
        company: company || undefined,
        status: status || undefined,
        leadSource: leadSource || undefined,
        email: email || undefined,
        annualRevenue: parsedRevenue(),
      },
      'Lead updated',
      `${displayName || lead.lastName || 'Lead'} · Lead`,
    );
  };

  const subtitleName = displayName || lead.lastName || 'Lead';

  return (
    <Modal
      open={open}
      onClose={onClose}
      tone="accent"
      icon={<Icon name="leads" size={17} />}
      title={creating ? 'New lead' : 'Lead details'}
      subtitle={
        creating
          ? company ? `${subtitleName} · ${company}` : 'Capture a new lead or referral'
          : company ? `${subtitleName} · ${company}` : subtitleName
      }
      footer={
        <div className="flex w-full flex-col gap-3">
          <CrmNote>Writes to Salesforce Lead</CrmNote>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="ml-auto flex items-center gap-2.5">
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button
                variant="accent"
                onClick={save}
                disabled={loading || (creating ? !canCreate : !editable)}
              >
                {loading ? 'Saving…' : creating ? 'Create lead' : 'Save'}
              </Button>
            </span>
          </div>
        </div>
      }
    >
      <div className="mb-5">
        <h4 className="mb-3 border-b border-line pb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          Lead
        </h4>
        {/* Lead.Name is a compound read-only field, so the editable name is
            FirstName + LastName. LastName is required for create. */}
        <FieldRow>
          <Field label="First Name">
            <TextInput value={firstName} onChange={e => setFirstName(e.target.value)} disabled={!editable} />
          </Field>
          <Field label="Last Name">
            <TextInput value={lastName} onChange={e => setLastName(e.target.value)} disabled={!editable} />
          </Field>
        </FieldRow>
        <Field label="Company">
          <TextInput value={company} onChange={e => setCompany(e.target.value)} disabled={!editable} />
        </Field>
        <FieldRow>
          <Field label="Status">
            <SelectInput value={status} onChange={e => setStatus(e.target.value)} disabled={!editable}>
              {LEAD_STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </SelectInput>
          </Field>
          <Field label="Lead Source">
            <SelectInput value={leadSource} onChange={e => setLeadSource(e.target.value)} disabled={!editable}>
              <option value="">—</option>
              {LEAD_SOURCE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </SelectInput>
          </Field>
        </FieldRow>
        <Field label="Email">
          <TextInput type="email" value={email} onChange={e => setEmail(e.target.value)} disabled={!editable} />
        </Field>
        <Field label="Est. Value (Annual Revenue)">
          <TextInput
            inputMode="decimal"
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder="e.g. 250000"
            disabled={!editable}
          />
        </Field>
        {!creating && lead.recordId && <DisplayRow label="Lead Id" value={lead.recordId} />}
      </div>

      {error && <p className="mt-1 text-[12px] text-risk">{error}</p>}
    </Modal>
  );
}
