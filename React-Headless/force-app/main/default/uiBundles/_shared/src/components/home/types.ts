/**
 * A lightweight client profile the Prep sheet and 360 quick view render. All
 * fields optional — the modals compose sensible defaults when they're absent so
 * the components stay decoupled from any bundle's data model.
 */
export interface ClientProfile {
  initials?: string;
  /** Short descriptor, e.g. "Retail household" / "Commercial". */
  descriptor?: string;
  since?: string;
  csat?: string;
  value?: string;
  openCases?: string;
  facts?: [string, string][];
  recap?: string;
  talk?: string;
  nba?: string[];
  // ── Rich Client-360 panel fields (all optional; the panel composes
  //    sensible fallbacks from the base fields when absent). ──
  /** 0..100 relationship-health score for the ring. */
  healthScore?: number;
  /** Word for the score, e.g. "Fair" / "Excellent". */
  healthLabel?: string;
  /** Signed month-over-month health delta, e.g. -8 or +3. */
  healthDeltaPts?: number;
  /** Segment/tier word rendered as a chip, e.g. "Platinum". */
  tier?: string;
  /** Priority flag rendered as a header chip, e.g. "High Priority". */
  priorityLabel?: string;
  /** Signed relationship-value trend for the quarter, e.g. +6. */
  valueDeltaPct?: number;
  /** Recent signals for the panel's "Recent Signals" list. */
  signals?: ClientSignal[];
  /** The single Next Best Action headline (renders as the primary button). */
  nbaHeadline?: string;
  /** Chronological relationship timeline for the panel's Timeline section. */
  timeline?: ClientTimelineEntry[];
}

/** One row in the Client-360 "Recent Signals" list. */
export interface ClientSignal {
  label: string;
  when: string;
  tone: 'risk' | 'warn' | 'ok' | 'neutral';
}

/** One entry in the Client-360 relationship timeline. */
export interface ClientTimelineEntry {
  when: string;
  title: string;
  detail?: string;
  tone: 'risk' | 'warn' | 'ok' | 'neutral';
}

/**
 * A banker's open task or meeting, merged from Task + Event feeds. Fields beyond
 * id/time/title/kind are optional so mock data (which lacks a real recordId)
 * still satisfies the type; the detail modal falls back to read-only when
 * recordId is absent.
 */
export interface ScheduleItem {
  id: string;                              // synthetic list key
  recordId?: string;                       // real Salesforce Id — required to edit
  sobjectType?: 'Task' | 'Event';
  time: string;                            // ISO date (YYYY-MM-DD) or '—' — display + bucketing
  startDateTime?: string;                  // full ISO datetime for Events — preserves clock time for edit
  title: string;                           // Subject
  kind: 'call' | 'meeting' | 'task' | 'event';
  clientName?: string;
  status?: string;                         // Task.Status
  priority?: string;                       // Task.Priority
  whatId?: string;                         // related record Id
  bucket?: 'overdue' | 'today' | 'upcoming';
  type?: string;                           // Task/Event Type picklist
  description?: string;                    // Comments / Description
  location?: string;                       // Event only
  showAs?: string;                         // Event only
  ownerId?: string;                        // Assigned To (Owner Id — seeds the lookup)
  ownerName?: string;                      // Assigned To (display)
  createdByName?: string;
  createdDate?: string;                    // ISO
  lastModifiedByName?: string;
  lastModifiedDate?: string;               // ISO
}

export type ScheduleBucketKey = 'overdue' | 'today' | 'upcoming';

/** Verified live-org Task picklist API values (label == value). Events have neither. */
export const TASK_STATUS_OPTIONS: string[] = [
  'Not Started', 'In Progress', 'Completed', 'Waiting on someone else', 'Deferred', 'Open',
];
export const TASK_PRIORITY_OPTIONS: string[] = ['High', 'Normal', 'Low'];

/** Task/Event Type picklist — verified live (label == value). */
export const TASK_TYPE_OPTIONS: string[] = ['Call', 'Email', 'Meeting', 'Prep', 'Other'];
export const EVENT_TYPE_OPTIONS: string[] = ['Call', 'Email', 'Meeting', 'Prep', 'Other'];

/** Event.ShowAs — stored value differs from display label for "Out of Office". */
export const EVENT_SHOWAS_OPTIONS: { value: string; label: string }[] = [
  { value: 'Busy', label: 'Busy' },
  { value: 'OutOfOffice', label: 'Out of Office' },
  { value: 'Free', label: 'Free' },
];
