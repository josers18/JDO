# Web_Engagements_RT_Timeline Revamp — Design Spec

**Status:** Approved (2026-05-17)
**Author:** Jose Sifontes (with Claude Opus 4.7)
**Implementation:** Three sequential plans — Hardening / Configurability / Multi-source

---

## 1. Goals & non-goals

### Goals
1. **Hardening** — add Apex test coverage and decide on the API version posture before any feature work.
2. **Configurability** — let admins point the component at any Data Graph, override branding, and control feed height through App Builder.
3. **Multi-source timeline** — interleave CRM activity (Cases, Tasks incl. logged calls, Calendar Events, Agentforce Voice calls) with Data Cloud web engagements in one chronological card stream.
4. **Preserve the Data Graph fast path.** No new feature is allowed to slow down or block real-time engagement rendering.

### Non-goals (explicitly deferred)
- Push CRM activity into Data Cloud as a unified calculated insight (would invert the architecture and add Data-Cloud-sync latency to "real-time").
- Email, Chat, or social-media sources beyond v1 enumeration.
- Per-source LWC sub-components (we keep one bundle, with helper modules).
- Per-status case-history rows (one Case = one timeline row, sorted by `CreatedDate`).
- Lead / Opportunity record-page support (Account + Contact only).

---

## 2. Architecture overview

```
Record Page (Account | Contact)
   │  recordId  +  App Builder properties
   ▼
LWC webEngagementData
   ├─ Promise A (T+0) ──▶ DataCloudWebEngagementController.getWebEngagementData(accountId, dataGraphName)
   │                          ▼ callout:Data_Cloud_API → Data Graph
   │                          ▼ resolve Unified ID via UnifiedLinkssotAccountAcc__dlm
   │                          ▼ parse → TimelineEvent[] (source: 'web')
   │
   └─ Promise B (T+0) ──▶ CrmTimelineController.getCrmTimelineEvents(recordId, sources, lookbackDays)
                              ▼ per-source SOQL fan-out → normalize → sort DESC → TimelineEvent[]

Render pipeline:
  T+0      : spinner
  on A     : render Data Graph rows immediately. "Loading CRM activity..." chip below if B still pending.
  on B     : merge sort with A, group by day, render Style B card stream.
  chip bar : filters visible sources client-side; no Apex round-trip per chip click.
```

### Invariants
1. Promise A is never blocked on Promise B. Failure or slowness in CRM never delays Data Graph render.
2. One unified `TimelineEvent` shape across all sources. Apex sources return it. LWC normalizes Data Graph response into it on the client.
3. Filter chips operate purely on already-loaded events. Toggling a chip never triggers Apex.

---

## 3. `TimelineEvent` shape & Apex API contract

### `TimelineEvent` (Apex inner class on `CrmTimelineController`; mirrored in JS)

```apex
public class TimelineEvent {
    @AuraEnabled public String   id;          // unique key — recordId for CRM, eventId__c for Data Graph
    @AuraEnabled public String   source;      // 'web' | 'case' | 'task' | 'event' | 'voice'
    @AuraEnabled public String   sourceLabel; // 'Web' | 'Case' | 'Task' | 'Event' | 'Voice'
    @AuraEnabled public String   iconName;    // SLDS icon, e.g. 'standard:case'
    @AuraEnabled public String   iconColor;   // hex; LWC applies as left-rail color
    @AuraEnabled public Datetime occurredAt;  // primary sort key
    @AuraEnabled public String   title;       // primary line in card
    @AuraEnabled public String   subtitle;    // secondary line
    @AuraEnabled public String   recordUrl;   // null for Data Graph; populated for CRM
    @AuraEnabled public List<DetailField> details; // expanded view; ordered, label/value
}

public class DetailField {
    @AuraEnabled public String label;
    @AuraEnabled public String value;
}
```

### Source → query contract

