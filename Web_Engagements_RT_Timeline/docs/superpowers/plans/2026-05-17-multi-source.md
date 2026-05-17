# Plan 3 — Multi-source Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stitch CRM events (Cases, Tasks/calls, Events, Agentforce VoiceCalls) into the same timeline as Data Cloud web engagements, switch the visual to Style B (day-grouped card stream with source-colored left rail and chip filters), and add per-source App Builder toggles plus a lookback-days property — without slowing the Data Graph fast path.

**Architecture:** Hybrid two-call architecture. Data Graph stays in `DataCloudWebEngagementController` untouched. New `CrmTimelineController.getCrmTimelineEvents(...)` aggregates CRM sources in one Apex round-trip with per-source LIMIT 200 and bound SOQL. The LWC fires both calls in parallel; Data Graph rows render the moment Promise A resolves; CRM events stream in below when Promise B finishes. Filter chips operate on already-loaded events (no re-fetch). Helper modules `sourceConfig.js` and `timelineMappers.js` keep the component class thin.

**Tech Stack:** Salesforce Apex (API 65.0), Lightning Web Components, `@salesforce/sfdx-lwc-jest` (already scaffolded by Plan 2), sf CLI v2.

---

## Context the engineer needs

**Working directory:** `/Users/jsifontes/Documents/Git/JDO/.claude/worktrees/web-engagements-hardening` (worktree on branch `worktree-web-engagements-hardening`).

**DX project root:** `Web_Engagements_RT_Timeline/` — `cd` here before any `sf` command. `cd ..` (or absolute paths) for git commands.

**Default org:** `jdo-fw51xz` → `admin@finsdc3.demo`. Don't change.

**State after Plan 2:**
- `DataCloudWebEngagementController.getWebEngagementData(String accountId, String dataGraphName)` exists with seam + extracted parser helper. 17 Apex tests at ~83% coverage.
- LWC has 5 App Builder properties (`dcDataGraphName`, `cardTitle`, `cardTitleLink`, `feedHeight`, `autoSize`).
- LWC class has the existing `processGraphData` function (~lines 78-203) doing dynamic title/subtitle/icon derivation. Plan 3 lifts it into `timelineMappers.js`.
- Jest is wired up with 6 passing tests for `feedStyle` / `headerTitleIsLink` getters (DOM-level assertions).
- `.forceignore` already excludes `**/__tests__/**` and `**/*.test.js` from deploys.

**Critical conventions discovered during Plan 1+2:**
1. **`@api` properties cannot start with `data` (>4 chars).** LWC1107. Plan 3's new properties don't trigger this (`showCases`, `showTasks`, `showEvents`, `showVoiceCalls`, `lookbackDays` — all safe).
2. **`ConnectApi.CdpQuery.querySql` is not mockable.** Plan 1 solved this with a `@TestVisible` seam. Plan 3 doesn't add new ConnectApi calls — CRM sources use plain SOQL with bind variables.
3. **Apex test class on `__tests__/` deploy collision was solved by `.forceignore`.** Plan 3 adds a new Jest test file (`timelineMappers.test.js`) — already covered by the existing wildcards.
4. **LWC Jest tests use DOM-level assertions, not getter-direct.** `el.shadowRoot.querySelector(...)` + `await Promise.resolve()` after `appendChild`.
5. **Each task ends with one commit. No squashing.** The branch already has 27 commits on top of `5e1a25d`; that's fine.

---

## Task 1: Create the `sourceConfig.js` registry

This is the source-of-truth mapping `source` (string) → label/color/icon for chip rendering and event styling. Pure data, no logic. Keeping it in its own file means future sources are a one-file change.

**Files:**
- Create: `Web_Engagements_RT_Timeline/force-app/main/default/lwc/webEngagementData/sourceConfig.js`

- [ ] **Step 1: Create the file**

Write to `Web_Engagements_RT_Timeline/force-app/main/default/lwc/webEngagementData/sourceConfig.js`:

```javascript
/**
 * Source registry for the multi-source timeline.
 * Future sources (e.g., 'email') extend the SOURCE_CONFIG map and add to SOURCE_ORDER.
 */

export const SOURCE_CONFIG = {
    web:   { label: 'Web',   chipLabel: 'Web',   color: '#7f56d9', defaultIcon: 'custom:custom68' },
    case:  { label: 'Case',  chipLabel: 'Case',  color: '#c23934', defaultIcon: 'standard:case' },
    task:  { label: 'Task',  chipLabel: 'Task',  color: '#04844b', defaultIcon: 'standard:task' },
    event: { label: 'Event', chipLabel: 'Event', color: '#c97a00', defaultIcon: 'standard:event' },
    voice: { label: 'Voice', chipLabel: 'Voice', color: '#0176d3', defaultIcon: 'standard:live_chat' }
};

export const SOURCE_ORDER = ['web', 'case', 'task', 'event', 'voice'];
```

- [ ] **Step 2: Validate**

```bash
cd Web_Engagements_RT_Timeline
sf project deploy validate --source-dir force-app/main/default/lwc --wait 10
```

Expected: `Validation succeeded`. (No tests run because nothing yet imports this module.)

- [ ] **Step 3: Commit**

```bash
cd ..
git add Web_Engagements_RT_Timeline/force-app/main/default/lwc/webEngagementData/sourceConfig.js
git commit -m "feat(web-engagements): add sourceConfig registry for multi-source timeline

SOURCE_CONFIG maps source key to label/chipLabel/color/defaultIcon for the
five sources Plan 3 supports (web, case, task, event, voice). SOURCE_ORDER
defines a stable display order for chips.

Future sources (email, etc.) extend this file as a one-file change.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Create the `timelineMappers.js` skeleton with `parseDataGraphResponse`

Lifts the existing JSON-walker logic out of `webEngagementData.js` into a pure function. We do this BEFORE introducing CRM events so the lift can be verified independently — Jest tests confirm the same inputs produce the same outputs.

**Files:**
- Create: `Web_Engagements_RT_Timeline/force-app/main/default/lwc/webEngagementData/timelineMappers.js`

- [ ] **Step 1: Create the file**

Write to `Web_Engagements_RT_Timeline/force-app/main/default/lwc/webEngagementData/timelineMappers.js`:

```javascript
/**
 * Pure functions for the multi-source timeline.
 *
 * All functions in this module accept inputs and return outputs without side
 * effects. They're testable in isolation via Jest with crafted inputs, no
 * LWC harness needed.
 */

import { SOURCE_CONFIG } from './sourceConfig';

/**
 * Decodes the 5 HTML entities that Data Cloud's wrapped-blob shape produces
 * when JSON is escaped inside JSON. Pure regex, no DOM touch — safer than
 * the textarea/innerHTML idiom and trivially testable in any Node env.
 *
 * Order matters: '&amp;' is replaced LAST so a double-encoded '&amp;quot;'
 * decodes to '"' across two passes (first pass yields '&quot;', second
 * pass yields '"'), not directly to '"'.
 *
 * @param {string} html
 * @returns {string}
 */
function decodeEntities(html) {
    if (!html) return '';
    return String(html)
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g,  '<')
        .replace(/&gt;/g,  '>')
        .replace(/&amp;/g, '&');
}

/**
 * Walks the parsed Data Graph response (or its wrapped-blob shape) and returns
 * an array of TimelineEvent objects (source: 'web') sorted by occurredAt DESC.
 *
 * Handles two response shapes:
 *   - Wrapped: { data: [{ json_blob__c: "<escaped JSON>" }] }
 *   - Direct:  the parsed graph object with embedded CumulusWeb_Engagements__dlm arrays
 *
 * @param {string} rawResponse - the body string returned by the Apex callout
 * @returns {Array} TimelineEvent[]
 */
export function parseDataGraphResponse(rawResponse) {
    if (!rawResponse || rawResponse === '[]') return [];

    let parsed;
    try {
        parsed = JSON.parse(rawResponse);
    } catch (e) {
        console.error('parseDataGraphResponse: invalid JSON', e);
        return [];
    }

    // 1. Detect wrapped-blob vs direct shape.
    let graphData = null;
    if (parsed?.data?.[0]?.json_blob__c) {
        try {
            graphData = JSON.parse(decodeEntities(parsed.data[0].json_blob__c));
        } catch (e) {
            console.error('parseDataGraphResponse: failed to parse inner blob', e);
            return [];
        }
    } else {
        graphData = parsed;
    }

    if (!graphData) return [];

    // 2. Recursively collect CumulusWeb_Engagements__dlm entries.
    const collected = [];
    const visit = (node) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node.CumulusWeb_Engagements__dlm)) {
            for (const e of node.CumulusWeb_Engagements__dlm) {
                collected.push(mapWebEngagement(e));
            }
        }
        for (const child of Object.values(node)) {
            if (Array.isArray(child)) {
                child.forEach(visit);
            } else if (child && typeof child === 'object') {
                visit(child);
            }
        }
    };
    visit(graphData);

    // 3. Dedupe by id, sort DESC.
    const byId = new Map();
    for (const evt of collected) {
        if (evt.id) byId.set(evt.id, evt);
    }
    return [...byId.values()].sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));
}

/**
 * Maps one CumulusWeb_Engagements__dlm row to a TimelineEvent.
 * Title, subtitle, icon, details all derived from productType/pageTitle/applicationStatus
 * per the rules previously living in webEngagementData.js.
 */
function mapWebEngagement(e) {
    const baseTitle = e.webInteractions_pageTitle__c;
    let title = e.webInteractions_applicationStatus__c
        ? `${baseTitle} - ${e.webInteractions_applicationStatus__c}`
        : baseTitle;
    if (e.webInteractions_productType__c === 'Your Dashboard') {
        title = 'Login - Home';
    }

    let subtitle = 'Visited Page';
    if (e.webInteractions_productType__c?.includes('Contact Us')) {
        subtitle = 'Contact Request Form';
    } else if (e.webInteractions_pageTitle__c?.includes('Apply')) {
        subtitle = 'Application';
    }

    let icon = SOURCE_CONFIG.web.defaultIcon;
    if (subtitle === 'Contact Request Form') {
        icon = 'custom:custom105';
    } else if (subtitle === 'Application') {
        switch (e.webInteractions_applicationStatus__c) {
            case 'submit_app':
                icon = 'standard:task2';
                subtitle = 'Application Submitted';
                break;
            case 'save_draft':
                icon = 'standard:record_update';
                subtitle = 'Application Saved';
                break;
            case 'cancel_app':
                icon = 'standard:cancel_checkout';
                subtitle = 'Application Cancelled';
                break;
            default:
                icon = 'standard:document';
        }
    }

    const details = [
        { label: 'Device Id', value: e.deviceId__c },
        { label: 'Event Type', value: e.eventType__c },
        { label: 'User Id', value: e.webInteractions_userId__c },
        { label: 'Contact Email', value: e.webInteractions_userEmail__c }
    ];
    if (e.webInteractions_productType__c?.includes('Contact Us')) {
        details.push({ label: 'Contact Name', value: e.webInteractions_contactName__c });
        details.push({ label: 'Contact Phone', value: e.webInteractions_contactPhone__c });
        details.push({ label: 'Contact Request', value: e.webInteractions_contactRequestType__c });
    }
    if (e.webInteractions_applicationStatus__c) {
        details.push({ label: 'Requested Amount', value: e.webInteractions_requestedAmount__c });
    }

    return {
        id: e.eventId__c,
        source: 'web',
        sourceLabel: SOURCE_CONFIG.web.label,
        iconName: icon,
        iconColor: SOURCE_CONFIG.web.color,
        occurredAt: e.dateTime__c,
        title,
        subtitle,
        recordUrl: null,
        details: details.filter(d => d.value !== null && d.value !== undefined)
    };
}
```

> **Note on `decodeEntities`:** the Plan 1+2 era of this code used `textarea.innerHTML = html` then read `.value` to decode entities. That works in jsdom but is flagged by static-analysis security scanners. The regex approach above is functionally equivalent for the 5 entities Data Cloud emits, runs without DOM dependencies, and is fully testable in any Node environment.

- [ ] **Step 2: Validate**

```bash
cd Web_Engagements_RT_Timeline
sf project deploy validate --source-dir force-app/main/default/lwc --wait 10
```

Expected: `Validation succeeded`.

- [ ] **Step 3: Commit**

```bash
cd ..
git add Web_Engagements_RT_Timeline/force-app/main/default/lwc/webEngagementData/timelineMappers.js
git commit -m "feat(web-engagements): add timelineMappers.parseDataGraphResponse

Lifts the existing Data Graph JSON-walker out of webEngagementData.js
into a pure function callable from Jest with crafted inputs. Same logic
as before (wrapped-blob and direct-JSON detection, recursive
CumulusWeb_Engagements__dlm collection, dedupe-by-id, sort DESC by
occurredAt) but the entity decoder is now a regex helper instead of the
textarea/innerHTML idiom — same output, no DOM touch, no scanner warnings.

Each entry now matches the unified TimelineEvent shape (id, source,
sourceLabel, iconName, iconColor, occurredAt, title, subtitle,
recordUrl, details). The component class is unchanged so far —
this commit only adds the new module.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Add Jest tests for `parseDataGraphResponse`

**Files:**
- Create: `Web_Engagements_RT_Timeline/force-app/main/default/lwc/webEngagementData/__tests__/timelineMappers.test.js`

- [ ] **Step 1: Create the test file**

Write to `Web_Engagements_RT_Timeline/force-app/main/default/lwc/webEngagementData/__tests__/timelineMappers.test.js`:

```javascript
import { parseDataGraphResponse } from '../timelineMappers';

describe('parseDataGraphResponse', () => {
    it('returns empty array for empty input', () => {
        expect(parseDataGraphResponse('')).toEqual([]);
        expect(parseDataGraphResponse(null)).toEqual([]);
        expect(parseDataGraphResponse('[]')).toEqual([]);
    });

    it('returns empty array for unparseable JSON', () => {
        expect(parseDataGraphResponse('not-json{{')).toEqual([]);
    });

    it('parses direct-JSON shape with one engagement', () => {
        const input = JSON.stringify({
            CumulusWeb_Engagements__dlm: [
                {
                    eventId__c: 'evt-1',
                    dateTime__c: '2026-05-01T10:00:00Z',
                    webInteractions_pageTitle__c: 'Pricing Page',
                    webInteractions_productType__c: 'Marketing',
                    deviceId__c: 'd-1',
                    eventType__c: 'page_view',
                    webInteractions_userId__c: 'u-1',
                    webInteractions_userEmail__c: 'a@b.com'
                }
            ]
        });

        const result = parseDataGraphResponse(input);

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
            id: 'evt-1',
            source: 'web',
            sourceLabel: 'Web',
            occurredAt: '2026-05-01T10:00:00Z',
            title: 'Pricing Page',
            subtitle: 'Visited Page',
            iconColor: '#7f56d9'
        });
    });

    it('parses wrapped-blob shape with HTML-entity-encoded inner JSON', () => {
        // Data Cloud's wrapped-blob shape escapes JSON inside JSON: the inner
        // JSON's quotes arrive as &quot; The decoder unescapes them before
        // the second JSON.parse.
        const innerBlobRaw = JSON.stringify({
            CumulusWeb_Engagements__dlm: [
                {
                    eventId__c: 'evt-2',
                    dateTime__c: '2026-05-02T11:00:00Z',
                    webInteractions_pageTitle__c: 'Apply for Loan',
                    webInteractions_applicationStatus__c: 'submit_app',
                    webInteractions_productType__c: 'Loan',
                    webInteractions_requestedAmount__c: '25000'
                }
            ]
        });
        const escaped = innerBlobRaw.replace(/"/g, '&quot;');
        const outer = { data: [{ json_blob__c: escaped }] };

        const result = parseDataGraphResponse(JSON.stringify(outer));

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
            id: 'evt-2',
            source: 'web',
            title: 'Apply for Loan - submit_app',
            subtitle: 'Application Submitted',
            iconName: 'standard:task2'
        });
        expect(result[0].details).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ label: 'Requested Amount', value: '25000' })
            ])
        );
    });

    it('parses wrapped-blob shape with un-escaped inner JSON (already valid)', () => {
        // Some Data Cloud configs return inner JSON without entity-encoding.
        // The regex decoder is a no-op on already-clean strings.
        const innerBlobRaw = JSON.stringify({
            CumulusWeb_Engagements__dlm: [
                { eventId__c: 'evt-clean', dateTime__c: '2026-05-02T11:00:00Z',
                  webInteractions_pageTitle__c: 'Clean' }
            ]
        });
        const outer = { data: [{ json_blob__c: innerBlobRaw }] };

        const result = parseDataGraphResponse(JSON.stringify(outer));

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('evt-clean');
    });

    it('overrides title to "Login - Home" when productType is "Your Dashboard"', () => {
        const input = JSON.stringify({
            CumulusWeb_Engagements__dlm: [
                {
                    eventId__c: 'evt-3',
                    dateTime__c: '2026-05-03T09:00:00Z',
                    webInteractions_pageTitle__c: 'Account Overview',
                    webInteractions_productType__c: 'Your Dashboard'
                }
            ]
        });

        const result = parseDataGraphResponse(input);

        expect(result[0].title).toBe('Login - Home');
    });

    it('routes Contact Us pages to the Contact Request Form subtitle', () => {
        const input = JSON.stringify({
            CumulusWeb_Engagements__dlm: [
                {
                    eventId__c: 'evt-4',
                    dateTime__c: '2026-05-04T12:00:00Z',
                    webInteractions_pageTitle__c: 'Reach Us',
                    webInteractions_productType__c: 'Contact Us — Mortgages',
                    webInteractions_contactName__c: 'Jane',
                    webInteractions_contactPhone__c: '555-1212',
                    webInteractions_contactRequestType__c: 'Callback'
                }
            ]
        });

        const result = parseDataGraphResponse(input);

        expect(result[0].subtitle).toBe('Contact Request Form');
        expect(result[0].iconName).toBe('custom:custom105');
        const labels = result[0].details.map(d => d.label);
        expect(labels).toEqual(
            expect.arrayContaining(['Contact Name', 'Contact Phone', 'Contact Request'])
        );
    });

    it('dedupes by id and sorts DESC by occurredAt', () => {
        const input = JSON.stringify({
            CumulusWeb_Engagements__dlm: [
                { eventId__c: 'a', dateTime__c: '2026-05-01T00:00:00Z', webInteractions_pageTitle__c: 'A' },
                { eventId__c: 'a', dateTime__c: '2026-05-01T00:00:00Z', webInteractions_pageTitle__c: 'A-dup' },
                { eventId__c: 'b', dateTime__c: '2026-05-03T00:00:00Z', webInteractions_pageTitle__c: 'B' },
                { eventId__c: 'c', dateTime__c: '2026-05-02T00:00:00Z', webInteractions_pageTitle__c: 'C' }
            ]
        });

        const result = parseDataGraphResponse(input);

        expect(result.map(r => r.id)).toEqual(['b', 'c', 'a']);
        expect(result).toHaveLength(3);
    });

    it('filters out null/undefined details', () => {
        const input = JSON.stringify({
            CumulusWeb_Engagements__dlm: [
                {
                    eventId__c: 'evt-clean',
                    dateTime__c: '2026-05-05T00:00:00Z',
                    webInteractions_pageTitle__c: 'Page',
                    deviceId__c: 'd-only',
                    eventType__c: null
                    // userId, userEmail unset (undefined)
                }
            ]
        });

        const result = parseDataGraphResponse(input);

        const labels = result[0].details.map(d => d.label);
        expect(labels).toEqual(['Device Id']);
    });
});
```

- [ ] **Step 2: Run Jest**

```bash
cd Web_Engagements_RT_Timeline
npm test
```

Expected: existing 6 Jest tests still pass + new 9 mapper tests pass = **15/15**.

If a test fails because `result[0].details` doesn't have `Requested Amount` for the wrapped-blob test, the issue is in `mapWebEngagement` not pushing the detail when `webInteractions_applicationStatus__c` is set. Re-check Task 2.

If `parseDataGraphResponse` returns empty for the wrapped-blob test, the regex `decodeEntities` step is mishandling the entity-encoded inner JSON. Add `console.log` in `decodeEntities` and re-run.

- [ ] **Step 3: Commit**

```bash
cd ..
git add Web_Engagements_RT_Timeline/force-app/main/default/lwc/webEngagementData/__tests__/timelineMappers.test.js
git commit -m "test(web-engagements): cover parseDataGraphResponse with 9 Jest tests

Tests cover: empty/null/[]/unparseable input, direct-JSON shape,
wrapped-blob with HTML-entity-encoded inner JSON, wrapped-blob with
already-clean inner JSON, Your Dashboard title override, Contact Us
subtitle routing, dedupe-by-id + sort DESC, null/undefined detail
filtering.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Add `mergeAndSort` and `groupByDay` to `timelineMappers.js`

**Files:**
- Modify: `Web_Engagements_RT_Timeline/force-app/main/default/lwc/webEngagementData/timelineMappers.js`

- [ ] **Step 1: Append the two functions**

Append to the END of `timelineMappers.js` (after the last `}` of `mapWebEngagement`):

```javascript

/**
 * Merges web events and CRM events into a single sorted array. Dedupes by id.
 * Attaches presentation fields (cssClass, leftRailStyle) so the template can
 * stay declarative.
 *
 * @param {Array} webEvents - TimelineEvent[] from parseDataGraphResponse
 * @param {Array} crmEvents - TimelineEvent[] from CrmTimelineController
 * @returns {Array} TimelineEvent[] with cssClass + leftRailStyle attached, sorted DESC
 */
export function mergeAndSort(webEvents, crmEvents) {
    const all = [...(webEvents || []), ...(crmEvents || [])];
    const byId = new Map();
    for (const evt of all) {
        if (evt && evt.id) byId.set(evt.id, evt);
    }
    return [...byId.values()]
        .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt))
        .map(evt => ({
            ...evt,
            cssClass: `stream-card stream-card-${evt.source}`,
            leftRailStyle: `border-left-color: ${evt.iconColor};`,
            expanded: false
        }));
}

/**
 * Groups merged events into buckets keyed by calendar day. Returns the
 * shape the Style B template iterates: { dayKey, dayLabel, events }.
 *
 * @param {Array} events - TimelineEvent[] (already sorted DESC)
 * @param {string} locale - Intl locale for day labels (default 'en-US')
 * @returns {Array} [{ dayKey, dayLabel, events }]
 */
export function groupByDay(events, locale = 'en-US') {
    if (!events || events.length === 0) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const buckets = new Map();
    for (const evt of events) {
        const d = new Date(evt.occurredAt);
        if (Number.isNaN(d.getTime())) continue;
        const dayKey = d.toISOString().slice(0, 10);
        if (!buckets.has(dayKey)) {
            buckets.set(dayKey, { dayKey, dayLabel: formatDayLabel(d, today, yesterday, locale), events: [] });
        }
        buckets.get(dayKey).events.push(evt);
    }
    // Map preserves insertion order, which equals the DESC sort order from mergeAndSort.
    return [...buckets.values()];
}

function formatDayLabel(d, today, yesterday, locale) {
    const dayStart = new Date(d);
    dayStart.setHours(0, 0, 0, 0);

    if (dayStart.getTime() === today.getTime()) {
        return `Today · ${d.toLocaleDateString(locale, { month: 'short', day: 'numeric' })}`;
    }
    if (dayStart.getTime() === yesterday.getTime()) {
        return `Yesterday · ${d.toLocaleDateString(locale, { month: 'short', day: 'numeric' })}`;
    }
    return d.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });
}
```

- [ ] **Step 2: Validate**

```bash
cd Web_Engagements_RT_Timeline
sf project deploy validate --source-dir force-app/main/default/lwc --wait 10
```

Expected: `Validation succeeded`.

- [ ] **Step 3: Commit**

```bash
cd ..
git add Web_Engagements_RT_Timeline/force-app/main/default/lwc/webEngagementData/timelineMappers.js
git commit -m "feat(web-engagements): add mergeAndSort + groupByDay mappers

mergeAndSort dedupes by id, sorts DESC by occurredAt, and attaches
cssClass + leftRailStyle to each event so the Style B template can
bind directly.

groupByDay buckets sorted events into day-keyed groups with friendly
labels: 'Today on May 17', 'Yesterday on May 16', 'Sat May 14'.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Add Jest tests for `mergeAndSort` and `groupByDay`

**Files:**
- Modify: `Web_Engagements_RT_Timeline/force-app/main/default/lwc/webEngagementData/__tests__/timelineMappers.test.js`

- [ ] **Step 1: Update the import**

At the top of the file, find:

```javascript
import { parseDataGraphResponse } from '../timelineMappers';
```

Replace with:

```javascript
import { parseDataGraphResponse, mergeAndSort, groupByDay } from '../timelineMappers';
```

- [ ] **Step 2: Append two new `describe` blocks**

Append AFTER the existing `describe('parseDataGraphResponse', ...)` block (i.e., as siblings, not nested):

```javascript

describe('mergeAndSort', () => {
    function evt(id, occurredAt, source = 'web', iconColor = '#000000') {
        return { id, source, occurredAt, iconColor, title: id };
    }

    it('returns empty array when both inputs are empty', () => {
        expect(mergeAndSort([], [])).toEqual([]);
    });

    it('handles undefined / null inputs', () => {
        expect(mergeAndSort(undefined, null)).toEqual([]);
        expect(mergeAndSort(null, [evt('x', '2026-05-01T00:00:00Z')])).toHaveLength(1);
    });

    it('sorts merged events DESC by occurredAt', () => {
        const web = [evt('w1', '2026-05-01T00:00:00Z')];
        const crm = [
            evt('c1', '2026-05-03T00:00:00Z', 'case'),
            evt('c2', '2026-05-02T00:00:00Z', 'case')
        ];

        const result = mergeAndSort(web, crm);

        expect(result.map(r => r.id)).toEqual(['c1', 'c2', 'w1']);
    });

    it('dedupes by id (last one wins via Map insertion order)', () => {
        const web = [evt('shared', '2026-05-01T00:00:00Z', 'web', '#7f56d9')];
        const crm = [evt('shared', '2026-05-02T00:00:00Z', 'case', '#c23934')];

        const result = mergeAndSort(web, crm);

        expect(result).toHaveLength(1);
        // CRM entry overwrites web because it was inserted into Map last.
        expect(result[0].source).toBe('case');
    });

    it('attaches cssClass and leftRailStyle to each event', () => {
        const result = mergeAndSort([evt('w', '2026-05-01T00:00:00Z', 'web', '#7f56d9')], []);

        expect(result[0].cssClass).toBe('stream-card stream-card-web');
        expect(result[0].leftRailStyle).toBe('border-left-color: #7f56d9;');
        expect(result[0].expanded).toBe(false);
    });
});

describe('groupByDay', () => {
    function evt(id, occurredAt) {
        return { id, occurredAt, source: 'web', iconColor: '#000', title: id };
    }

    it('returns empty array for empty input', () => {
        expect(groupByDay([])).toEqual([]);
        expect(groupByDay(null)).toEqual([]);
    });

    it('skips events with invalid occurredAt', () => {
        const events = [
            evt('a', 'not-a-date'),
            evt('b', '2026-05-01T00:00:00Z')
        ];
        const result = groupByDay(events);
        expect(result).toHaveLength(1);
        expect(result[0].events.map(e => e.id)).toEqual(['b']);
    });

    it('buckets events by ISO day key', () => {
        const events = [
            evt('a', '2026-05-03T15:00:00Z'),
            evt('b', '2026-05-03T09:00:00Z'),
            evt('c', '2026-05-02T11:00:00Z')
        ];

        const result = groupByDay(events);

        expect(result).toHaveLength(2);
        expect(result[0].dayKey).toBe('2026-05-03');
        expect(result[0].events.map(e => e.id)).toEqual(['a', 'b']);
        expect(result[1].dayKey).toBe('2026-05-02');
        expect(result[1].events.map(e => e.id)).toEqual(['c']);
    });

    it('preserves DESC sort order across day boundaries', () => {
        // Input is already sorted DESC (caller's responsibility); groupByDay
        // must preserve that ordering across buckets.
        const events = [
            evt('a', '2026-05-04T00:00:00Z'),
            evt('b', '2026-05-03T23:00:00Z'),
            evt('c', '2026-05-03T01:00:00Z'),
            evt('d', '2026-05-02T12:00:00Z')
        ];

        const result = groupByDay(events);

        expect(result.map(g => g.dayKey)).toEqual(['2026-05-04', '2026-05-03', '2026-05-02']);
    });
});
```

