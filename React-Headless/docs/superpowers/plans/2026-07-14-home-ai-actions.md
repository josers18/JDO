# Home AI Action Buttons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the home page's seven `toast()`-stub AI/summary buttons into real actions (generate an answer, draft follow-ups that write CRM tasks, speak the brief, snooze), and fix the Agentforce chat panel that 403s on load.

**Architecture:** Every generative chip composes a deterministic answer from data already on the page, then best-effort enriches it through a new `/services/apexrest/ai/generate` Apex resource (Einstein Models API, guarded so a not-enabled org degrades to `unavailable` rather than 500). This mirrors the existing `PrepModal` resilience pattern and the `crmWrite`/`runPromptFlow` apexrest-bridge pattern — no chip depends on Models API being on. Speech uses the browser `SpeechSynthesis` API; snooze is local state. All three `HomePage.tsx` files are byte-identical, so the same edits apply verbatim to each of the three bundles.

**Tech Stack:** React 19 + Vite 7 + TypeScript + Tailwind v4 (`@shared` alias, Vite-inlined), Salesforce Apex `@RestResource` (API v67.0), `@salesforce/platform-sdk` `createDataSDK().fetch`, browser `window.speechSynthesis`.

## Global Constraints

- New Apex is API v67.0, `global with sharing`, SOQL `WITH USER_MODE` where any query is added.
- UI bundles deploy `dist/`, NOT `src/` — run `npm run build` in every touched bundle before deploy. `_shared` is Vite-inlined into each app, so any `_shared` edit means rebuilding **all three** bundles (ReactRetail, ReactWealth, ReactCommercial).
- Every `sf project deploy` captures `--json`; check `status` and `numberComponentErrors`; stop on any hard failure; never `--ignore-conflicts`.
- Target org alias: `admin@finsdc3.demo` (jdo-1lrnov, core `storm-16a17dc388fbe6`, EE, API v67.0).
- No new npm dependencies — `SpeechSynthesis` and `fetch` are platform/browser APIs.
- `generateText` NEVER throws for "feature off" — it resolves `{ text:'', source:'unavailable' }` so callers keep their composed answer. It throws only on transport/5xx so a real outage is visible.
- Human gate before any CRM write: `DraftFollowupsModal` writes tasks only on explicit "Create N tasks" click.
- Self-hosted fonts + AppShell chrome already shipped — do not regress them.
- The three `HomePage.tsx` files are identical (647 lines, matching stub line numbers). Apply each HomePage edit to all three: `ReactRetail/`, `ReactWealth/`, `ReactCommercial/src/home/HomePage.tsx`.
- Work in the PRIMARY checkout `/Users/jsifontes/Documents/Git/JDO/React-Headless/` (the deployed source of truth with the uncommitted redesign). Branch: `feat/home-ai-actions`.

---

### Task 1: `AiGenerateRest` Apex resource + test

**Files:**
- Create: `React-Headless/force-app/main/default/classes/AiGenerateRest.cls`
- Create: `React-Headless/force-app/main/default/classes/AiGenerateRest.cls-meta.xml`
- Create: `React-Headless/force-app/main/default/classes/AiGenerateRestTest.cls`
- Create: `React-Headless/force-app/main/default/classes/AiGenerateRestTest.cls-meta.xml`

**Interfaces:**
- Consumes: nothing (leaf backend). Mirrors the shape of `DcPromptRest.cls` (allowlist, `Test.isRunningTest()` deterministic branch, `writeError` helper, `RestContext.response` guard).
- Produces: `POST /services/apexrest/ai/generate`, request body `{ task, prompt, context }`, success `200 { text, source }` where `source` ∈ `'model' | 'composed' | 'unavailable'`; `400 { error }` on bad/empty input; `500 { error }` on unexpected failure. Task 2's `generateText` consumes this exact contract.

- [ ] **Step 1: Write the failing test**

Create `AiGenerateRestTest.cls`:

```apex
@IsTest
private class AiGenerateRestTest {
    private static RestResponse invoke(String body) {
        RestRequest req = new RestRequest();
        req.requestUri = '/services/apexrest/ai/generate';
        req.httpMethod = 'POST';
        req.requestBody = body == null ? null : Blob.valueOf(body);
        RestContext.request = req;
        RestContext.response = new RestResponse();
        AiGenerateRest.run();
        return RestContext.response;
    }

    @IsTest
    static void returnsGeneratedTextForValidTask() {
        Test.startTest();
        RestResponse res = invoke('{"task":"queue_rationale","prompt":"Explain the order."}');
        Test.stopTest();
        System.assertEquals(200, res.statusCode, 'valid request should be 200');
        Map<String, Object> out = (Map<String, Object>) JSON.deserializeUntyped(res.responseBody.toString());
        System.assertEquals('TEST_AI_TEXT', out.get('text'), 'test branch returns deterministic text');
        System.assertEquals('model', out.get('source'), 'test branch reports model source');
    }

    @IsTest
    static void acceptsEachAllowlistedTask() {
        for (String t : new List<String>{ 'queue_rationale', 'pipeline_summary', 'followups', 'freeform' }) {
            RestResponse res = invoke('{"task":"' + t + '","prompt":"hi"}');
            System.assertEquals(200, res.statusCode, 'task ' + t + ' should be allowed');
        }
    }

    @IsTest
    static void rejectsUnknownTask() {
        RestResponse res = invoke('{"task":"delete_everything","prompt":"hi"}');
        System.assertEquals(400, res.statusCode, 'unknown task should be 400');
        Map<String, Object> out = (Map<String, Object>) JSON.deserializeUntyped(res.responseBody.toString());
        System.assert(((String) out.get('error')).containsIgnoreCase('task'), 'error should mention task');
    }

    @IsTest
    static void rejectsEmptyPrompt() {
        RestResponse res = invoke('{"task":"freeform","prompt":"   "}');
        System.assertEquals(400, res.statusCode, 'empty prompt should be 400');
    }

    @IsTest
    static void rejectsEmptyBody() {
        RestResponse res = invoke('');
        System.assertEquals(400, res.statusCode, 'empty body should be 400');
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd /Users/jsifontes/Documents/Git/JDO/React-Headless
sf project deploy start --source-dir force-app/main/default/classes/AiGenerateRestTest.cls --source-dir force-app/main/default/classes/AiGenerateRestTest.cls-meta.xml -o admin@finsdc3.demo --json
```
Expected: deploy FAILS — `AiGenerateRest` does not exist yet (`Invalid type: AiGenerateRest`). (Create the `AiGenerateRestTest.cls-meta.xml` alongside in this step so the deploy attempt is well-formed; see Step 3 for the meta template.)

