# Plan 2 — Configurability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose 5 new App Builder properties on the `webEngagementData` LWC (`dataGraphName`, `cardTitle`, `cardTitleLink`, `feedHeight`, `autoSize`) and thread them through the Apex controller and HTML template, so admins can point the component at any Data Graph, override branding, and control feed height — without code changes per instance.

**Architecture:** Plumbing change. The `dataGraphName` parameter is added to `DataCloudWebEngagementController.getWebEngagementData(...)` with a default that preserves today's behavior. The 4 visual/branding properties are pure LWC concerns — read by getters and bound directly in the template. CSS loses its hardcoded `max-height`; the inline style from the `feedStyle` getter takes over. Jest is introduced for the first time in this repo, scoped narrowly to the new getters.

**Tech Stack:** Salesforce Apex (API 65.0), Lightning Web Components, `@salesforce/sfdx-lwc-jest`, sf CLI v2.

---

## Context the engineer needs

**Working directory:** `/Users/jsifontes/Documents/Git/JDO/.claude/worktrees/web-engagements-hardening` (worktree on branch `worktree-web-engagements-hardening`).

**DX project root:** `Web_Engagements_RT_Timeline/` — `cd` here before running any `sf` command. `cd ..` (or absolute paths) for git operations.

**Default org:** Resolved by `sf config get target-org` to `jdo-fw51xz` → `admin@finsdc3.demo`. Don't change.

**State after Plan 1:**
- `DataCloudWebEngagementController.getWebEngagementData(String accountId)` is `@AuraEnabled`, calls a `@TestVisible static String testMockUnifiedId` seam, then a `@TestVisible static String extractUnifiedIdFromQueryOutput(Map<String, Object>)` parser. Hardcoded `DATA_GRAPH_NAME = 'RT_Web_Engagementsv2'` constant on line 5.
- `DataCloudWebEngagementControllerTest` has 15 tests at ~83% coverage. All 6 integration-style tests call `DataCloudWebEngagementController.getWebEngagementData('00100...')` with one arg.
- `webEngagementData.js` has `@api recordId;` only. `webInteractions`, `isLoading`, `hasError`, `errorMessage`. No height/title properties.
- `webEngagementData.html` has a hardcoded title (`Real Time Engagements`) inside an `<a href="https://cumulusbank-...">`.
- `webEngagementData.css` has `.engagement-feed { max-height: 600px; }`.

**Why Jest now:** Spec §7 anchors Jest to "Plan 2 + 3" as the highest-ROI place to add unit testing because helper modules / getters are pure functions. Setting up Jest later means re-integrating across multiple PRs. Plan 2's `feedStyle` getter is the simplest possible first thing to test — perfect for proving the harness works.

**Conventions you must follow:**
- All `sf` CLI commands run from `Web_Engagements_RT_Timeline/`. Git commands run from anywhere — paths in this plan use `Web_Engagements_RT_Timeline/...` for absolute clarity, but if you `cd` for the deploy and forget to `cd ..`, `git add` with the relative path still works (just from a different directory).
- TDD: write the failing test first (or in parallel for test-class edits where the test will compile but fail at runtime), then make it pass.
- Frequent commits — one task = one commit.
- All commits to branch `worktree-web-engagements-hardening`. Do not push or merge to main.

---

## Task 1: Add `dataGraphName` parameter to the Apex controller

**Files:**
- Modify: `Web_Engagements_RT_Timeline/force-app/main/default/classes/DataCloudWebEngagementController.cls`

- [ ] **Step 1: Read the current method signature**

Read `Web_Engagements_RT_Timeline/force-app/main/default/classes/DataCloudWebEngagementController.cls`. Confirm:
- Line 5: `private static final String DATA_GRAPH_NAME = 'RT_Web_Engagementsv2';`
- Line 17-18: `@AuraEnabled public static String getWebEngagementData(String accountId) {`
- Around line 33: endpoint string uses `DATA_GRAPH_NAME` — `'callout:Data_Cloud_API/services/data/v65.0/ssot/data-graphs/data/' + DATA_GRAPH_NAME + '/' + unifiedId;`

- [ ] **Step 2: Update the method signature and endpoint**

Apply two edits:

**Edit A:** Replace the method signature line:

```apex
    public static String getWebEngagementData(String accountId) { // Using accountId because this will be deployed on Person Account record page.
```

with:

```apex
    public static String getWebEngagementData(String accountId, String dataGraphName) {
        // Using accountId because this will be deployed on Person Account record page.
        // dataGraphName falls back to the default constant when blank, so existing
        // single-arg callers (none in this repo, but possible future) still work.
        if (String.isBlank(dataGraphName)) dataGraphName = DATA_GRAPH_NAME;
```

**Edit B:** Replace the endpoint construction line. Find:

```apex
            String endpoint = 'callout:Data_Cloud_API/services/data/v65.0/ssot/data-graphs/data/' + DATA_GRAPH_NAME + '/' + unifiedId;
```

Replace with:

```apex
            String endpoint = 'callout:Data_Cloud_API/services/data/v65.0/ssot/data-graphs/data/' + dataGraphName + '/' + unifiedId;
```

The `DATA_GRAPH_NAME` constant stays as the default-fallback; it just isn't directly read by the endpoint anymore.

- [ ] **Step 3: Validate compile**

```bash
cd Web_Engagements_RT_Timeline
sf project deploy validate --source-dir force-app/main/default/classes --tests RunLocalTests --wait 15
```