- [ ] **Step 3: Run Jest**

```bash
cd Web_Engagements_RT_Timeline
npm test
```

Expected: 6 component getter tests + 9 parseDataGraphResponse tests + 5 mergeAndSort tests + 4 groupByDay tests = **24/24**.

> **Note on `groupByDay` "Today/Yesterday" labels:** the `formatDayLabel` helper compares against `today` and `yesterday` computed at function-call time. We deliberately don't test those friendly labels in unit tests because they'd be brittle (locale-dependent + clock-dependent). The integration in real time uses them; the unit tests focus on bucketing correctness.

- [ ] **Step 4: Commit**

```bash
cd ..
git add Web_Engagements_RT_Timeline/force-app/main/default/lwc/webEngagementData/__tests__/timelineMappers.test.js
git commit -m "test(web-engagements): cover mergeAndSort + groupByDay with 9 Jest tests

mergeAndSort tests: empty/null inputs, DESC sort across sources, dedupe
by id (last-wins), cssClass/leftRailStyle attachment.

groupByDay tests: empty/null inputs, invalid-date skipping, ISO day-key
bucketing, DESC ordering preservation across day boundaries.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Refactor `webEngagementData.js` to use `parseDataGraphResponse`

The component still has its inline `processGraphData`. With the lift complete + tested in Tasks 2-5, replace the inline logic with a call to `parseDataGraphResponse`. Rename `webInteractions` to `webEvents` so the variable name reflects its post-Plan-3 role (one of two event arrays merged for display).

**Files:**
- Modify: `Web_Engagements_RT_Timeline/force-app/main/default/lwc/webEngagementData/webEngagementData.js`

- [ ] **Step 1: Add the mapper import**

At the top of the file, find:

```javascript
import { LightningElement, api } from 'lwc';
import getWebEngagementData from '@salesforce/apex/DataCloudWebEngagementController.getWebEngagementData';
```

Replace with:

```javascript
import { LightningElement, api } from 'lwc';
import getWebEngagementData from '@salesforce/apex/DataCloudWebEngagementController.getWebEngagementData';
import { parseDataGraphResponse } from './timelineMappers';
```

- [ ] **Step 2: Rename `webInteractions` to `webEvents`**

Multiple references throughout the file. Use a global rename. Find every occurrence of `webInteractions` and replace with `webEvents`. Approximately 10 references including:

- The class field `webInteractions = [];` becomes `webEvents = [];`
- Inside `handleRefresh()` body wherever it resets the array
- `processGraphData` method body
- `handleToggle` method (`this.webInteractions = this.webInteractions.map(...)` becomes `this.webEvents = this.webEvents.map(...)`)
- `get hasInteractions()` body returns `this.webInteractions.length` — keep the getter NAME `hasInteractions` for now (it'll be replaced in Task 13 by `hasAnyEvents`); just update the array reference inside

Use this command to verify zero `webInteractions` references remain after editing:

```bash
grep -n "webInteractions" Web_Engagements_RT_Timeline/force-app/main/default/lwc/webEngagementData/webEngagementData.js
```

(`webInteractions_` field names from Data Cloud, like `webInteractions_pageTitle__c`, only appear in the `mapWebEngagement` function inside `timelineMappers.js`, NOT in the component class. The grep should return zero matches in `webEngagementData.js`.)

- [ ] **Step 3: Replace `processGraphData` body with the mapper call**

Find the `then(rawResponse => { ... })` block in `handleRefresh()`. The current body is roughly:

```javascript
            .then(rawResponse => {
                console.log('Raw Response from Apex:', rawResponse);

                if (!rawResponse || rawResponse === '[]') {
                    console.warn('Empty response received.');
                    this.isLoading = false;
                    return;
                }

                try {
                    const parsedResponse = JSON.parse(rawResponse);
                    let graphData = null;
                    // ... wrapped-blob detection, recursive walk, etc.
                    if (graphData) {
                        this.processGraphData(graphData);
                    }
                } catch (parseError) { ... }

                this.isLoading = false;
            })
```

Replace the entire `.then(...)` block with:

```javascript
            .then(rawResponse => {
                this.webEvents = parseDataGraphResponse(rawResponse);
                this.isLoading = false;
            })
```

- [ ] **Step 4: Delete the now-orphaned `processGraphData` method**

Find the method `processGraphData(rootData) { ... }` and delete the entire method (declaration through closing `}`). It typically spans ~125 lines. After this delete, the component class is dramatically smaller.

Also delete the now-unused `decodeHtml` helper method if it's defined on the class (it's now scoped inside `timelineMappers.js` as `decodeEntities`).

- [ ] **Step 5: Validate AND run Jest**

```bash
cd Web_Engagements_RT_Timeline
sf project deploy validate --source-dir force-app/main/default/lwc --wait 10
npm test
```

Expected: validate succeeds, 24/24 Jest tests pass (the existing 6 component getter tests still work because the rename + delete didn't change `feedStyle` / `headerTitleIsLink`).

If a Jest test fails, the most likely culprit is a leftover `webInteractions` reference. Re-grep.

- [ ] **Step 6: Commit**

```bash
cd ..
git add Web_Engagements_RT_Timeline/force-app/main/default/lwc/webEngagementData/webEngagementData.js
git commit -m "refactor(web-engagements): replace inline processGraphData with parseDataGraphResponse

The 125-line processGraphData function is now a one-line call:
this.webEvents = parseDataGraphResponse(rawResponse).

Renamed the instance field webInteractions to webEvents to reflect its
post-Plan-3 role (one of two event arrays merged for display alongside
crmEvents).

Deleted the orphaned decodeHtml helper (now in timelineMappers.js as
decodeEntities, regex-based).

The hasInteractions getter is kept for now (template still references
it). Task 13 replaces it with hasAnyEvents once the template moves to
the merged-events render path.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Add the `CrmTimelineController` Apex class skeleton

Cases-only at first to keep this task tight. Tasks 9 / 10 add Tasks, Events, VoiceCalls.

**Files:**
- Create: `Web_Engagements_RT_Timeline/force-app/main/default/classes/CrmTimelineController.cls`
- Create: `Web_Engagements_RT_Timeline/force-app/main/default/classes/CrmTimelineController.cls-meta.xml`
- Create: `Web_Engagements_RT_Timeline/force-app/main/default/classes/CrmTimelineControllerTest.cls`
- Create: `Web_Engagements_RT_Timeline/force-app/main/default/classes/CrmTimelineControllerTest.cls-meta.xml`

- [ ] **Step 1: Create the controller meta-XML**

Write `Web_Engagements_RT_Timeline/force-app/main/default/classes/CrmTimelineController.cls-meta.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ApexClass xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>65.0</apiVersion>
    <status>Active</status>
</ApexClass>
```

- [ ] **Step 2: Create the controller skeleton**

Write `Web_Engagements_RT_Timeline/force-app/main/default/classes/CrmTimelineController.cls`:

```apex
public with sharing class CrmTimelineController {

    public class TimelineEvent {
        @AuraEnabled public String   id;
        @AuraEnabled public String   source;
        @AuraEnabled public String   sourceLabel;
        @AuraEnabled public String   iconName;
        @AuraEnabled public String   iconColor;
        @AuraEnabled public Datetime occurredAt;
        @AuraEnabled public String   title;
        @AuraEnabled public String   subtitle;
        @AuraEnabled public String   recordUrl;
        @AuraEnabled public List<DetailField> details;
    }

    public class DetailField {
        @AuraEnabled public String label;
        @AuraEnabled public String value;
        public DetailField(String label, String value) {
            this.label = label;
            this.value = value;
        }
    }

    private class TimelineEventComparator implements Comparator<TimelineEvent> {
        public Integer compare(TimelineEvent a, TimelineEvent b) {
            // DESC: newer first.
            if (a.occurredAt == b.occurredAt) return 0;
            return (a.occurredAt > b.occurredAt) ? -1 : 1;
        }
    }

    private static final Set<String> ALLOWED_SOURCES =
        new Set<String>{ 'case', 'task', 'event', 'voice' };

    private static final Integer MAX_LOOKBACK_DAYS = 365;
    private static final Integer DEFAULT_LOOKBACK_DAYS = 90;
    private static final Integer PER_SOURCE_LIMIT = 200;

    @AuraEnabled(cacheable=false)
    public static List<TimelineEvent> getCrmTimelineEvents(
        Id recordId,
        List<String> enabledSources,
        Integer lookbackDays
    ) {
        // 1. Validate recordId target.
        Schema.SObjectType sot = recordId.getSObjectType();
        if (sot != Account.SObjectType && sot != Contact.SObjectType) {
            throw new AuraHandledException(
                'Web Engagements timeline only supports Account and Contact record pages.'
            );
        }

        // 2. Whitelist filter.
        Set<String> sources = new Set<String>();
        for (String s : (enabledSources == null ? new List<String>() : enabledSources)) {
            if (ALLOWED_SOURCES.contains(s)) sources.add(s);
        }
        if (sources.isEmpty()) return new List<TimelineEvent>();

        // 3. Bound lookback.
        Integer days = (lookbackDays == null || lookbackDays < 1)
            ? DEFAULT_LOOKBACK_DAYS
            : Math.min(lookbackDays, MAX_LOOKBACK_DAYS);
        Datetime since = Datetime.now().addDays(-days);

        // 4. Per-source dispatch.
        List<TimelineEvent> events = new List<TimelineEvent>();
        if (sources.contains('case')) events.addAll(queryCases(recordId, sot, since));
        // task / event / voice added in Tasks 9-10.

        // 5. Sort DESC and return.
        TimelineEvent[] arr = events.clone();
        arr.sort(new TimelineEventComparator());
        return arr;
    }

    private static List<TimelineEvent> queryCases(Id recordId, Schema.SObjectType sot, Datetime since) {
        List<Case> rows = (sot == Account.SObjectType)
            ? [SELECT Id, CaseNumber, Subject, Status, Owner.Name, CreatedDate
               FROM Case
               WHERE AccountId = :recordId AND CreatedDate >= :since
               ORDER BY CreatedDate DESC
               LIMIT :PER_SOURCE_LIMIT]
            : [SELECT Id, CaseNumber, Subject, Status, Owner.Name, CreatedDate
               FROM Case
               WHERE ContactId = :recordId AND CreatedDate >= :since
               ORDER BY CreatedDate DESC
               LIMIT :PER_SOURCE_LIMIT];

        List<TimelineEvent> out = new List<TimelineEvent>();
        for (Case c : rows) {
            TimelineEvent t = new TimelineEvent();
            t.id          = c.Id;
            t.source      = 'case';
            t.sourceLabel = 'Case';
            t.iconName    = 'standard:case';
            t.iconColor   = '#c23934';
            t.occurredAt  = c.CreatedDate;
            t.title       = c.Subject == null ? 'Case ' + c.CaseNumber : c.Subject;
            String ownerName = (c.Owner != null) ? c.Owner.Name : 'Unassigned';
            t.subtitle    = 'Case ' + c.CaseNumber + ' on ' + c.Status + ' owner ' + ownerName;
            t.recordUrl   = '/lightning/r/Case/' + c.Id + '/view';
            t.details     = new List<DetailField>{
                new DetailField('Case Number', c.CaseNumber),
                new DetailField('Status', c.Status),
                new DetailField('Owner', ownerName)
            };
            out.add(t);
        }
        return out;
    }
}
```

- [ ] **Step 3: Create the test class meta-XML**

Write `Web_Engagements_RT_Timeline/force-app/main/default/classes/CrmTimelineControllerTest.cls-meta.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ApexClass xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>65.0</apiVersion>
    <status>Active</status>
</ApexClass>
```

- [ ] **Step 4: Create the test class skeleton + 3 initial tests**

Write `Web_Engagements_RT_Timeline/force-app/main/default/classes/CrmTimelineControllerTest.cls`:

```apex
@IsTest
private class CrmTimelineControllerTest {

    @TestSetup
    static void setupAccountAndContact() {
        Account a = new Account(Name = 'Timeline Test Account');
        insert a;
        Contact c = new Contact(LastName = 'Timeline Test Contact', AccountId = a.Id);
        insert c;
    }

    @IsTest
    static void unsupportedRecordIdThrows() {
        // Use an Opportunity ID — neither Account nor Contact.
        Account a = [SELECT Id FROM Account LIMIT 1];
        Opportunity o = new Opportunity(Name = 'O', StageName = 'Prospecting',
            CloseDate = Date.today().addDays(30), AccountId = a.Id);
        insert o;

        Boolean threw = false;
        try {
            Test.startTest();
            CrmTimelineController.getCrmTimelineEvents(o.Id, new List<String>{ 'case' }, 90);
            Test.stopTest();
        } catch (AuraHandledException e) {
            threw = true;
            System.assert(
                String.isNotBlank(e.getMessage()),
                'AuraHandledException should carry a message.'
            );
        }
        System.assert(threw, 'Expected AuraHandledException for non-Account/non-Contact recordId.');
    }

    @IsTest
    static void emptyEnabledSourcesReturnsEmpty() {
        Account a = [SELECT Id FROM Account LIMIT 1];

        Test.startTest();
        List<CrmTimelineController.TimelineEvent> result =
            CrmTimelineController.getCrmTimelineEvents(a.Id, new List<String>(), 90);
        Test.stopTest();

        System.assertEquals(0, result.size(), 'Empty enabledSources should yield empty list.');
    }

    @IsTest
    static void whitelistRejectsUnknownSources() {
        Account a = [SELECT Id FROM Account LIMIT 1];

        Test.startTest();
        List<CrmTimelineController.TimelineEvent> result =
            CrmTimelineController.getCrmTimelineEvents(
                a.Id,
                new List<String>{ 'malicious_source', 'unknown_source' },
                90
            );
        Test.stopTest();

        System.assertEquals(0, result.size(),
            'Sources not in ALLOWED_SOURCES whitelist should be silently dropped.');
    }
}
```

- [ ] **Step 5: Validate + deploy + run tests**

```bash
cd Web_Engagements_RT_Timeline
sf project deploy start --source-dir force-app/main/default/classes --tests CrmTimelineControllerTest --wait 20
```

Expected:
- `Deploy Succeeded.`
- `Tests · 3` (the 3 we just added — DataCloudWebEngagementControllerTest is NOT included unless you specify it)
- `Pass Rate · 100%`

If a deploy error mentions `Comparator not found`, the org's API version doesn't support `Comparator<T>` — you'd need to fall back to the older `sort()` approach with a wrapper class. This is unlikely at API 65 but possible. STOP and report.

- [ ] **Step 6: Commit**

```bash
cd ..
git add Web_Engagements_RT_Timeline/force-app/main/default/classes/CrmTimelineController.cls Web_Engagements_RT_Timeline/force-app/main/default/classes/CrmTimelineController.cls-meta.xml Web_Engagements_RT_Timeline/force-app/main/default/classes/CrmTimelineControllerTest.cls Web_Engagements_RT_Timeline/force-app/main/default/classes/CrmTimelineControllerTest.cls-meta.xml
git commit -m "feat(web-engagements): add CrmTimelineController with Cases source

@AuraEnabled getCrmTimelineEvents(recordId, enabledSources, lookbackDays)
returns a unified TimelineEvent list across CRM sources. Cases is the
first wired source. Whitelist + recordId target validation + lookback
clamping all in place.

Test class covers: unsupported recordId throws, empty enabledSources
returns empty, whitelist rejects unknown source strings.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Add the Cases happy-path test

**Files:**
- Modify: `Web_Engagements_RT_Timeline/force-app/main/default/classes/CrmTimelineControllerTest.cls`

- [ ] **Step 1: Append the test method**

Append inside `CrmTimelineControllerTest`, before the closing `}`:

```apex
    @IsTest
    static void casesHappyPathReturnsTimelineEvents() {
        Account a = [SELECT Id FROM Account LIMIT 1];

        Case c1 = new Case(Subject = 'Statement discrepancy', Status = 'New', AccountId = a.Id);
        Case c2 = new Case(Subject = 'Loan question',         Status = 'Working', AccountId = a.Id);
        insert new List<Case>{ c1, c2 };

        Test.startTest();
        List<CrmTimelineController.TimelineEvent> result =
            CrmTimelineController.getCrmTimelineEvents(a.Id, new List<String>{ 'case' }, 90);
        Test.stopTest();

        System.assertEquals(2, result.size(), 'Both Cases should be returned.');
        Set<String> titles = new Set<String>();
        for (CrmTimelineController.TimelineEvent t : result) {
            titles.add(t.title);
            System.assertEquals('case', t.source, 'Source should be case.');
            System.assertEquals('Case', t.sourceLabel);
            System.assertEquals('standard:case', t.iconName);
            System.assertEquals('#c23934', t.iconColor);
            System.assertNotEquals(null, t.occurredAt, 'occurredAt should be populated from CreatedDate.');
            System.assert(t.recordUrl.startsWith('/lightning/r/Case/'), 'recordUrl should be a Case path.');
            System.assert(t.subtitle.contains('owner '), 'Subtitle should mention owner.');
            // Three details: Case Number, Status, Owner.
            System.assertEquals(3, t.details.size());
        }
        System.assert(titles.contains('Statement discrepancy'));
        System.assert(titles.contains('Loan question'));
    }

    @IsTest
    static void casesContactPagePath() {
        Contact c = [SELECT Id FROM Contact LIMIT 1];
        Case caseRecord = new Case(Subject = 'Contact-page Case', Status = 'New', ContactId = c.Id);
        insert caseRecord;

        Test.startTest();
        List<CrmTimelineController.TimelineEvent> result =
            CrmTimelineController.getCrmTimelineEvents(c.Id, new List<String>{ 'case' }, 90);
        Test.stopTest();

        System.assertEquals(1, result.size());
        System.assertEquals('Contact-page Case', result[0].title);
    }
```

- [ ] **Step 2: Run the new tests**

```bash
cd Web_Engagements_RT_Timeline
sf apex run test --tests CrmTimelineControllerTest.casesHappyPathReturnsTimelineEvents --tests CrmTimelineControllerTest.casesContactPagePath --result-format human --code-coverage --wait 15 --synchronous
```

Expected: 2/2 pass.

- [ ] **Step 3: Run all CrmTimelineControllerTest tests**

```bash
sf apex run test --class-names CrmTimelineControllerTest --result-format human --code-coverage --wait 15 --synchronous
```

Expected: 5/5 pass.

- [ ] **Step 4: Commit**

```bash
cd ..
git add Web_Engagements_RT_Timeline/force-app/main/default/classes/CrmTimelineControllerTest.cls
git commit -m "test(web-engagements): cover Cases source happy paths

Two new tests:
- casesHappyPathReturnsTimelineEvents: Account-page Cases mapped to
  TimelineEvent shape (source/iconName/iconColor/recordUrl/details).
- casesContactPagePath: same but Cases on a Contact record page,
  exercising the ContactId branch of queryCases.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Add Tasks (incl. logged calls) source

**Files:**
- Modify: `Web_Engagements_RT_Timeline/force-app/main/default/classes/CrmTimelineController.cls`
- Modify: `Web_Engagements_RT_Timeline/force-app/main/default/classes/CrmTimelineControllerTest.cls`

- [ ] **Step 1: Add `queryTasks` to the controller**

Find the dispatch line:

```apex
        if (sources.contains('case')) events.addAll(queryCases(recordId, sot, since));
        // task / event / voice added in Tasks 9-10.
```

Replace with:

```apex
        if (sources.contains('case')) events.addAll(queryCases(recordId, sot, since));
        if (sources.contains('task')) events.addAll(queryTasks(recordId, sot, since));
        // event / voice added in subsequent tasks.
```

Then append `queryTasks` AFTER `queryCases` (before the closing `}` of the class):

```apex

    private static List<TimelineEvent> queryTasks(Id recordId, Schema.SObjectType sot, Datetime since) {
        // Task.WhatId points to Account/Opportunity/etc.; Task.WhoId points to Contact/Lead.
        // For the Account record page we query WhatId = recordId; for Contact, WhoId = recordId.
        // Activities use ActivityDate (Date), not Datetime — fall back to CreatedDate when null.
        List<Task> rows = (sot == Account.SObjectType)
            ? [SELECT Id, Subject, Type, CallType, ActivityDate, CreatedDate, Owner.Name
               FROM Task
               WHERE WhatId = :recordId AND CreatedDate >= :since
               ORDER BY CreatedDate DESC
               LIMIT :PER_SOURCE_LIMIT]
            : [SELECT Id, Subject, Type, CallType, ActivityDate, CreatedDate, Owner.Name
               FROM Task
               WHERE WhoId = :recordId AND CreatedDate >= :since
               ORDER BY CreatedDate DESC
               LIMIT :PER_SOURCE_LIMIT];

        List<TimelineEvent> out = new List<TimelineEvent>();
        for (Task task : rows) {
            TimelineEvent t = new TimelineEvent();
            t.id          = task.Id;
            t.source      = 'task';
            t.sourceLabel = 'Task';
            // log_a_call icon when this is a logged call; default task icon otherwise.
            t.iconName    = String.isNotBlank(task.CallType) ? 'standard:log_a_call' : 'standard:task';
            t.iconColor   = '#04844b';
            // Prefer ActivityDate as the user-facing date; convert Date to Datetime at midnight UTC.
            // Fall back to CreatedDate when ActivityDate is null (uncommon but possible).
            t.occurredAt  = (task.ActivityDate != null)
                ? Datetime.newInstanceGmt(task.ActivityDate, Time.newInstance(0, 0, 0, 0))
                : task.CreatedDate;
            t.title       = String.isBlank(task.Subject) ? '(no subject)' : task.Subject;
            // Subtitle prefers Type; appends CallType when present (e.g. 'Call on Outbound').
            String sub    = String.isBlank(task.Type) ? 'Task' : task.Type;
            if (String.isNotBlank(task.CallType)) sub += ' on ' + task.CallType;
            t.subtitle    = sub;
            t.recordUrl   = '/lightning/r/Task/' + task.Id + '/view';
            t.details     = new List<DetailField>{
                new DetailField('Type', task.Type),
                new DetailField('Owner', (task.Owner != null) ? task.Owner.Name : 'Unassigned')
            };
            if (String.isNotBlank(task.CallType)) {
                t.details.add(new DetailField('Call Type', task.CallType));
            }
            out.add(t);
        }
        return out;
    }
```

- [ ] **Step 2: Add a Tasks happy-path test**

Append inside `CrmTimelineControllerTest` before the closing `}`:

```apex
    @IsTest
    static void tasksHappyPathReturnsBothTaskAndLoggedCall() {
        Account a = [SELECT Id FROM Account LIMIT 1];

        Task plain = new Task(
            Subject = 'Follow up email',
            Type = 'Email',
            ActivityDate = Date.today(),
            WhatId = a.Id
        );
        Task call = new Task(
            Subject = 'Outbound to Jane',
            Type = 'Call',
            CallType = 'Outbound',
            ActivityDate = Date.today(),
            WhatId = a.Id
        );
        insert new List<Task>{ plain, call };

        Test.startTest();
        List<CrmTimelineController.TimelineEvent> result =
            CrmTimelineController.getCrmTimelineEvents(a.Id, new List<String>{ 'task' }, 90);
        Test.stopTest();

        System.assertEquals(2, result.size());

        Map<String, CrmTimelineController.TimelineEvent> bySubject = new Map<String, CrmTimelineController.TimelineEvent>();
        for (CrmTimelineController.TimelineEvent t : result) bySubject.put(t.title, t);

        CrmTimelineController.TimelineEvent emailEvt = bySubject.get('Follow up email');
        System.assertEquals('standard:task', emailEvt.iconName,
            'Plain task should use the task icon (CallType blank).');
        System.assertEquals('Email', emailEvt.subtitle);

        CrmTimelineController.TimelineEvent callEvt = bySubject.get('Outbound to Jane');
        System.assertEquals('standard:log_a_call', callEvt.iconName,
            'Logged call (CallType populated) should use the call icon.');
        System.assertEquals('Call on Outbound', callEvt.subtitle);
        // CallType detail row only appears when CallType is set.
        Boolean hasCallTypeDetail = false;
        for (CrmTimelineController.DetailField d : callEvt.details) {
            if (d.label == 'Call Type') hasCallTypeDetail = true;
        }
        System.assert(hasCallTypeDetail, 'Logged call should include a Call Type detail row.');
    }
```

- [ ] **Step 3: Deploy + run**

```bash
cd Web_Engagements_RT_Timeline
sf project deploy start --source-dir force-app/main/default/classes --tests CrmTimelineControllerTest --wait 20
```

Expected: `Tests · 6`, `Pass Rate · 100%`.

- [ ] **Step 4: Commit**

```bash
cd ..
git add Web_Engagements_RT_Timeline/force-app/main/default/classes/CrmTimelineController.cls Web_Engagements_RT_Timeline/force-app/main/default/classes/CrmTimelineControllerTest.cls
git commit -m "feat(web-engagements): add Tasks source (incl. logged calls)

queryTasks branches on the parent SObject type (Account uses WhatId,
Contact uses WhoId), maps Task records to TimelineEvent. Logged calls
(Task.CallType populated) get the standard:log_a_call icon and a
'Type on CallType' subtitle plus a Call Type detail row.

Test covers both the plain-task and logged-call paths in one go.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Add Events + VoiceCall sources

VoiceCall is gated on Schema availability (orgs without Service Cloud Voice silently skip). Combining both sources here because each is small and they don't depend on each other.

**Files:**
- Modify: `Web_Engagements_RT_Timeline/force-app/main/default/classes/CrmTimelineController.cls`
- Modify: `Web_Engagements_RT_Timeline/force-app/main/default/classes/CrmTimelineControllerTest.cls`

- [ ] **Step 1: Add `queryEvents` and `queryVoiceCalls` to the controller**

Update the dispatch block. Find:

```apex
        if (sources.contains('case')) events.addAll(queryCases(recordId, sot, since));
        if (sources.contains('task')) events.addAll(queryTasks(recordId, sot, since));
        // event / voice added in subsequent tasks.
```

Replace with:

```apex
        if (sources.contains('case'))  events.addAll(queryCases(recordId, sot, since));
        if (sources.contains('task'))  events.addAll(queryTasks(recordId, sot, since));
        if (sources.contains('event')) events.addAll(queryEvents(recordId, sot, since));
        if (sources.contains('voice')) events.addAll(queryVoiceCalls(recordId, sot, since));