| Source | Lookup field on parent | Date field (sort key) | Title | Subtitle | Icon / Color |
|---|---|---|---|---|---|
| `case`  | `Case.AccountId` (or `ContactId`) | `CreatedDate` | `Case.Subject` | `'Case ' + CaseNumber + ' · ' + Status + ' · Owner ' + Owner.Name` | `standard:case` / `#c23934` |
| `task`  | `Task.WhatId` + `Task.WhoId` | `Task.ActivityDate` (fallback `CreatedDate`) | `Task.Subject` | `Task.Type` + (CallType if present) | `standard:task` / `#04844b` (`standard:log_a_call` if `Task.CallType` populated) |
| `event` | `Event.WhatId` + `Event.WhoId` | `Event.StartDateTime` | `Event.Subject` | `Event.Description` (truncated) or `Event.Location` | `standard:event` / `#c97a00` |
| `voice` | `VoiceCall.RelatedRecordId` + caller/callee Contact | `VoiceCall.CallStartDateTime` | `'Inbound · ' + duration` (or `'Outbound · '`) | `'Agentforce Voice · ' + endingDispositionName` | `standard:live_chat` / `#0176d3` |
| `web`   | n/a (parsed in LWC) | `CumulusWeb_Engagements__dlm.dateTime__c` | dynamic (today's logic) | dynamic (today's logic) | dynamic / `#7f56d9` |

### `CrmTimelineController` public surface

```apex
public with sharing class CrmTimelineController {
    @AuraEnabled(cacheable=false)
    public static List<TimelineEvent> getCrmTimelineEvents(
        Id recordId,
        List<String> enabledSources,   // ['case','task','event','voice']
        Integer lookbackDays           // default 90; max 365
    );

    private static List<TimelineEvent> queryCases(Id recordId, Schema.SObjectType sot, Datetime since);
    private static List<TimelineEvent> queryTasks(Id recordId, Schema.SObjectType sot, Datetime since);
    private static List<TimelineEvent> queryEvents(Id recordId, Schema.SObjectType sot, Datetime since);
    private static List<TimelineEvent> queryVoiceCalls(Id recordId, Schema.SObjectType sot, Datetime since);
}
```

### Constraints

| Constraint | Value | Rationale |
|---|---|---|
| `lookbackDays` upper bound | 365 | Prevents pathological SOQL on demo orgs with years of history |
| Per-source `LIMIT` | 200 | Cap before merge; well within governor headroom |
| Page-level support | Account, Contact | `recordId.getSObjectType()` switches lookup field |
| Voice availability | Optional | `Schema.getGlobalDescribe()` check; returns `[]` if SObject absent |
| Unsupported recordId | `AuraHandledException` | "Web Engagements timeline only supports Account and Contact record pages." |

---

## 4. App Builder property surface

### `webEngagementData.js-meta.xml` properties (v1)

| API name | Type | Default | Label | Plan |
|---|---|---|---|---|
| `dataGraphName` | String | `RT_Web_Engagementsv2` | Data Graph API name | 2 |
| `cardTitle` | String | `Real Time Engagements` | Card title | 2 |
| `cardTitleLink` | String | *(empty)* | Card title link URL | 2 |
| `showCases` | Boolean | `false` | Show Case events | 3 |
| `showTasks` | Boolean | `false` | Show Task events (incl. logged calls) | 3 |
| `showEvents` | Boolean | `false` | Show Event records (calendar) | 3 |
| `showVoiceCalls` | Boolean | `false` | Show Agentforce Voice calls | 3 |
| `lookbackDays` | Integer | `90` | CRM lookback (days) — max 365 | 3 |
| `feedHeight` | Integer | `600` | Feed height (px) — ignored when Auto-size on | 2 |
| `autoSize` | Boolean | `false` | Auto-size feed (grows to 90% viewport) | 2 |

**Defaults preserve today's behavior.** All CRM toggles default `false`; existing record pages see zero behavior change post-deploy.

### Required signature change to `DataCloudWebEngagementController`

```apex
@AuraEnabled(cacheable=false)
public static String getWebEngagementData(String accountId, String dataGraphName) {
    if (String.isBlank(dataGraphName)) dataGraphName = 'RT_Web_Engagementsv2';
    // ... rest unchanged
}
```

`DATA_GRAPH_NAME` is removed as a private static final constant — replaced by the parameter with a default. The `LINK_OBJECT_NAME` stays hardcoded (out of scope per Section 3 of the brainstorm).

---

## 5. LWC internals (Style B card stream)

### File structure

