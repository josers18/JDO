# Native-Mirror Schedule Detail Modal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the shared Schedule detail modal to mirror the native Salesforce Task/Event surface — Type, Comments, read-only Assigned To / Related To / Created / Modified, plus Mark Complete, Delete, Create Follow-Up Task/Event actions — across Retail/Wealth/Commercial.

**Architecture:** Shared type + modal + Apex edited once; three near-identical `homeDataReal.ts` GraphQL query widenings. All writes go through the existing `CrmWriteRest` REST bridge (`/crm/*`) via `useCrmAction`.

**Tech Stack:** React 19 + Vite 7 + TS + Tailwind v4 (Aurora Glass tokens, `@shared` alias); Apex REST; SFDX API v67.

## Global Constraints

- **Live Task.Type / Event.Type values (label==value):** `Call`, `Email`, `Meeting`, `Prep`, `Other`.
- **Event.ShowAs values:** `Busy`, `OutOfOffice`, `Free` (display `OutOfOffice` as "Out of Office").
- **Task.Status:** `Not Started`, `In Progress`, `Completed`, `Waiting on someone else`, `Deferred`, `Open`. **Priority:** `High`, `Normal`, `Low`.
- **UIBundles deploy `dist/` not `src/`** — dist rebuild is the final task, never per-edit.
- **All heavy verification (vitest full, deploy, apex run test, browser) is BATCHED to the very end of the whole build.** During iteration, do not run full suites or deploy. Scope any test authoring to the touched file; do not execute it repeatedly.
- **Polymorphic `What`/`Owner` do NOT expose `Name` in uiapi** — read scalar `WhatId`/`OwnerId`; resolve Owner→Name via a batch User lookup (mirror the existing `accountNamesQuery` pattern). Related-To display reuses the item's existing `clientName`.
- **Apex:** keep the existing 400-on-bad-input JSON contract (`{success:false,error}`); reuse the cross-type Id guard verbatim for delete.
- Match family LWC/React idioms already in these files; no new deps.

---

### Task 1: CrmWriteRest — new update fields + delete action + tests

**Files:**
- Modify: `React-Headless/force-app/main/default/classes/CrmWriteRest.cls`
- Modify: `React-Headless/force-app/main/default/classes/CrmWriteRestTest.cls`

**Interfaces:**
- Consumes: existing `WriteRequest`, `handleUpdate`, `writeError`/`writeSuccess`, dispatch in `write()`.
- Produces: `update` now honors `type`,`description` (Task) and `type`,`description`,`location`,`showAs` (Event); new `delete` action → `handleDelete(res, req)`; `WriteRequest` gains `public String type; public String location; public String showAs;`.

- [ ] **Step 1: Add fields to `WriteRequest`.** After the `recordId` field (~line 36) add:
```apex
        public String type;             // Task/Event Type picklist
        public String location;         // Event location
        public String showAs;           // Event ShowAs (Busy|OutOfOffice|Free)
```

- [ ] **Step 2: Extend `handleUpdate` writes.** In the Task branch, after the `dueDate` line add:
```apex
            if (!String.isBlank(req.type))        { t.Type = req.type; }
            if (!String.isBlank(req.description)) { t.Description = req.description; }
```
In the Event branch, after the `activityDateTime` block add:
```apex
            if (!String.isBlank(req.type))        { ev.Type = req.type; }
            if (!String.isBlank(req.description)) { ev.Description = req.description; }
            if (!String.isBlank(req.location))    { ev.Location = req.location; }
            if (!String.isBlank(req.showAs))      { ev.ShowAs = req.showAs; }
```

- [ ] **Step 3: Route `delete` in `write()` dispatch.** Add an `else if (action == 'delete') { handleDelete(res, reqBody); }` alongside the existing `update` branch (~line 69).

- [ ] **Step 4: Implement `handleDelete`.** Add after `handleUpdate`. Reuse the SAME guard sequence (blank recordId → 400; sobjectType not Task/Event → 400; bad Id cast → 400; prefix mismatch → 400), then:
```apex
        if (sot == 'Task') { delete new Task(Id = recId); }
        else               { delete new Event(Id = recId); }
        writeSuccess(res, recId);
```
Extract the shared guard into a private `Id resolveVerifiedId(RestResponse res, WriteRequest req)` returning null (after writing the error) on any failure, and have BOTH `handleUpdate` and `handleDelete` call it — DRY, no duplicated guard block.