```

Append `queryEvents` and `queryVoiceCalls` AFTER `queryTasks`:

```apex

    private static List<TimelineEvent> queryEvents(Id recordId, Schema.SObjectType sot, Datetime since) {
        List<Event> rows = (sot == Account.SObjectType)
            ? [SELECT Id, Subject, Description, StartDateTime, Location, Owner.Name
               FROM Event
               WHERE WhatId = :recordId AND StartDateTime >= :since
               ORDER BY StartDateTime DESC
               LIMIT :PER_SOURCE_LIMIT]
            : [SELECT Id, Subject, Description, StartDateTime, Location, Owner.Name
               FROM Event
               WHERE WhoId = :recordId AND StartDateTime >= :since
               ORDER BY StartDateTime DESC
               LIMIT :PER_SOURCE_LIMIT];

        List<TimelineEvent> out = new List<TimelineEvent>();
        for (Event evt : rows) {
            TimelineEvent t = new TimelineEvent();
            t.id          = evt.Id;
            t.source      = 'event';
            t.sourceLabel = 'Event';
            t.iconName    = 'standard:event';
            t.iconColor   = '#c97a00';
            t.occurredAt  = evt.StartDateTime;
            t.title       = String.isBlank(evt.Subject) ? '(no subject)' : evt.Subject;
            // Subtitle: prefer Location; fall back to truncated Description; else 'Event'.
            String subtitle = 'Event';
            if (String.isNotBlank(evt.Location)) {
                subtitle = evt.Location;
            } else if (String.isNotBlank(evt.Description)) {
                subtitle = evt.Description.length() > 80
                    ? evt.Description.substring(0, 80) + '...'
                    : evt.Description;
            }
            t.subtitle    = subtitle;
            t.recordUrl   = '/lightning/r/Event/' + evt.Id + '/view';
            t.details     = new List<DetailField>{
                new DetailField('Owner', (evt.Owner != null) ? evt.Owner.Name : 'Unassigned')
            };
            if (String.isNotBlank(evt.Location)) {
                t.details.add(new DetailField('Location', evt.Location));
            }
            out.add(t);
        }
        return out;
    }

    private static List<TimelineEvent> queryVoiceCalls(Id recordId, Schema.SObjectType sot, Datetime since) {
        // VoiceCall only exists in orgs with Service Cloud Voice provisioned.
        // Silently return empty if absent so admins can leave 'Show Voice' on
        // without breaking the timeline.
        if (!Schema.getGlobalDescribe().containsKey('VoiceCall')) {
            return new List<TimelineEvent>();
        }

        // Use Database.query so this method compiles in orgs without VoiceCall
        // (a static SOQL would fail Apex compilation there).
        String soql =
            'SELECT Id, CallStartDateTime, CallType, EndingDispositionName, ' +
                'TalkDurationInSeconds, RelatedRecordId ' +
            'FROM VoiceCall ' +
            'WHERE RelatedRecordId = :recordId AND CallStartDateTime >= :since ' +
            'ORDER BY CallStartDateTime DESC ' +
            'LIMIT ' + PER_SOURCE_LIMIT;
        List<SObject> rows = Database.query(soql);

        List<TimelineEvent> out = new List<TimelineEvent>();
        for (SObject row : rows) {
            TimelineEvent t = new TimelineEvent();
            t.id          = (String) row.get('Id');
            t.source      = 'voice';
            t.sourceLabel = 'Voice';
            t.iconName    = 'standard:live_chat';
            t.iconColor   = '#0176d3';
            t.occurredAt  = (Datetime) row.get('CallStartDateTime');
            String direction = (String) row.get('CallType');
            Integer durationSec = (Integer) row.get('TalkDurationInSeconds');
            String durationLabel = (durationSec == null)
                ? '?'
                : (durationSec / 60) + 'm ' + Math.mod(durationSec, 60) + 's';
            t.title       = (String.isBlank(direction) ? 'Call' : direction) + ' on ' + durationLabel;
            String dispo = (String) row.get('EndingDispositionName');
            t.subtitle    = String.isBlank(dispo)
                ? 'Agentforce Voice'
                : 'Agentforce Voice on ' + dispo;
            t.recordUrl   = '/lightning/r/VoiceCall/' + t.id + '/view';
            t.details     = new List<DetailField>{
                new DetailField('Direction', direction),
                new DetailField('Duration', durationLabel),
                new DetailField('Disposition', dispo)
            };
            out.add(t);
        }
        return out;
    }
```

- [ ] **Step 2: Add Events test**

Append inside `CrmTimelineControllerTest`:

```apex
    @IsTest
    static void eventsHappyPathReturnsTimelineEvents() {
        Account a = [SELECT Id FROM Account LIMIT 1];

        Event meeting = new Event(
            Subject = 'Quarterly review',
            StartDateTime = Datetime.now().addDays(-1),
            DurationInMinutes = 30,
            Location = 'HQ Conference Room',
            WhatId = a.Id
        );
        insert meeting;

        Test.startTest();
        List<CrmTimelineController.TimelineEvent> result =
            CrmTimelineController.getCrmTimelineEvents(a.Id, new List<String>{ 'event' }, 90);
        Test.stopTest();

        System.assertEquals(1, result.size());
        CrmTimelineController.TimelineEvent t = result[0];
        System.assertEquals('event', t.source);
        System.assertEquals('standard:event', t.iconName);
        System.assertEquals('Quarterly review', t.title);
        System.assertEquals('HQ Conference Room', t.subtitle,
            'Location should be the subtitle when present.');
        System.assert(t.recordUrl.startsWith('/lightning/r/Event/'));
    }
```

- [ ] **Step 3: Add VoiceCall absent test**

We can't insert `VoiceCall` records in tests across all orgs (Service Cloud Voice may or may not be provisioned). The portable test verifies that asking for `voice` doesn't throw — it either returns events (Voice provisioned, none exist for this Account) or returns empty (Voice absent). Either way the test passes.

Append inside `CrmTimelineControllerTest`:

```apex
    @IsTest
    static void voiceCallSourceDoesNotThrowEvenWhenAbsent() {
        Account a = [SELECT Id FROM Account LIMIT 1];

        Test.startTest();
        List<CrmTimelineController.TimelineEvent> result =
            CrmTimelineController.getCrmTimelineEvents(a.Id, new List<String>{ 'voice' }, 90);
        Test.stopTest();

        // Either Voice isn't provisioned (Schema.getGlobalDescribe lookup fails)
        // and we get [] silently, or it is provisioned and there are no calls
        // for this fresh Test Account. Both paths return empty without throwing.
        System.assertNotEquals(null, result);
        System.assertEquals(0, result.size(),
            'Fresh Test Account should have no VoiceCall records (or Voice is absent).');
    }
```

- [ ] **Step 4: Add a multi-source sort test**

Append inside `CrmTimelineControllerTest`:

```apex
    @IsTest
    static void multiSourceMergedAndSortedDesc() {
        Account a = [SELECT Id FROM Account LIMIT 1];

        // Insert a Case (CreatedDate is system-set to now), a Task with ActivityDate
        // 5 days ago, and an Event 2 days ago. Result should be sorted DESC by
        // occurredAt: case (newest), event (-2d), task (-5d).
        Case c = new Case(Subject = 'Newest', Status = 'New', AccountId = a.Id);
        insert c;
        Task task = new Task(
            Subject = 'Older Task',
            Type = 'Email',
            ActivityDate = Date.today().addDays(-5),
            WhatId = a.Id
        );
        insert task;
        Event evt = new Event(
            Subject = 'Middle Event',
            StartDateTime = Datetime.now().addDays(-2),
            DurationInMinutes = 30,
            WhatId = a.Id
        );
        insert evt;

        Test.startTest();
        List<CrmTimelineController.TimelineEvent> result =
            CrmTimelineController.getCrmTimelineEvents(
                a.Id,
                new List<String>{ 'case', 'task', 'event' },
                90
            );
        Test.stopTest();

        System.assertEquals(3, result.size());
        // Order: Case (most recent CreatedDate), Event (-2d), Task (-5d).
        System.assertEquals('case',  result[0].source);
        System.assertEquals('event', result[1].source);
        System.assertEquals('task',  result[2].source);
    }
```

- [ ] **Step 5: Deploy + run all tests**

```bash
cd Web_Engagements_RT_Timeline
sf project deploy start --source-dir force-app/main/default/classes --tests CrmTimelineControllerTest --wait 20
```

Expected: `Tests · 9`, `Pass Rate · 100%`.

- [ ] **Step 6: Commit**

```bash
cd ..
git add Web_Engagements_RT_Timeline/force-app/main/default/classes/CrmTimelineController.cls Web_Engagements_RT_Timeline/force-app/main/default/classes/CrmTimelineControllerTest.cls
git commit -m "feat(web-engagements): add Events + VoiceCall sources to CrmTimelineController

queryEvents maps Salesforce Calendar Events. Subtitle prefers Location,
falls back to truncated Description, else 'Event'.

queryVoiceCalls is gated on Schema.getGlobalDescribe.containsKey('VoiceCall')
and uses Database.query to avoid compile-time dependency on Service Cloud
Voice. In orgs without Voice, the source silently returns empty so admins
can leave 'Show Voice' enabled without breaking the timeline.

New tests: events happy path, voice-absent-no-throw, three-source merged
DESC sort.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Add a `lookbackDays` clamping test

This is the last Apex test before moving to LWC. Validates the `Math.min(lookbackDays, MAX_LOOKBACK_DAYS)` clamp + the null/<1 fallback.

**Files:**
- Modify: `Web_Engagements_RT_Timeline/force-app/main/default/classes/CrmTimelineControllerTest.cls`

- [ ] **Step 1: Add the test**

Append inside `CrmTimelineControllerTest`:

```apex
    @IsTest
    static void lookbackDaysClampingBehavior() {
        Account a = [SELECT Id FROM Account LIMIT 1];
        // Insert a Case 200 days ago (within MAX_LOOKBACK_DAYS=365 but outside
        // any caller's request below 200).
        Case c = new Case(Subject = 'Old', Status = 'New', AccountId = a.Id);
        insert c;
        // Backdate CreatedDate via Test.setCreatedDate for assertion accuracy.
        Test.setCreatedDate(c.Id, Datetime.now().addDays(-200));

        Test.startTest();
        // Within window: 250 days lookback should include the 200-day-old case.
        List<CrmTimelineController.TimelineEvent> within =
            CrmTimelineController.getCrmTimelineEvents(a.Id, new List<String>{ 'case' }, 250);
        // Outside window: 100 days lookback should exclude it.
        List<CrmTimelineController.TimelineEvent> outside =
            CrmTimelineController.getCrmTimelineEvents(a.Id, new List<String>{ 'case' }, 100);
        // Null defaults to 90 days, also excluded.
        List<CrmTimelineController.TimelineEvent> nullDays =
            CrmTimelineController.getCrmTimelineEvents(a.Id, new List<String>{ 'case' }, null);
        // Negative also defaults to 90, excluded.
        List<CrmTimelineController.TimelineEvent> negativeDays =
            CrmTimelineController.getCrmTimelineEvents(a.Id, new List<String>{ 'case' }, -5);
        // Wildly large clamps to MAX_LOOKBACK_DAYS=365, still includes 200-day case.
        List<CrmTimelineController.TimelineEvent> huge =
            CrmTimelineController.getCrmTimelineEvents(a.Id, new List<String>{ 'case' }, 99999);
        Test.stopTest();

        System.assertEquals(1, within.size(),       '250-day lookback should include 200-day-old case.');
        System.assertEquals(0, outside.size(),      '100-day lookback should exclude 200-day-old case.');
        System.assertEquals(0, nullDays.size(),     'null lookbackDays should default to 90 (excluded).');
        System.assertEquals(0, negativeDays.size(), 'negative lookbackDays should default to 90 (excluded).');
        System.assertEquals(1, huge.size(),         'huge lookbackDays should clamp to 365 (included).');
    }
```

- [ ] **Step 2: Run + commit**

```bash
cd Web_Engagements_RT_Timeline
sf apex run test --tests CrmTimelineControllerTest.lookbackDaysClampingBehavior --result-format human --wait 15 --synchronous
cd ..
git add Web_Engagements_RT_Timeline/force-app/main/default/classes/CrmTimelineControllerTest.cls
git commit -m "test(web-engagements): cover lookbackDays clamping in CrmTimelineController

Five-arm test exercises: within-window, outside-window, null fallback,
negative fallback, and huge clamp-to-365. Uses Test.setCreatedDate to
backdate a Case to 200 days ago.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Add the 5 new App Builder properties to LWC meta-XML

**Files:**
- Modify: `Web_Engagements_RT_Timeline/force-app/main/default/lwc/webEngagementData/webEngagementData.js-meta.xml`

- [ ] **Step 1: Add the 5 properties**

Find the closing `</targetConfig>` tag inside `<targetConfigs>`. Insert these 5 new `<property>` elements IMMEDIATELY BEFORE that closing tag (after the last existing property `autoSize`):

```xml
            <property
                name="showCases"
                label="Show Case events"
                type="Boolean"
                default="false"
                description="Include Case records (created in the lookback window) on the timeline."/>
            <property
                name="showTasks"
                label="Show Task events (incl. logged calls)"
                type="Boolean"
                default="false"
                description="Include Task records on the timeline. Logged calls (Task with CallType set) get a distinct icon."/>
            <property
                name="showEvents"
                label="Show Event records (calendar)"
                type="Boolean"
                default="false"
                description="Include Salesforce Calendar Event records on the timeline."/>
            <property
                name="showVoiceCalls"
                label="Show Agentforce Voice calls"
                type="Boolean"
                default="false"
                description="Include VoiceCall records (Service Cloud Voice). Silently skipped if Voice isn't provisioned."/>
            <property
                name="lookbackDays"
                label="CRM lookback (days)"
                type="Integer"
                default="90"
                description="How far back to query CRM events. Max 365; values out of range fall back to 90."/>