Expected: `Validation succeeded` AND `Test Failures · 15` (or some non-zero count) — because the existing test class still calls `getWebEngagementData(...)` with one argument, which no longer compiles with the new signature. **This is fine** — the test class is updated in Task 2.

If `Validation succeeded` reports 0 test failures, the deploy validator may have skipped the tests (if all components are reported "Unchanged"). That's OK too; the test failures will surface in Task 2's run.

If validation fails for *compilation* reasons (not test failures), STOP and read the error — something else is wrong with the controller change.

- [ ] **Step 4: Commit**

```bash
cd ..
git add Web_Engagements_RT_Timeline/force-app/main/default/classes/DataCloudWebEngagementController.cls
git commit -m "feat(web-engagements): add dataGraphName parameter to getWebEngagementData

Replaces the hardcoded DATA_GRAPH_NAME read in the endpoint string with
a method parameter. Blank input falls back to the default constant so
single-arg callers (none in this repo) wouldn't break either, though
all repo callers update to pass the parameter in subsequent commits.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

> **Note:** This commit leaves the test class temporarily broken. That's intentional — Task 2 fixes it in the next commit. The branch is not in a deployable state between Tasks 1 and 2; **do not deploy to the org until Task 2 lands.**

---

## Task 2: Update existing tests to pass the new `dataGraphName` argument

**Files:**
- Modify: `Web_Engagements_RT_Timeline/force-app/main/default/classes/DataCloudWebEngagementControllerTest.cls`

- [ ] **Step 1: Update all six call sites**

The test class has six places that call `DataCloudWebEngagementController.getWebEngagementData(...)`. Update each one to pass a 2nd argument: `null` (so the controller's default fallback fires; existing happy-path test bodies do not depend on the data graph name).

Open `Web_Engagements_RT_Timeline/force-app/main/default/classes/DataCloudWebEngagementControllerTest.cls` and apply six edits:

**Edit A** — `getWebEngagementData_blankAccountId_returnsEmptyArray`. Find:

```apex
        String resultNull  = DataCloudWebEngagementController.getWebEngagementData(null);
        String resultEmpty = DataCloudWebEngagementController.getWebEngagementData('');
        String resultBlank = DataCloudWebEngagementController.getWebEngagementData('   ');
```

Replace with:

```apex
        String resultNull  = DataCloudWebEngagementController.getWebEngagementData(null, null);
        String resultEmpty = DataCloudWebEngagementController.getWebEngagementData('', null);
        String resultBlank = DataCloudWebEngagementController.getWebEngagementData('   ', null);
```

**Edit B** — `getWebEngagementData_happyPath_returnsMockedDataGraphBody`. Find:

```apex
        String result = DataCloudWebEngagementController.getWebEngagementData('001000000000001AAA');
```

Replace with:

```apex
        String result = DataCloudWebEngagementController.getWebEngagementData('001000000000001AAA', null);
```

**Edit C** — `getWebEngagementData_http500_returnsEmptyArray`. Find:

```apex
        String result = DataCloudWebEngagementController.getWebEngagementData('001000000000002AAA');
```

Replace with:

```apex
        String result = DataCloudWebEngagementController.getWebEngagementData('001000000000002AAA', null);
```

**Edit D** — `getWebEngagementData_http404_returnsEmptyArray`. Find:

```apex
        String result = DataCloudWebEngagementController.getWebEngagementData('001000000000003AAA');
```

Replace with:

```apex
        String result = DataCloudWebEngagementController.getWebEngagementData('001000000000003AAA', null);
```

**Edit E** — `getWebEngagementData_noUnifiedId_returnsEmptyArray`. Find:

```apex
        String result = DataCloudWebEngagementController.getWebEngagementData('001000000000004AAA');
```

Replace with:

```apex
        String result = DataCloudWebEngagementController.getWebEngagementData('001000000000004AAA', null);
```

**Edit F** — `getWebEngagementData_calloutException_throwsAuraHandledException`. Find:

```apex
            DataCloudWebEngagementController.getWebEngagementData('001000000000005AAA');
```

Replace with:

```apex
            DataCloudWebEngagementController.getWebEngagementData('001000000000005AAA', null);
```

- [ ] **Step 2: Run all tests against the org**

```bash
cd Web_Engagements_RT_Timeline
sf apex run test --class-names DataCloudWebEngagementControllerTest --result-format human --code-coverage --wait 15 --synchronous
```

Expected:
- `Tests Ran 15`
- `Pass Rate · 100%`
- Coverage on `DataCloudWebEngagementController` ~83%

If tests fail, the most likely cause is one of the six edits was missed. Re-grep the test file for `getWebEngagementData(.*)` and confirm every call has two arguments.

- [ ] **Step 3: Commit**

```bash
cd ..
git add Web_Engagements_RT_Timeline/force-app/main/default/classes/DataCloudWebEngagementControllerTest.cls
git commit -m "test(web-engagements): pass null dataGraphName to existing 6 test call sites

Existing tests are agnostic to the data graph name (mocked at the unified
ID + HTTP layers, not the URL). Pass null so the controller's default
fallback fires.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

The branch is now deployable again.

---

## Task 3: Add a test for the dataGraphName parameter passthrough

**Files:**
- Modify: `Web_Engagements_RT_Timeline/force-app/main/default/classes/DataCloudWebEngagementControllerTest.cls`

This task verifies the new parameter actually plumbs through to the endpoint. Without this test, a future regression where `dataGraphName` was silently ignored would still pass the suite.

