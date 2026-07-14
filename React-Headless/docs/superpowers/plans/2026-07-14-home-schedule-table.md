# Home Reorder + Unified Editable Tasks & Schedule Table — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorder the banker home (Daily Brief → KPI Pulse → Tasks & Schedule), collapse the three schedule bucket-panels into one filterable, color-coded, editable table across all three cockpits.

**Architecture:** A new `@shared` schedule module (type + tagging util + `ScheduleTable` + `ScheduleDetailModal`) is consumed by each bundle's `HomePage.tsx`. Editing real records requires a new `update` action on the existing `CrmWriteRest` Apex bridge (currently insert-only). Data flows: `homeDataReal.ts` (preserves the real record Id + Status/Priority) → `tagSchedule()` (assigns Overdue/Today/Upcoming) → `ScheduleTable` (filters) → row click → `ScheduleDetailModal` → `crmWrite({action:'update'})` → `refetch()`.

**Tech Stack:** React 19, Vite 7, TypeScript, Tailwind v4 (Aurora Glass tokens), Vitest + @testing-library/react (jsdom), Apex (`@RestResource`), Salesforce GraphQL via `@salesforce/platform-sdk`.

## Global Constraints

- **Base branch:** `feat/home-schedule-table` (already created off `feat/home-ai-actions`). All work happens in the worktree at `/Users/jsifontes/Documents/Git/JDO/.worktrees/react-headless-agentforce/React-Headless`.
- **Target org:** `jdo-1lrnov`. **API version:** 67.0 — do not change `sourceApiVersion`.
- **UIBundle deploys `dist/`, not `src/`** — every bundle whose `src/` changes MUST be rebuilt (`npm run build`) and the rebuilt `dist/` committed, or the feature ships invisibly.
- **Task picklist API values (verified live, label == value):** Status ∈ {`Not Started`, `In Progress`, `Completed`, `Waiting on someone else`, `Deferred`, `Open`}; Priority ∈ {`High`, `Normal`, `Low`}. Use these verbatim — never guessed labels. Events have no Status/Priority.
- **GraphQL rules:** `@optional` on every read field, `first:` mandatory; `Id` is a plain string on nodes (read `node.Id` directly), every other scalar is `{ value }`-wrapped (read via the `s()` helper).
- **Aurora tokens only** for color: `text-risk`/`bg-risk-bg` (overdue), `text-accent`/`bg-accent-bg` (today), `text-muted`/`bg-track` (upcoming). No new gradients.
- **Apex DML posture:** match the existing insert handlers — plain DML in a `with sharing` class (the handlers do `insert t;` with no explicit USER_MODE; the new `update` follows the same pattern for consistency).
- **Scope:** open-only table (existing queries already filter `IsClosed = false`); no closed/"Done" bucket. Edit is limited to Subject / Date / Time / Status / Priority. No Case/Lead editing from this table.
- **DRY / YAGNI / TDD / frequent commits.** The three bundles' schedule code is byte-identical today — keep the per-bundle edits identical.

## File Structure

**New files (shared):**
- `force-app/main/default/uiBundles/_shared/src/components/home/schedule.ts` — `tagSchedule()` + `scheduleCounts()` pure functions + `SCHEDULE_BUCKETS` metadata.
- `force-app/main/default/uiBundles/_shared/src/components/home/ScheduleTable.tsx` — presentational table + filter chips.
- `force-app/main/default/uiBundles/_shared/src/components/home/ScheduleDetailModal.tsx` — detail + inline edit modal.

