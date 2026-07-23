# Native-Mirror Schedule Detail Modal — Design Spec

**Date:** 2026-07-14
**Branch:** `feat/schedule-modal-native` (off `main` @ `157006d4`)
**Goal:** Expand the home-page Schedule detail modal so it mirrors the native Salesforce Task/Event record surface — richer read + edit fields (Type, Comments, Assigned To, Related To, Created/Modified) and quick actions (Mark Complete, Delete, Create Follow-Up Task/Event) — across all three cockpits (Retail/Wealth/Commercial).

## Context

Today (`ScheduleDetailModal.tsx`, shared) edits four fields — Subject, Date/Time, Status, Priority — and Save writes via `CrmWriteRest` `update`. The user supplied the native Task page + edit dialog + action dropdown as the reference target. The modal should read like the native record: sectioned (Task Information / Additional Information / System Information), more editable fields, and the native quick actions.

## Live-org facts (verified against jdo-1lrnov / storm-16a17dc388fbe6, 2026-07-14)

- **Task.Type** picklist (label == value): `Call`, `Email`, `Meeting`, `Prep`, `Other`.
- **Event** has `Type` (same 5 values), `ShowAs` (`Busy`/`OutOfOffice`/`Free`), `Location` (text), `Description` (text), `IsAllDayEvent`, `DurationInMinutes`, `EndDateTime`.
- **Task.Status** (existing): `Not Started`, `In Progress`, `Completed`, `Waiting on someone else`, `Deferred`, `Open`. **Priority**: `High`, `Normal`, `Low`.
- uiapi GraphQL: `Type`, `Description`, `WhatId`, `OwnerId`, `CreatedBy.Name`, `LastModifiedBy.Name`, `CreatedDate`, `LastModifiedDate` all resolve on Task/Event. Polymorphic `What`/`Owner` do NOT expose `Name` directly — only the scalar `*Id`. "Related To" reuses the item's existing `clientName`; "Assigned To" comes from the running user's identity (no per-row Owner lookup).

## Architecture

Change-cost splits three ways:
- **Shared, edited once:** `_shared/.../types.ts` (widen `ScheduleItem` + option consts), `ScheduleDetailModal.tsx` (the modal rewrite), `fields.tsx` (already has `TextArea`; add a read-only display row helper).
- **Apex, edited once:** `CrmWriteRest.cls` — extend `handleUpdate` with `Type`/`Description` (Task) and `Type`/`Description`/`Location`/`ShowAs` (Event); add a `delete` action. New `WriteRequest` fields: `type`, `location`, `showAs`.
- **Per-bundle, edited three times (near-identical):** `homeDataReal.ts` in Retail/Wealth/Commercial — widen the Task + Event GraphQL selections and map the new fields onto `ScheduleItem`.

## Data model changes

### `ScheduleItem` (widen — all optional, mock-safe)
```
type?: string;              // Task/Event Type picklist value
description?: string;       // Comments / Description
location?: string;          // Event only
showAs?: string;            // Event only
ownerName?: string;         // Assigned To (display)
createdByName?: string;
createdDate?: string;       // ISO
lastModifiedByName?: string;
lastModifiedDate?: string;  // ISO
```
`clientName` already carries Related-To display. `whatId` already present.

### New option consts
```
TASK_TYPE_OPTIONS  = ['Call','Email','Meeting','Prep','Other'];
EVENT_TYPE_OPTIONS = ['Call','Email','Meeting','Prep','Other'];
EVENT_SHOWAS_OPTIONS = ['Busy','OutOfOffice','Free'];   // value; label 'Out of Office' for OutOfOffice
```

## Write layer (`CrmWriteRest.cls`)

`WriteRequest` gains: `public String type; public String location; public String showAs;`

`handleUpdate` — Task branch also sets (when non-blank): `t.Type`, `t.Description`.
Event branch also sets (when non-blank): `ev.Type`, `ev.Description`, `ev.Location`, `ev.ShowAs`.

New action `delete` (routed in `write()` dispatch → `handleDelete`):
- Requires `recordId` + `sobjectType` (Task|Event); reuses the **exact** cross-type Id guard from `handleUpdate` (400 on mismatch / bad Id / blank).
- `delete new Task(Id = recId)` / `delete new Event(Id = recId)`; returns `{success:true, id:recId}`.

Mark Complete = an `update` with `status:'Completed'` (no new Apex).
Follow-Up Task/Event = existing `task`/`event` create actions, seeded `whatId` + `Follow up: <subject>`.

## Modal UX (`ScheduleDetailModal.tsx`)

Sections mirroring native, but only the fields that carry demo meaning:

**Task Information** — Subject* (text), Related To (read-only, from `clientName`), Due Date (date), Type (select), Comments (textarea).
**Additional Information** — Status* (select), Priority* (select). *(Events: Type, Location, Show As instead of Status/Priority.)*
**System Information** (read-only) — Assigned To (`ownerName`), Created By · `createdDate`, Last Modified By · `lastModifiedDate`. Rendered as label/value display rows (not inputs).

**Footer actions** (left → right):
- `✓ Mark Complete` — Tasks only, hidden when `status === 'Completed'`. Sets Completed, saves, refetch.
- `+ Follow-Up Task` / `+ Follow-Up Event` — create action, seeded from this record, then refetch.
- `🗑 Delete` — two-step: click reveals inline "Delete? [Confirm] [Keep]"; Confirm fires `delete` action, refetch, close.
- `Cancel` · `Save` (existing).

Non-editable rows / demo (mock, no `recordId`) records: everything read-only, only Cancel shown (existing behavior preserved).

## Scope exclusions (confirmed)
- Native dropdown's *Change Status / Change Priority / Change Date / Edit Comments / Edit* → subsumed by the inline editable form.
- *Change Record Type* / *Edit Labels* → org-admin ops, no demo meaning — dropped.
- Assigned To / Related To are **read-only** (native lets you reassign; not needed for demo and avoids Owner/What write complexity).

## Error handling
- Reuse `useCrmAction` (toast + inline error). Delete confirm guards accidental loss.
- Blank Event date still guarded against `NaN.toISOString()` (existing logic kept).
- All new Apex paths keep the existing 400-on-bad-input contract.

## Testing (batched to end-of-build gate only — per standing instruction)
- vitest: extend `schedule.test.ts` for any new pure util (option lists need none). Modal logic (follow-up seeding, delete confirm state) gets a focused test.
- Apex: extend `CrmWriteRestTest.cls` — update sets Type/Description; delete happy-path + cross-type 400 + missing-id 400.
- Deploy + browser verification once, at the very end of the whole build.

## Files
- Modify: `_shared/src/components/home/types.ts` (widen + consts)
- Modify: `_shared/src/components/home/fields.tsx` (read-only `DisplayRow`)
- Modify: `_shared/src/components/home/ScheduleDetailModal.tsx` (rewrite)
- Modify: `classes/CrmWriteRest.cls` (+fields, +delete, +Type/Description/Location/ShowAs)
- Modify: `classes/CrmWriteRestTest.cls` (+tests)
- Modify: `{ReactRetail,ReactWealth,ReactCommercial}/src/home/homeDataReal.ts` (widen queries + mapping)
- Rebuild: `dist/` ×3 (end step)