```
lwc/webEngagementData/
├── webEngagementData.html           # Header, chip bar, day-grouped card stream, error/loading states
├── webEngagementData.js             # Component class: lifecycle, state, Apex calls, getters
├── webEngagementData.css            # SLDS hooks; height/scroll; source-color rail
├── webEngagementData.js-meta.xml    # 10 App Builder properties
├── timelineMappers.js               # Pure functions: parseDataGraphResponse, mergeAndSort, groupByDay
└── sourceConfig.js                  # Source registry: { source → { label, icon, color, chipLabel } }
```

### `sourceConfig.js`

```javascript
export const SOURCE_CONFIG = {
  web:   { label: 'Web',   chipLabel: 'Web',   color: '#7f56d9', defaultIcon: 'custom:custom68' },
  case:  { label: 'Case',  chipLabel: 'Case',  color: '#c23934', defaultIcon: 'standard:case' },
  task:  { label: 'Task',  chipLabel: 'Task',  color: '#04844b', defaultIcon: 'standard:task' },
  event: { label: 'Event', chipLabel: 'Event', color: '#c97a00', defaultIcon: 'standard:event' },
  voice: { label: 'Voice', chipLabel: 'Voice', color: '#0176d3', defaultIcon: 'standard:live_chat' }
};
export const SOURCE_ORDER = ['web', 'case', 'task', 'event', 'voice'];
```

### `timelineMappers.js`

```javascript
export function parseDataGraphResponse(rawResponse);     // existing recursive walker, lifted out of component
export function mergeAndSort(webEvents, crmEvents);      // dedupe by id, sort DESC by occurredAt, attach cssClass + leftRailStyle
export function groupByDay(events, locale = 'en-US');    // → [{ dayLabel, dayKey, events }]
```

`mergeAndSort` attaches presentation fields (`cssClass`, `leftRailStyle`) directly to each event so the template stays declarative — no per-row helper getters required.

### `webEngagementData.js` shape

```javascript
import { LightningElement, api } from 'lwc';
import getWebEngagementData from '@salesforce/apex/DataCloudWebEngagementController.getWebEngagementData';
import getCrmTimelineEvents from '@salesforce/apex/CrmTimelineController.getCrmTimelineEvents';
import { parseDataGraphResponse, mergeAndSort, groupByDay } from './timelineMappers';
import { SOURCE_CONFIG, SOURCE_ORDER } from './sourceConfig';

export default class WebEngagementData extends LightningElement {
    @api recordId;
    @api dataGraphName = 'RT_Web_Engagementsv2';
    @api showCases = false;
    @api showTasks = false;
    @api showEvents = false;
    @api showVoiceCalls = false;
    @api lookbackDays = 90;
    @api cardTitle = 'Real Time Engagements';
    @api cardTitleLink = '';
    @api feedHeight = 600;
    @api autoSize = false;

    webEvents = []; crmEvents = [];
    loadingWeb = false; loadingCrm = false;
    webError = null; crmError = null;
    // Initialized to all available sources on first render, so chip bar shows "All" selected.
    // Updated whenever loaded events introduce a new source not yet in the filter set.
    activeSourceFilters = new Set();
    expandedIds = new Set();

    connectedCallback() { this.handleRefresh(); }

    handleRefresh() { this.loadWebEngagements(); this.loadCrmEvents(); }

    async loadWebEngagements();
    async loadCrmEvents();

    get enabledCrmSources();
    get availableChips();
    get mergedEvents() { return mergeAndSort(this.webEvents, this.crmEvents); }
    get visibleEvents();
    get groupedByDay() { return groupByDay(this.visibleEvents); }
    get feedStyle() { return `max-height: ${this.autoSize ? '90vh' : this.feedHeight + 'px'}`; }
    get headerTitleIsLink() { return Boolean(this.cardTitleLink); }
    get isCrmLoadingChip() { return this.loadingCrm && this.webEvents.length > 0; }

    handleChipToggle(event);
    handleRowToggle(event);
}
```

### Template structure