**New files (tests, in ReactRetail's src so they import from `@shared`):**
- `force-app/main/default/uiBundles/ReactRetail/src/home/__tests__/schedule.test.ts`
- `force-app/main/default/uiBundles/ReactRetail/src/home/__tests__/ScheduleTable.test.tsx`
- `force-app/main/default/uiBundles/ReactRetail/src/home/__tests__/ScheduleDetailModal.test.tsx`

**Modified (shared):**
- `_shared/src/components/home/types.ts` — add `ScheduleItem`, `ScheduleBucket`, option-list constants.
- `_shared/src/components/index.ts` — export the new components + schedule util + types.
- `_shared/src/data/crmWriteClient.ts` — widen `CrmAction`, add `sobjectType`/`recordId`, make `subject` optional.

**Modified (Apex):**
- `force-app/main/default/classes/CrmWriteRest.cls` — `update` dispatch + `handleUpdate` + 2 `WriteRequest` fields.
- `force-app/main/default/classes/CrmWriteRestTest.cls` — 4 new test methods.

**Modified (per bundle ×3 — ReactRetail, ReactWealth, ReactCommercial):**
- `src/home/homeTypes.ts` — re-export `ScheduleItem` from `@shared` (remove local definition).
- `src/home/homeDataReal.ts` — preserve real Id, project + map Status/Priority, set `sobjectType`.
- `src/home/HomePage.tsx` — reorder KPI above schedule, swap 3-panel for `<ScheduleTable>`, wire `<ScheduleDetailModal>`, delete local `ScheduleRow` + `bucketSchedule`.

---

## Task 1: Apex `update` action on CrmWriteRest

**Files:**
- Modify: `force-app/main/default/classes/CrmWriteRest.cls`
- Test: `force-app/main/default/classes/CrmWriteRestTest.cls`

**Interfaces:**
- Consumes: existing `WriteRequest` class, `write()` dispatch, `writeSuccess`/`writeError` helpers.
- Produces: a new action `update` accepting `{ action:'update', sobjectType:'Task'|'Event', recordId, subject?, dueDate?, activityDateTime?, priority?, status? }` → 200 `{success:true, id:recordId}`; 400 on missing recordId / bad sobjectType / blank action.

- [ ] **Step 1: Write the failing tests**

Append these methods inside `CrmWriteRestTest` (before the closing brace) in `force-app/main/default/classes/CrmWriteRestTest.cls`:

```apex
    @IsTest
    static void updatesTask() {
        Task t = new Task(Subject = 'Old subject', Status = 'Not Started', Priority = 'Normal', ActivityDate = Date.today());
        insert t;
        setupRequest('{"action":"update","sobjectType":"Task","recordId":"' + t.Id + '","subject":"New subject","status":"Completed","priority":"High","dueDate":"2026-09-01"}');
        Test.startTest();
        CrmWriteRest.write();
        Test.stopTest();
        System.assertEquals(200, RestContext.response.statusCode, 'update task should 200');
        System.assertEquals(true, parseBody().get('success'), 'success flag');
        Task after = [SELECT Subject, Status, Priority, ActivityDate FROM Task WHERE Id = :t.Id];
        System.assertEquals('New subject', after.Subject, 'subject updated');
        System.assertEquals('Completed', after.Status, 'status updated');
        System.assertEquals('High', after.Priority, 'priority updated');
        System.assertEquals(Date.valueOf('2026-09-01'), after.ActivityDate, 'date updated');
    }

    @IsTest
    static void updatesEvent() {
        Event ev = new Event(Subject = 'Old meeting', ActivityDateTime = Datetime.now(), DurationInMinutes = 30);
        insert ev;
        setupRequest('{"action":"update","sobjectType":"Event","recordId":"' + ev.Id + '","subject":"New meeting","activityDateTime":"2026-09-05T16:00:00Z"}');
        Test.startTest();
        CrmWriteRest.write();
        Test.stopTest();
        System.assertEquals(200, RestContext.response.statusCode, 'update event should 200');
        Event after = [SELECT Subject FROM Event WHERE Id = :ev.Id];
        System.assertEquals('New meeting', after.Subject, 'subject updated');
    }

    @IsTest
    static void rejectsUpdateWithoutRecordId() {
        setupRequest('{"action":"update","sobjectType":"Task","subject":"No id"}');
        Test.startTest();
        CrmWriteRest.write();
        Test.stopTest();
        System.assertEquals(400, RestContext.response.statusCode, 'missing recordId should 400');
        System.assertEquals(false, parseBody().get('success'), 'success false');
    }

    @IsTest
    static void rejectsUpdateWithBadSobjectType() {
        Task t = new Task(Subject = 'x', Status = 'Not Started', Priority = 'Normal');
        insert t;
        setupRequest('{"action":"update","sobjectType":"Contact","recordId":"' + t.Id + '","subject":"nope"}');
        Test.startTest();
        CrmWriteRest.write();
        Test.stopTest();
        System.assertEquals(400, RestContext.response.statusCode, 'bad sobjectType should 400');
        System.assert(((String) parseBody().get('error')).containsIgnoreCase('sobjecttype'), 'error mentions sobjectType');
    }
```

- [ ] **Step 2: Deploy tests to verify they fail**

Run (from project root `…/react-headless-agentforce/React-Headless`):
```bash
sf project deploy start --source-dir force-app/main/default/classes/CrmWriteRestTest.cls \
  --test-level RunSpecifiedTests --tests CrmWriteRestTest -o jdo-1lrnov --json
```
Expected: FAIL — the new methods send `action:"update"`, which the current dispatch answers with HTTP 400 "Unknown action" (so `updatesTask`/`updatesEvent` fail their 200 assertion), OR deploy is rejected for insufficient coverage on the new path. Either way: non-success.

- [ ] **Step 3: Add the two `WriteRequest` fields**

In `CrmWriteRest.cls`, add to the `WriteRequest` class (after the `htmlBody` field, before the closing brace of the class):
```apex
        public String sobjectType;      // 'Task' | 'Event'  (required for update)
        public String recordId;         // Id of the record to update
```

- [ ] **Step 4: Add the `update` branch to the dispatch**

In `CrmWriteRest.cls`, in `write()`, extend the action `if`/`else` chain — change the `else if (action == 'email')` block's following `else` so the chain reads:
```apex
            } else if (action == 'email') {
                handleEmail(res, reqBody);
            } else if (action == 'update') {
                handleUpdate(res, reqBody);
            } else {
                writeError(res, 400, 'Unknown action "' + reqBody.action + '". Use task, event, case, email, or update.');
            }
```

- [ ] **Step 5: Implement `handleUpdate`**

In `CrmWriteRest.cls`, add this method after `handleEmail` (before `writeSuccess`):
```apex
    private static void handleUpdate(RestResponse res, WriteRequest req) {
        if (String.isBlank(req.recordId)) {
            writeError(res, 400, 'A recordId is required to update a record.');
            return;
        }
        String sot = req.sobjectType == null ? '' : req.sobjectType.trim();
        if (sot != 'Task' && sot != 'Event') {
            writeError(res, 400, 'Unsupported sobjectType "' + req.sobjectType + '". Use Task or Event.');
            return;
        }
        Id recId;
        try {
            recId = (Id) req.recordId;
        } catch (Exception e) {
            writeError(res, 400, 'recordId is not a valid Id.');
            return;
        }
        if (sot == 'Task') {
            Task t = new Task(Id = recId);
            if (!String.isBlank(req.subject))  { t.Subject = req.subject; }
            if (!String.isBlank(req.status))   { t.Status = req.status; }
            if (!String.isBlank(req.priority)) { t.Priority = req.priority; }
            if (!String.isBlank(req.dueDate))  { t.ActivityDate = Date.valueOf(req.dueDate); }
            update t;
        } else {
            Event ev = new Event(Id = recId);
            if (!String.isBlank(req.subject)) { ev.Subject = req.subject; }
            if (!String.isBlank(req.activityDateTime)) {
                ev.ActivityDateTime = (Datetime) JSON.deserialize('"' + req.activityDateTime + '"', Datetime.class);
            }
            update ev;
        }
        writeSuccess(res, recId);
    }
```

- [ ] **Step 6: Deploy with tests to verify they pass**

Run:
```bash
sf project deploy start \
  --source-dir force-app/main/default/classes/CrmWriteRest.cls \
  --source-dir force-app/main/default/classes/CrmWriteRestTest.cls \
  --test-level RunSpecifiedTests --tests CrmWriteRestTest -o jdo-1lrnov --json
```
Expected: PASS — `status: Succeeded`, `numberComponentErrors: 0`, all `CrmWriteRestTest` methods pass (including the 4 new ones). Read the JSON `result.status` and `result.numberTestsCompleted`.

- [ ] **Step 7: Commit**

```bash
git add force-app/main/default/classes/CrmWriteRest.cls force-app/main/default/classes/CrmWriteRestTest.cls
git commit -m "feat(crm-bridge): add update action to CrmWriteRest for Task/Event edits"
```

---

## Task 2: Shared ScheduleItem type + tagging util

**Files:**
- Modify: `force-app/main/default/uiBundles/_shared/src/components/home/types.ts`
- Create: `force-app/main/default/uiBundles/_shared/src/components/home/schedule.ts`
- Modify: `force-app/main/default/uiBundles/_shared/src/components/index.ts`
- Test: `force-app/main/default/uiBundles/ReactRetail/src/home/__tests__/schedule.test.ts`

**Interfaces:**
- Produces:
  - `interface ScheduleItem { id: string; recordId?: string; sobjectType?: 'Task' | 'Event'; time: string; title: string; kind: 'call' | 'meeting' | 'task' | 'event'; clientName?: string; status?: string; priority?: string; whatId?: string; bucket?: 'overdue' | 'today' | 'upcoming'; }`
  - `type ScheduleBucketKey = 'overdue' | 'today' | 'upcoming'`
  - `tagSchedule(items: ScheduleItem[], todayISO?: string): ScheduleItem[]` — returns a new array, each item's `bucket` set, sorted (overdue DESC, today ASC, upcoming ASC), overdue group first, then today, then upcoming.
  - `scheduleCounts(items: ScheduleItem[]): { all: number; overdue: number; today: number; upcoming: number }`
  - `TASK_STATUS_OPTIONS: string[]`, `TASK_PRIORITY_OPTIONS: string[]`
- Consumes: nothing.

- [ ] **Step 1: Write the failing test**

Create `force-app/main/default/uiBundles/ReactRetail/src/home/__tests__/schedule.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { tagSchedule, scheduleCounts, type ScheduleItem } from '@shared';

const TODAY = '2026-07-14';
const items: ScheduleItem[] = [
  { id: 'a', time: '2026-07-10', title: 'Overdue task', kind: 'task' },
  { id: 'b', time: '2026-07-14', title: 'Today task', kind: 'task' },
  { id: 'c', time: '2026-07-20', title: 'Future meeting', kind: 'meeting' },
  { id: 'd', time: '—', title: 'No date', kind: 'task' },
];

describe('tagSchedule', () => {
  it('assigns bucket by date vs today', () => {
    const m = new Map(tagSchedule(items, TODAY).map(i => [i.id, i.bucket]));
    expect(m.get('a')).toBe('overdue');
    expect(m.get('b')).toBe('today');
    expect(m.get('c')).toBe('upcoming');
  });
  it('puts undated items in upcoming (nothing dropped)', () => {
    expect(tagSchedule(items, TODAY).find(i => i.id === 'd')?.bucket).toBe('upcoming');
  });
  it('orders overdue group before today before upcoming', () => {
    const buckets = tagSchedule(items, TODAY).map(i => i.bucket);
    const firstToday = buckets.indexOf('today');
    const firstUpcoming = buckets.indexOf('upcoming');
    expect(buckets.indexOf('overdue')).toBeLessThan(firstToday);
    expect(firstToday).toBeLessThan(firstUpcoming);
  });
});

describe('scheduleCounts', () => {
  it('counts each bucket and all', () => {
    const c = scheduleCounts(tagSchedule(items, TODAY));
    expect(c.all).toBe(4);
    expect(c.overdue).toBe(1);
    expect(c.today).toBe(1);
    expect(c.upcoming).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `force-app/main/default/uiBundles/ReactRetail`):
```bash
npm run test -- run src/home/__tests__/schedule.test.ts
```
Expected: FAIL — `tagSchedule`/`scheduleCounts`/`ScheduleItem` not exported from `@shared`.

- [ ] **Step 3: Add the type + constants**

Append to `force-app/main/default/uiBundles/_shared/src/components/home/types.ts`:
```ts
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
  time: string;                            // ISO date (YYYY-MM-DD) or '—'
  title: string;                           // Subject
  kind: 'call' | 'meeting' | 'task' | 'event';
  clientName?: string;
  status?: string;                         // Task.Status
  priority?: string;                       // Task.Priority
  whatId?: string;                         // related record Id
  bucket?: 'overdue' | 'today' | 'upcoming';
}