- [ ] **Step 1: Add a custom mock that captures the request endpoint**

Append the following mock class **above** the `DataGraphMock` inner class (so all mocks live together at the top of the class). Find the existing `DataGraphMock` declaration:

```apex
    /**
     * Reusable HttpCalloutMock for the Data Graph endpoint.
     * Caller sets statusCode + body; respond() echoes them back.
     */
    private class DataGraphMock implements HttpCalloutMock {
```

Insert the following BEFORE that JavaDoc comment:

```apex
    /**
     * HttpCalloutMock that captures the inbound request endpoint URL,
     * exposing it via a public `capturedEndpoint` field. Used to assert
     * that the controller built the expected URL from its parameters.
     */
    private class CapturingMock implements HttpCalloutMock {
        public String capturedEndpoint;
        public HttpResponse respond(HttpRequest req) {
            this.capturedEndpoint = req.getEndpoint();
            HttpResponse res = new HttpResponse();
            res.setStatusCode(200);
            res.setHeader('Content-Type', 'application/json');
            res.setBody('{"data":[]}');
            return res;
        }
    }

```

- [ ] **Step 2: Add the test method**

Append **before** the `// ─── extractUnifiedIdFromQueryOutput parser tests ───` section divider (same insertion point pattern Plan 1 used):

```apex
    @IsTest
    static void getWebEngagementData_customDataGraphName_buildsEndpointWithIt() {
        DataCloudWebEngagementController.testMockUnifiedId = 'unified-custom';
        CapturingMock mock = new CapturingMock();
        Test.setMock(HttpCalloutMock.class, mock);

        Test.startTest();
        DataCloudWebEngagementController.getWebEngagementData(
            '001000000000099AAA',
            'My_Custom_DataGraph'
        );
        Test.stopTest();

        // The endpoint should contain the custom data graph name segment, NOT
        // the default RT_Web_Engagementsv2.
        System.assert(
            mock.capturedEndpoint != null,
            'Mock should have captured an endpoint.'
        );
        System.assert(
            mock.capturedEndpoint.contains('/data/My_Custom_DataGraph/'),
            'Endpoint should embed the custom dataGraphName: ' + mock.capturedEndpoint
        );
        System.assert(
            !mock.capturedEndpoint.contains('RT_Web_Engagementsv2'),
            'Endpoint should NOT contain the default when a custom name is passed: ' + mock.capturedEndpoint
        );
    }

    @IsTest
    static void getWebEngagementData_blankDataGraphName_fallsBackToDefault() {
        DataCloudWebEngagementController.testMockUnifiedId = 'unified-default';
        CapturingMock mock = new CapturingMock();
        Test.setMock(HttpCalloutMock.class, mock);

        Test.startTest();
        DataCloudWebEngagementController.getWebEngagementData(
            '001000000000098AAA',
            ''
        );
        Test.stopTest();

        System.assert(
            mock.capturedEndpoint != null && mock.capturedEndpoint.contains('/data/RT_Web_Engagementsv2/'),
            'Blank dataGraphName should fall back to the default constant: ' + mock.capturedEndpoint
        );
    }

```

- [ ] **Step 3: Run the new tests**

```bash
cd Web_Engagements_RT_Timeline
sf apex run test --tests DataCloudWebEngagementControllerTest.getWebEngagementData_customDataGraphName_buildsEndpointWithIt --tests DataCloudWebEngagementControllerTest.getWebEngagementData_blankDataGraphName_fallsBackToDefault --result-format human --code-coverage --wait 15 --synchronous
```

Expected: `Tests Ran 2`, `Pass Rate · 100%`.

If a test fails because the endpoint contains `null` instead of `RT_Web_Engagementsv2`, the controller's `if (String.isBlank(dataGraphName))` fallback (Task 1 Edit A) wasn't applied. Re-check Task 1.

- [ ] **Step 4: Run the whole class to confirm nothing else regressed**

```bash
sf apex run test --class-names DataCloudWebEngagementControllerTest --result-format human --code-coverage --wait 15 --synchronous
```

Expected: `Tests Ran 17`, `Pass Rate · 100%`, coverage still ~83% (likely a hair higher with two new tests covering the previously-uncovered fallback line).

- [ ] **Step 5: Commit**

```bash
cd ..
git add Web_Engagements_RT_Timeline/force-app/main/default/classes/DataCloudWebEngagementControllerTest.cls
git commit -m "test(web-engagements): cover dataGraphName parameter passthrough + default

CapturingMock records the inbound endpoint URL so we can assert the
controller built it from the parameter (or fell back to the default).
Two tests:
- custom dataGraphName lands in the URL verbatim
- blank dataGraphName triggers the RT_Web_Engagementsv2 fallback

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Add the 5 new App Builder properties to the LWC meta-XML

**Files:**
- Modify: `Web_Engagements_RT_Timeline/force-app/main/default/lwc/webEngagementData/webEngagementData.js-meta.xml`

- [ ] **Step 1: Read the current meta-XML**

It currently has only the `<targetConfigs>` block with `<objects>Account</objects>` and `<objects>Contact</objects>`, no `<property>` elements.

- [ ] **Step 2: Replace the `<targetConfig>` block to add the 5 properties**

Find:

```xml
        <targetConfig targets="lightning__RecordPage">
            <objects>
                <object>Account</object>
                <object>Contact</object>
            </objects>
        </targetConfig>