```html
<template>
  <lightning-card icon-name="standard:data_cloud">
    <h3 slot="title">
      <template if:true={headerTitleIsLink}><a href={cardTitleLink} target="_blank">{cardTitle}</a></template>
      <template if:false={headerTitleIsLink}>{cardTitle}</template>
    </h3>
    <div slot="actions"><lightning-button-icon icon-name="utility:refresh" onclick={handleRefresh}></lightning-button-icon></div>

    <div class="chip-bar">
      <template for:each={availableChips} for:item="chip">
        <button key={chip.source} class={chip.cssClass} data-source={chip.source} onclick={handleChipToggle}>
          {chip.label} <span class="chip-count">{chip.count}</span>
        </button>
      </template>
    </div>

    <div class="engagement-feed" style={feedStyle}>
      <template if:true={loadingWeb}><lightning-spinner></lightning-spinner></template>
      <template if:true={isCrmLoadingChip}>
        <div class="crm-loading-chip">⟳ Loading CRM activity...</div>
      </template>

      <template for:each={groupedByDay} for:item="day">
        <div key={day.dayKey} class="day-group">
          <div class="day-header">{day.dayLabel}</div>
          <template for:each={day.events} for:item="event">
            <article key={event.id} class={event.cssClass} style={event.leftRailStyle}
                     onclick={handleRowToggle} data-id={event.id}>
              <!-- title, subtitle, expanded details -->
            </article>
          </template>
        </div>
      </template>
    </div>
  </lightning-card>
</template>
```

---

## 6. Error handling, security & permissions

### Partial-failure render matrix

| Promise A (Web) | Promise B (CRM) | User experience |
|---|---|---|
| ✅ | ✅ | Full unified timeline. No banners. |
| ✅ | ❌ | Web rows render. Inline warning under chips: "Couldn't load CRM activity — [Retry]". |
| ❌ | ✅ | CRM rows render. Inline warning above feed: "Couldn't load web engagements — [Retry]". |
| ❌ | ❌ | Top-of-card error banner: "Unable to load engagement data." with single Retry. |
| ✅ (empty) | ✅ (empty) | "No recent engagements found." |
| ✅ | ⏳ Loading | Web rows + "⟳ Loading CRM activity..." chip below. |
| All sources off | n/a | Promise B never fires. Web-engagement rows only. Behaves like today. |

Each `[Retry]` re-runs only its side. A transient CRM failure does not force a Data Graph re-fetch.

### Apex security — `CrmTimelineController`

```apex
public with sharing class CrmTimelineController {

    private static final Set<String> ALLOWED_SOURCES =
        new Set<String>{ 'case', 'task', 'event', 'voice' };

    private static final Integer MAX_LOOKBACK_DAYS = 365;
    private static final Integer DEFAULT_LOOKBACK_DAYS = 90;
    private static final Integer PER_SOURCE_LIMIT = 200;

    @AuraEnabled(cacheable=false)
    public static List<TimelineEvent> getCrmTimelineEvents(
        Id recordId, List<String> enabledSources, Integer lookbackDays
    ) {
        // 1. Validate recordId target (Account or Contact only)
        Schema.SObjectType sot = recordId.getSObjectType();
        if (sot != Account.SObjectType && sot != Contact.SObjectType) {
            throw new AuraHandledException(
                'Web Engagements timeline only supports Account and Contact record pages.'
            );
        }

        // 2. Whitelist filter — never trust the parameter list as a string-concat source
        Set<String> sources = new Set<String>();
        for (String s : (enabledSources == null ? new List<String>() : enabledSources)) {
            if (ALLOWED_SOURCES.contains(s)) sources.add(s);
        }
        if (sources.isEmpty()) return new List<TimelineEvent>();

        // 3. Bound lookback
        Integer days = (lookbackDays == null || lookbackDays < 1) ? DEFAULT_LOOKBACK_DAYS
                     : Math.min(lookbackDays, MAX_LOOKBACK_DAYS);
        Datetime since = Datetime.now().addDays(-days);

        // 4. Per-source dispatch — all queries use bind variables, no string concat
        List<TimelineEvent> events = new List<TimelineEvent>();
        if (sources.contains('case'))  events.addAll(queryCases(recordId, sot, since));
        if (sources.contains('task'))  events.addAll(queryTasks(recordId, sot, since));
        if (sources.contains('event')) events.addAll(queryEvents(recordId, sot, since));
        if (sources.contains('voice')) events.addAll(queryVoiceCalls(recordId, sot, since));

        events.sort(new TimelineEventComparator()); // DESC by occurredAt
        return events;
    }
}
```