export type ScheduleBucketKey = 'overdue' | 'today' | 'upcoming';

/** Verified live-org Task picklist API values (label == value). Events have neither. */
export const TASK_STATUS_OPTIONS: string[] = [
  'Not Started', 'In Progress', 'Completed', 'Waiting on someone else', 'Deferred', 'Open',
];
export const TASK_PRIORITY_OPTIONS: string[] = ['High', 'Normal', 'Low'];
```

- [ ] **Step 4: Create the tagging util**

Create `force-app/main/default/uiBundles/_shared/src/components/home/schedule.ts`:
```ts
import type { ScheduleItem, ScheduleBucketKey } from './types';

/**
 * Assign each item an Overdue / Today / Upcoming bucket by comparing its ISO
 * date-string against today. ISO dates (YYYY-MM-DD) sort chronologically as
 * plain strings, so no timezone math is needed. Undated items ('—') fall into
 * Upcoming so nothing is silently dropped. Returns a new sorted array: overdue
 * group first (most-overdue on top, DESC), then today (ASC), then upcoming (ASC).
 */
export function tagSchedule(items: ScheduleItem[], todayISO?: string): ScheduleItem[] {
  const today = todayISO ?? new Date().toISOString().slice(0, 10);
  const bucketOf = (it: ScheduleItem): ScheduleBucketKey => {
    const d = (it.time || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return 'upcoming';
    if (d < today) return 'overdue';
    if (d === today) return 'today';
    return 'upcoming';
  };
  const tagged = items.map(it => ({ ...it, bucket: bucketOf(it) }));
  const order: Record<ScheduleBucketKey, number> = { overdue: 0, today: 1, upcoming: 2 };
  return tagged.sort((a, b) => {
    if (a.bucket !== b.bucket) return order[a.bucket!] - order[b.bucket!];
    // overdue newest-first (most recently overdue on top); today/upcoming soonest-first
    const dir = a.bucket === 'overdue' ? -1 : 1;
    return a.time < b.time ? -dir : a.time > b.time ? dir : 0;
  });
}

/** Bucket totals for the filter chips. Accepts tagged or untagged items. */
export function scheduleCounts(
  items: ScheduleItem[],
): { all: number; overdue: number; today: number; upcoming: number } {
  const tagged = items.every(i => i.bucket) ? items : tagSchedule(items);
  return {
    all: tagged.length,
    overdue: tagged.filter(i => i.bucket === 'overdue').length,
    today: tagged.filter(i => i.bucket === 'today').length,
    upcoming: tagged.filter(i => i.bucket === 'upcoming').length,
  };
}
```

- [ ] **Step 5: Export from the shared barrel**

In `force-app/main/default/uiBundles/_shared/src/components/index.ts`, add near the other `home/` exports (after the `export { ScheduleModal } …` line):
```ts
export { ScheduleTable } from './home/ScheduleTable';
export { ScheduleDetailModal } from './home/ScheduleDetailModal';
export { tagSchedule, scheduleCounts } from './home/schedule';
export type { ScheduleItem, ScheduleBucketKey } from './home/types';
export { TASK_STATUS_OPTIONS, TASK_PRIORITY_OPTIONS } from './home/types';
```
(The `ScheduleTable`/`ScheduleDetailModal` re-exports point at files created in Tasks 3–4; they will not resolve until then. To keep this task green on its own, temporarily omit those two lines and add them in Tasks 3 and 4. If you prefer one edit, create empty stub files first — but the simplest green path is: add only the `tagSchedule`/`scheduleCounts`/type/constant exports now.)

For THIS task, add only:
```ts
export { tagSchedule, scheduleCounts } from './home/schedule';
export type { ScheduleItem, ScheduleBucketKey } from './home/types';
export { TASK_STATUS_OPTIONS, TASK_PRIORITY_OPTIONS } from './home/types';
```

- [ ] **Step 6: Run test to verify it passes**

Run (from `force-app/main/default/uiBundles/ReactRetail`):
```bash
npm run test -- run src/home/__tests__/schedule.test.ts
```
Expected: PASS — all 5 assertions green.

- [ ] **Step 7: Commit**

```bash
git add force-app/main/default/uiBundles/_shared/src/components/home/types.ts \
        force-app/main/default/uiBundles/_shared/src/components/home/schedule.ts \
        force-app/main/default/uiBundles/_shared/src/components/index.ts \
        force-app/main/default/uiBundles/ReactRetail/src/home/__tests__/schedule.test.ts
git commit -m "feat(shared): ScheduleItem type + tagSchedule/scheduleCounts bucketing util"
```

---

## Task 3: ScheduleTable component (single table + filter chips)

**Files:**
- Create: `force-app/main/default/uiBundles/_shared/src/components/home/ScheduleTable.tsx`
- Modify: `force-app/main/default/uiBundles/_shared/src/components/index.ts`
- Test: `force-app/main/default/uiBundles/ReactRetail/src/home/__tests__/ScheduleTable.test.tsx`

**Interfaces:**
- Consumes: `ScheduleItem`, `scheduleCounts` from `./` (Task 2); `Icon` from `../iconMap`.
- Produces: `function ScheduleTable({ items, onOpen }: { items: ScheduleItem[]; onOpen: (item: ScheduleItem) => void }): JSX.Element`. Items are assumed already tagged (caller passes `tagSchedule(...)`). Renders filter chips `All / Overdue / Today / Upcoming` (with counts) + a `Tasks / Meetings` kind toggle; a row per item; clicking a row calls `onOpen(item)`.

- [ ] **Step 1: Write the failing test**

Create `force-app/main/default/uiBundles/ReactRetail/src/home/__tests__/ScheduleTable.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScheduleTable, tagSchedule, type ScheduleItem } from '@shared';