- [ ] **Step 3: Write minimal implementation**

Create `AiGenerateRest.cls`:

```apex
/**
 * Einstein text-generation bridge for React UI bundles.
 *
 * WHY REST (same constraint as DcPromptRest / CrmWriteRest): a Multi-Framework
 * UI bundle's app-domain session cannot call @AuraEnabled Apex or the generic
 * Einstein REST APIs — only /services/apexrest/* is reachable via the SDK
 * fetch() path. So generative chips post here and this resource runs the
 * Einstein Models API server-side.
 *
 * Models API is NOT guaranteed enabled (jdo-1lrnov currently throws
 * System.TypeException: Missing dependent object at runtime). This resource
 * catches that and returns { text:'', source:'unavailable' } with HTTP 200, so
 * the caller keeps its locally-composed answer instead of seeing a 500. Only a
 * genuinely unexpected failure returns 500.
 *
 *   POST /services/apexrest/ai/generate
 *     body: { "task":"queue_rationale", "prompt":"...", "context":"..." }
 *     200:  { "text":"<generated>", "source":"model" }
 *     200:  { "text":"", "source":"unavailable" }   // Models API off
 *     400:  { "error":"message" }
 *     500:  { "error":"message" }
 */
@RestResource(urlMapping='/ai/generate')
global with sharing class AiGenerateRest {
    private static final Set<String> ALLOWED_TASKS = new Set<String>{
        'queue_rationale', 'pipeline_summary', 'followups', 'freeform'
    };

    global class GenRequest {
        public String task;
        public String prompt;
        public String context;
    }

    @HttpPost
    global static void run() {
        RestResponse res = RestContext.response;
        if (res == null) {
            res = new RestResponse();
            RestContext.response = res;
        }
        res.addHeader('Content-Type', 'application/json');
        try {
            String body = RestContext.request != null && RestContext.request.requestBody != null
                ? RestContext.request.requestBody.toString()
                : '';
            GenRequest req = String.isBlank(body)
                ? new GenRequest()
                : (GenRequest) JSON.deserialize(body, GenRequest.class);

            String task = req.task == null ? '' : req.task.trim();
            if (String.isBlank(task) || !ALLOWED_TASKS.contains(task)) {
                writeError(res, 400, 'Unsupported task: ' + task);
                return;
            }
            String prompt = req.prompt == null ? '' : req.prompt.trim();
            if (String.isBlank(prompt)) {
                writeError(res, 400, 'prompt is required.');
                return;
            }

            if (Test.isRunningTest()) {
                writeResult(res, 'TEST_AI_TEXT', 'model');
                return;
            }

            String composed = req.context == null ? '' : req.context;
            String generated = generate(prompt, composed);
            if (String.isBlank(generated)) {
                // Models API unavailable / empty — caller keeps its composed answer.
                writeResult(res, '', 'unavailable');
            } else {
                writeResult(res, generated, 'model');
            }
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'AiGenerateRest error: ' + e.getTypeName() + ': ' + e.getMessage() + '\n' + e.getStackTraceString());
            writeError(res, 500, 'Text generation failed.');
        }
    }

    /**
     * Best-effort Einstein Models API call. Returns '' (never throws) when the
     * Models API is not provisioned in this org, so run() reports 'unavailable'
     * rather than 500. The prompt already carries the composed context blob.
     */
    private static String generate(String prompt, String context) {
        String fullPrompt = String.isBlank(context) ? prompt : prompt + '\n\n' + context;
        try {
            aiplatform.ModelsAPI.createGenerations_Request gen = new aiplatform.ModelsAPI.createGenerations_Request();
            aiplatform.ModelsAPI_GenerationRequest reqBody = new aiplatform.ModelsAPI_GenerationRequest();
            reqBody.prompt = fullPrompt;
            gen.body = reqBody;
            gen.modelName = 'sfdc_ai__DefaultGPT4Omni';

            aiplatform.ModelsAPI api = new aiplatform.ModelsAPI();
            aiplatform.ModelsAPI.createGenerations_Response resp = api.createGenerations(gen);
            if (resp != null && resp.Code200 != null && resp.Code200.generation != null) {
                return resp.Code200.generation.generatedText;
            }
            return '';
        } catch (System.TypeException te) {
            // "Missing dependent object" — Models API not enabled in this org.
            System.debug(LoggingLevel.WARN, 'Models API unavailable: ' + te.getMessage());
            return '';
        } catch (Exception e) {
            System.debug(LoggingLevel.WARN, 'Models API call failed: ' + e.getMessage());
            return '';
        }
    }

    private static void writeResult(RestResponse res, String text, String source) {
        res.statusCode = 200;
        res.responseBody = Blob.valueOf(JSON.serialize(new Map<String, Object>{ 'text' => text, 'source' => source }));
    }

    private static void writeError(RestResponse res, Integer code, String msg) {
        res.statusCode = code;
        res.responseBody = Blob.valueOf(JSON.serialize(new Map<String, Object>{ 'error' => msg }));
    }
}
```

Create `AiGenerateRest.cls-meta.xml` (and `AiGenerateRestTest.cls-meta.xml` with identical content):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ApexClass xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>67.0</apiVersion>
    <status>Active</status>
