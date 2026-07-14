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