const TODAY = '2026-07-14';
const items: ScheduleItem[] = tagSchedule([
  { id: 'a', time: '2026-07-10', title: 'Overdue call', kind: 'call', clientName: 'Acme' },
  { id: 'b', time: '2026-07-14', title: 'Today task', kind: 'task', priority: 'High' },
  { id: 'c', time: '2026-07-20', title: 'Future meeting', kind: 'meeting' },
], TODAY);

describe('ScheduleTable', () => {
  it('shows all rows under the All filter', () => {
    render(<ScheduleTable items={items} onOpen={() => {}} />);
    expect(screen.getByText('Overdue call')).toBeInTheDocument();
    expect(screen.getByText('Today task')).toBeInTheDocument();
    expect(screen.getByText('Future meeting')).toBeInTheDocument();
  });

  it('filters to a single bucket when its chip is clicked', async () => {
    render(<ScheduleTable items={items} onOpen={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Overdue/ }));
    expect(screen.getByText('Overdue call')).toBeInTheDocument();
    expect(screen.queryByText('Today task')).not.toBeInTheDocument();
  });

  it('filters by kind (Meetings hides pure tasks)', async () => {
    render(<ScheduleTable items={items} onOpen={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Meetings/ }));
    expect(screen.getByText('Future meeting')).toBeInTheDocument();
    expect(screen.getByText('Overdue call')).toBeInTheDocument(); // 'call' counts as a meeting
    expect(screen.queryByText('Today task')).not.toBeInTheDocument();
  });

  it('shows an empty state when a filter matches nothing', async () => {
    const overdueOnly = tagSchedule([{ id: 'x', time: '2026-07-01', title: 'Old', kind: 'task' }], TODAY);
    render(<ScheduleTable items={overdueOnly} onOpen={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Today/ }));
    expect(screen.getByText(/Nothing/i)).toBeInTheDocument();
  });

  it('calls onOpen with the clicked item', async () => {
    const onOpen = vi.fn();
    render(<ScheduleTable items={items} onOpen={onOpen} />);
    await userEvent.click(screen.getByText('Today task'));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0][0].id).toBe('b');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `force-app/main/default/uiBundles/ReactRetail`):
```bash
npm run test -- run src/home/__tests__/ScheduleTable.test.tsx
```
Expected: FAIL — `ScheduleTable` not exported from `@shared`.

- [ ] **Step 3: Implement the component**