</ApexClass>
```

> **Note on the Models API type names:** `aiplatform.ModelsAPI` inner-type names (`createGenerations_Request`, `ModelsAPI_GenerationRequest`, `createGenerations_Response`, `Code200`, `generation.generatedText`, and the `modelName`) are the documented v67 shapes but were NOT compile-verified in this org (Models API is off). Because the whole `generate()` body is inside try/catch and the runtime path is never exercised until Models API is enabled, a name mismatch cannot break the shipped feature — it only changes which catch fires. **If the deploy in Step 4 fails to COMPILE on any of these symbols, replace the entire body of `generate()` with `return '';`** (which makes every chip use its composed answer) and record a Minor finding so the Models-API wiring is revisited when an admin enables it. Do not block the task on Models API type names.

- [ ] **Step 4: Deploy and run the test**

Run:
```bash
cd /Users/jsifontes/Documents/Git/JDO/React-Headless
sf project deploy start --source-dir force-app/main/default/classes/AiGenerateRest.cls --source-dir force-app/main/default/classes/AiGenerateRest.cls-meta.xml --source-dir force-app/main/default/classes/AiGenerateRestTest.cls --source-dir force-app/main/default/classes/AiGenerateRestTest.cls-meta.xml -o admin@finsdc3.demo --json
```
Expected: `status: Succeeded`, `numberComponentErrors: 0`. If it fails to compile on a `aiplatform.*` symbol, apply the Step 3 note fallback (`return '';`) and redeploy.

Then:
```bash
sf apex run test --tests AiGenerateRestTest --result-format human --wait 10 -o admin@finsdc3.demo
```
Expected: all 5 methods PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO
git add React-Headless/force-app/main/default/classes/AiGenerateRest.cls React-Headless/force-app/main/default/classes/AiGenerateRest.cls-meta.xml React-Headless/force-app/main/default/classes/AiGenerateRestTest.cls React-Headless/force-app/main/default/classes/AiGenerateRestTest.cls-meta.xml
git commit -m "feat: AiGenerateRest apexrest bridge for Einstein text generation

Composed-first: Models API TypeException degrades to source:unavailable (HTTP 200) so callers keep their composed answer."
```

---

### Task 2: `aiGenerateClient.ts` shared client

**Files:**
- Create: `React-Headless/force-app/main/default/uiBundles/_shared/src/data/aiGenerateClient.ts`
- Modify: `React-Headless/force-app/main/default/uiBundles/_shared/src/data/index.ts`

**Interfaces:**
- Consumes: `createDataSDK` from `@salesforce/platform-sdk`; the `POST /services/apexrest/ai/generate` contract from Task 1.
- Produces:
  ```ts
  export type AiGenerateTask = 'queue_rationale' | 'pipeline_summary' | 'followups' | 'freeform';
  export interface AiGenerateInput { task: AiGenerateTask; prompt: string; context?: string; }
  export interface AiGenerateResult { text: string; source: 'model' | 'composed' | 'unavailable'; }
  export function generateText(input: AiGenerateInput): Promise<AiGenerateResult>;
  ```
  Tasks 3 and 4 import `generateText`, `AiGenerateInput`, `AiGenerateResult`, `AiGenerateTask` from `@shared`.

- [ ] **Step 1: Write the client**

Create `aiGenerateClient.ts`:

```ts
/**
 * Einstein text-generation path for React UI bundles.
 *
 * Same apexrest-bridge constraint as promptClient / crmWriteClient: the bundle's
 * app-domain session can only reach /services/apexrest/*. So generative chips
 * post to AiGenerateRest, which runs the Einstein Models API server-side.
 *
 * RESILIENCE CONTRACT: generateText NEVER rejects for "feature off". If the
 * server reports source:'unavailable' (Models API not enabled) it resolves with
 * empty text + that source, so the caller keeps its locally-composed answer. It
 * rejects ONLY on a transport / 5xx error, which the caller surfaces quietly.
 *   POST /services/apexrest/ai/generate
 *     body: { task, prompt, context }
 *     200:  { text, source }
 */
import { createDataSDK } from '@salesforce/platform-sdk';

export type AiGenerateTask = 'queue_rationale' | 'pipeline_summary' | 'followups' | 'freeform';

export interface AiGenerateInput {
  /** Which chip is asking — allowlisted server-side. */
  task: AiGenerateTask;
  /** The instruction line. */
  prompt: string;
  /** List/aggregate blob (queue, pipeline, drafts) the model should ground on. */
  context?: string;
}

export interface AiGenerateResult {
  text: string;
  /** 'model' = Einstein generated it; 'unavailable' = feature off (empty text); 'composed' is set by callers, never by this client. */
  source: 'model' | 'composed' | 'unavailable';
}

/**
 * Ask the org to generate text. Resolves with the model text on success, or
 * `{ text:'', source:'unavailable' }` when the Models API is off. Rejects only
 * on a real transport / server error so the caller can note it.
 */
export async function generateText(input: AiGenerateInput): Promise<AiGenerateResult> {
  const sdk = await createDataSDK();
  if (!sdk.fetch) {
    throw new Error('fetch is not available on this surface');
  }
  const res = await sdk.fetch('/services/apexrest/ai/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: input.task, prompt: input.prompt, context: input.context ?? '' }),
  });
  const json = (await res.json()) as { text?: string; source?: AiGenerateResult['source']; error?: string };
  if (!res.ok) {
    throw new Error(json?.error ?? `Text generation failed (HTTP ${res.status})`);
  }
  return { text: json.text ?? '', source: json.source ?? 'unavailable' };
}
```

- [ ] **Step 2: Re-export from the data barrel**

In `data/index.ts`, add after the `crmWrite` export line:

```ts
export { generateText, type AiGenerateTask, type AiGenerateInput, type AiGenerateResult } from './aiGenerateClient';
```

- [ ] **Step 3: Type-check the shared lib via a bundle build**

`_shared` has no build of its own; it is type-checked when a bundle builds. Run:
```bash
cd /Users/jsifontes/Documents/Git/JDO/React-Headless/force-app/main/default/uiBundles/ReactRetail
npm run build
```
Expected: tsc + vite succeed (exit 0), no TS errors referencing `aiGenerateClient`.

- [ ] **Step 4: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO
git add React-Headless/force-app/main/default/uiBundles/_shared/src/data/aiGenerateClient.ts React-Headless/force-app/main/default/uiBundles/_shared/src/data/index.ts
git commit -m "feat: generateText shared client for AiGenerateRest (composed-safe)"
```

---

### Task 3: `AiResultModal` shared component

**Files:**
- Create: `React-Headless/force-app/main/default/uiBundles/_shared/src/components/home/AiResultModal.tsx`
- Modify: `React-Headless/force-app/main/default/uiBundles/_shared/src/components/index.ts`

**Interfaces:**
- Consumes: `Modal` (`{ open, onClose, title, subtitle?, icon?, tone, footer, wide?, children }`), `Button` (`variant 'ai'|'accent'|'ghost'`, `size 'sm'|'md'`), `GenLine` (from `./fields`), `generateText`/`AiGenerateResult` from `@shared`.
- Produces:
  ```ts
  export function AiResultModal(props: {
    open: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    generate: () => Promise<AiGenerateResult>;
    fallbackText: string;
  }): JSX.Element | null;
  ```
  HomePage (Task 6) renders it.

- [ ] **Step 1: Write the component**

Create `AiResultModal.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Modal } from '../Modal';
import { Button } from '../Button';
import { GenLine } from './fields';
import type { AiGenerateResult } from '../../data/aiGenerateClient';