```

Replace with:

```xml
        <targetConfig targets="lightning__RecordPage">
            <objects>
                <object>Account</object>
                <object>Contact</object>
            </objects>
            <property
                name="dataGraphName"
                label="Data Graph API name"
                type="String"
                default="RT_Web_Engagementsv2"
                description="API name of the Data Cloud Data Graph this card pulls from."/>
            <property
                name="cardTitle"
                label="Card title"
                type="String"
                default="Real Time Engagements"
                description="Header text shown on the card."/>
            <property
                name="cardTitleLink"
                label="Card title link URL"
                type="String"
                description="Optional URL the card title links to. Leave blank for plain text."/>
            <property
                name="feedHeight"
                label="Feed height (px)"
                type="Integer"
                default="600"
                description="Maximum height of the feed before scrolling. Ignored when Auto-size is on."/>
            <property
                name="autoSize"
                label="Auto-size feed"
                type="Boolean"
                default="false"
                description="When on, feed grows up to 90% of viewport height. Overrides Feed height (px)."/>
        </targetConfig>
```

> **Note on property order:** App Builder displays properties in document order. We list them in user-task order: pick the data source, brand it, then size it.

> **Note on `default=` attribute for Boolean:** Salesforce accepts `default="false"` as a string; the LWC `@api` declaration coerces. Some platform documentation shows `default="false"` for Boolean properties; verified working in API 65.0.

- [ ] **Step 3: Validate the meta-XML**

```bash
cd Web_Engagements_RT_Timeline
sf project deploy validate --source-dir force-app/main/default/lwc --wait 10
```

Expected: `Validation succeeded` (no Apex tests run because we only changed an LWC file).

If validation reports an error like `Property 'cardTitleLink' must specify default attribute`, the platform requires a default for that type even when blank. Add `default=""` to the `cardTitleLink` element.

- [ ] **Step 4: Commit**

```bash
cd ..
git add Web_Engagements_RT_Timeline/force-app/main/default/lwc/webEngagementData/webEngagementData.js-meta.xml
git commit -m "feat(web-engagements): expose 5 App Builder properties on webEngagementData

Adds dataGraphName, cardTitle, cardTitleLink, feedHeight, autoSize.
Defaults preserve today's behavior (RT_Web_Engagementsv2, 'Real Time
Engagements', no link, 600px, autoSize off). LWC consumes them in
subsequent commits.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Wire the 5 properties into the LWC JS class

**Files:**
- Modify: `Web_Engagements_RT_Timeline/force-app/main/default/lwc/webEngagementData/webEngagementData.js`

- [ ] **Step 1: Read the current top of the JS file**

The file currently starts with:

```javascript
import { LightningElement, api } from 'lwc';
import getWebEngagementData from '@salesforce/apex/DataCloudWebEngagementController.getWebEngagementData';

export default class WebEngagementData extends LightningElement {
    @api recordId;
    webInteractions = [];

    isLoading = false;
    hasError = false;
    errorMessage = '';

    connectedCallback() {
        this.handleRefresh();
    }
```

- [ ] **Step 2: Add `@api` declarations after `recordId`**

Find the line `@api recordId;` and replace the `recordId` block + the `webInteractions = [];` line with:

```javascript
    @api recordId;

    // App Builder properties — defaults match webEngagementData.js-meta.xml.
    @api dataGraphName = 'RT_Web_Engagementsv2';
    @api cardTitle = 'Real Time Engagements';
    @api cardTitleLink = '';
    @api feedHeight = 600;
    @api autoSize = false;

    webInteractions = [];
```

> **Note:** `@api` properties accept defaults that fire when App Builder doesn't set the prop. Even though the meta-XML has matching defaults, the JS defaults are still required for design-time and unit-test contexts where the harness instantiates the class without metadata.

- [ ] **Step 3: Pass `dataGraphName` to the Apex call**

Find the Apex call inside `handleRefresh()`:

```javascript
        getWebEngagementData({ accountId: this.recordId })
            .then(rawResponse => {
```

Replace with:

```javascript
        getWebEngagementData({ accountId: this.recordId, dataGraphName: this.dataGraphName })
            .then(rawResponse => {
```

- [ ] **Step 4: Add the `feedStyle` getter**

Find the existing `get hasInteractions()` getter (near the end of the class):

```javascript
    get hasInteractions() {
        return this.webInteractions.length > 0;
    }
}
```

Replace with:

```javascript
    get hasInteractions() {
        return this.webInteractions.length > 0;
    }

    /**
     * Inline style string for the .engagement-feed container.
     * - autoSize on  → cap at 90% of viewport height
     * - autoSize off → cap at the numeric feedHeight (px)
     * Always sets `overflow-y: auto` so scrolling kicks in once the cap is hit.
     */
    get feedStyle() {
        const cap = this.autoSize ? '90vh' : `${this.feedHeight}px`;
        return `max-height: ${cap}; overflow-y: auto;`;
    }

    /**
     * True when an explicit cardTitleLink was provided in App Builder.
     * Used by the template to choose between an <a> and plain text.
     */
    get headerTitleIsLink() {
        return Boolean(this.cardTitleLink);
    }
}
```

- [ ] **Step 5: Validate JS compile**

```bash
cd Web_Engagements_RT_Timeline
sf project deploy validate --source-dir force-app/main/default/lwc --wait 10
```

Expected: `Validation succeeded`.

If you get a JS parse error, the most likely cause is a missing comma or trailing `}` from the edits. Re-read the surrounding context.