- [ ] **Step 5: Write tests** in `CrmWriteRestTest.cls`:
  - `updateSetsTypeAndDescription` — insert Task; update with `type:"Meeting"`,`description:"notes"`; assert both persisted.
  - `updateSetsEventShowAsAndLocation` — insert Event; update with `showAs:"Free"`,`location:"HQ"`,`type:"Call"`; assert persisted.
  - `deletesTask` — insert Task; `action:"delete"`,`sobjectType:"Task"`,recordId; assert 200 + `[SELECT COUNT() FROM Task WHERE Id=:id]` == 0.
  - `deletesEvent` — same for Event.
  - `rejectsDeleteWithoutRecordId` — `action:"delete"`,`sobjectType:"Task"`, no id → 400, success=false.
  - `rejectsDeleteWhenIdTypeMismatches` — insert Task, send `sobjectType:"Event"` + Task Id → 400.

- [ ] **Step 6: Do NOT deploy or run tests now.** Author the tests; they run at the end-of-build gate. Commit:
```bash
git add React-Headless/force-app/main/default/classes/CrmWriteRest.cls React-Headless/force-app/main/default/classes/CrmWriteRestTest.cls
git commit -m "feat(crm-bridge): update Type/Description/Location/ShowAs + delete action"
```

---

### Task 2: Shared type widening + option consts + read-only field row

**Files:**
- Modify: `React-Headless/force-app/main/default/uiBundles/_shared/src/components/home/types.ts`
- Modify: `React-Headless/force-app/main/default/uiBundles/_shared/src/components/home/fields.tsx`

**Interfaces:**
- Consumes: existing `ScheduleItem`, `TASK_STATUS_OPTIONS`, `TASK_PRIORITY_OPTIONS`, existing `Field`.
- Produces: widened `ScheduleItem` (new optional fields below); `TASK_TYPE_OPTIONS`, `EVENT_TYPE_OPTIONS`, `EVENT_SHOWAS_OPTIONS` (as `{value,label}[]` for ShowAs); `DisplayRow` component for read-only label/value rows.

- [ ] **Step 1: Widen `ScheduleItem`** — add these optional fields after `priority`:
```ts
  type?: string;               // Task/Event Type
  description?: string;        // Comments / Description
  location?: string;           // Event only
  showAs?: string;             // Event only
  ownerName?: string;          // Assigned To (display)
  createdByName?: string;
  createdDate?: string;        // ISO
  lastModifiedByName?: string;
  lastModifiedDate?: string;   // ISO
```

- [ ] **Step 2: Add option consts** after the existing ones:
```ts
export const TASK_TYPE_OPTIONS: string[] = ['Call', 'Email', 'Meeting', 'Prep', 'Other'];
export const EVENT_TYPE_OPTIONS: string[] = ['Call', 'Email', 'Meeting', 'Prep', 'Other'];
export const EVENT_SHOWAS_OPTIONS: { value: string; label: string }[] = [
  { value: 'Busy', label: 'Busy' },
  { value: 'OutOfOffice', label: 'Out of Office' },
  { value: 'Free', label: 'Free' },
];
```

- [ ] **Step 3: Add `DisplayRow`** to `fields.tsx` (read-only label/value, mono label like `Field`, plain text value; used for System Information rows):
```tsx
export function DisplayRow({ label, value }: { label: string; value: ReactNode }) {
  if (value == null || value === '') return null;
  return (
    <div className="mb-3">
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.12em] text-faint">{label}</span>
      <span className="text-[13px] text-fg">{value}</span>
    </div>
  );
}
```

- [ ] **Step 4: Commit** (no build/test now):
```bash
git add React-Headless/force-app/main/default/uiBundles/_shared/src/components/home/types.ts React-Headless/force-app/main/default/uiBundles/_shared/src/components/home/fields.tsx
git commit -m "feat(shared): widen ScheduleItem for native modal + Type/ShowAs consts + DisplayRow"
```

---

### Task 3: Rewrite ScheduleDetailModal — sections, new fields, quick actions

**Files:**
- Modify: `React-Headless/force-app/main/default/uiBundles/_shared/src/components/home/ScheduleDetailModal.tsx`