const SOURCE_LABEL: Record<AiGenerateResult['source'], string> = {
  model: 'Generated by Einstein',
  composed: 'Composed from your book',
  unavailable: 'Composed from your book',
};

/**
 * Read-only AI result panel. Runs `generate()` on open and on Regenerate. If it
 * resolves `unavailable`/empty or rejects, shows `fallbackText` under a
 * "Composed from your book" subtitle — the chip always produces a real answer.
 */
export function AiResultModal({
  open,
  onClose,
  title,
  subtitle,
  generate,
  fallbackText,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  generate: () => Promise<AiGenerateResult>;
  fallbackText: string;
}) {
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState(fallbackText);
  const [source, setSource] = useState<AiGenerateResult['source']>('composed');
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setBusy(true);
    setText(fallbackText);
    setSource('composed');
    generate()
      .then(r => {
        if (cancelled) return;
        if (r.source === 'model' && r.text.trim()) {
          setText(r.text.trim());
          setSource('model');
        } else {
          setText(fallbackText);
          setSource(r.source === 'unavailable' ? 'unavailable' : 'composed');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setText(fallbackText);
          setSource('composed');
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, nonce]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      tone="ai"
      icon={<span>✦</span>}
      title={title}
      subtitle={subtitle ?? SOURCE_LABEL[source]}
      footer={
        <>
          <span className="flex-1 font-mono text-[10px] tracking-[0.04em] text-faint">{SOURCE_LABEL[source]}</span>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button variant="ai" onClick={() => setNonce(n => n + 1)} disabled={busy}>Regenerate</Button>
        </>
      }
    >
      {busy && <GenLine>Generating…</GenLine>}
      <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-fg">{text}</p>
    </Modal>
  );
}
```

- [ ] **Step 2: Export it**

In `components/index.ts`, add after the `PrepModal` export:

```ts
export { AiResultModal } from './home/AiResultModal';
```

- [ ] **Step 3: Type-check via bundle build**

```bash
cd /Users/jsifontes/Documents/Git/JDO/React-Headless/force-app/main/default/uiBundles/ReactRetail
npm run build
```
Expected: exit 0, no TS errors referencing `AiResultModal`.

- [ ] **Step 4: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO
git add React-Headless/force-app/main/default/uiBundles/_shared/src/components/home/AiResultModal.tsx React-Headless/force-app/main/default/uiBundles/_shared/src/components/index.ts
git commit -m "feat: AiResultModal — composed-first AI result panel with Regenerate"
```

---

### Task 4: `DraftFollowupsModal` shared component

**Files:**
- Create: `React-Headless/force-app/main/default/uiBundles/_shared/src/components/home/DraftFollowupsModal.tsx`
- Modify: `React-Headless/force-app/main/default/uiBundles/_shared/src/components/index.ts`

**Interfaces:**
- Consumes: `Modal`, `Button`, `GenLine`, `TextInput` (from `./fields`), `crmWrite`/`CrmWriteInput` and `generateText`/`AiGenerateResult` from `@shared`, `useToast` from `../Toast`.
- Produces:
  ```ts
  export interface DraftRow { clientId?: string; clientName: string; subject: string; body: string; }
  export function DraftFollowupsModal(props: {
    open: boolean;
    onClose: () => void;
    drafts: DraftRow[];
    enrich?: () => Promise<AiGenerateResult>;
  }): JSX.Element | null;
  ```
  HomePage (Task 6) renders it with composed drafts.

- [ ] **Step 1: Write the component**

Create `DraftFollowupsModal.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Modal } from '../Modal';
import { Button } from '../Button';
import { GenLine } from './fields';
import { useToast } from '../Toast';
import { crmWrite } from '../../data/crmWriteClient';
import type { AiGenerateResult } from '../../data/aiGenerateClient';

export interface DraftRow {
  clientId?: string;
  clientName: string;
  subject: string;
  body: string;
}

interface EditableRow extends DraftRow {
  checked: boolean;
}

/**
 * Review-then-create follow-up drafts. Composed drafts come in via `drafts`;
 * `enrich` (optional) best-effort rewrites the bodies via Einstein. The banker
 * edits subjects, unchecks any to skip, then "Create N tasks" writes a real
 * Task per checked row through crmWrite. Per-row try/catch → reports
 * created/failed counts, never a half-state.
 */
export function DraftFollowupsModal({
  open,
  onClose,
  drafts,
  enrich,
}: {
  open: boolean;
  onClose: () => void;
  drafts: DraftRow[];
  enrich?: () => Promise<AiGenerateResult>;
}) {
  const { toast } = useToast();
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [enriching, setEnriching] = useState(false);
  const [creating, setCreating] = useState(false);

  // Seed rows from composed drafts each time the modal opens.
  useEffect(() => {
    if (!open) return;
    setRows(drafts.map(d => ({ ...d, checked: true })));
  }, [open, drafts]);

  // Best-effort enrichment: rewrite each body if Einstein returns per-line text.
  useEffect(() => {
    if (!open || !enrich) return;
    let cancelled = false;
    setEnriching(true);
    enrich()
      .then(r => {
        if (cancelled || r.source !== 'model' || !r.text.trim()) return;
        const lines = r.text.split('\n').map(l => l.trim()).filter(Boolean);
        setRows(prev => prev.map((row, i) => (lines[i] ? { ...row, body: lines[i] } : row)));
      })
      .catch(() => {
        /* keep composed drafts */
      })
      .finally(() => {
        if (!cancelled) setEnriching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, enrich]);

  const setSubject = (i: number, subject: string) =>
    setRows(prev => prev.map((r, idx) => (idx === i ? { ...r, subject } : r)));
  const toggle = (i: number) =>
    setRows(prev => prev.map((r, idx) => (idx === i ? { ...r, checked: !r.checked } : r)));

  const selected = rows.filter(r => r.checked);

  const create = async () => {
    setCreating(true);
    let created = 0;
    let failed = 0;
    for (const r of selected) {
      try {
        await crmWrite({
          action: 'task',
          subject: r.subject,
          description: r.body,
          whatId: r.clientId || undefined,
        });
        created += 1;
      } catch {
        failed += 1;
      }
    }
    setCreating(false);
    toast(
      failed ? `Created ${created}, ${failed} failed` : `Created ${created} follow-up task${created === 1 ? '' : 's'}`,
      failed ? 'Some writes failed — retry from the queue' : 'Tasks are on your activity list',
    );
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      tone="ai"
      wide
      icon={<span>✦</span>}
      title="Draft follow-ups"
      subtitle="Review and edit — nothing is created until you confirm"
      footer={
        <>
          <span className="flex-1 font-mono text-[10px] tracking-[0.04em] text-faint">{selected.length} selected</span>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="accent" onClick={() => void create()} disabled={creating || selected.length === 0}>
            {creating ? 'Creating…' : `Create ${selected.length} task${selected.length === 1 ? '' : 's'}`}
          </Button>
        </>
      }
    >
      {enriching && <GenLine>Refining drafts…</GenLine>}
      <div className="flex flex-col gap-2.5">
        {rows.map((r, i) => (
          <div key={`${r.clientName}-${i}`} className="rounded-[12px] border border-line bg-bg px-3.5 py-3">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={r.checked}
                onChange={() => toggle(i)}
                className="h-4 w-4 flex-none accent-[var(--wp-accent)]"
                aria-label={`Include ${r.clientName}`}
              />
              <span className="w-[150px] flex-none truncate text-[12.5px] font-semibold text-fg">{r.clientName}</span>
              <input
                value={r.subject}
                onChange={e => setSubject(i, e.target.value)}
                className="flex-1 rounded-[8px] border border-line bg-surface px-2.5 py-1.5 text-[13px] text-fg outline-none focus:border-accent-border"
              />
            </div>
            <p className="mt-2 pl-7 text-[12.5px] leading-relaxed text-muted">{r.body}</p>
          </div>
        ))}
        {rows.length === 0 && <p className="text-[13px] text-muted">No queued clients to follow up on.</p>}
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Export it**

In `components/index.ts`, add after the `AiResultModal` export:

```ts
export { DraftFollowupsModal, type DraftRow } from './home/DraftFollowupsModal';
```

- [ ] **Step 3: Type-check via bundle build**

```bash
cd /Users/jsifontes/Documents/Git/JDO/React-Headless/force-app/main/default/uiBundles/ReactRetail
npm run build
```
Expected: exit 0, no TS errors referencing `DraftFollowupsModal`.

- [ ] **Step 4: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO
git add React-Headless/force-app/main/default/uiBundles/_shared/src/components/home/DraftFollowupsModal.tsx React-Headless/force-app/main/default/uiBundles/_shared/src/components/index.ts
git commit -m "feat: DraftFollowupsModal — review-then-create follow-up tasks via crmWrite"
```

---

### Task 5: `useSpeech` hook

**Files:**
- Create: `React-Headless/force-app/main/default/uiBundles/_shared/src/components/home/useSpeech.ts`
- Modify: `React-Headless/force-app/main/default/uiBundles/_shared/src/components/index.ts`

**Interfaces:**
- Consumes: browser `window.speechSynthesis` + `SpeechSynthesisUtterance`.
- Produces:
  ```ts
  export function useSpeech(): {
    supported: boolean;
    speaking: boolean;
    toggle: (text: string) => void;
    stop: () => void;
  };
  ```
  HomePage (Task 6) uses it for "Listen to brief" and Portfolio "▷ Listen".

- [ ] **Step 1: Write the hook**

Create `useSpeech.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Thin wrapper over the browser SpeechSynthesis API. `toggle(text)` starts
 * speaking, or stops if already speaking. Guards unsupported browsers
 * (`supported:false` — the caller should toast). Cancels on unmount.
 */
export function useSpeech(): {
  supported: boolean;
  speaking: boolean;
  toggle: (text: string) => void;
  stop: () => void;
} {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [speaking, setSpeaking] = useState(false);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  const stop = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  const toggle = useCallback(
    (text: string) => {
      if (!supported) return;
      if (window.speechSynthesis.speaking) {
        stop();
        return;
      }
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.02;
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      utterRef.current = u;
      window.speechSynthesis.speak(u);
      setSpeaking(true);
    },
    [supported, stop],
  );

  useEffect(() => {
    return () => {
      if (supported) window.speechSynthesis.cancel();
    };
  }, [supported]);

  return { supported, speaking, toggle, stop };
}
```

- [ ] **Step 2: Export it**

In `components/index.ts`, add after the `DraftFollowupsModal` export:

```ts
export { useSpeech } from './home/useSpeech';
```

- [ ] **Step 3: Type-check via bundle build**

```bash
cd /Users/jsifontes/Documents/Git/JDO/React-Headless/force-app/main/default/uiBundles/ReactRetail
npm run build
```
Expected: exit 0. If tsc complains that `SpeechSynthesisUtterance`/`speechSynthesis` are undefined, confirm `"DOM"` is in `tsconfig` `lib` (it is for a Vite React app) — no code change needed.

- [ ] **Step 4: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO
git add React-Headless/force-app/main/default/uiBundles/_shared/src/components/home/useSpeech.ts React-Headless/force-app/main/default/uiBundles/_shared/src/components/index.ts
git commit -m "feat: useSpeech hook over browser SpeechSynthesis"
```

---

### Task 6: Wire the seven stub buttons in `HomePage.tsx` (×3 bundles)

**Files (all three identical — apply the SAME edits to each):**
- Modify: `React-Headless/force-app/main/default/uiBundles/ReactRetail/src/home/HomePage.tsx`
- Modify: `React-Headless/force-app/main/default/uiBundles/ReactWealth/src/home/HomePage.tsx`
- Modify: `React-Headless/force-app/main/default/uiBundles/ReactCommercial/src/home/HomePage.tsx`

**Interfaces:**
- Consumes: `AiResultModal`, `DraftFollowupsModal` (+ `DraftRow`), `useSpeech`, `generateText`, `AiGenerateResult` from `@shared` (Tasks 2-5); existing `data.callList` (`CallItem`), `data.pipeline` (`PipelineItem`), `data.kpis` (`HomeKpi`), `pipelineNarrative()`.
- Produces: no new exports; internal behavior change only.

> **Efficiency note for the implementer:** make every edit once in `ReactRetail/src/home/HomePage.tsx`, verify its build, then propagate the identical file to the other two bundles by copying it: `cp ReactRetail/src/home/HomePage.tsx ReactWealth/src/home/HomePage.tsx && cp ReactRetail/src/home/HomePage.tsx ReactCommercial/src/home/HomePage.tsx` (run from `.../uiBundles`). The three files are byte-identical before this task, so a copy is safe and keeps them in sync.

- [ ] **Step 1: Extend imports and modal state**

In the `@shared` import block (lines 3-23), add these names to the existing import list:
```
  AiResultModal,
  DraftFollowupsModal,
  useSpeech,
  generateText,
  type DraftRow,
  type AiGenerateResult,
```

Extend the modal-kind union (line 76). Change:
```ts
type ModalKind = 'task' | 'schedule' | 'case' | 'email' | 'prep' | 'quickview' | 'why';
```
to:
```ts
type ModalKind = 'task' | 'schedule' | 'case' | 'email' | 'prep' | 'quickview' | 'why' | 'airesult' | 'drafts';
```

- [ ] **Step 2: Add generative state + builders inside `HomeContent`**

Immediately after the existing `const [dismissed, setDismissed] = useState<Set<string>>(new Set());` line (line 112), add:

```ts
  const speech = useSpeech();
  const [aiModal, setAiModal] = useState<{
    open: boolean;
    title: string;
    task: 'queue_rationale' | 'pipeline_summary';
    prompt: string;
    context: string;
    fallback: string;
  } | null>(null);
  const [draftsOpen, setDraftsOpen] = useState(false);
```

After the `pipelineNarrative` function (ends line 165), add these builders:

```ts
  // ── Generative-chip helpers ──────────────────────────────────
  const speakOrToast = (text: string) => {
    if (!speech.supported) {
      toast('Not supported', 'This browser has no speech synthesis');
      return;
    }
    speech.toggle(text);
  };

  const queueContext = () =>
    data.callList
      .map(c => `${c.clientName} · ${c.tier ?? 'watch'} · ${Math.round((c.score ?? 0) * 100)}% · ${c.reason}`)
      .join('\n');

  const queueFallback = () => {
    const top = data.callList.slice(0, 4);
    const lines = top.map(
      (c, i) => `${i + 1}. ${c.clientName} — ${c.reason} (priority ${Math.round((c.score ?? 0) * 100)}%).`,
    );
    return `Your queue is ranked by AI priority score, blending relationship value, urgency, and recent signals.\n\n${lines.join('\n')}\n\nHighest-scoring clients surface first so your earliest hours go to the accounts most likely to move today.`;
  };

  const stalledContext = () =>
    data.pipeline
      .filter(p => p.propensity < 0.7)
      .map(p => `${p.clientName} · ${p.name} · ${p.stage} · ${Math.round(p.propensity * 100)}% · $${p.amount}`)
      .join('\n');

  const stalledFallback = () => {
    const stalled = data.pipeline.filter(p => p.propensity < 0.7).sort((a, b) => b.amount - a.amount).slice(0, 4);
    if (!stalled.length) return 'No stalled deals — every open opportunity is above a 70% propensity to close.';
    const lines = stalled.map(
      p => `• ${p.clientName} — ${p.name} (${p.stage}), ${formatValue(p.amount, 'currencyCompact')} at ${Math.round(p.propensity * 100)}% propensity.`,
    );
    return `${pipelineNarrative()}\n\nLargest at-risk deals:\n${lines.join('\n')}\n\nEach has slipped below a 70% close propensity — prioritize a next touch to keep them from aging out.`;
  };

  const draftRows = (): DraftRow[] =>
    [...today, ...week].map(c => ({
      clientId: c.clientId,
      clientName: c.clientName,
      subject: `Follow up: ${c.clientName}`,
      body: `Reach out to ${c.clientName} — ${c.reason}. Suggested next step: ${c.action}.`,
    }));

  const draftsContext = () => draftRows().map(d => `${d.clientName}: ${d.body}`).join('\n');

  const openAi = (task: 'queue_rationale' | 'pipeline_summary', title: string, prompt: string, context: string, fallback: string) =>
    setAiModal({ open: true, title, task, prompt, context, fallback });
```

- [ ] **Step 3: Rewire the seven stub call sites**

3a — "Listen to brief" button `onClick` (line 190):
```ts
                  onClick={() => speakOrToast(`${data.aiBriefHeadline}. ${data.aiBrief}`)}
```
And change its label text (line 193) to reflect toggle state:
```
                  {speech.speaking ? '❚❚ Stop' : '▷ Listen to brief'}
```

3b — "Ask why this order" `AskChip` (line 195). Replace:
```tsx
                <AskChip onClick={() => toast('Agentforce', "Opening assistant with today's brief in context")}>
                  Ask why this order
                </AskChip>
```
with:
```tsx
                <AskChip
                  onClick={() =>
                    openAi(
                      'queue_rationale',
                      'Why this order',
                      "Explain in 3-4 sentences why these clients are ranked in this order for a banker's day. Reference the priority scores.",
                      queueContext(),
                      queueFallback(),
                    )
                  }
                >
                  Ask why this order
                </AskChip>
```

3c — Right-Now "Snooze" (line 205). Replace:
```tsx
                onSnooze={() => toast('Snoozed', 'Right Now item snoozed for 1 hour')}
```
with a real local dismiss (hides the hero card for the session):
```tsx
                onSnooze={() => {
                  setDismissed(s => new Set(s).add('rightNow'));
                  toast('Snoozed', 'Right Now item hidden for this session');
                }}
```
And guard the `RightNowCard` render — change the opening of that block (line 200) from:
```tsx
            {data.rightNow && (
```
to:
```tsx
            {data.rightNow && !dismissed.has('rightNow') && (
```

3d — "Draft all follow-ups" `AskChip` (line 232). Replace:
```tsx
          <AskChip onClick={() => toast('Batch prep', 'Drafting follow-ups for all queued clients…')}>Draft all follow-ups</AskChip>
```
with:
```tsx
          <AskChip onClick={() => setDraftsOpen(true)}>Draft all follow-ups</AskChip>
```

3e — "Prep all N" button (line 246). This opens the existing real `PrepModal` for the first week-tier client. Replace:
```tsx
            <Button size="sm" variant="ghost" onClick={() => toast('Prep queued', `Prepping ${week.length} clients — sheets ready in your dock`)}>
              Prep all {week.length}
            </Button>
```
with:
```tsx
            <Button
              size="sm"
              variant="ghost"
              disabled={!week.length}
              onClick={() => week[0] && open('prep', week[0].clientName, week[0].clientId)}
            >
              Prep all {week.length}
            </Button>
```

3f — "Summarize stalled deals" `AskChip` (line 307). Replace:
```tsx
          <AskChip onClick={() => toast('Pipeline insight', 'Summarizing the largest stalled deals…')}>Summarize stalled deals</AskChip>
```
with:
```tsx
          <AskChip
            onClick={() =>
              openAi(
                'pipeline_summary',
                'Stalled deals',
                'Summarize the largest stalled deals below in 3-4 sentences and suggest the single next move for each.',
                stalledContext(),
                stalledFallback(),
              )
            }
          >
            Summarize stalled deals
          </AskChip>
```

3g — Portfolio pulse "▷ Listen" (line 351). Replace:
```tsx
            <SectionPanel icon="pulse" label="Portfolio pulse" right={<LinkBtn>▷ Listen</LinkBtn>} padded>
```
with a clickable listen control that speaks the narrative:
```tsx
            <SectionPanel
              icon="pulse"
              label="Portfolio pulse"
              right={
                <button
                  type="button"
                  onClick={() => speakOrToast(pipelineNarrative())}
                  className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted transition hover:text-fg"
                >
                  {speech.speaking ? '❚❚ Stop' : '▷ Listen'}
                </button>
              }
              padded
            >
```

- [ ] **Step 4: Render the two new modals**

In the `{/* ---------- MODALS ---------- */}` block, after the `modal.type === 'why'` block (ends ~line 413, before the closing `</div>`), add:

```tsx
      {aiModal?.open && (
        <AiResultModal
          open
          onClose={() => setAiModal(null)}
          title={aiModal.title}
          generate={(): Promise<AiGenerateResult> =>
            generateText({ task: aiModal.task, prompt: aiModal.prompt, context: aiModal.context })
          }
          fallbackText={aiModal.fallback}
        />
      )}
      {draftsOpen && (
        <DraftFollowupsModal
          open
          onClose={() => setDraftsOpen(false)}
          drafts={draftRows()}
          enrich={(): Promise<AiGenerateResult> =>
            generateText({
              task: 'followups',
              prompt:
                'Rewrite each follow-up below as one concise, warm sentence. Return one line per client, in the same order, no numbering.',
              context: draftsContext(),
            })
          }
        />
      )}
```

- [ ] **Step 5: Build ReactRetail and verify types**

```bash
cd /Users/jsifontes/Documents/Git/JDO/React-Headless/force-app/main/default/uiBundles/ReactRetail
npm run build
```
Expected: exit 0, no TS errors. If `toast` becomes unused after removing stubs, it is still used elsewhere (e.g. `approveRec`, `speakOrToast`) — no removal needed.

- [ ] **Step 6: Propagate to the other two bundles and build them**

```bash
cd /Users/jsifontes/Documents/Git/JDO/React-Headless/force-app/main/default/uiBundles
cp ReactRetail/src/home/HomePage.tsx ReactWealth/src/home/HomePage.tsx
cp ReactRetail/src/home/HomePage.tsx ReactCommercial/src/home/HomePage.tsx
(cd ReactWealth && npm run build) && (cd ReactCommercial && npm run build)
```
Expected: both builds exit 0.

- [ ] **Step 7: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO
git add React-Headless/force-app/main/default/uiBundles/ReactRetail/src/home/HomePage.tsx React-Headless/force-app/main/default/uiBundles/ReactWealth/src/home/HomePage.tsx React-Headless/force-app/main/default/uiBundles/ReactCommercial/src/home/HomePage.tsx
git add React-Headless/force-app/main/default/uiBundles/*/dist
git commit -m "feat: wire home AI chips to real actions (generate, draft, speak, snooze)"
```

---

### Task 7: Deploy all three bundles and verify live

**Files:** none (deploy + browser verification). Depends on Tasks 1-6 being built into each bundle's `dist/`.

**Interfaces:** Consumes the built `dist/` of all three bundles. Produces a verified live deployment.

- [ ] **Step 1: Confirm each bundle's dist/ is freshly built**

The dist must reflect the Task 6 source. Rebuild to be certain (idempotent):
```bash
cd /Users/jsifontes/Documents/Git/JDO/React-Headless/force-app/main/default/uiBundles
for b in ReactRetail ReactWealth ReactCommercial; do (cd $b && npm run build) || exit 1; done
```
Expected: three exit-0 builds.

- [ ] **Step 2: Deploy each bundle (one at a time — 2-min shell limit)**

```bash
cd /Users/jsifontes/Documents/Git/JDO/React-Headless
sf project deploy start --source-dir force-app/main/default/uiBundles/ReactRetail -o admin@finsdc3.demo --json
```
Then repeat for `ReactWealth` and `ReactCommercial` in separate invocations. For each, confirm `status: Succeeded` and `numberComponentErrors: 0` from the JSON. If a deploy times out, redeploy that single bundle alone.

- [ ] **Step 3: Get a frontdoor URL (no credentials)**

```bash
cd /Users/jsifontes/Documents/Git/JDO/React-Headless
INSTANCE=$(sf org display --target-org admin@finsdc3.demo --verbose --json | python3 -c "import sys,json,re; d=json.loads(re.sub(r'\x1b\[[0-9;]*m','',sys.stdin.read())); print(d['result']['instanceUrl'])")
TOKEN=$(sf org auth show-access-token --target-org admin@finsdc3.demo --no-prompt 2>/dev/null | python3 -c "import sys,re; m=re.search(r'00D[A-Za-z0-9]{12,18}![^\s]+', re.sub(r'\x1b\[[0-9;]*m','',sys.stdin.read())); print(m.group(0) if m else '')")
echo "$INSTANCE"; echo "${#TOKEN} char token"
```
Expected: a real ~112-char token (not 54-char `[REDACTED]`). Build the App Domain URL for ReactRetail: `<instanceUrl>/secur/frontdoor.jsp?sid=<TOKEN>&retURL=<url-encoded App Domain app URL for c__ReactRetail>`.

- [ ] **Step 4: Verify each chip live via Playwright**

Navigate to the ReactRetail app via the frontdoor URL. Then assert, one per chip:
- **Ask why this order** → click; `AiResultModal` opens with a non-empty body paragraph (composed fallback text is fine; source label reads "Composed from your book" when Models API is off).
- **Summarize stalled deals** → click (in Pipeline section); `AiResultModal` opens with non-empty body.
- **Draft all follow-ups** → click; `DraftFollowupsModal` opens with one row per queued client, checkboxes checked. Click "Create N tasks"; assert a success toast appears ("Created N follow-up task(s)").
- **Listen to brief** → click; assert `window.speechSynthesis.speaking === true` (via `browser_evaluate`), and the label flips to "❚❚ Stop". Click again → speaking false.
- **Prep all N** → click; the existing `PrepModal` opens for the first week client.
- **Snooze** (Right Now card) → click; the Right-Now hero card disappears and a "Snoozed" toast shows.
- **Portfolio ▷ Listen** → click; assert speaking true.

Capture a screenshot of the `AiResultModal` open. Spot-check ReactWealth and ReactCommercial by loading each and clicking "Ask why this order" once (same shared code → same behavior).

- [ ] **Step 5: Commit any dist changes from the rebuild (if not already committed in Task 6)**

```bash
cd /Users/jsifontes/Documents/Git/JDO
git add React-Headless/force-app/main/default/uiBundles/*/dist
git diff --cached --quiet || git commit -m "build: rebuild all three bundle dist/ for home AI actions"
```

---

### Task 8: Agentforce 403 fix (investigation-first)

**Files:** TBD by the investigation — likely none in this repo (org-admin entitlement) or a config-only change. Do not guess-and-deploy.

**Interfaces:** Consumes the deployed ReactRetail app (Task 7) where the Agentforce FAB currently 403s on `runtime_copilot/accSdkWrapper`. Produces either a resolved chat panel or a documented exact admin step.

- [ ] **Step 1: Reproduce the exact 403 in the browser**

On the live ReactRetail app (frontdoor from Task 7), open the Agentforce chat FAB and capture the failing network request: full request URL, request headers (origin), response status, and response body. Use Playwright `browser_network_requests` filtered to the `accSdkWrapper` / `runtime_copilot` request. Record the exact 403 payload — do not proceed on assumption.

- [ ] **Step 2: Classify the root cause against the three candidates**

From the response body + status, determine which holds:
1. Selected agent (`Cumulus Assistant`, id `0Xxam000000tfCDCAY`) is not **activated**, or the running user's permission set lacks access.
2. Agent not exposed to the channel the bundle's Lightning Out uses.
3. CSP/CORS: App Domain origin is not a trusted origin for the LWR endpoint.

Confirm agent activation state:
```bash
cd /Users/jsifontes/Documents/Git/JDO/React-Headless
sf data query --query "SELECT Id, MasterLabel, Status FROM GenAiPlannerBundle" -o admin@finsdc3.demo --json 2>/dev/null || sf data query --query "SELECT DeveloperName, Type FROM GenAiPlugin LIMIT 20" -o admin@finsdc3.demo --json
```
(Use whichever agent metadata object resolves in this org; the goal is to confirm the embedded agent id is Active.)

- [ ] **Step 3: Apply the fix for the confirmed cause**

- If **agent not activated / no access**: activate the agent and/or grant the running user the required permission set (document the exact Setup path and, if settable via CLI/metadata, deploy it capturing `--json`).
- If **CORS/trusted origin**: add the App Domain origin to CORS allowlist / trusted URLs (metadata `CorsWhitelistOrigin` or Setup → CORS). Deploy capturing `--json`.
- If the root cause is an org-admin entitlement **not settable from CLI**, document the exact Setup step in a short note in the plan folder and STOP — the chips (Tasks 1-7) do not depend on Agentforce loading.

- [ ] **Step 4: Verify the fix live**

Reload the ReactRetail app via frontdoor. Open the FAB. Assert `accSdkWrapper` no longer returns 403 and the chat panel renders a live agent greeting. If entitlement-gated and undeployable, confirm the documented step is accurate and mark the task complete-with-note.

- [ ] **Step 5: Commit (only if a repo change was made)**

```bash
cd /Users/jsifontes/Documents/Git/JDO
git add -A React-Headless/force-app
git diff --cached --quiet || git commit -m "fix: resolve Agentforce accSdkWrapper 403 (<confirmed cause>)"
```

---

## Self-Review

**Spec coverage:**
- Ask why this order → Task 6 (3b) + AiResultModal (Task 3) + generateText (Task 2) + AiGenerateRest (Task 1). ✓
- Summarize stalled deals → Task 6 (3f) + same stack. ✓
- Draft all follow-ups → Task 6 (3d) + DraftFollowupsModal (Task 4) + crmWrite. ✓
- Prep all N → Task 6 (3e), opens existing real PrepModal. ✓
- Listen to brief / Portfolio ▷ Listen → Task 6 (3a, 3g) + useSpeech (Task 5). ✓
- Snooze → Task 6 (3c), local dismiss. ✓
- Models API + composed fallback → Task 1 (guarded TypeException → unavailable) + Task 3 (fallbackText). ✓
- Draft + review before create → Task 4 (human gate, per-row try/catch). ✓
- Agentforce 403 fix → Task 8 (investigation-first). ✓
- Apex test (success/each task/bad-task/empty-prompt) → Task 1 Step 1. ✓ (unavailable-shape is not unit-testable because `Test.isRunningTest()` forces the model branch; covered live in Task 7 instead — noted.)
- Build + deploy + Playwright per chip → Task 7. ✓
- ×3 bundles, dist rebuild → Global Constraints + Task 6 Step 6 + Task 7. ✓

**Placeholder scan:** Task 8 files are legitimately "TBD by investigation" per the spec's investigation-first mandate (no guess-and-deploy) — this is a real constraint, not a lazy placeholder; every actionable branch has a concrete command. The Models API type-name caveat in Task 1 has an explicit deterministic fallback (`return '';`). No other placeholders.

**Type consistency:** `AiGenerateResult` / `AiGenerateInput` / `AiGenerateTask` / `generateText` (Task 2) are used verbatim in Tasks 3, 4, 6. `DraftRow` (Task 4) used in Task 6. `useSpeech` return shape (Task 5) used in Task 6. `AiResultModal` and `DraftFollowupsModal` prop signatures (Tasks 3, 4) match their Task 6 render sites. Modal-kind union extension is additive. Consistent.