### Permission model

| Class | Required for end users |
|---|---|
| `DataCloudWebEngagementController` | Apex class access (already required today) |
| `CrmTimelineController` | Apex class access (new) — same permset bundle |

`with sharing` means CRM SOQL respects record visibility. **Data Cloud Data Graph callout runs in system mode** because `ConnectApi.CdpQuery.querySql` is platform-system-context — not our choice. Documented in README.

### VoiceCall optionality

```apex
private static List<TimelineEvent> queryVoiceCalls(Id recordId, Schema.SObjectType sot, Datetime since) {
    if (!Schema.getGlobalDescribe().containsKey('VoiceCall')) {
        return new List<TimelineEvent>();
    }
    // ... bind-variable SOQL via Database.query
}
```

Admin enables `Show Voice` but org has no Service Cloud Voice → silent empty return; chip simply never appears.

### Error-detail policy

End users see generic messages only ("Couldn't load CRM activity"). Specific exception details are sent to `console.error` for DevTools-equipped admins. AuraHandledException messages are not displayed in inline warnings.

---

## 7. Testing strategy

| Test class / spec | Scope | Coverage target | Plan |
|---|---|---|---|
| `DataCloudWebEngagementControllerTest` (new) | Mocked HTTP success / 4xx / 5xx; blank `accountId`; `ConnectApi.CdpQuery.querySql` happy path + `dataRows`/`data`/`rowData`/`row` shape variants; `dataGraphName` parameter handling | ≥ 80% (see "Coverage ceiling" below) | 1 + 2 |
| `CrmTimelineControllerTest` (new) | Per-source happy path; VoiceCall absent path; source whitelist filtering; `lookbackDays` clamping (0 / null / 999); unsupported recordId throws `AuraHandledException`; Account vs Contact lookup branching; sort correctness across mixed sources | ≥ 85% | 3 |
| `timelineMappers.test.js` (new — Jest) | `parseDataGraphResponse` (wrapped-blob + direct-JSON); `mergeAndSort` dedupe + sort; `groupByDay` boundaries (today / yesterday / week-old); `cssClass` + `leftRailStyle` attachment | ≥ 80% | 2 + 3 |
| `webEngagementData.test.js` (new — Jest) | App Builder property defaults; `feedStyle` getter; chip filter state transitions; partial-failure UI matrix | ≥ 80% | 3 |

Jest is new for this repo. Sibling widgets ship without it. We adopt it because the helper modules are pure functions — highest ROI place to add unit testing. Component-class tests are added only for state-transition behavior the helpers don't cover.

### Coverage ceiling for `DataCloudWebEngagementController`

The `@TestVisible static String testMockUnifiedId` seam intentionally bypasses the entire body of `getUnifiedId` so unit tests don't depend on `ConnectApi.CdpQuery.querySql` (which is not mockable via `Test.setMock` in API 65.0). This means the lines inside `getUnifiedId` that build the SOQL string, instantiate `ConnectApi.QuerySqlInput`, and call `ConnectApi.CdpQuery.querySql` itself are structurally uncoverable by unit tests in this org's API version.

Plan 1's Task 9a refactor extracted the JSON-parsing logic into a `@TestVisible private static String extractUnifiedIdFromQueryOutput(Map<String, Object>)` helper, which Task 9b covers directly with crafted-Map inputs. After this work, `DataCloudWebEngagementController` is at **~83% line coverage** — every branch of every method that *can* be unit-tested is tested. The remaining ~17% is the un-mockable `ConnectApi` call path and its preceding setup.

The spec target of `≥80%` accounts for this ceiling. Salesforce's org-wide deployment threshold is 75%, so the class is comfortably deployable. The README documents the ceiling for future maintainers.

---

## 8. API version posture

`sourceApiVersion` stays at `62.0` to match siblings (`DC_BusinessProfileWidget`, `DC_PersonProfileWidget`, etc.). Component `-meta.xml` files retrieved at `65.0` stay at `65.0`. Org runs `66.0`. The three numbers can legally differ — `sourceApiVersion` only governs new metadata authored in this DX project, not existing components or runtime behavior.

**Rationale:** monorepo consistency outranks chasing the org's API. Newer API versions can shift LWC compilation and Apex enforcement in ways that affect demos. We bump only when a feature requires it.