- [ ] **Step 6: Commit**

```bash
cd ..
git add Web_Engagements_RT_Timeline/force-app/main/default/lwc/webEngagementData/webEngagementData.js
git commit -m "feat(web-engagements): wire App Builder properties into webEngagementData JS

- @api declarations for dataGraphName, cardTitle, cardTitleLink, feedHeight, autoSize
- Apex call now sends dataGraphName so the Data Graph URL is configurable
- feedStyle getter computes inline max-height (90vh when autoSize on, feedHeight px otherwise)
- headerTitleIsLink getter drives the template's link-vs-plain branch

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Bind the new properties in the LWC template

**Files:**
- Modify: `Web_Engagements_RT_Timeline/force-app/main/default/lwc/webEngagementData/webEngagementData.html`

- [ ] **Step 1: Replace the hardcoded title with a configurable one**

Find:

```html
        <h3 slot="title">
            <a href="https://cumulusbank-620df6d1b36b.herokuapp.com/login" target="_blank" class="slds-card__header-link slds-truncate">
                Real Time Engagements
            </a>
        </h3>
```

Replace with:

```html
        <h3 slot="title">
            <template lwc:if={headerTitleIsLink}>
                <a href={cardTitleLink} target="_blank" class="slds-card__header-link slds-truncate">
                    {cardTitle}
                </a>
            </template>
            <template lwc:else>
                <span class="slds-truncate">{cardTitle}</span>
            </template>
        </h3>
```

> **Note:** `lwc:if` / `lwc:else` is the modern conditional-rendering directive (introduced in Spring '23, API 57+; safe at API 65). The old `if:true` / `if:false` would also work but doesn't pair as cleanly when there are two branches.

- [ ] **Step 2: Bind `feedStyle` on the feed container**

Find:

```html
        <div class="slds-p-around_medium engagement-feed">
```

Replace with:

```html
        <div class="slds-p-around_medium engagement-feed" style={feedStyle}>
```

- [ ] **Step 3: Validate template compile**

```bash
cd Web_Engagements_RT_Timeline
sf project deploy validate --source-dir force-app/main/default/lwc --wait 10
```

Expected: `Validation succeeded`.

If validation reports `Inline styles are not allowed`, the org has a CSP setting blocking inline `style=` attributes. STOP and report — Plan 2 then needs to take a different approach (e.g., applying classes via `classList` in `connectedCallback`). This is unlikely; LWC has supported `style={...}` bindings since API 53.

- [ ] **Step 4: Commit**

```bash
cd ..
git add Web_Engagements_RT_Timeline/force-app/main/default/lwc/webEngagementData/webEngagementData.html
git commit -m "feat(web-engagements): bind cardTitle/link and feedStyle in template

- Title is configurable via {cardTitle}; renders as <a> when
  cardTitleLink is set, else plain text.
- Feed container's max-height is now driven by {feedStyle} from JS
  instead of hardcoded CSS.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Remove the hardcoded `max-height` from CSS

**Files:**
- Modify: `Web_Engagements_RT_Timeline/force-app/main/default/lwc/webEngagementData/webEngagementData.css`

- [ ] **Step 1: Remove the two `max-height` / `overflow-y` lines from `.engagement-feed`**

Find:

```css
.engagement-feed {
    background-color: var(--slds-g-color-neutral-base-100, #ffffff); /* Clean white for timeline */
    border: 1px solid var(--slds-g-color-border-base-4, #dddbda);
    border-radius: 4px;
    padding: 10px;
    max-height: 600px; 
    overflow-y: auto;  /* Enables the scrollbar */
}
```

Replace with:

```css
.engagement-feed {
    background-color: var(--slds-g-color-neutral-base-100, #ffffff); /* Clean white for timeline */
    border: 1px solid var(--slds-g-color-border-base-4, #dddbda);
    border-radius: 4px;
    padding: 10px;
    /* max-height + overflow-y now come from the inline style={feedStyle}
       computed by the LWC class — that lets feedHeight + autoSize control
       both at runtime. */
}
```

The rest of the CSS file (the `.engagement-details-box` rule and the `.slds-timeline__item_expandable:hover` rule) is unchanged.

- [ ] **Step 2: Validate**

```bash
cd Web_Engagements_RT_Timeline
sf project deploy validate --source-dir force-app/main/default/lwc --wait 10
```

Expected: `Validation succeeded`.

- [ ] **Step 3: Commit**

```bash
cd ..
git add Web_Engagements_RT_Timeline/force-app/main/default/lwc/webEngagementData/webEngagementData.css
git commit -m "style(web-engagements): drop hardcoded .engagement-feed max-height

The inline style={feedStyle} now drives max-height and overflow-y
based on autoSize + feedHeight App Builder properties. Comment marks
where the runtime override comes from for future maintainers.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Scaffold Jest for the project

**Files:**
- Create: `Web_Engagements_RT_Timeline/package.json`
- Create: `Web_Engagements_RT_Timeline/jest.config.js`
- Create: `Web_Engagements_RT_Timeline/.gitignore` (if not already present)
- Created by `npm install`, must be committed: `Web_Engagements_RT_Timeline/package-lock.json`

- [ ] **Step 1: Check whether `Web_Engagements_RT_Timeline/.gitignore` exists**

```bash
ls -la Web_Engagements_RT_Timeline/.gitignore 2>&1 | head -3
```

If it doesn't exist, create it in Step 3. If it does, append `node_modules/` to it (skip duplicate).

- [ ] **Step 2: Create `package.json`**

Write to `Web_Engagements_RT_Timeline/package.json`:

```json
{
  "name": "web-engagements-rt-timeline",
  "version": "1.0.0",
  "private": true,
  "description": "Salesforce DX project: real-time Data Cloud web engagement timeline LWC + Apex.",
  "scripts": {
    "test": "sfdx-lwc-jest"
  },
  "devDependencies": {
    "@salesforce/sfdx-lwc-jest": "^7.0.0"
  }
}
```

- [ ] **Step 3: Create `jest.config.js`**

Write to `Web_Engagements_RT_Timeline/jest.config.js`:

```javascript
const { jestConfig } = require('@salesforce/sfdx-lwc-jest/config');

