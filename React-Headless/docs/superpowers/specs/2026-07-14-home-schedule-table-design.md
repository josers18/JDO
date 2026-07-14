# Home Reorder + Unified Editable Tasks & Schedule — Design

**Date:** 2026-07-14
**Branch:** `feat/home-schedule-table` (off `feat/home-ai-actions`)
**Scope:** ReactRetail, ReactWealth, ReactCommercial banker home pages + shared library + Apex CRM bridge.

## Problem

The banker home currently renders, top-to-bottom: **Daily Brief → Tasks & Schedule (3 separate bucket panels) → KPI Pulse → Priority Queue → …**. The user wants:

1. The **KPI Pulse** row to sit directly after the Daily Brief ("today box").
2. **Tasks & Schedule** to follow the KPIs.
3. Tasks & Schedule rendered as **one table**, not three bucket panels.
4. **Filter chips** (All / Overdue / Today / Upcoming, with counts) + a Tasks/Meetings kind toggle.
5. **More information per line item** (status, priority, kind, date/time).
6. **Color-coded chips** keyed to the bucket.
7. A **row-click detail modal** showing all fields with the **ability to edit** the real record.

## Decisions (locked with the user)

- **Edit depth:** TRUE edit — the detail modal patches the real Task/Event via a new `update` action added to `CrmWriteRest.cls` (+ test). Code change → PR-gated.
- **Bundle scope:** all three cockpits (Retail, Wealth, Commercial).
- **Editable fields:** every displayed field — Subject, Date & Time, Status, Priority.
- **Closed items:** open-only. Existing queries already filter `IsClosed = false`; marking a task Completed via edit makes it drop on the next refetch. No "Done" bucket.

## Ground-truth facts that shape the design

- `CrmWriteRest.cls` is **insert-only** today (`task`/`event`/`case`/`email`, each ending in `insert`). No update path exists — this feature adds one.
- `homeDataReal.ts` **selects the real `Id`** on each Task/Event/Overdue query, then **discards it** by mapping to synthetic ids (`to0`, `tu1`, `e2`). To edit or identify a real record, the real `Id` must be preserved.
- `ScheduleItem` is field-poor: `{ id, time, title, kind, clientName? }`. "More info" and "edit" require widening the type and the GraphQL projection.
- `bucketSchedule()` currently splits into 3 arrays. A single table with filters wants each item *tagged* with its bucket instead.
- ISO date strings (`YYYY-MM-DD`) sort chronologically as plain strings — existing bucketing relies on this; keep it (no timezone math).
- Task status/priority picklists: standard `Task.Status`/`Task.Priority` use PascalCase labels ("Not Started", "Completed", "High", "Normal", "Low"). Per prior findings, describe() returns labels and restricted picklists reject labels on DML — the update path must send **API values discovered from the org** (`SELECT Status, COUNT(Id) FROM Task GROUP BY Status`), not guessed strings. Verify before hardcoding option lists.

## Architecture

### Data layer

**`ScheduleItem` (homeTypes.ts, all 3 bundles)** gains:
```ts
export interface ScheduleItem {
  id: string;            // synthetic list key (unchanged)
  recordId?: string;     // REAL Salesforce Id (Task/Event) — required for edit
  sobjectType?: 'Task' | 'Event';
  time: string;          // ISO date (Task) or date-only slice (Event); '—' when absent
  title: string;         // Subject
  kind: 'call' | 'meeting' | 'task' | 'event';
  clientName?: string;
  status?: string;       // Task.Status (Event has none — omit)
  priority?: string;     // Task.Priority
  whatId?: string;       // related record Id (future drill-in)
  bucket?: 'overdue' | 'today' | 'upcoming';  // derived client-side
}
```

**`homeDataReal.ts` (all 3 bundles):**
- Keep the real `Id` when mapping (`recordId: e.node.Id`).
- Add `Status`, `Priority` to the Task/TaskOverdue/TaskUpcoming GraphQL projections (`@optional { value }`).
- Set `sobjectType` per source ('Task' for the two task queries, 'Event' for the event query).
- Wealth/Commercial: confirm each bundle's real-data source has equivalent Task/Event queries; widen the same way, or (if a bundle uses mock) leave mock in place with the new fields optional.

### Apex — `CrmWriteRest.cls` update action

Add to the `action` dispatch:
```
} else if (action == 'update') {
    handleUpdate(res, reqBody);
}
```
`WriteRequest` gains `String sobjectType;` and `String recordId;`.