---

## 9. Three-plan decomposition

```
Plan 1 — Hardening                                    [~1-2 hrs]
├─ DataCloudWebEngagementControllerTest.cls (≥ 80% — see Coverage ceiling note)
├─ Decision: keep sourceApiVersion 62.0 (rationale documented in spec)
└─ README "Known issues" updated to note remaining cosmetic semicolon finding

Plan 2 — Configurability                              [~half day]
├─ Apex: add `dataGraphName` parameter to getWebEngagementData (default preserves behavior)
├─ LWC meta-XML: add 5 properties (dataGraphName, cardTitle, cardTitleLink, feedHeight, autoSize)
├─ LWC JS: thread properties through; feedStyle getter; title-link branch
├─ LWC HTML: dynamic title; feedStyle binding
├─ LWC CSS: remove hardcoded max-height
├─ Apex test: extend DataCloudWebEngagementControllerTest for the new parameter
└─ Jest: scaffold Jest infrastructure for the project (jest.config, lwc-recipes-style setup)
         and cover `feedStyle` getter behavior. parseDataGraphResponse stays inline in
         webEngagementData.js for Plan 2; it gets lifted into timelineMappers.js in Plan 3.

Plan 3 — Multi-source timeline                        [~multi-day]
├─ Step 3a: TimelineEvent shape, sourceConfig.js, timelineMappers.js
│            - lift parseDataGraphResponse out of webEngagementData.js
│            - introduce mergeAndSort, groupByDay
│            - Jest coverage of all three mappers
├─ Step 3b: CrmTimelineController + Cases source only
│            - whitelist + lookback bounds + recordId target validation
│            - queryCases for Account & Contact pages
│            - CrmTimelineControllerTest.cls (initial)
├─ Step 3c: Add Tasks source (incl. logged calls — Task.CallType-driven icon swap)
│            - extend controller + test class
├─ Step 3d: Add Events + VoiceCall sources
│            - VoiceCall optionality via Schema check
│            - extend test class
├─ Step 3e: LWC integration
│            - 4 source-toggle properties + lookbackDays property
│            - Promise B with progressive render
│            - chip bar (in-template, no child component)
│            - partial-failure UI per Section 6 matrix
└─ Step 3f: Style B card-stream HTML+CSS
             - day headers, source-colored left rail, expanded details
             - replace slds-timeline markup
```

Each plan ends with a deployable, demo-able state. Plan 1 can be shipped and stopped on. Plan 2 is independently valuable. Plan 3 is the visual + feature shift.

---

## 10. Open questions / future work

- **Email source (`EmailMessage`).** Deferred to v2; one-line addition to `sourceConfig.js` + one private method on `CrmTimelineController`.
- **Case status-change rows.** Deferred to v2 — one row per `CaseHistory` transition. 3-5× the row count; defer until product feedback warrants it.
- **Lead / Opportunity record pages.** Deferred — not in v1 requirements; doubles the lookup-field branching surface.
- **Push CRM activity into Data Cloud.** Architecturally rejected for v1 — Data Cloud sync latency is incompatible with "real-time".

---

## 11. Decision log

| Decision | Choice | Rationale |
|---|---|---|
| Aggregation strategy | Hybrid: Data Graph isolated, CRM aggregator as one method | Don't slow Data Graph; preserve working code path |
| Render order | Progressive: Data Graph first, CRM streams in below | Match user perception of "real-time" |
| Apex shape | One method, fan-out internally | Clean LWC contract; trivial future-source extension |
| LWC structure | Single bundle, helper modules | Avoid LWC composition overhead; sibling-widget consistency |
| Filter chips | Client-side filtering on loaded data | Snappy UX; App Builder controls availability |
| Visual style | Style B card stream | User selection from mockup comparison |
| Case sort key | `CreatedDate` | One row per case; matches user mental model |
| Unsupported recordId | `AuraHandledException` | Explicit failure mode; LWC error banner shows it |
| Event style binding | `cssClass` / `leftRailStyle` baked in by mapper | Template stays declarative |
| Error detail policy | Generic messages; details to console only | No info disclosure on user-facing record pages |
| API version | Stay at 62.0 | Monorepo consistency; bump only when required by a feature |