```

- [ ] **Step 2: Validate**

```bash
cd Web_Engagements_RT_Timeline
sf project deploy validate --source-dir force-app/main/default/lwc --wait 10
```

Expected: `Validation succeeded`.

- [ ] **Step 3: Commit**

```bash
cd ..
git add Web_Engagements_RT_Timeline/force-app/main/default/lwc/webEngagementData/webEngagementData.js-meta.xml
git commit -m "feat(web-engagements): add 5 App Builder properties for CRM sources

showCases, showTasks, showEvents, showVoiceCalls (Boolean, default false)
plus lookbackDays (Integer, default 90, max 365). Defaults preserve
today's behavior (admin must opt in to each CRM source).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Wire CRM properties into webEngagementData.js + Promise B

The big LWC class change. Adds `@api` declarations, `crmEvents` state, `loadCrmEvents()` method, partial-failure tracking, chip-bar state, and several getters that the Style B template will consume.

**Files:**
- Modify: `Web_Engagements_RT_Timeline/force-app/main/default/lwc/webEngagementData/webEngagementData.js`

- [ ] **Step 1: Add the Apex import + helper imports**

At the top of the file, find:

```javascript
import { LightningElement, api } from 'lwc';
import getWebEngagementData from '@salesforce/apex/DataCloudWebEngagementController.getWebEngagementData';
import { parseDataGraphResponse } from './timelineMappers';
```

Replace with:

```javascript
import { LightningElement, api } from 'lwc';
import getWebEngagementData from '@salesforce/apex/DataCloudWebEngagementController.getWebEngagementData';
import getCrmTimelineEvents from '@salesforce/apex/CrmTimelineController.getCrmTimelineEvents';
import { parseDataGraphResponse, mergeAndSort, groupByDay } from './timelineMappers';
import { SOURCE_CONFIG, SOURCE_ORDER } from './sourceConfig';
```

- [ ] **Step 2: Add the 5 new `@api` properties**

Find the existing `@api autoSize = false;` line. Append IMMEDIATELY AFTER it:

```javascript
    @api showCases = false;
    @api showTasks = false;
    @api showEvents = false;
    @api showVoiceCalls = false;
    @api lookbackDays = 90;
```

- [ ] **Step 3: Replace component state**

Find:

```javascript
    webEvents = [];

    isLoading = false;
    hasError = false;
    errorMessage = '';
```

Replace with:

```javascript
    webEvents = [];
    crmEvents = [];

    loadingWeb = false;
    loadingCrm = false;
    webError = null;
    crmError = null;

    // Set of source keys whose chips are currently active (visible). Initialized
    // lazily on first render to all available sources so the chip bar shows
    // 'All' selected by default.
    activeSourceFilters = new Set();
    // Set of event ids currently expanded in the card stream.
    expandedIds = new Set();
```

- [ ] **Step 4: Update `connectedCallback` to fire both promises**

Find:

```javascript
    connectedCallback() {
        this.handleRefresh();
    }
```