Create `force-app/main/default/uiBundles/_shared/src/components/home/ScheduleTable.tsx`:
```tsx
import { useMemo, useState } from 'react';
import { Icon } from '../iconMap';
import { scheduleCounts, type ScheduleItem, type ScheduleBucketKey } from './schedule';

type BucketFilter = 'all' | ScheduleBucketKey;
type KindFilter = 'all' | 'tasks' | 'meetings';

const BUCKET_CHIP: Record<ScheduleBucketKey, { label: string; chip: string }> = {
  overdue: { label: 'Overdue', chip: 'bg-risk-bg text-risk' },
  today: { label: 'Today', chip: 'bg-accent-bg text-accent' },
  upcoming: { label: 'Upcoming', chip: 'bg-track text-muted' },
};

function isMeeting(it: ScheduleItem): boolean {
  return it.kind === 'meeting' || it.kind === 'call';
}

export function ScheduleTable({
  items,
  onOpen,
}: {
  items: ScheduleItem[];
  onOpen: (item: ScheduleItem) => void;
}) {
  const [bucket, setBucket] = useState<BucketFilter>('all');
  const [kind, setKind] = useState<KindFilter>('all');
  const counts = useMemo(() => scheduleCounts(items), [items]);

  const rows = items.filter(it => {
    if (bucket !== 'all' && it.bucket !== bucket) return false;
    if (kind === 'tasks' && isMeeting(it)) return false;
    if (kind === 'meetings' && !isMeeting(it)) return false;
    return true;
  });

  const chip = (key: BucketFilter, label: string, count: number) => (
    <button
      key={key}
      type="button"
      onClick={() => setBucket(key)}
      className={`rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] transition ${
        bucket === key ? 'bg-fg text-bg' : 'bg-track text-muted hover:text-fg'
      }`}
    >
      {label} <span className="opacity-70">{count}</span>
    </button>
  );

  const kindChip = (key: KindFilter, label: string) => (
    <button
      key={key}
      type="button"
      onClick={() => setKind(key)}
      className={`rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] transition ${
        kind === key ? 'bg-accent-bg text-accent' : 'bg-track text-muted hover:text-fg'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="rounded-[18px] border border-line bg-surface-glass shadow-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        {chip('all', 'All', counts.all)}
        {chip('overdue', 'Overdue', counts.overdue)}
        {chip('today', 'Today', counts.today)}
        {chip('upcoming', 'Upcoming', counts.upcoming)}
        <span className="mx-1 h-4 w-px bg-line" />
        {kindChip('all', 'All types')}
        {kindChip('tasks', 'Tasks')}
        {kindChip('meetings', 'Meetings')}
      </div>

      {rows.length === 0 ? (
        <p className="px-5 py-6 text-[13px] text-muted">Nothing in this view.</p>
      ) : (
        <ul>
          {rows.map(it => {
            const b = it.bucket ?? 'upcoming';
            const meeting = isMeeting(it);
            return (
              <li key={it.id}>
                <button
                  type="button"
                  onClick={() => onOpen(it)}
                  className="flex w-full items-center gap-3 border-b border-line px-5 py-3 text-left transition last:border-b-0 hover:bg-track/50"
                >
                  <span
                    className={`grid h-8 w-8 flex-none place-items-center rounded-[9px] ${
                      meeting ? 'bg-accent-bg text-accent' : 'bg-track text-muted'
                    }`}
                  >
                    <Icon name={meeting ? 'call' : 'task'} size={14} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-fg">{it.title}</span>
                    {it.clientName && <span className="block truncate text-[12px] text-muted">{it.clientName}</span>}
                  </span>
                  <span className={`flex-none rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] ${BUCKET_CHIP[b].chip}`}>
                    {BUCKET_CHIP[b].label}
                  </span>
                  {it.priority === 'High' && (
                    <span className="flex-none rounded-full bg-risk-bg px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-risk">High</span>
                  )}
                  <span className="flex-none font-mono text-[11px] text-muted">{it.time}</span>
                  <Icon name="arrow" size={14} className="flex-none text-faint" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

> Icon note (pre-resolved): `IconKey` in `iconMap.tsx` is a **closed union** — the trailing affordance uses `name="arrow"` (ArrowRight) and the row icon uses `name="call"` (meetings) / `name="task"` (tasks), all of which exist in the union. Do NOT introduce a new key like `chevron-right` — it would be a TypeScript compile error.

- [ ] **Step 4: Export from the shared barrel**

In `force-app/main/default/uiBundles/_shared/src/components/index.ts`, add:
```ts
export { ScheduleTable } from './home/ScheduleTable';
```

- [ ] **Step 5: Run test to verify it passes**

Run (from `force-app/main/default/uiBundles/ReactRetail`):
```bash
npm run test -- run src/home/__tests__/ScheduleTable.test.tsx
```
Expected: PASS — all 5 tests green.

- [ ] **Step 6: Commit**

```bash
git add force-app/main/default/uiBundles/_shared/src/components/home/ScheduleTable.tsx \
        force-app/main/default/uiBundles/_shared/src/components/index.ts \
        force-app/main/default/uiBundles/ReactRetail/src/home/__tests__/ScheduleTable.test.tsx
git commit -m "feat(shared): ScheduleTable — one filterable, color-coded schedule table"
```

---

## Task 4: ScheduleDetailModal + crmWriteClient update support

**Files:**
- Modify: `force-app/main/default/uiBundles/_shared/src/data/crmWriteClient.ts`
- Create: `force-app/main/default/uiBundles/_shared/src/components/home/ScheduleDetailModal.tsx`
- Modify: `force-app/main/default/uiBundles/_shared/src/components/index.ts`
- Test: `force-app/main/default/uiBundles/ReactRetail/src/home/__tests__/ScheduleDetailModal.test.tsx`

**Interfaces:**
- Consumes: `Modal`, `CrmNote` from `../Modal`; `Button` from `../Button`; `Icon` from `../iconMap`; `Field`, `FieldRow`, `TextInput`, `SelectInput` from `./fields`; `useCrmAction` from `./useCrmAction`; `ScheduleItem`, `TASK_STATUS_OPTIONS`, `TASK_PRIORITY_OPTIONS` from `./types`.
- Produces: `function ScheduleDetailModal({ open, onClose, item, onSaved }: { open: boolean; onClose: () => void; item: ScheduleItem | null; onSaved?: () => void }): JSX.Element | null`. When `item.recordId` is present it submits `{ action:'update', sobjectType, recordId, subject, dueDate|activityDateTime, status?, priority? }`; when absent it renders read-only and disables Save.
- `crmWriteClient`: `CrmAction` gains `'update'`; `CrmWriteInput.subject` becomes optional; adds `sobjectType?: 'Task' | 'Event'` and `recordId?: string`.

- [ ] **Step 1: Widen the client type**

In `force-app/main/default/uiBundles/_shared/src/data/crmWriteClient.ts`:
- Change the `CrmAction` type:
```ts
export type CrmAction = 'task' | 'event' | 'case' | 'email' | 'update';
```
- In `CrmWriteInput`, change `subject: string;` to `subject?: string;` and add after it:
```ts
  /** SObject to update (required when action === 'update'). */
  sobjectType?: 'Task' | 'Event';
  /** Id of the record to update (required when action === 'update'). */
  recordId?: string;
```

- [ ] **Step 2: Write the failing test**

Create `force-app/main/default/uiBundles/ReactRetail/src/home/__tests__/ScheduleDetailModal.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScheduleDetailModal, type ScheduleItem } from '@shared';
import * as client from '@shared/data/crmWriteClient';

const taskItem: ScheduleItem = {
  id: 'b', recordId: '00T000000000001', sobjectType: 'Task',
  time: '2026-07-14', title: 'Today task', kind: 'task', status: 'Not Started', priority: 'Normal', bucket: 'today',
};
const mockItem: ScheduleItem = { id: 'm', time: '2026-07-14', title: 'Mock task', kind: 'task', bucket: 'today' };

describe('ScheduleDetailModal', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('renders editable fields for a real record', () => {
    render(<ScheduleDetailModal open onClose={() => {}} item={taskItem} />);
    expect(screen.getByDisplayValue('Today task')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save/i })).toBeEnabled();
  });

  it('submits an update with the edited fields', async () => {
    const spy = vi.spyOn(client, 'crmWrite').mockResolvedValue({ success: true, id: '00T000000000001' });
    const onSaved = vi.fn();
    render(<ScheduleDetailModal open onClose={() => {}} item={taskItem} onSaved={onSaved} />);
    const subject = screen.getByDisplayValue('Today task');
    await userEvent.clear(subject);
    await userEvent.type(subject, 'Edited subject');
    await userEvent.click(screen.getByRole('button', { name: /Save/i }));
    expect(spy).toHaveBeenCalledTimes(1);
    const arg = spy.mock.calls[0][0];
    expect(arg.action).toBe('update');
    expect(arg.sobjectType).toBe('Task');
    expect(arg.recordId).toBe('00T000000000001');
    expect(arg.subject).toBe('Edited subject');
  });

  it('is read-only (Save disabled) when the item has no recordId', () => {
    render(<ScheduleDetailModal open onClose={() => {}} item={mockItem} />);
    expect(screen.getByRole('button', { name: /Save/i })).toBeDisabled();
  });

  it('renders nothing when item is null', () => {
    const { container } = render(<ScheduleDetailModal open onClose={() => {}} item={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

> Mock path (pre-verified — use exactly as written): the vitest `@shared` string alias prefix-matches, so `@shared/data/crmWriteClient` resolves to the absolute file `_shared/src/data/crmWriteClient.ts`. `useCrmAction` imports `crmWrite` from that **same** absolute file (`../../data/crmWriteClient`), and Vitest dedupes modules by resolved path — so `vi.spyOn(client, 'crmWrite')` intercepts the call the hook makes. This is the correct strategy; do not switch to mocking the `@shared` barrel object (spying a re-export star can miss the live binding).

- [ ] **Step 3: Run test to verify it fails**

Run (from `force-app/main/default/uiBundles/ReactRetail`):
```bash
npm run test -- run src/home/__tests__/ScheduleDetailModal.test.tsx
```
Expected: FAIL — `ScheduleDetailModal` not exported from `@shared`.

- [ ] **Step 4: Implement the modal**

Create `force-app/main/default/uiBundles/_shared/src/components/home/ScheduleDetailModal.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { Modal, CrmNote } from '../Modal';
import { Button } from '../Button';
import { Icon } from '../iconMap';
import { Field, FieldRow, TextInput, SelectInput } from './fields';
import { useCrmAction } from './useCrmAction';
import { TASK_STATUS_OPTIONS, TASK_PRIORITY_OPTIONS, type ScheduleItem } from './types';

/** Split an ISO datetime/date into a date part and (for events) a time part. */
function splitDateTime(iso: string): { date: string; time: string } {
  const d = (iso || '').slice(0, 10);
  const t = iso && iso.length >= 16 ? iso.slice(11, 16) : '';
  return { date: /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '', time: t };
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
  const editable = !!item?.recordId && !!item?.sobjectType;
  const isEvent = item?.sobjectType === 'Event';
  const init = splitDateTime(item?.time ?? '');

  const [subject, setSubject] = useState(item?.title ?? '');
  const [date, setDate] = useState(init.date);
  const [time, setTime] = useState(init.time || '14:30');
  const [status, setStatus] = useState(item?.status ?? 'Not Started');
  const [priority, setPriority] = useState(item?.priority ?? 'Normal');

  // Reseed local fields whenever a different row is opened.
  useEffect(() => {
    if (!item) return;
    const s = splitDateTime(item.time);
    setSubject(item.title);
    setDate(s.date);
    setTime(s.time || '14:30');
    setStatus(item.status ?? 'Not Started');
    setPriority(item.priority ?? 'Normal');
  }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { submit, loading, error } = useCrmAction(() => {
    onSaved?.();
    onClose();
  });

  if (!item) return null;

  const save = () => {
    if (!editable) return;
    const base = { action: 'update' as const, sobjectType: item.sobjectType, recordId: item.recordId, subject };
    if (isEvent) {
      const activityDateTime = new Date(`${date}T${time || '00:00'}`).toISOString();
      void submit({ ...base, activityDateTime }, 'Meeting updated', `${item.title} · Salesforce Event`);
    } else {
      void submit({ ...base, dueDate: date || undefined, status, priority }, 'Task updated', `${item.title} · Salesforce Task`);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      tone="accent"
      icon={<Icon name={isEvent ? 'call' : 'task'} size={17} />}
      title={isEvent ? 'Meeting details' : 'Task details'}
      subtitle={item.clientName ? `${item.title} · ${item.clientName}` : item.title}
      footer={
        <>
          <CrmNote>{editable ? `Writes to Salesforce ${item.sobjectType}` : 'Demo record — read only'}</CrmNote>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="accent" onClick={save} disabled={!editable || loading}>
            {loading ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <Field label="Subject">
        <TextInput value={subject} onChange={e => setSubject(e.target.value)} disabled={!editable} />
      </Field>
      <FieldRow>
        <Field label="Date">
          <TextInput type="date" value={date} onChange={e => setDate(e.target.value)} disabled={!editable} />
        </Field>
        {isEvent && (
          <Field label="Time">
            <TextInput type="time" value={time} onChange={e => setTime(e.target.value)} disabled={!editable} />
          </Field>
        )}
      </FieldRow>
      {!isEvent && (
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
      {error && <p className="mt-1 text-[12px] text-risk">{error}</p>}
    </Modal>
  );
}
```

- [ ] **Step 5: Export from the shared barrel**

In `force-app/main/default/uiBundles/_shared/src/components/index.ts`, add:
```ts
export { ScheduleDetailModal } from './home/ScheduleDetailModal';
```

- [ ] **Step 6: Run test to verify it passes**

Run (from `force-app/main/default/uiBundles/ReactRetail`):
```bash
npm run test -- run src/home/__tests__/ScheduleDetailModal.test.tsx
```
Expected: PASS — all 4 tests green. If the deep-import mock path failed, apply the fallback in Step 2's note and re-run.

- [ ] **Step 7: Commit**

```bash
git add force-app/main/default/uiBundles/_shared/src/data/crmWriteClient.ts \
        force-app/main/default/uiBundles/_shared/src/components/home/ScheduleDetailModal.tsx \
        force-app/main/default/uiBundles/_shared/src/components/index.ts \
        force-app/main/default/uiBundles/ReactRetail/src/home/__tests__/ScheduleDetailModal.test.tsx
git commit -m "feat(shared): ScheduleDetailModal with inline edit + crmWrite update action"
```

---

## Task 5: Wire real data — preserve record Id + Status/Priority (×3 bundles)

**Files (repeat identically for each bundle B ∈ {ReactRetail, ReactWealth, ReactCommercial}):**
- Modify: `force-app/main/default/uiBundles/<B>/src/home/homeTypes.ts`
- Modify: `force-app/main/default/uiBundles/<B>/src/home/homeDataReal.ts`

**Interfaces:**
- Consumes: `ScheduleItem` from `@shared` (Task 2).
- Produces: `data.schedule` items now carry `recordId`, `sobjectType`, `status`, `priority` for real records (mock items keep the old shape; the extra fields are optional).

- [ ] **Step 1: Re-point homeTypes.ts to the shared type**

In each `<B>/src/home/homeTypes.ts`, DELETE the local `ScheduleItem` interface block:
```ts
export interface ScheduleItem {
  id: string;
  time: string;
  title: string;
  kind: 'call' | 'meeting' | 'task' | 'event';
  clientName?: string;
}
```
and REPLACE it with a re-export:
```ts
export type { ScheduleItem } from '@shared';
```

- [ ] **Step 2: Widen the GraphQL Task projections**

In each `<B>/src/home/homeDataReal.ts`, change the two Task query field selections to add `Status` and `Priority`:
```graphql
        TaskOverdue: Task(first: 15, where: { IsClosed: { eq: false }, ActivityDate: { lt: { literal: TODAY } } }, orderBy: { ActivityDate: { order: DESC } }) {
          edges { node { Id Subject @optional { value } ActivityDate @optional { value } Status @optional { value } Priority @optional { value } } }
        }
        TaskUpcoming: Task(first: 25, where: { IsClosed: { eq: false }, ActivityDate: { gte: { literal: TODAY } } }, orderBy: { ActivityDate: { order: ASC } }) {
          edges { node { Id Subject @optional { value } ActivityDate @optional { value } Status @optional { value } Priority @optional { value } } }
        }
```
(The `Event` query needs no new fields.)

- [ ] **Step 3: Map the real Id + new fields**

In each `<B>/src/home/homeDataReal.ts`, replace the `schedule` array construction:
```ts
  const schedule: ScheduleItem[] = [
    ...(q?.TaskOverdue?.edges ?? []).map((e, i) => ({ id: `to${i}`, time: s(e.node, 'ActivityDate') || '—', title: s(e.node, 'Subject') || 'Task', kind: 'task' as const })),
    ...(q?.TaskUpcoming?.edges ?? []).map((e, i) => ({ id: `tu${i}`, time: s(e.node, 'ActivityDate') || '—', title: s(e.node, 'Subject') || 'Task', kind: 'task' as const })),
    ...(q?.Event?.edges ?? []).map((e, i) => ({ id: `e${i}`, time: (s(e.node, 'ActivityDateTime') || '').slice(0, 10) || '—', title: s(e.node, 'Subject') || 'Event', kind: 'meeting' as const })),
  ];
```
with:
```ts
  const schedule: ScheduleItem[] = [
    ...(q?.TaskOverdue?.edges ?? []).map((e, i) => ({
      id: `to${i}`, recordId: e.node.Id, sobjectType: 'Task' as const,
      time: s(e.node, 'ActivityDate') || '—', title: s(e.node, 'Subject') || 'Task', kind: 'task' as const,
      status: s(e.node, 'Status') || undefined, priority: s(e.node, 'Priority') || undefined,
    })),
    ...(q?.TaskUpcoming?.edges ?? []).map((e, i) => ({
      id: `tu${i}`, recordId: e.node.Id, sobjectType: 'Task' as const,
      time: s(e.node, 'ActivityDate') || '—', title: s(e.node, 'Subject') || 'Task', kind: 'task' as const,
      status: s(e.node, 'Status') || undefined, priority: s(e.node, 'Priority') || undefined,
    })),
    ...(q?.Event?.edges ?? []).map((e, i) => ({
      id: `e${i}`, recordId: e.node.Id, sobjectType: 'Event' as const,
      time: (s(e.node, 'ActivityDateTime') || '').slice(0, 10) || '—', title: s(e.node, 'Subject') || 'Event', kind: 'meeting' as const,
    })),
  ];
```

- [ ] **Step 4: Type-check all three bundles**

Run for each bundle (from its directory):
```bash
cd force-app/main/default/uiBundles/ReactRetail && npx tsc -b && cd -
cd force-app/main/default/uiBundles/ReactWealth && npx tsc -b && cd -
cd force-app/main/default/uiBundles/ReactCommercial && npx tsc -b && cd -
```
Expected: no type errors. The widened `ScheduleItem` accepts the new fields; mock `homeData.ts` items (old shape) still satisfy it because every new field is optional. If `homeData.ts` (mock) has its own `ScheduleItem` import, it now resolves to the shared type — confirm it still compiles.

- [ ] **Step 5: Re-run the shared unit tests (regression)**

Run (from `force-app/main/default/uiBundles/ReactRetail`):
```bash
npm run test -- run src/home/__tests__/
```
Expected: PASS — schedule, ScheduleTable, ScheduleDetailModal suites all green (no behavior change, just confirming the type move didn't break imports).

- [ ] **Step 6: Commit**

```bash
git add force-app/main/default/uiBundles/ReactRetail/src/home/homeTypes.ts \
        force-app/main/default/uiBundles/ReactRetail/src/home/homeDataReal.ts \
        force-app/main/default/uiBundles/ReactWealth/src/home/homeTypes.ts \
        force-app/main/default/uiBundles/ReactWealth/src/home/homeDataReal.ts \
        force-app/main/default/uiBundles/ReactCommercial/src/home/homeTypes.ts \
        force-app/main/default/uiBundles/ReactCommercial/src/home/homeDataReal.ts
git commit -m "feat(home-data): preserve real record Id + Status/Priority on schedule feed (3 bundles)"
```

---

## Task 6: HomePage integration — reorder + single table + detail modal (×3 bundles)

**Files (repeat identically for each bundle B ∈ {ReactRetail, ReactWealth, ReactCommercial}):**
- Modify: `force-app/main/default/uiBundles/<B>/src/home/HomePage.tsx`

**Interfaces:**
- Consumes: `ScheduleTable`, `ScheduleDetailModal`, `tagSchedule` from `@shared` (Tasks 2–4); `data.schedule: ScheduleItem[]`; existing `refetch` from `useAsyncData`.
- Produces: no new exports — final page layout.

- [ ] **Step 1: Import the new shared pieces**

In each `<B>/src/home/HomePage.tsx`, add to the `from '@shared'` import block (alongside `TaskModal`, `ScheduleModal`):
```ts
  ScheduleTable,
  ScheduleDetailModal,
  tagSchedule,
```

- [ ] **Step 2: Add detail-modal state**

In the component body, near the other `useState` modal declarations (e.g. beside `setAiModal`), add:
```ts
  const [detailItem, setDetailItem] = useState<ScheduleItem | null>(null);
```
(`ScheduleItem` is already imported from `./homeTypes` in this file.)

- [ ] **Step 3: Reorder — move KPI PULSE above TASKS & SCHEDULE, replace the 3-panel block**

Replace the entire `{/* ---------- TASKS & SCHEDULE ---------- */}` section AND the `{/* ---------- KPI PULSE ---------- */}` section (currently schedule-then-kpi) with KPI first, then the single-table schedule:
```tsx
      {/* ---------- KPI PULSE ---------- */}
      <section id="kpis" className="mt-8 scroll-mt-[82px]">
        <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3 lg:grid-cols-5">
          {data.kpis.map(k => (
            <KpiCard
              key={k.key}
              label={k.label}
              value={formatValue(k.value, k.format)}
              note={k.note}
              risk={k.key === 'atRisk'}
              onClick={() => scrollToId(KPI_TARGET[k.key] ?? 'pipeline')}
            />
          ))}
        </div>
      </section>

      {/* ---------- TASKS & SCHEDULE ---------- */}
      <section id="schedule" className="mt-8 scroll-mt-[82px]">
        <SectionHead eyebrow="Your tasks & meetings · book-wide" title="Tasks & schedule">
          <Button size="sm" variant="ghost" onClick={() => open('task', data.bankerName)}>+ Task</Button>
          <Button size="sm" variant="ghost" onClick={() => open('schedule', data.bankerName, undefined, 'Meeting')}>+ Meeting</Button>
        </SectionHead>
        <ScheduleTable items={tagSchedule(data.schedule)} onOpen={setDetailItem} />
      </section>
```

- [ ] **Step 4: Render the detail modal**

Near the other modal renders (beside `<TaskModal … />` / `<ScheduleModal … />`, around line 502), add:
```tsx
      <ScheduleDetailModal
        open={detailItem !== null}
        onClose={() => setDetailItem(null)}
        item={detailItem}
        onSaved={refetch}
      />
```

- [ ] **Step 5: Delete the dead local code**

In each `<B>/src/home/HomePage.tsx`, DELETE the now-unused `ScheduleBucket` interface, the `bucketSchedule` function, and the `ScheduleRow` component (the block starting at `/* ── Tasks & schedule bucketing ──` through the end of `function ScheduleRow(...)`). Confirm no other references remain:
```bash
grep -n "bucketSchedule\|ScheduleRow\|SectionPanel" force-app/main/default/uiBundles/<B>/src/home/HomePage.tsx
```
If `SectionPanel` is now unused in this file, remove it from the `@shared` import. If it is still used elsewhere in the file, leave the import.

- [ ] **Step 6: Type-check + lint all three bundles**

Run for each bundle (from its directory):
```bash
npx tsc -b && npm run lint
```
Expected: no type errors, no lint errors. (Unused-import lint will catch a stale `bucketSchedule`/`ScheduleRow`/`SectionPanel` reference — fix any it flags.)

- [ ] **Step 7: Commit**

```bash
git add force-app/main/default/uiBundles/ReactRetail/src/home/HomePage.tsx \
        force-app/main/default/uiBundles/ReactWealth/src/home/HomePage.tsx \
        force-app/main/default/uiBundles/ReactCommercial/src/home/HomePage.tsx
git commit -m "feat(home): reorder KPI above schedule; single editable Tasks & Schedule table (3 bundles)"
```

---

## Task 7: Build dist + deploy + live verification

**Files:**
- Modify (generated): `force-app/main/default/uiBundles/{ReactRetail,ReactWealth,ReactCommercial}/dist/**`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: deployed feature on `jdo-1lrnov`.

- [ ] **Step 1: Full test pass (regression gate)**

Run (from `force-app/main/default/uiBundles/ReactRetail`):
```bash
npm run test -- run
```
Expected: PASS — all suites (existing shared-primitives + the 3 new schedule suites).

- [ ] **Step 2: Rebuild all three dist bundles**

Run for each bundle (from its directory):
```bash
cd force-app/main/default/uiBundles/ReactRetail && npm run build && cd -
cd force-app/main/default/uiBundles/ReactWealth && npm run build && cd -
cd force-app/main/default/uiBundles/ReactCommercial && npm run build && cd -
```
Expected: each `tsc -b && vite build` succeeds, writing to `dist/`.

- [ ] **Step 3: Stage dist tightly (no node_modules/tsbuildinfo leaks)**

```bash
git add force-app/main/default/uiBundles/ReactRetail/dist \
        force-app/main/default/uiBundles/ReactWealth/dist \
        force-app/main/default/uiBundles/ReactCommercial/dist
git status --short   # confirm ONLY dist/ files are staged; unstage any tsconfig.tsbuildinfo / node_modules if they appear
git commit -m "build(home): rebuild dist for schedule-table redesign (3 bundles)"
```

- [ ] **Step 4: Deploy Apex + all three bundles + permsets**

Run (from project root), one command:
```bash
sf project deploy start \
  --source-dir force-app/main/default/classes/CrmWriteRest.cls \
  --source-dir force-app/main/default/classes/CrmWriteRestTest.cls \
  --source-dir force-app/main/default/uiBundles/ReactRetail \
  --source-dir force-app/main/default/uiBundles/ReactWealth \
  --source-dir force-app/main/default/uiBundles/ReactCommercial \
  --source-dir force-app/main/default/uiBundles/_shared \
  --test-level RunSpecifiedTests --tests CrmWriteRestTest \
  -o jdo-1lrnov --json
```
Expected: JSON `result.status == "Succeeded"`, `result.numberComponentErrors == 0`. If `_shared` errors as a non-deployable bundle (it has meta but no dist), drop its `--source-dir` line — its source is inlined into each bundle's dist at build time and does not deploy independently.

- [ ] **Step 5: Live verification (manual, on `jdo-1lrnov`)**

Open `https://storm-16a17dc388fbe6--c.demo.my.salesforce.app/app/c__ReactRetail` and confirm:
1. Section order is Daily Brief → **KPI Pulse** → **Tasks & Schedule** → Priority Queue.
2. Tasks & Schedule is ONE table with filter chips `All / Overdue / Today / Upcoming` (live counts) + Tasks/Meetings toggle.
3. Rows show kind icon, title, client, a color-coded bucket chip, High-priority pill, date.
4. Clicking a row opens the detail modal with editable Subject/Date/Status/Priority (Task) or Subject/Date/Time (Event).
5. Edit a Task's Status → `Completed`, Save → row disappears on refetch (IsClosed filter drops it) OR its chip/values update; no full-page spinner.
6. Edit a meeting's time, Save → persists (re-open shows the new time).
7. Repeat the section-order + single-table check on `c__ReactWealth` and `c__ReactCommercial`.

- [ ] **Step 6: Commit any verification-driven fixes**

If live verification surfaces an issue, fix it in `src/`, rebuild the affected `dist/`, redeploy, and commit with a descriptive message. If verification is clean, no commit needed here.

---

## Self-Review

**1. Spec coverage:**
- Reorder KPI above schedule → Task 6 Step 3. ✅
- One table not 3 panels → Task 3 (`ScheduleTable`) + Task 6 Step 3. ✅
- Filter chips (All/Overdue/Today/Upcoming + counts) + kind toggle → Task 3. ✅
- More info per line item (status/priority/kind/date) → Task 2 (type) + Task 5 (data) + Task 3 (render). ✅
- Color-coded chips by bucket → Task 3 `BUCKET_CHIP`. ✅
- Row-click detail modal with edit → Task 4 (`ScheduleDetailModal`) + Task 6 Step 4. ✅
- True edit (Apex update path) → Task 1. ✅
- Editable Subject/Date/Time/Status/Priority → Task 4. ✅
- Preserve real record Id + widen type → Task 2 + Task 5. ✅
- All 3 cockpits → Tasks 5–7. ✅
- Open-only (no Done bucket) → no query change; existing `IsClosed=false` retained. ✅
- Dist rebuilt + deployed with `--json` + test level → Task 7. ✅

**2. Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to Task N". Every code step shows complete code. The two verification-dependent notes (iconMap `chevron-right` existence; `@shared/data` deep-import) give concrete fallback instructions, not placeholders.

**3. Type consistency:** `ScheduleItem` shape identical in Task 2 (definition), Task 4 (modal props), Task 5 (data mapping). `tagSchedule`/`scheduleCounts` signatures consistent across Tasks 2/3/6. `crmWrite({action:'update', sobjectType, recordId, subject, dueDate|activityDateTime, status?, priority?})` matches the Apex `WriteRequest` fields added in Task 1 and the client type widened in Task 4. Bucket keys `overdue|today|upcoming` consistent everywhere. Picklist option lists match the verified live values in Global Constraints.