module.exports = {
    ...jestConfig
};
```

- [ ] **Step 4: Create or update `.gitignore`**

If `Web_Engagements_RT_Timeline/.gitignore` does not exist, create it with:

```
node_modules/
*.log
.DS_Store
```

If it exists, append `node_modules/` and `*.log` if not already present (skip if they are).

- [ ] **Step 5: Install Jest**

```bash
cd Web_Engagements_RT_Timeline
npm install
```

Expected output: a tree of installed packages, no errors. Creates `Web_Engagements_RT_Timeline/node_modules/` and `Web_Engagements_RT_Timeline/package-lock.json`.

If `npm install` fails because Node isn't installed, REPORT BLOCKED. Don't try to install Node from the plan.

If it warns about peer-dependency mismatches, that's typical for the LWC Jest preset; proceed.

- [ ] **Step 6: Commit (excluding `node_modules/`)**

```bash
cd ..
git add Web_Engagements_RT_Timeline/package.json Web_Engagements_RT_Timeline/jest.config.js Web_Engagements_RT_Timeline/.gitignore Web_Engagements_RT_Timeline/package-lock.json
git commit -m "chore(web-engagements): scaffold Jest for LWC unit tests

- package.json: pinned @salesforce/sfdx-lwc-jest devDep, npm test script
- jest.config.js: extends the standard SFDX preset
- .gitignore: excludes node_modules/, *.log, .DS_Store

First Jest setup in this repo. Prior LWCs (DC_Person/Business widgets etc.)
still ship without Jest; we adopt it here because Plan 3's helper modules
will be pure functions where Jest has the highest ROI.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

> **Note:** `package-lock.json` lists transitive dependency versions and is committed for reproducibility. `node_modules/` is gitignored.

---

## Task 9: Write Jest tests for `feedStyle` and `headerTitleIsLink`

**Files:**
- Create: `Web_Engagements_RT_Timeline/force-app/main/default/lwc/webEngagementData/__tests__/webEngagementData.test.js`

- [ ] **Step 1: Create the `__tests__` directory and test file**

Write to `Web_Engagements_RT_Timeline/force-app/main/default/lwc/webEngagementData/__tests__/webEngagementData.test.js`:

```javascript
import { createElement } from 'lwc';
import WebEngagementData from 'c/webEngagementData';

describe('c-web-engagement-data', () => {
    afterEach(() => {
        // Clean up any DOM created by previous tests.
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    function buildElement(props = {}) {
        const el = createElement('c-web-engagement-data', { is: WebEngagementData });
        Object.assign(el, props);
        document.body.appendChild(el);
        return el;
    }

    describe('feedStyle getter', () => {
        it('uses feedHeight in pixels when autoSize is off', () => {
            const el = buildElement({ feedHeight: 800, autoSize: false });
            expect(el.feedStyle).toBe('max-height: 800px; overflow-y: auto;');
        });

        it('falls back to default 600px when feedHeight not set and autoSize is off', () => {
            const el = buildElement({ autoSize: false });
            expect(el.feedStyle).toBe('max-height: 600px; overflow-y: auto;');
        });

        it('uses 90vh when autoSize is on, ignoring feedHeight', () => {
            const el = buildElement({ feedHeight: 800, autoSize: true });
            expect(el.feedStyle).toBe('max-height: 90vh; overflow-y: auto;');
        });
    });

    describe('headerTitleIsLink getter', () => {
        it('returns true when cardTitleLink is set', () => {
            const el = buildElement({ cardTitleLink: 'https://example.com' });
            expect(el.headerTitleIsLink).toBe(true);
        });

        it('returns false when cardTitleLink is empty string', () => {
            const el = buildElement({ cardTitleLink: '' });
            expect(el.headerTitleIsLink).toBe(false);
        });

        it('returns false when cardTitleLink is not set (default)', () => {
            const el = buildElement({});
            expect(el.headerTitleIsLink).toBe(false);
        });
    });
});
```

> **Note on `el.feedStyle` direct access:** `feedStyle` and `headerTitleIsLink` are getters on the LWC class. In LWC Jest, properties defined on the class instance — including getters — are accessible from the test once the element is appended to the DOM. The harness handles the LWC reactivity.

- [ ] **Step 2: Run Jest**

```bash
cd Web_Engagements_RT_Timeline
npm test
```

Expected output (key lines):

```
PASS  force-app/main/default/lwc/webEngagementData/__tests__/webEngagementData.test.js
  c-web-engagement-data
    feedStyle getter
      ✓ uses feedHeight in pixels when autoSize is off
      ✓ falls back to default 600px when feedHeight not set and autoSize is off
      ✓ uses 90vh when autoSize is on, ignoring feedHeight
    headerTitleIsLink getter
      ✓ returns true when cardTitleLink is set
      ✓ returns false when cardTitleLink is empty string
      ✓ returns false when cardTitleLink is not set (default)

Tests:       6 passed, 6 total
```

