import { useEffect, useState } from 'react';
import { Modal, CrmNote } from '../Modal';
import { Button } from '../Button';
import { Icon } from '../iconMap';
import { Field, FieldRow, TextInput, TextArea, SelectInput, DisplayRow } from './fields';
import { useCrmAction } from './useCrmAction';
import { formatValue } from '../format';
import {
  GOAL_STATUS_OPTIONS,
  GOAL_PRIORITY_OPTIONS,
  GOAL_TYPE_OPTIONS,
  type CustomerGoalItem,
} from './types';

/** Progress toward the target as a whole-percent (0..100), 0 when no target. */
function pctOf(current: number, target: number): number {
  if (!target) return 0;
  return Math.max(0, Math.min(100, Math.round((current / target) * 100)));
}

export function CustomerGoalModal({
  open,
  onClose,
  goal,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  goal: CustomerGoalItem | null;
  onSaved?: () => void;
}) {
  // Defer to an inner component once `goal` is non-null so the hooks that need
  // Salesforce context (useCrmAction → useToast) never run for the empty state.
  if (!goal) return null;
  return <CustomerGoalModalContent open={open} onClose={onClose} goal={goal} onSaved={onSaved} />;
}

function CustomerGoalModalContent({
  open,
  onClose,
  goal,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  goal: CustomerGoalItem;
  onSaved?: () => void;
}) {
  const editable = !!goal.recordId;

  const [name, setName] = useState(goal.name ?? '');
  const [status, setStatus] = useState(goal.status || 'NOT_STARTED');
  const [priority, setPriority] = useState(goal.priority || 'MEDIUM');
  const [type, setType] = useState(goal.type || 'Other');
  const [targetDate, setTargetDate] = useState(goal.targetDate ?? '');
  const [target, setTarget] = useState(goal.target != null ? String(goal.target) : '');
  const [current, setCurrent] = useState(goal.current != null ? String(goal.current) : '');
  const [description, setDescription] = useState(goal.description ?? '');

  // Reseed whenever a different goal is opened.
  useEffect(() => {
    setName(goal.name ?? '');
    setStatus(goal.status || 'NOT_STARTED');
    setPriority(goal.priority || 'MEDIUM');
    setType(goal.type || 'Other');
    setTargetDate(goal.targetDate ?? '');
    setTarget(goal.target != null ? String(goal.target) : '');
    setCurrent(goal.current != null ? String(goal.current) : '');
    setDescription(goal.description ?? '');
  }, [goal.recordId]); // eslint-disable-line react-hooks/exhaustive-deps

  const { submit, loading, error } = useCrmAction(() => {
    onSaved?.();
    onClose();
  });

  const save = () => {
    if (!editable) return;
    // Amounts are numeric fields — send them only when they parse, so a blank
    // input leaves the server value untouched rather than zeroing it.
    const targetNum = target.trim() === '' ? undefined : Number(target);
    const currentNum = current.trim() === '' ? undefined : Number(current);
    void submit(
      {
        action: 'update',
        sobjectType: 'FinancialGoal',
        recordId: goal.recordId,
        name,
        status,
        priority,
        type,
        description,
        targetDate: targetDate || undefined,
        targetAmount: targetNum != null && !isNaN(targetNum) ? targetNum : undefined,
        actualAmount: currentNum != null && !isNaN(currentNum) ? currentNum : undefined,
      },
      'Goal updated',
      `${goal.name} · FinancialGoal`,
    );
  };

  const targetNum = Number(target) || 0;
  const currentNum = Number(current) || 0;
  const progress = pctOf(currentNum, targetNum);
  // Attribution line: prefer the client (account), else the plan name.
  const attribution = goal.clientName || goal.planName || '';

  return (
    <Modal
      open={open}
      onClose={onClose}
      tone="accent"
      icon={<Icon name="goal" size={17} />}
      title="Goal details"
      subtitle={attribution ? `${goal.name} · ${attribution}` : goal.name}
      footer={
        <div className="flex w-full flex-col gap-3">
          <CrmNote>{editable ? 'Writes to Salesforce FinancialGoal' : 'Demo record — read only'}</CrmNote>
          <div className="flex flex-wrap items-center gap-2.5">
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
      <div className="mb-5">
        <h4 className="mb-3 border-b border-line pb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          Goal Information
        </h4>
        <Field label="Goal Name">
          <TextInput value={name} onChange={e => setName(e.target.value)} disabled={!editable} />
        </Field>
        {attribution && (
          <DisplayRow
            label={goal.clientName ? 'Client' : 'Plan'}
            value={goal.clientName ? `${goal.clientName}${goal.planName ? ` · ${goal.planName}` : ''}` : goal.planName}
          />
        )}
        <FieldRow>
          <Field label="Status">
            <SelectInput value={status} onChange={e => setStatus(e.target.value)} disabled={!editable}>
              {GOAL_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </SelectInput>
          </Field>
          <Field label="Priority">
            <SelectInput value={priority} onChange={e => setPriority(e.target.value)} disabled={!editable}>
              {GOAL_PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </SelectInput>
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Type">
            <SelectInput value={type} onChange={e => setType(e.target.value)} disabled={!editable}>
              {GOAL_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </SelectInput>
          </Field>
          <Field label="Target Date">
            <TextInput type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} disabled={!editable} />
          </Field>
        </FieldRow>
        <Field label="Description">
          <TextArea value={description} onChange={e => setDescription(e.target.value)} disabled={!editable} />
        </Field>
      </div>

      <div className="mb-5">
        <h4 className="mb-3 border-b border-line pb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          Progress
        </h4>
        <FieldRow>
          <Field label="Amount Saved">
            <TextInput
              type="number"
              inputMode="decimal"
              value={current}
              onChange={e => setCurrent(e.target.value)}
              disabled={!editable}
            />
          </Field>
          <Field label="Target Amount">
            <TextInput
              type="number"
              inputMode="decimal"
              value={target}
              onChange={e => setTarget(e.target.value)}
              disabled={!editable}
            />
          </Field>
        </FieldRow>
        <DisplayRow
          label="Progress"
          value={`${progress}% · ${formatValue(currentNum, 'currencyCompact')} of ${formatValue(targetNum, 'currencyCompact')}`}
        />
      </div>

      {error && <p className="mt-1 text-[12px] text-risk">{error}</p>}
    </Modal>
  );
}