**Interfaces:**
- Consumes: widened `ScheduleItem`; `TASK_TYPE_OPTIONS`/`EVENT_TYPE_OPTIONS`/`EVENT_SHOWAS_OPTIONS`/`TASK_STATUS_OPTIONS`/`TASK_PRIORITY_OPTIONS`; `useCrmAction` (its `submit(payload, toastTitle, toastSub)`); `Field`,`FieldRow`,`TextInput`,`SelectInput`,`TextArea`,`DisplayRow`; `Modal`,`CrmNote`,`Button`,`Icon`.
- Produces: no new exports; same props `{open,onClose,item,onSaved}`.

- [ ] **Step 1: Add local state** for the new editable fields (seed in the same `useEffect([item.id])` that reseeds subject/date/etc.): `type`, `description`, `location`, `showAs`. Seed `type` from `item.type ?? (isEvent ? 'Meeting' : 'Call')`, `description` from `item.description ?? ''`, `location`/`showAs` from item (Event).

- [ ] **Step 2: Add a delete-confirm state** `const [confirmDelete, setConfirmDelete] = useState(false)`; reset to false in the reseed effect.

- [ ] **Step 3: Extend `save()`** payloads: Task update adds `type`, `description`; Event update adds `type`, `description`, `location`, `showAs`. Keep the existing blank-date NaN guard.

- [ ] **Step 4: Add action handlers** (all call `submit(...)` then rely on its `onSaved`+close):
  - `markComplete()` — Tasks only: `submit({action:'update',sobjectType:'Task',recordId,status:'Completed'}, 'Task completed', item.title)`.
  - `del()` — `submit({action:'delete',sobjectType:item.sobjectType,recordId}, 'Deleted', `${item.title} · removed`)`.
  - `followUpTask()` — `submit({action:'task',subject:`Follow up: ${item.title}`,whatId:item.whatId}, 'Follow-up task created', item.title)`.
  - `followUpEvent()` — `submit({action:'event',subject:`Follow up: ${item.title}`,whatId:item.whatId}, 'Follow-up event created', item.title)`.

- [ ] **Step 5: Restructure the body into sections** using a small local `Section` heading (mono uppercase, matches native section bars) — Task Information (Subject, Related To via `DisplayRow value={item.clientName}`, Due Date, Type, Comments) / Additional Information (Task: Status+Priority; Event: Type already above → here Location + Show As) / System Information (`DisplayRow` Assigned To=`item.ownerName`, Created By=`${item.createdByName} · ${fmtDate(item.createdDate)}`, Last Modified similarly). Provide a local `fmtDate(iso)` → `M/D/YYYY, h:mm AM` (or '' when absent).
  - Events show Type + Location + Show As (selects/text); NO Status/Priority.
  - Tasks show Type in Task Information; Status + Priority in Additional Information.

- [ ] **Step 6: Rebuild the footer.** Left cluster (only when `editable`): `Mark Complete` (Tasks && status !== 'Completed'), `+ Follow-Up Task`, `+ Follow-Up Event`, then Delete: when `!confirmDelete` a ghost `Delete` button that sets confirmDelete; when `confirmDelete` an inline "Delete this <type>? [Confirm] [Keep]" (Confirm→`del()`, Keep→setConfirmDelete(false)). Right cluster: `Cancel`, `Save` (existing). Keep `CrmNote` + disabled-when-not-editable behavior.

- [ ] **Step 7: Commit** (no build/test now):
```bash
git add React-Headless/force-app/main/default/uiBundles/_shared/src/components/home/ScheduleDetailModal.tsx
git commit -m "feat(shared): native-mirror ScheduleDetailModal — sections, Type/Comments, quick actions"
```

---

### Task 4: Widen GraphQL + mapping in all three bundles

**Files:**
- Modify: `React-Headless/force-app/main/default/uiBundles/ReactRetail/src/home/homeDataReal.ts`
- Modify: `React-Headless/force-app/main/default/uiBundles/ReactWealth/src/home/homeDataReal.ts`
- Modify: `React-Headless/force-app/main/default/uiBundles/ReactCommercial/src/home/homeDataReal.ts`

**Interfaces:**
- Consumes: existing `HOME_CORE_QUERY`, the `s`/`v` node helpers, the schedule mapping block, existing `accountNamesQuery` + name-resolution pattern.
- Produces: schedule items carrying `type`,`description`,`ownerName`,`createdByName`,`createdDate`,`lastModifiedByName`,`lastModifiedDate` (Task+Event) and `location`,`showAs`,`whatId` (Event).