If Jest fails with `Cannot find module 'c/webEngagementData'`, the LWC Jest preset's resolver isn't picking up the `force-app/main/default/lwc/` directory. Run `npx sfdx-lwc-jest --help` to verify the binary is installed; if it's missing, `npm install` again from Step 8.5.

If a single test fails with a string mismatch like `Expected: "max-height: 800px; overflow-y: auto;"` vs `Received: "max-height: 800px"`, Task 5's `feedStyle` getter implementation is missing the `overflow-y` segment. Re-check.

- [ ] **Step 3: Commit**

```bash
cd ..
git add Web_Engagements_RT_Timeline/force-app/main/default/lwc/webEngagementData/__tests__/webEngagementData.test.js
git commit -m "test(web-engagements): cover feedStyle + headerTitleIsLink getters with Jest

Six Jest tests:
- feedStyle: pixel value when autoSize off (custom + default), 90vh when on
- headerTitleIsLink: true when cardTitleLink set, false when empty/unset

First Jest test in this repo. Plan 3 will extend coverage to mappers
once parseDataGraphResponse is lifted out of the component.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Live deploy + post-deploy smoke test

**Files:** none modified

- [ ] **Step 1: Confirm target org**

```bash
sf config get target-org
```

Expected: `jdo-fw51xz`. If empty, REPORT BLOCKED.

- [ ] **Step 2: Real deploy with all 17 Apex tests**

```bash
cd Web_Engagements_RT_Timeline
sf project deploy start --source-dir force-app --tests DataCloudWebEngagementControllerTest --wait 20
```

Expected:
- `Deploy Succeeded.`
- `Component Failures · 0`
- `Tests · 17`
- `Test Failures · 0`

The deploy uploads:
- The modified `DataCloudWebEngagementController.cls` + meta-XML
- The modified `DataCloudWebEngagementControllerTest.cls` + meta-XML
- The modified LWC bundle (`webEngagementData.js`, `.html`, `.css`, `.js-meta.xml`)

If you get `Cannot deploy class file without meta-xml`, see Plan 1 Task 10's note.

- [ ] **Step 3: Confirm the LWC's design-time properties show up in App Builder**

This is a manual smoke test — the engineer should browse to the org's App Builder, open an Account record page, drop the `Real Time Digital Engagements` component on the layout, and confirm 5 new properties are visible in the right rail with the documented defaults:

| Property | Default |
|---|---|
| Data Graph API name | `RT_Web_Engagementsv2` |
| Card title | `Real Time Engagements` |
| Card title link URL | (empty) |
| Feed height (px) | `600` |
| Auto-size feed | (unchecked) |

If the smoke test passes, the implementer notes "App Builder properties confirmed visible" in their report. If it fails (properties missing or labels wrong), STOP and re-read the meta-XML from Task 4.

> **Note for non-interactive subagents:** if the implementer can't browse a UI from a CLI subagent, skip Step 3 and report `App Builder smoke test deferred to human` — the deploy success and Jest passes are sufficient validation that the meta-XML compiled and the runtime contract is intact.

- [ ] **Step 4: No commit needed — deploy is read-only**

---

## Task 11: Update README with App Builder properties section

**Files:**
- Modify: `Web_Engagements_RT_Timeline/README.md`

- [ ] **Step 1: Read the current README structure**

Read `Web_Engagements_RT_Timeline/README.md`. Find the "Customizing for your data" table. After Plan 1, that table likely still exists with rows like "Data Graph API name | DataCloudWebEngagementController.cls → DATA_GRAPH_NAME". After Plan 2, several of those rows are wrong — values are now App Builder properties, not source code edits.

- [ ] **Step 2: Add an "App Builder properties" section**

Find the "Customizing for your data" section heading (`## Customizing for your data` or similar). Insert this new section IMMEDIATELY ABOVE it (so the App Builder route is the first thing readers see, with the source-code route as the fallback below):

```markdown
## App Builder properties

Once deployed, the **Real Time Digital Engagements** component exposes 5 properties in App Builder. Configure per-instance — no code changes needed for common admin tasks.

| Property | Default | Description |
|---|---|---|
| **Data Graph API name** | `RT_Web_Engagementsv2` | API name of the Data Cloud Data Graph this card pulls from. Change to point at any other Data Graph in the same org. |
| **Card title** | `Real Time Engagements` | Header text shown on the card. |
| **Card title link URL** | _(blank)_ | Optional URL the card title links to. Leave blank for plain text. |
| **Feed height (px)** | `600` | Maximum height of the feed before scrolling. Ignored when Auto-size is on. |
| **Auto-size feed** | _off_ | When on, feed grows up to 90% of viewport height. Overrides Feed height. |

Defaults preserve the component's pre-Plan-2 behavior — existing record pages see no change after deploy.

---
```

- [ ] **Step 3: Update the "Customizing for your data" table to drop now-redundant rows**

The "Customizing for your data" table likely has these rows that should now point readers to App Builder instead of source:

| Change | Where (current/wrong) |
|---|---|
| Data Graph API name | `DataCloudWebEngagementController.cls` → `DATA_GRAPH_NAME` |
| Card title link | `webEngagementData.html` → `<a href="...">Real Time Engagements</a>` |
| Feed max height / scroll | `webEngagementData.css` → `.engagement-feed { max-height: 600px }` |

