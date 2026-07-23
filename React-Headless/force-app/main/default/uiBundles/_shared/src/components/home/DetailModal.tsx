import { type ReactNode } from 'react';
import { Modal } from '../Modal';
import { Button } from '../Button';
import { FactTile, DisplayRow } from './fields';

/** A key stat rendered as a tile at the top of the detail modal. */
export interface DetailFact {
  label: string;
  value: ReactNode;
}

/** A label/value row in the detail modal's field section (empty values hide). */
export interface DetailField {
  label: string;
  value: ReactNode;
}

/** A footer button — typically an escape hatch to a fuller record view. */
export interface DetailAction {
  label: string;
  onClick: () => void;
  variant?: 'accent' | 'ghost' | 'ai';
}

/**
 * The structured content for a read-only detail popup. Any list row (pipeline
 * opportunity, life event, alert, …) builds one of these and drops it into the
 * page's `detailView` state slot, mirroring how `ScheduleDetailModal` is driven
 * by `detailItem`. Kept read-only on purpose: it surfaces the record the user
 * clicked, and hands off to the editable/360 surfaces via `actions`.
 */
export interface DetailModalData {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  tone?: 'ai' | 'accent';
  /** Top-of-modal stat tiles (amount, propensity, …). */
  facts?: DetailFact[];
  /** A short narrative paragraph under the tiles (e.g. the recommended play). */
  note?: string;
  /** Detail rows; a row with an empty value renders nothing. */
  fields?: DetailField[];
  /** Section heading over the field rows. */
  sectionTitle?: string;
  /** Footer buttons — e.g. "Open client 360 →". */
  actions?: DetailAction[];
}

/**
 * Generic read-only detail modal. Renders nothing when `data` is null, so a
 * single instance can sit at the page root and light up on demand — the same
 * shape as `ScheduleDetailModal`.
 */
export function DetailModal({ data, onClose }: { data: DetailModalData | null; onClose: () => void }) {
  if (!data) return null;
  const actions = data.actions ?? [];
  return (
    <Modal
      open
      onClose={onClose}
      tone={data.tone ?? 'accent'}
      icon={data.icon}
      title={data.title}
      subtitle={data.subtitle}
      footer={
        <>
          <span className="flex-1 font-mono text-[10px] tracking-[0.04em] text-faint">Details</span>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          {actions.map(a => (
            <Button key={a.label} variant={a.variant ?? 'accent'} onClick={a.onClick}>
              {a.label}
            </Button>
          ))}
        </>
      }
    >
      {data.facts && data.facts.length > 0 && (
        <div className={`mb-4 grid gap-2.5 ${data.facts.length >= 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {data.facts.map(f => (
            <FactTile key={f.label} label={f.label} value={f.value} />
          ))}
        </div>
      )}

      {data.note && (
        <p className="mb-4 whitespace-pre-line text-[13.5px] leading-relaxed text-fg">{data.note}</p>
      )}

      {data.fields && data.fields.some(f => f.value != null && f.value !== '') && (
        <div className="mb-1">
          {data.sectionTitle && (
            <h4 className="mb-3 border-b border-line pb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              {data.sectionTitle}
            </h4>
          )}
          {data.fields.map(f => (
            <DisplayRow key={f.label} label={f.label} value={f.value} />
          ))}
        </div>
      )}
    </Modal>
  );
}