(It's likely a single line — keep it. The body change is in `handleRefresh`.)

Find `handleRefresh()` and replace its entire body:

```javascript
    handleRefresh() {
        this.loadWebEngagements();
        this.loadCrmEvents();
    }

    async loadWebEngagements() {
        this.loadingWeb = true;
        this.webError = null;
        try {
            const raw = await getWebEngagementData({
                accountId: this.recordId,
                dataGraphName: this.dcDataGraphName
            });
            this.webEvents = parseDataGraphResponse(raw);
        } catch (e) {
            console.error('Web engagements load failed:', e);
            this.webError = "Couldn't load web engagements.";
        } finally {
            this.loadingWeb = false;
        }
    }

    async loadCrmEvents() {
        const enabled = this.enabledCrmSources;
        if (enabled.length === 0) {
            this.crmEvents = [];
            return;
        }
        this.loadingCrm = true;
        this.crmError = null;
        try {
            const events = await getCrmTimelineEvents({
                recordId: this.recordId,
                enabledSources: enabled,
                lookbackDays: this.lookbackDays
            });
            this.crmEvents = events || [];
        } catch (e) {
            console.error('CRM events load failed:', e);
            this.crmError = "Couldn't load CRM activity.";
        } finally {
            this.loadingCrm = false;
        }
    }
```

- [ ] **Step 5: Replace getters**

Find and DELETE the existing `get hasInteractions()` getter (it's superseded).

Find and KEEP `get feedStyle()` and `get headerTitleIsLink()` (Plan 2's getters — they still apply).

Append new getters AFTER `feedStyle` / `headerTitleIsLink`:

```javascript

    /**
     * The list of source keys currently enabled by App Builder properties.
     * Web is always enabled (the component's primary purpose).
     */
    get enabledCrmSources() {
        const out = [];
        if (this.showCases)      out.push('case');
        if (this.showTasks)      out.push('task');
        if (this.showEvents)     out.push('event');
        if (this.showVoiceCalls) out.push('voice');
        return out;
    }

    /**
     * Merged + sorted timeline events with cssClass and leftRailStyle attached.
     */
    get mergedEvents() {
        const merged = mergeAndSort(this.webEvents, this.crmEvents);
        // Annotate each with current expansion state. Re-create the array
        // (don't mutate) so reactivity fires.
        return merged.map(evt => ({
            ...evt,
            isExpanded: this.expandedIds.has(evt.id)
        }));
    }

    /**
     * Source to count of events in the merged set. Drives chip counts.
     */
    get sourceCounts() {
        const counts = {};
        for (const evt of this.mergedEvents) {
            counts[evt.source] = (counts[evt.source] || 0) + 1;
        }
        return counts;
    }

    /**
     * Chip definitions for the chip bar. Only sources with at least one event
     * get a chip; the 'All' chip is always shown.
     */
    get availableChips() {
        const counts = this.sourceCounts;
        const chips = [];

        // 'All' chip — toggles visibility for every present source.
        const total = this.mergedEvents.length;
        const allActive = SOURCE_ORDER.every(s =>
            counts[s] === undefined || this.activeSourceFilters.has(s)
        );
        chips.push({
            source: '__all__',
            label: 'All',
            count: total,
            cssClass: 'chip ' + (allActive ? 'chip-on' : '')
        });

        for (const s of SOURCE_ORDER) {
            if (!counts[s]) continue;
            const cfg = SOURCE_CONFIG[s];
            chips.push({
                source: s,
                label: cfg.chipLabel,
                count: counts[s],
                cssClass: 'chip ' + (this.activeSourceFilters.has(s) ? 'chip-on' : '')
            });
        }
        return chips;
    }

    /**
     * Filtered + day-grouped events for rendering. If activeSourceFilters is empty,
     * everything is visible (filters are interpreted as inclusive — empty means no
     * exclusions yet). On first render we populate filters with all available
     * sources so the 'All' chip starts active.
     */
    get groupedByDay() {
        // Lazy-init filters on first read.
        if (this.activeSourceFilters.size === 0 && this.mergedEvents.length > 0) {
            for (const s of SOURCE_ORDER) {
                if (this.sourceCounts[s]) this.activeSourceFilters.add(s);
            }
        }
        const filtered = this.mergedEvents.filter(e =>
            this.activeSourceFilters.size === 0 || this.activeSourceFilters.has(e.source)
        );
        return groupByDay(filtered);
    }

    get hasAnyEvents() {
        return this.mergedEvents.length > 0;
    }

    /**
     * True when Data Graph rows have rendered but CRM is still pending.
     * Drives the inline 'Loading CRM activity' chip below the feed.
     */
    get isCrmLoadingChip() {
        return this.loadingCrm && !this.loadingWeb;
    }

    get isInitialLoading() {
        return this.loadingWeb && this.webEvents.length === 0;
    }

    /**
     * True when both Promise A and Promise B have completed and zero events
     * came back. Drives the empty-state message.
     */
    get isFullyLoadedAndEmpty() {
        return !this.loadingWeb && !this.loadingCrm && !this.hasAnyEvents;
    }
```

- [ ] **Step 6: Update `handleToggle` to use `expandedIds`**

The existing `handleToggle` method still references `webInteractions`. Replace its entire body:

```javascript
    handleToggle(event) {
        const itemId = event.currentTarget.dataset.id;
        if (this.expandedIds.has(itemId)) {
            this.expandedIds.delete(itemId);
        } else {
            this.expandedIds.add(itemId);
        }
        // Force reactive recompute of mergedEvents-derived getters.
        this.expandedIds = new Set(this.expandedIds);
    }
```

- [ ] **Step 7: Add chip click handler + retry handlers**

Append BEFORE the closing `}` of the class:

```javascript

    handleChipToggle(event) {
        const source = event.currentTarget.dataset.source;
        if (source === '__all__') {
            // 'All' toggles between everything-active and nothing-active.
            const counts = this.sourceCounts;
            const allActive = SOURCE_ORDER.every(s =>
                counts[s] === undefined || this.activeSourceFilters.has(s)
            );
            if (allActive) {
                this.activeSourceFilters = new Set();
            } else {
                this.activeSourceFilters = new Set(SOURCE_ORDER.filter(s => counts[s]));
            }
            return;
        }
        const next = new Set(this.activeSourceFilters);
        if (next.has(source)) next.delete(source);
        else next.add(source);
        this.activeSourceFilters = next;
    }

    handleRetryWeb()  { this.loadWebEngagements(); }
    handleRetryCrm()  { this.loadCrmEvents(); }
```

- [ ] **Step 8: Validate + run Jest**

```bash
cd Web_Engagements_RT_Timeline
sf project deploy validate --source-dir force-app/main/default/lwc --wait 10
npm test
```

Expected: validate succeeds, **24/24 Jest tests still pass** (the existing component tests don't touch the new getters, and `feedStyle` / `headerTitleIsLink` are unchanged).

If Jest fails on the existing tests, the most likely cause is a syntax error from missing braces. Re-read the whole file.

If the existing `feedStyle` / `headerTitleIsLink` tests fail with `Cannot read properties of undefined`, the new component state changes broke their setup. STOP and report.

- [ ] **Step 9: Commit**

```bash
cd ..
git add Web_Engagements_RT_Timeline/force-app/main/default/lwc/webEngagementData/webEngagementData.js
git commit -m "feat(web-engagements): wire CRM sources + chip filters + partial-failure UI

- 5 new @api props (showCases/Tasks/Events/VoiceCalls, lookbackDays)
- Promise A (web) and Promise B (CRM) fire in parallel from handleRefresh
- New state: crmEvents, loadingCrm, webError, crmError, activeSourceFilters,
  expandedIds (Set-based for O(1) lookups)
- New getters: enabledCrmSources, mergedEvents, sourceCounts, availableChips,
  groupedByDay (filter + group), hasAnyEvents, isCrmLoadingChip,
  isInitialLoading, isFullyLoadedAndEmpty
- Chip-toggle handler ('All' toggle + per-source toggle)
- Retry handlers for partial-failure UI

Removed the old hasInteractions getter (replaced by hasAnyEvents).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: Replace the LWC template with Style B card stream

The biggest single template change in Plan 3. Swaps the slds-timeline `<ul>` for a chip bar + day-grouped card stream + partial-failure inline warnings.

**Files:**
- Modify: `Web_Engagements_RT_Timeline/force-app/main/default/lwc/webEngagementData/webEngagementData.html`

- [ ] **Step 1: Read the current template**

Confirm it has:
- Lines 1-15: `<lightning-card>` + `<h3 slot="title">` with the `lwc:if={headerTitleIsLink}` branching (Plan 2)
- Lines 17-19: refresh button in `slot="actions"`
- Line 21: `<div class="slds-p-around_medium engagement-feed" style={feedStyle}>`
- Line 23+: `<template if:true={isLoading}>` spinner
- Mid-file: `<template if:true={hasError}>` error banner
- Mid-file: the `<template if:false={isLoading}>` block with the slds-timeline `<ul>`

- [ ] **Step 2: Replace the entire feed-area body**

Find the line:

```html
        <div class="slds-p-around_medium engagement-feed" style={feedStyle}>
```

…and replace EVERYTHING from that line through the closing `</div>` of the engagement-feed div (just before `</lightning-card>`) with:

```html
        <!-- Chip bar — only renders when at least one source has events -->
        <template lwc:if={hasAnyEvents}>
            <div class="slds-p-horizontal_medium slds-p-top_x-small chip-bar">
                <template for:each={availableChips} for:item="chip">
                    <button key={chip.source}
                            class={chip.cssClass}
                            data-source={chip.source}
                            type="button"
                            onclick={handleChipToggle}>
                        {chip.label}
                        <span class="chip-count">{chip.count}</span>
                    </button>
                </template>
            </div>
        </template>

        <!-- Partial-failure: web failed -->
        <template lwc:if={webError}>
            <div class="slds-p-horizontal_medium slds-p-top_x-small">
                <div class="slds-notify slds-notify_alert slds-alert_warning" role="alert">
                    <span class="slds-text-body_small">{webError}</span>
                    <button class="slds-button slds-button_neutral slds-m-left_small"
                            type="button"
                            onclick={handleRetryWeb}>Retry</button>
                </div>
            </div>
        </template>

        <!-- Partial-failure: CRM failed -->
        <template lwc:if={crmError}>
            <div class="slds-p-horizontal_medium slds-p-top_x-small">
                <div class="slds-notify slds-notify_alert slds-alert_warning" role="alert">
                    <span class="slds-text-body_small">{crmError}</span>
                    <button class="slds-button slds-button_neutral slds-m-left_small"
                            type="button"
                            onclick={handleRetryCrm}>Retry</button>
                </div>
            </div>
        </template>

        <!-- Day-grouped card stream -->
        <div class="slds-p-around_medium engagement-feed" style={feedStyle}>

            <!-- Initial-load spinner: only when web hasn't returned yet AND no events visible -->
            <template lwc:if={isInitialLoading}>
                <div class="slds-p-around_large slds-is-relative" style="min-height: 4rem;">
                    <lightning-spinner alternative-text="Loading" size="medium"></lightning-spinner>
                </div>
            </template>

            <template lwc:if={hasAnyEvents}>
                <template for:each={groupedByDay} for:item="day">
                    <div key={day.dayKey} class="day-group">
                        <div class="day-header">{day.dayLabel}</div>
                        <template for:each={day.events} for:item="event">
                            <article key={event.id}
                                     class={event.cssClass}
                                     style={event.leftRailStyle}>
                                <div class="stream-head">
                                    <div class="stream-title">
                                        <lightning-icon icon-name={event.iconName}
                                                        size="x-small"
                                                        class="stream-icon">
                                        </lightning-icon>
                                        <span class="stream-title-text">{event.title}</span>
                                        <span class="stream-source-tag">{event.sourceLabel}</span>
                                    </div>
                                    <div class="stream-meta">
                                        <lightning-formatted-date-time
                                            value={event.occurredAt}
                                            year="numeric"
                                            month="numeric"
                                            day="numeric"
                                            hour="2-digit"
                                            minute="2-digit">
                                        </lightning-formatted-date-time>
                                    </div>
                                </div>
                                <p class="stream-sub">{event.subtitle}</p>
                                <div class="stream-actions">
                                    <button class="slds-button slds-button_neutral slds-button_small"
                                            type="button"
                                            data-id={event.id}
                                            onclick={handleToggle}>Details</button>
                                    <template lwc:if={event.recordUrl}>
                                        <a class="slds-button slds-button_neutral slds-button_small slds-m-left_x-small"
                                           href={event.recordUrl}>Open</a>
                                    </template>
                                </div>
                                <template lwc:if={event.isExpanded}>
                                    <div class="stream-details">
                                        <template for:each={event.details} for:item="detail">
                                            <div key={detail.label} class="stream-detail-row">
                                                <span class="stream-detail-label">{detail.label}</span>
                                                <span class="stream-detail-value">{detail.value}</span>
                                            </div>
                                        </template>
                                        <div class="stream-detail-row stream-detail-id">
                                            <span class="stream-detail-label">System ID</span>
                                            <span class="stream-detail-value">{event.id}</span>
                                        </div>
                                    </div>
                                </template>
                            </article>
                        </template>
                    </div>
                </template>
            </template>

            <!-- Empty state: web finished, CRM either disabled or finished, no events -->
            <template lwc:if={isFullyLoadedAndEmpty}>
                <div class="slds-text-align_center slds-text-color_weak slds-p-top_medium">
                    No recent engagements found.
                </div>
            </template>

            <!-- CRM loading chip: web rendered, CRM still pending -->
            <template lwc:if={isCrmLoadingChip}>
                <div class="slds-text-align_center slds-text-color_weak slds-p-vertical_x-small crm-loading-chip">
                    Loading CRM activity...
                </div>
            </template>
        </div>
```

> **Note:** the title block (lines 4-15 with `<h3 slot="title">` + `lwc:if={headerTitleIsLink}`) and the refresh button slot (lines 17-19) are NOT modified. The replacement starts at line 21.

- [ ] **Step 3: Validate + run Jest**

```bash
cd Web_Engagements_RT_Timeline
sf project deploy validate --source-dir force-app/main/default/lwc --wait 10
npm test
```

Expected: validate succeeds, 24/24 Jest tests pass.

If Jest fails because the existing `headerTitleIsLink` tests no longer find an `<a>` or `<span>`, the title block in the template MUST still be present. Confirm the title block (lines 4-15) is intact.

- [ ] **Step 4: Commit**

```bash
cd ..
git add Web_Engagements_RT_Timeline/force-app/main/default/lwc/webEngagementData/webEngagementData.html
git commit -m "feat(web-engagements): swap slds-timeline for Style B card stream

Template now renders:
- Chip bar at top (only when there are events)
- Inline warning banners for partial web/CRM failures with Retry buttons
- Day-grouped card stream: source-colored left rail, source tag, formatted
  date, Details + Open buttons per event, expandable detail panel
- Empty state when both promises finished with zero events
- 'Loading CRM activity' chip when web rendered but CRM still pending

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: Add CSS for Style B chip bar + cards + day headers + detail panel

**Files:**
- Modify: `Web_Engagements_RT_Timeline/force-app/main/default/lwc/webEngagementData/webEngagementData.css`

- [ ] **Step 1: Append the new rules**

The existing CSS has `.engagement-feed`, `.engagement-details-box`, and `.slds-timeline__item_expandable:hover`. The third rule no longer applies (no slds-timeline). Then APPEND the Style B rules.

Find:

```css
/* Optional: Add a subtle hover effect to the timeline items */
.slds-timeline__item_expandable:hover {
    background-color: var(--slds-g-color-neutral-base-95, #f3f2f2);
}
```

Replace with (delete the slds-timeline hover rule, append all the Style B rules):

```css

/* ---------- Style B card stream ---------- */

.chip-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
}

.chip {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 12px;
    background: var(--slds-g-color-neutral-base-95, #f3f3f3);
    color: var(--slds-g-color-neutral-base-30, #444);
    border: 1px solid var(--slds-g-color-border-base-4, #e0e0e0);
    cursor: pointer;
    transition: background 120ms ease;
}

.chip:hover {
    background: var(--slds-g-color-neutral-base-90, #ebebeb);
}

.chip.chip-on {
    background: var(--slds-g-color-accent-1, #0176d3);
    color: var(--slds-g-color-neutral-base-100, #fff);
    border-color: var(--slds-g-color-accent-1, #0176d3);
}

.chip-count {
    margin-left: 4px;
    font-weight: 500;
    opacity: 0.85;
}

.day-group {
    margin-top: 12px;
}

.day-header {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: var(--slds-g-color-brand-base-50, #032d60);
    font-weight: 600;
    padding: 4px 0 6px 0;
    border-bottom: 1px solid var(--slds-g-color-border-base-4, #e5e5e5);
    margin-bottom: 6px;
}

.stream-card {
    background: var(--slds-g-color-neutral-base-100, #fafafa);
    border-left: 3px solid var(--slds-g-color-border-base-4, #ddd);
    border-radius: 0 4px 4px 0;
    padding: 8px 10px;
    margin-bottom: 6px;
}

.stream-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
}

.stream-title {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;
}

.stream-icon {
    flex-shrink: 0;
}

.stream-title-text {
    font-weight: 600;
    color: var(--slds-g-color-neutral-base-15, #181818);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.stream-source-tag {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--slds-g-color-neutral-base-50, #747474);
    flex-shrink: 0;
}

.stream-meta {
    color: var(--slds-g-color-neutral-base-50, #747474);
    font-size: 11px;
    white-space: nowrap;
    flex-shrink: 0;
}

.stream-sub {
    color: var(--slds-g-color-neutral-base-30, #444);
    font-size: 12px;
    margin: 4px 0 0 0;
}

.stream-actions {
    margin-top: 6px;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
}

.crm-loading-chip {
    font-size: 11px;
    font-style: italic;
}

.stream-details {
    margin-top: 8px;
    padding-top: 6px;
    border-top: 1px solid var(--slds-g-color-border-base-4, #e5e5e5);
    display: grid;
    grid-template-columns: minmax(120px, max-content) 1fr;
    gap: 4px 12px;
    font-size: 12px;
}

.stream-detail-row {
    display: contents;
}

.stream-detail-label {
    color: var(--slds-g-color-neutral-base-50, #747474);
    font-weight: 500;
}

.stream-detail-value {
    color: var(--slds-g-color-neutral-base-30, #181818);
    word-break: break-word;
}

.stream-detail-id .stream-detail-value {
    color: var(--slds-g-color-neutral-base-50, #747474);
    font-family: monospace;
    font-size: 11px;
}
```

The `.engagement-feed` and `.engagement-details-box` rules at the top of the file stay unchanged.

- [ ] **Step 2: Validate**

```bash
cd Web_Engagements_RT_Timeline
sf project deploy validate --source-dir force-app/main/default/lwc --wait 10
```

Expected: `Validation succeeded`. The sf-lwc validator (the post-tool hook) may report SLDS-2 score. As long as deploy validate passes, ignore lint suggestions about `var(--slds-...)` — we already use SLDS hooks throughout.

- [ ] **Step 3: Commit**

```bash
cd ..
git add Web_Engagements_RT_Timeline/force-app/main/default/lwc/webEngagementData/webEngagementData.css
git commit -m "style(web-engagements): add Style B card-stream CSS

Adds chip bar, day-header, stream-card, stream-head/title/sub/meta,
stream-actions, crm-loading-chip, and stream-details (with display:
contents grid pattern for label/value alignment) rules. All use
SLDS-2 design tokens with sensible fallbacks. Removes the now-unused
.slds-timeline__item_expandable:hover rule.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 16: Add Jest tests for chip bar + day grouping integration

**Files:**
- Modify: `Web_Engagements_RT_Timeline/force-app/main/default/lwc/webEngagementData/__tests__/webEngagementData.test.js`

- [ ] **Step 1: Append a new `describe` block at the end**

Append (before the closing `});` of the outer describe):

```javascript

    describe('chip bar (rendered via availableChips getter)', () => {
        // The component fires Apex on connectedCallback. To unit-test the chip
        // bar without that real call, we set webEvents directly via Object.assign
        // and rely on the post-Apex code path (parseDataGraphResponse already
        // tested in timelineMappers.test.js).
        async function buildElementWithEvents(webEvents = [], crmEvents = []) {
            const el = createElement('c-web-engagement-data', { is: WebEngagementData });
            el.recordId = '001000000000001AAA';
            // The component will call the Apex import on connectedCallback.
            // Since '@salesforce/apex/...' is auto-mocked by sfdx-lwc-jest to
            // return undefined-resolving promises, the load methods catch and
            // log; the empty initial state remains, and we can then poke the
            // events directly to test rendering.
            document.body.appendChild(el);
            await Promise.resolve();
            await Promise.resolve();
            // Replace state so the chip-bar / merged getters see real data.
            el.webEvents = webEvents;
            el.crmEvents = crmEvents;
            // Force a re-render by setting a tracked-equivalent state.
            el.expandedIds = new Set();
            await Promise.resolve();
            return el;
        }

        const sample = (id, source, occurredAt, color) => ({
            id, source,
            sourceLabel: source[0].toUpperCase() + source.slice(1),
            iconName: 'standard:default',
            iconColor: color,
            occurredAt,
            title: id,
            subtitle: 'sub',
            recordUrl: null,
            details: []
        });

        it('renders an All chip plus one chip per source with events', async () => {
            const el = await buildElementWithEvents([
                sample('w1', 'web',  '2026-05-03T10:00:00Z', '#7f56d9'),
                sample('w2', 'web',  '2026-05-02T10:00:00Z', '#7f56d9')
            ], [
                sample('c1', 'case', '2026-05-04T10:00:00Z', '#c23934')
            ]);

            const chips = el.shadowRoot.querySelectorAll('.chip');
            expect(chips.length).toBe(3); // All + Web + Case
            const labels = [...chips].map(c => c.textContent.trim());
            expect(labels.some(l => l.startsWith('All'))).toBe(true);
            expect(labels.some(l => l.startsWith('Web'))).toBe(true);
            expect(labels.some(l => l.startsWith('Case'))).toBe(true);
        });

        it('does not render chips for sources with zero events', async () => {
            const el = await buildElementWithEvents([], [
                sample('c1', 'case', '2026-05-01T00:00:00Z', '#c23934')
            ]);
            const chips = el.shadowRoot.querySelectorAll('.chip');
            const labels = [...chips].map(c => c.textContent.trim());
            // No 'Web', no 'Task', no 'Event', no 'Voice' chips.
            expect(labels.some(l => l.startsWith('Task'))).toBe(false);
            expect(labels.some(l => l.startsWith('Event'))).toBe(false);
            expect(labels.some(l => l.startsWith('Voice'))).toBe(false);
        });

        it('renders day groups with the correct number of cards', async () => {
            const el = await buildElementWithEvents([
                sample('w1', 'web', '2026-05-03T10:00:00Z', '#7f56d9'),
                sample('w2', 'web', '2026-05-02T10:00:00Z', '#7f56d9'),
                sample('w3', 'web', '2026-05-02T08:00:00Z', '#7f56d9')
            ]);

            const dayGroups = el.shadowRoot.querySelectorAll('.day-group');
            expect(dayGroups.length).toBe(2);
            const cards = el.shadowRoot.querySelectorAll('.stream-card');
            expect(cards.length).toBe(3);
        });

        it('inline left-rail color is set per event', async () => {
            const el = await buildElementWithEvents([
                sample('w1', 'web',  '2026-05-03T10:00:00Z', '#7f56d9')
            ], [
                sample('c1', 'case', '2026-05-02T10:00:00Z', '#c23934')
            ]);

            const cards = el.shadowRoot.querySelectorAll('.stream-card');
            // Cards rendered DESC by date — w1 before c1.
            // jsdom normalizes hex to rgb; just confirm a non-empty value is set.
            expect(cards[0].style.borderLeftColor).not.toBe('');
            expect(cards[1].style.borderLeftColor).not.toBe('');
        });
    });
```

- [ ] **Step 2: Run Jest**

```bash
cd Web_Engagements_RT_Timeline
npm test
```

Expected: previous 24 + 4 new = **28/28**.

If a chip-count test fails because the All chip appears with count 0, the test setup didn't propagate state through to the getter. Re-check the `buildElementWithEvents` helper.

- [ ] **Step 3: Commit**

```bash
cd ..
git add Web_Engagements_RT_Timeline/force-app/main/default/lwc/webEngagementData/__tests__/webEngagementData.test.js
git commit -m "test(web-engagements): cover chip bar + day groups + left-rail color via DOM

Four new Jest tests:
- All + per-source chips render based on event presence
- Sources with zero events don't get chips
- Day-group count matches distinct days
- Inline left-rail color is applied per event

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 17: Live deploy + smoke test

**Files:** none modified

- [ ] **Step 1: Deploy with both Apex test classes**

```bash
cd Web_Engagements_RT_Timeline
sf project deploy start --source-dir force-app --tests DataCloudWebEngagementControllerTest --tests CrmTimelineControllerTest --wait 25
```

Expected:
- `Deploy Succeeded.`
- `Tests · 26` (17 from Plan 1+2 + 9 new from Plan 3)
- `Test Failures · 0`

> **Note:** `.forceignore` (added in Plan 2) excludes the LWC `__tests__/` from this deploy automatically.

- [ ] **Step 2: Confirm Jest still passes**

```bash
npm test
```

Expected: **28/28**.

- [ ] **Step 3: Manual App Builder smoke test (deferred to user)**

The plan engineer reports `App Builder smoke test deferred to human`. The user will:
1. Open an Account record page in App Builder
2. Drop the `Real Time Digital Engagements` component
3. Confirm 10 properties visible (5 from Plan 2 + 5 from Plan 3)
4. Toggle on `Show Cases`, save, reload the record page, confirm cases appear interleaved with web engagements
5. Toggle filter chips and confirm they hide/show events without re-fetching
6. Click `Details` on a card and confirm the expanded panel renders

- [ ] **Step 4: No commit needed**

---

## Task 18: Update README + artifacts.md

**Files:**
- Modify: `Web_Engagements_RT_Timeline/README.md`
- Modify: `Web_Engagements_RT_Timeline/artifacts.md`

- [ ] **Step 1: Extend the App Builder properties table in README**

Find the existing "App Builder properties" table (added in Plan 2). Add 5 new rows AFTER the existing 5:

```markdown
| **Show Case events** | _off_ | Include Case records (created in the lookback window) on the timeline. |
| **Show Task events (incl. logged calls)** | _off_ | Include Task records on the timeline. Logged calls (Task with CallType set) get a distinct icon. |
| **Show Event records (calendar)** | _off_ | Include Salesforce Calendar Event records on the timeline. |
| **Show Agentforce Voice calls** | _off_ | Include VoiceCall records (Service Cloud Voice). Silently skipped if Voice isn't provisioned. |
| **CRM lookback (days)** | `90` | How far back to query CRM events. Max 365; values out of range fall back to 90. |
```

Update the descriptive paragraph below the table. Find:

```markdown
Defaults preserve the component's pre-Plan-2 behavior for 4 of 5 properties (Data Graph name, card title, feed height, auto-size). The exception is **Card title link URL**: pre-Plan-2 instances had a hardcoded link to a Cumulus Bank demo URL in the title; the new default is blank (plain text). Demo-org admins who want the original behavior should paste their landing-page URL into the Card title link URL property after deploy.
```

Replace with:

```markdown
Defaults preserve pre-revamp behavior except for **Card title link URL** (was hardcoded to a Cumulus Bank demo URL; now blank — paste a URL to restore the link) and the four **Show … events** toggles (default off, so no CRM events appear until an admin opts in).
```

- [ ] **Step 2: Add a "Multi-source timeline" section after the App Builder properties section**

Find the `---` separator after the App Builder properties section. Insert this new section between the App Builder section and the next one:

```markdown
## Multi-source timeline

When any of the four CRM source toggles are on, the component fires two Apex calls in parallel:

| Call | Apex method | Returns |
|---|---|---|
| **A — Web** (always) | `DataCloudWebEngagementController.getWebEngagementData` | Data Cloud Data Graph events |
| **B — CRM** (only when one or more sources on) | `CrmTimelineController.getCrmTimelineEvents` | Cases / Tasks / Events / VoiceCalls |

The Data Graph rows render the moment Call A resolves. CRM events stream in below when Call B finishes. Filter chips operate on already-loaded events with no Apex round-trip.

**Source colors / icons:**

| Source | Color | Default icon |
|---|---|---|
| Web | `#7f56d9` | `custom:custom68` |
| Case | `#c23934` | `standard:case` |
| Task | `#04844b` | `standard:task` (or `standard:log_a_call` for logged calls) |
| Event | `#c97a00` | `standard:event` |
| Voice | `#0176d3` | `standard:live_chat` |

**Partial-failure UX:** if Call A or Call B fails, the other still renders. An inline warning banner with a Retry button appears for the failed side; the working side keeps showing.

**Lookback:** all CRM sources share the `CRM lookback (days)` window (default 90). Per-source `LIMIT 200` keeps the SOQL inside governor headroom.

---
```

- [ ] **Step 3: Update Test coverage section**

Find the existing "Test coverage" section. Replace with:

```markdown
## Test coverage

| Class / spec | Tests | Coverage target |
|---|---|---|
| `DataCloudWebEngagementController` | 17 Apex (Plan 1+2) | ≥80% (achieves ~83%) |
| `CrmTimelineController` | 9 Apex (Plan 3) | ≥80% |
| `timelineMappers.js` | 18 Jest (parseDataGraphResponse + mergeAndSort + groupByDay) | ≥80% |
| `webEngagementData` LWC | 10 Jest (DOM-level) | smoke + regression |

Run all locally:

```bash
sf apex run test --class-names DataCloudWebEngagementControllerTest --class-names CrmTimelineControllerTest --result-format human --code-coverage --wait 15 --synchronous
npm test
```

The DataCloudWebEngagementController coverage ceiling (~83%) is by design: the `@TestVisible static String testMockUnifiedId` seam intentionally bypasses `getUnifiedId`'s body, leaving the SOQL build + `ConnectApi.QuerySqlInput` + `ConnectApi.CdpQuery.querySql` call structurally uncoverable in API 65.0. The JSON-parsing logic that follows is extracted into `extractUnifiedIdFromQueryOutput` and tested directly via 9 Jest-style branch tests.
```

- [ ] **Step 4: Update artifacts.md**

Find the existing "Apex" section in artifacts.md. Update it (or add a row if a table) to mention `CrmTimelineController` + `CrmTimelineControllerTest`.

Add or extend an "LWC helper modules" section:

```markdown
## LWC helper modules

| Path | Role |
|---|---|
| `lwc/webEngagementData/sourceConfig.js` | Source registry: `SOURCE_CONFIG` (label/color/icon per source key) and `SOURCE_ORDER` (display order). |
| `lwc/webEngagementData/timelineMappers.js` | Pure functions: `parseDataGraphResponse`, `mergeAndSort`, `groupByDay`. Lifted out of the component class for direct Jest testability. |
| `lwc/webEngagementData/__tests__/timelineMappers.test.js` | Jest unit tests for the three mappers (~18 tests). |
| `lwc/webEngagementData/__tests__/webEngagementData.test.js` | Jest DOM tests for the component (feedStyle / headerTitleIsLink getters + chip bar + day groups + left-rail color, ~10 tests). |
```

- [ ] **Step 5: Commit**

```bash
cd ..
git add Web_Engagements_RT_Timeline/README.md Web_Engagements_RT_Timeline/artifacts.md
git commit -m "docs(web-engagements): document Plan 3 multi-source timeline

README: extends App Builder properties table with 5 new rows (4 source
toggles + lookbackDays); adds Multi-source timeline section explaining
the two-call architecture, source colors, partial-failure UX, lookback;
expands Test coverage section with new test counts.

artifacts.md: adds CrmTimelineController + helper modules + Jest test
files to inventory.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 19: Final verification

**Files:** none modified

- [ ] **Step 1: Confirm clean tree**

```bash
git status
```

Expected: `nothing to commit, working tree clean`. (`.claude/`, `node_modules/` should be gitignored.)

- [ ] **Step 2: Run all Apex tests**

```bash
cd Web_Engagements_RT_Timeline
sf apex run test --class-names DataCloudWebEngagementControllerTest --class-names CrmTimelineControllerTest --result-format human --code-coverage --wait 20 --synchronous
```

Expected: `Tests Ran 26`, `Pass Rate · 100%`, both controllers ≥80% coverage.

- [ ] **Step 3: Run all Jest tests**

```bash
npm test
```

Expected: `Tests: 28 passed, 28 total`.

- [ ] **Step 4: Show the full Plan 3 commit log**

```bash
cd ..
git log --oneline cd00a69..HEAD | head -25
```

Expected: ~19 commits from Plan 3 on top of Plan 2's.

- [ ] **Step 5: Plan 3 complete**

Plan 3 is done when:
- ✅ `CrmTimelineController` exists with 4 sources (Cases, Tasks, Events, VoiceCalls) and a 9-test coverage class at ≥80%.
- ✅ LWC has 10 App Builder properties (5 from Plan 2 + 5 new).
- ✅ LWC class uses helper modules `sourceConfig.js` + `timelineMappers.js`; the old inline 125-line `processGraphData` is gone.
- ✅ Template renders Style B card stream with chip bar, day groups, source-colored left rail, expand-on-click details, inline retry banners on partial failure.
- ✅ 26 Apex tests + 28 Jest tests all passing.
- ✅ README + artifacts.md document the new architecture.
- ✅ Live deploy against `admin@finsdc3.demo` succeeded with all tests green.

The branch `worktree-web-engagements-hardening` now holds Plan 1 + Plan 2 + Plan 3. Ready for the merge-to-main step (the `finishing-a-development-branch` skill if you want to walk through it).

---

## Spec coverage check

| Spec section / line | Plan 3 task | Note |
|---|---|---|
| §3 `TimelineEvent` shape (Apex inner class) | Task 7 | Apex declaration with all 10 fields |
| §3 `DetailField` inner class | Task 7 | Direct |
| §3 source query contract — case | Task 7 | `queryCases` |
| §3 source query contract — task (incl. logged calls) | Task 9 | `queryTasks` with CallType branching |
| §3 source query contract — event | Task 10 | `queryEvents` |
| §3 source query contract — voice | Task 10 | `queryVoiceCalls` (Schema-gated) |
| §3 ALLOWED_SOURCES whitelist | Task 7 | `Set<String>{ 'case', 'task', 'event', 'voice' }` |
| §3 lookbackDays clamping | Task 11 | 5-arm test |
| §3 unsupported recordId throws | Task 7 | `unsupportedRecordIdThrows` test |
| §3 PER_SOURCE_LIMIT = 200 | Task 7 | Direct |
| §4 properties: showCases / Tasks / Events / VoiceCalls | Task 12 | Direct |
| §4 property: lookbackDays | Task 12 | Direct |
| §4 "Defaults preserve today's behavior" — all toggles default off | Task 12 | Direct (default="false" on each) |
| §5 sourceConfig.js | Task 1 | Direct |
| §5 timelineMappers.parseDataGraphResponse | Task 2 | Lifted from inline `processGraphData` |
| §5 timelineMappers.mergeAndSort with cssClass + leftRailStyle | Task 4 | Direct |
| §5 timelineMappers.groupByDay | Task 4 | Direct |
| §5 LWC class shape (`enabledCrmSources`, `mergedEvents`, `availableChips`, `groupedByDay`, `feedStyle`, `headerTitleIsLink`, `isCrmLoadingChip`) | Task 13 | All getters present |
| §5 `handleChipToggle` / `handleRowToggle` (renamed `handleToggle`) | Task 13 | `handleToggle` retains its name; chip handler is `handleChipToggle` |
| §5 template structure (chip bar + day-group + cards + detail panel) | Task 14 | Style B markup |
| §6 partial-failure render matrix | Tasks 13 + 14 | `webError` / `crmError` state, retry handlers, inline banners |
| §6 `with sharing` on CrmTimelineController | Task 7 | Direct |
| §6 source whitelist filter (no string concat injection) | Task 7 | `Set` membership check |
| §6 VoiceCall optionality via Schema check | Task 10 | Direct |
| §6 error-detail policy: generic message + console only | Tasks 13 + 14 | `console.error` in `loadCrmEvents` / `loadWebEngagements`; UI shows generic strings |
| §7 `CrmTimelineControllerTest` coverage ≥80% | Tasks 7-11 | 9 tests covering: target validation, whitelist, empty sources, Cases happy paths (Account + Contact), Tasks happy path (incl. logged calls), Events happy path, Voice absent path, multi-source sort, lookbackDays clamping |
| §7 Jest `timelineMappers.test.js` ≥80% | Tasks 3 + 5 | 18 tests across the 3 mapper functions |
| §7 Jest `webEngagementData.test.js` (chip filter, partial failure UI) | Task 16 | 4 new tests |
| §9 Plan 3 Step 3a (helper extraction + lift) | Tasks 1-6 | Direct |
| §9 Plan 3 Step 3b (CrmTimelineController + Cases) | Tasks 7-8 | Direct |
| §9 Plan 3 Step 3c (Tasks source) | Task 9 | Direct |
| §9 Plan 3 Step 3d (Events + VoiceCall) | Task 10 | Direct |
| §9 Plan 3 Step 3e (LWC integration: 4 toggles + Promise B + chip bar + partial-failure UI) | Tasks 12 + 13 | Direct |
| §9 Plan 3 Step 3f (Style B HTML + CSS) | Tasks 14-15 | Direct (detail panel folded into Task 14) |

Spec sections 1, 2, 8 are background/cross-plan; sections 4 and 7 partly covered by Plan 1/2. Plan 3 fully implements the multi-source goal.