Find the existing table. Replace those three rows with one new row at the top of the table:

```markdown
| Data Graph name, card title/link, feed height/auto-size | **App Builder property** — see "App Builder properties" section above |
```

Leave the remaining rows (Link Object DLO API name, Engagement DMO name, Title/subtitle/icon rules, Detail rows) unchanged — those are still source-code customizations until Plan 3.

> **Note:** If the README has been edited since Plan 1 and the "Customizing for your data" table no longer matches the structure described, adapt: ensure the new "App Builder properties" section is present, and any rows in the source-customization table that are now superseded by an App Builder property get removed.

- [ ] **Step 4: Commit**

```bash
cd ..
git add Web_Engagements_RT_Timeline/README.md
git commit -m "docs(web-engagements): document the 5 new App Builder properties

Adds 'App Builder properties' section listing all 5 plus defaults.
Removes three rows from 'Customizing for your data' that pointed to
source-code edits — those are now App Builder configuration.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Final verification

**Files:** none modified

- [ ] **Step 1: Confirm git tree is clean**

```bash
git status
```

Expected: `nothing to commit, working tree clean` (the `.claude/` directory may still appear as untracked — ignore it; same for `node_modules/` which is gitignored).

- [ ] **Step 2: Run all Apex tests**

```bash
cd Web_Engagements_RT_Timeline
sf apex run test --class-names DataCloudWebEngagementControllerTest --result-format human --code-coverage --wait 15 --synchronous
```

Expected: `Tests Ran 17`, `Pass Rate · 100%`, coverage on `DataCloudWebEngagementController` ~83%.

- [ ] **Step 3: Run all Jest tests**

```bash
npm test
```

Expected: `Tests: 6 passed, 6 total`.

- [ ] **Step 4: Show the final commit log for Plan 2**

```bash
cd ..
git log --oneline 7bce524..HEAD
```

Expected: 11-12 commits since the start of Plan 2 (one per Task 1-9 + Task 11; Tasks 10 and 12 don't commit).

- [ ] **Step 5: Plan 2 complete**

Plan 2 is done when:
- ✅ `DataCloudWebEngagementController.getWebEngagementData(String, String)` accepts `dataGraphName`
- ✅ Test class still passes 17 tests at ≥80% coverage
- ✅ LWC has 5 new App Builder properties wired through JS, HTML, and meta-XML
- ✅ CSS no longer has hardcoded `max-height`
- ✅ Jest is set up at the project root with 6 passing tests
- ✅ `README.md` documents the 5 new properties
- ✅ Live deploy against `admin@finsdc3.demo` succeeded with tests green

The branch `worktree-web-engagements-hardening` now holds Plan 1 + Plan 2. Plan 3 (multi-source) builds on top.

---

## Spec coverage check

| Spec section / line | Plan 2 task | Note |
|---|---|---|
| §4 property `dataGraphName` (String, default `RT_Web_Engagementsv2`) | Task 4 step 2 | Direct |
| §4 property `cardTitle` (String, default `Real Time Engagements`) | Task 4 step 2 | Direct |
| §4 property `cardTitleLink` (String, default empty) | Task 4 step 2 | Direct |
| §4 property `feedHeight` (Integer, default 600) | Task 4 step 2 | Direct |
| §4 property `autoSize` (Boolean, default false) | Task 4 step 2 | Direct |
| §4 "Required tweak to DataCloudWebEngagementController" | Task 1 | Direct (signature change with default fallback) |
| §4 "Defaults preserve today's behavior" | Tasks 4 + 5 | Both meta-XML and JS @api defaults match the original constants |
| §5 `feedStyle` getter | Task 5 step 4 | Direct |
| §5 `headerTitleIsLink` getter | Task 5 step 4 | Direct |
| §5 template title link branch | Task 6 step 1 | Direct |
| §5 template `style={feedStyle}` binding | Task 6 step 2 | Direct |
| §7 testing line: "Apex test: extend DataCloudWebEngagementControllerTest for the new parameter" | Task 3 | Direct (CapturingMock + 2 tests) |
| §7 testing line: "Jest scaffolding + cover feedStyle getter" | Tasks 8 + 9 | Direct |
| §9 Plan 2 line: "Apex: add `dataGraphName` parameter to getWebEngagementData" | Task 1 | Direct |
| §9 Plan 2 line: "LWC meta-XML: add 5 properties" | Task 4 | Direct |
| §9 Plan 2 line: "LWC JS: thread properties through; height styling getter; title link branch" | Task 5 | Direct |
| §9 Plan 2 line: "LWC HTML: dynamic title; feedStyle binding" | Task 6 | Direct |
| §9 Plan 2 line: "LWC CSS: remove hardcoded max-height" | Task 7 | Direct |
| §9 Plan 2 line: "Apex test: extend DataCloudWebEngagementControllerTest" | Task 3 | Direct |
| §9 Plan 2 line: "Jest: scaffold + cover feedStyle getter" | Tasks 8 + 9 | Direct |
| §11 decision: "Apex shape: One method, fan-out internally" | n/a Plan 3 | Out of scope for Plan 2 |

Spec sections 2, 3, 5 (sourceConfig.js + timelineMappers.js + most of the LWC), 6, 7 (CrmTimelineControllerTest + most Jest scope), 9 Plan 1 + Plan 3 lines: out of scope for Plan 2 — they're either Plan 1 (already done) or Plan 3 (next).