`handleUpdate`:
- Reject if `recordId` blank or `sobjectType` not in {`Task`, `Event`} → 400.
- CRUD/FLS check matching the existing handlers' security posture (`isUpdateable()` on the object and each field set).
- Build the SObject with only provided fields (subject → `Subject`; dueDate → `Task.ActivityDate`; activityDateTime → `Event.ActivityDateTime`; priority → `Task.Priority`; status → `Task.Status`), set `Id = recordId`, `Database.update` in USER_MODE consistent with insert handlers.
- Return `{ id: recordId, action: 'update' }` on success; 400 on validation, 500 on DML.

`CrmWriteRestTest` gains: (a) update-Task happy path, (b) update-Event happy path, (c) missing recordId → 400, (d) bad sobjectType → 400.

### Client layer — `crmWriteClient.ts`

```ts
export type CrmAction = 'task' | 'event' | 'case' | 'email' | 'update';
export interface CrmWriteInput {
  action: CrmAction;
  subject?: string;          // now optional (update may omit)
  sobjectType?: 'Task' | 'Event';
  recordId?: string;
  // …existing fields unchanged…
}
```
`useCrmAction` unchanged (forwards input).

### UI layer

**`bucketSchedule` → tag, not split.** Move to `@shared` and refactor to return the same `ScheduleItem[]` with each item's `bucket` set, plus `scheduleCounts(items)` returning `{ all, overdue, today, upcoming }`. Sort: overdue first (DESC), then today, then upcoming (ASC). Keep the string-compare date logic.

**New shared `ScheduleTable`** (`_shared/src/components/home/ScheduleTable.tsx`, presentational):
- Props: `items: ScheduleItem[]`, `onOpen(item)`.
- Segmented filter: `All · Overdue · Today · Upcoming` with counts; kind toggle `Tasks / Meetings`. Local `useState`.
- Header row + body rows. Row: kind icon + kind chip; title + client secondary line; status chip color-coded by `bucket` (overdue→risk, today→accent, upcoming→muted); priority pill when `priority === 'High'`; right-aligned date/time + chevron. Whole row is a button → `onOpen(item)`.
- Empty state per active filter.

**New shared `ScheduleDetailModal`** (`_shared/src/components/home/ScheduleDetailModal.tsx`):
- Props: `open`, `onClose`, `item: ScheduleItem | null`, `onSaved()`.
- Editable fields (reuse `fields.tsx`): Subject, Date, Time (Events), Status (Tasks — select), Priority (Tasks — select).
- Uses `useCrmAction(onSaved+close)`; submits `{ action:'update', sobjectType, recordId, subject, dueDate|activityDateTime, status, priority }`.
- Guard: if `recordId` missing (mock), render read-only + note; disable Save.
- Status/Priority options from verified org picklist API values.

**`HomePage.tsx` (all 3 bundles):**
- Move `KPI PULSE` above `TASKS & SCHEDULE`, both after `DAILY BRIEF`.
- Replace the 3-panel grid with `<ScheduleTable items={taggedSchedule} onOpen={openDetail} />`.
- Wire `openDetail` state + `<ScheduleDetailModal … onSaved={refetch} />`.
- Remove the now-unused local `ScheduleRow` and old `bucketSchedule` (moved to `@shared`).

## Testing

- **Apex:** `CrmWriteRestTest` — 4 new methods; deploy with `RunSpecifiedTests` for `CrmWriteRestTest`.
- **Vitest:** tagging `bucketSchedule` + `scheduleCounts` (bucket assignment, no-date → upcoming) and `ScheduleTable` filtering (counts, kind toggle, empty state).
- **Manual/live:** deploy to `jdo-1lrnov`; verify reorder, single table, chips, filter counts, row→modal, edit Task status → Completed → row drops after refetch; edit meeting time → persists.

## Deploy

- Apex + 3 bundles + permsets, `--json`, check `status`/`numberComponentErrors`. Rebuild each bundle's `dist/` (UIBundle deploys dist) and commit rebuilt dist. PR-gated. Base `feat/home-ai-actions`.

## Out of scope (YAGNI)

- "Done" bucket / closed-item history.
- Editing Case/Lead from this table.
- Bulk actions, drag-to-reschedule, calendar view.
- Wealth/Commercial schedule *data* enrichment beyond the same field-widening.