- [ ] **Step 1 (each bundle): widen the Task selections** (`TaskOverdue` + `TaskUpcoming`) to add: `Type @optional { value } Description @optional { value } WhatId @optional { value } OwnerId @optional { value } CreatedBy @optional { Name @optional { value } } CreatedDate @optional { value } LastModifiedBy @optional { Name @optional { value } } LastModifiedDate @optional { value }`.

- [ ] **Step 2 (each bundle): widen the Event selection** to add the same plus `Location @optional { value } ShowAs @optional { value }` (Event already selects `ActivityDateTime`).

- [ ] **Step 3 (each bundle): map the new fields** onto each schedule item (`to`/`tu`/`e` maps): `type: s(e.node,'Type')||undefined`, `description: s(e.node,'Description')||undefined`, `whatId: s(e.node,'WhatId')||undefined`, `createdByName: (e.node.CreatedBy?.Name?.value)||undefined`, `createdDate: s(e.node,'CreatedDate')||undefined`, `lastModifiedByName`, `lastModifiedDate`; Event adds `location`,`showAs`.

- [ ] **Step 4 (each bundle): resolve Owner → Assigned To name.** Collect distinct `OwnerId`s from all schedule nodes; if any, run a batch User-name lookup (mirror `accountNamesQuery` → a `userNamesQuery(ids)` returning `User(where:{Id:{in:[...]}}){ edges{ node{ Id Name @optional {value} } } }`); build `ownerNameById` and set `ownerName` on each item. Best-effort try/catch like the account-name block; fall back to leaving `ownerName` undefined.

- [ ] **Step 5: Commit** (no build/test now — the three bundle edits are one logical change):
```bash
git add React-Headless/force-app/main/default/uiBundles/ReactRetail/src/home/homeDataReal.ts React-Headless/force-app/main/default/uiBundles/ReactWealth/src/home/homeDataReal.ts React-Headless/force-app/main/default/uiBundles/ReactCommercial/src/home/homeDataReal.ts
git commit -m "feat(home-data): feed Type/Comments/Owner/system fields to schedule modal (3 bundles)"
```

---

### Task 5: End-of-build gate — build, test, deploy, verify, dist commit

**This is the single batched verification gate. Only runs after Tasks 1–4 are code-complete and reviewed.**

- [ ] **Step 1: Root + per-bundle `npm install`** if node_modules absent (fresh worktree needs root `React-Headless/node_modules` for `clsx`/`@shared` resolution).

- [ ] **Step 2: `npm run build` all three** (tsc -b + vite). Fix any type errors. Expected: all three "✓ built".

- [ ] **Step 3: vitest** — run once in ReactRetail (`CI=true npx vitest run`). Add a focused modal test only if a pure util was introduced; existing 19 should still pass.

- [ ] **Step 4: Deploy** — from repo root, deploy the four Apex/class files + three bundles. Capture `--json`, check `result.status`/`numberComponentErrors`. Cross-verify Apex via `sf apex run test -t CrmWriteRestTest`.

- [ ] **Step 5: Browser verify** (frontdoor auth, read-mostly): open a Task detail modal, confirm Type/Comments/Assigned To/Created/Modified render; confirm Mark Complete + Follow-Up + Delete buttons present. Do not mutate org data beyond a reversible check.

- [ ] **Step 6: Stage dist explicitly** (dist/ only, NOT tsconfig.tsbuildinfo), commit:
```bash
git commit -m "build(react-headless): rebuild dist for native-mirror schedule modal (3 bundles)"
```

- [ ] **Step 7: Finish the branch** via superpowers:finishing-a-development-branch → PR.

## Self-Review

- Spec coverage: fields (Task 2/3/4), Type+Comments edit (1/3/4), read-only system rows (2/3/4), Mark Complete/Delete/Follow-Up (1/3), Events get all available fields (1/3/4). ✓
- No placeholders: all code shown inline. ✓
- Type consistency: `ScheduleItem` fields added in Task 2 are consumed by exactly those names in Tasks 3 & 4; `WriteRequest.type/location/showAs` added in Task 1 consumed by payloads in Task 3. `EVENT_SHOWAS_OPTIONS` is `{value,label}[]` — Task 3 must map `.value`/`.label`, not treat as string[]. ✓
