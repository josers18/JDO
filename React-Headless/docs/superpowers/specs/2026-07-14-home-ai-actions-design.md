# Home AI Action Buttons — Design Spec

**Date:** 2026-07-14
**Org:** jdo-1lrnov (core `storm-16a17dc388fbe6`, EE, API v67.0)
**Surface:** ReactRetail / ReactWealth / ReactCommercial UI bundles, shared via `_shared`.

## Goal

Make the home page's AI/summary buttons take **real actions** — generate an
answer, draft follow-ups that write to CRM, speak the brief — instead of firing
a `toast()` stub. Also fix the Agentforce chat panel, which currently 403s on
load.

## Verified starting state (empirical, against jdo-1lrnov, 2026-07-14)

- **Already functional** (real CRM writes via `crmWrite()` → `CrmWriteRest`
  apexrest): Prep me, Schedule call, Why?, per-row Call/Email/Task, and the
  Recommendation card's Approve/Edit/Dismiss. These open modals and write real
  Task/Event/Case records. **Not in scope to change.**
- **Pure `toast()` stubs** (do nothing real): *Ask why this order*, *Listen to
  brief*, *Draft all follow-ups*, *Summarize stalled deals*, *Prep all N*,
  *Snooze*, and Portfolio pulse *▷ Listen*. **This is the work.**
- **Einstein Models API is NOT enabled.**
  `aiplatform.ModelsAPI.CreateGenerationsRequest` compiles (namespace ships) but
  throws `System.TypeException: Missing dependent object` at runtime. So a
  Models-API-only backend would ship dead buttons.
- **The prompt-flow path works** (`DcPromptRest` → `Flow.Interview` →
  Einstein prompt template) but is **record-scoped**: one Account → one
  template. It cannot take list/aggregate/free-form input.
- **Agentforce 403:** the ACC `runtime_copilot/accSdkWrapper` LWR endpoint
  returns 403 → `LO2:LightningOutError: unable to load the iframe`.
- **ACC has no context/send channel** (verified against `index.d.ts` for
  `@salesforce/agentforce-conversation-client`): inputs are only `agentId`,
  `agentLabel`, `messageInputPlaceholderText`, `styleTokens`. So chips do NOT
  route into the chat with a seeded prompt — per user direction, they generate
  a real answer directly instead.

## Architecture

Three behavior classes, each with the cheapest backend that makes it real:

| Button | Real behavior | Backend (primary → enrichment) |
|---|---|---|
| Ask why this order | Result modal explaining the queue ranking | Composed from queue data → Models API if enabled |
| Summarize stalled deals | Result modal summarizing top stalled pipeline | Composed from pipeline data → Models API if enabled |
| Draft all follow-ups | Review modal of per-client draft tasks; approve → real Tasks | Composed drafts → Models API if enabled; `crmWrite` on approve |
| Prep all N (week group) | Prep sheet for each week-tier client | Existing `PrepModal` + `runPromptFlow` (already real) |
| Listen to brief / Portfolio ▷ Listen | Speaks text aloud; toggles to stop | Browser `SpeechSynthesis` (client-only) |
| Snooze | Hides the Right-Now item for the session | Local dismiss state (client-only) |

**Resilience principle (mirrors `PrepModal`):** every generative chip composes a
deterministic answer from data *already loaded on the page*, then attempts an
LLM enrichment. If enrichment is unavailable (Models API off) or errors, the
composed answer stands. No chip depends on Models API being enabled — so all
buttons work the day this ships, and LLM text lights up automatically if an
admin enables Models API later.

### New shared components (`_shared/src`)

1. **`data/aiGenerateClient.ts`** — `generateText(input): Promise<AiGenerateResult>`.
   Mirrors `runPromptFlow`/`crmWrite`: `createDataSDK()` →
   `sdk.fetch('/services/apexrest/ai/generate', POST {task, prompt, context})`.
   Returns `{ text, source: 'model' | 'composed' | 'unavailable' }`. NEVER throws
   for "feature off" — resolves with `source:'unavailable'` + empty text so the
   caller keeps its composed answer. Throws only on transport/5xx so a real
   outage is visible.

   ```ts
   export interface AiGenerateInput {
     task: 'queue_rationale' | 'pipeline_summary' | 'followups' | 'freeform';
     prompt: string;                // the instruction
     context?: string;             // list/aggregate blob (deals, queue, etc.)
   }
   export interface AiGenerateResult {
     text: string;
     source: 'model' | 'composed' | 'unavailable';
   }
   ```

2. **`components/home/AiResultModal.tsx`** — read-only result panel (tone `ai`):
   title, subtitle showing the source ("Einstein Models API" vs "Composed from
   your book"), body (whitespace-pre-line), a *Regenerate* button, and Close.
   Shows a `GenLine` shimmer while generating. Props: `{ open, onClose, title,
   subtitle?, generate: () => Promise<AiGenerateResult>, fallbackText: string }`.
   Runs `generate()` on open and on Regenerate; if it resolves `unavailable`/empty
   or rejects, shows `fallbackText` with a "Composed from your book" subtitle.

3. **`components/home/DraftFollowupsModal.tsx`** — takes a list of `{clientId?,
   clientName, subject, body}` rows (generated), renders each with an editable
   subject + a checkbox (default checked). Footer: *Create N tasks* → for each
   checked row, `crmWrite({action:'task', subject, description: body, whatId:
   clientId})`; toasts a summary (`created`/`failed` counts). Human gate before
   any write. Reuses `Button`, `Modal`, `crmWrite`.

4. **`components/home/useSpeech.ts`** — `useSpeech()` → `{ supported, speaking,
   toggle(text), stop() }` over `window.speechSynthesis`. Guards unsupported
   browsers (`supported:false`; caller toasts). Cancels on unmount.

### New Apex (`force-app/main/default/classes`)

5. **`AiGenerateRest.cls`** — `@RestResource(urlMapping='/ai/generate')`,
   `global with sharing`, `@HttpPost run()`. Body `{task, prompt, context}`.
   - Allowlist the four `task` values; reject others 400. Empty prompt → 400.
   - Attempt `aiplatform.ModelsAPI` generation, guarded so a
     `Missing dependent object` / `System.TypeException` is caught and returns
     `{ text:'', source:'unavailable' }` (HTTP 200), NOT 500. Real unexpected
     errors → `{ error }` 500.
   - Success: `{ text, source:'model' }`.
   - Under `Test.isRunningTest()` return deterministic `{ text:'TEST_AI_TEXT',
     source:'model' }` (same pattern as `DcPromptRest`).
   - `meta.xml` v67.0. Deploy with **`AiGenerateRestTest.cls`** (success,
     each task, bad-task 400, empty-prompt 400, unavailable-shape).

### Agentforce 403 fix (investigation task)

The 403 is on the LWR endpoint serving the ACC wrapper. Candidate causes, to be
confirmed live before fixing:
1. Selected agent not **activated**, or running user's permission set lacks
   access to it.
2. Agent not exposed to the channel the bundle's Lightning Out uses.
3. CSP/CORS: App Domain origin not a trusted origin for the LWR endpoint.

The fix task reproduces the exact 403 (network request + response body) via
Playwright first, then resolves the specific cause. No guess-and-deploy. If the
root cause is an org-admin entitlement not settable from CLI, document the exact
setup step and stop — the chips do not depend on Agentforce loading.

## Data flow

- **Ask why this order:** page builds `context` from `data.callList` (name,
  tier, reason, score, source) + `prompt` ("Explain in 3-4 sentences why these
  clients are ranked in this order for a banker's day."). Composed fallback = a
  templated rationale from the same list.
- **Summarize stalled deals:** `context` from `data.pipeline` filtered to
  low-propensity/idle deals; composed fallback extends today's
  `pipelineNarrative()`.
- **Draft all follow-ups:** for each `today`+`week` queue client, compose a
  one-line follow-up; enrichment rewrites them. Result → `DraftFollowupsModal`.
- **Prep all N:** opens `PrepModal` for the first week-tier client; existing
  real prep path.

## Error handling

- `generateText` resolves (never rejects) for feature-off; rejects only on
  transport error, which `AiResultModal` catches → composed text + quiet
  "couldn't reach Einstein" subtitle.
- `DraftFollowupsModal` create loop is per-row try/catch; reports
  created/failed counts, never a half-state.
- `useSpeech` no-ops with a toast when `speechSynthesis` is missing.

## Testing

- **Apex:** `AiGenerateRestTest` — 200 success (mock), each allowlisted task,
  400 bad task / empty prompt, 200 unavailable shape. Run
  `sf apex run test --tests AiGenerateRestTest --result-format human --wait 10
  -o jdo-1lrnov`; confirm pass before bundle deploy.
- **Bundle build:** `npm run build` per bundle passes tsc + vite (clsx resolves
  via project-root `node_modules`).
- **Live (Playwright, frontdoor — no credentials):** on `.../app/c__ReactRetail`,
  click each chip and assert: Ask why / Summarize open `AiResultModal` with
  non-empty body; Draft all opens `DraftFollowupsModal` and Create writes tasks
  (assert toast); Listen toggles `speechSynthesis.speaking`; Snooze removes the
  Right-Now card. Spot-check Wealth + Commercial.
- **Agentforce:** after the 403 fix, confirm `accSdkWrapper` no longer 403s and
  the FAB opens a live panel (or document the admin step if entitlement-gated).

## Global constraints

- UI bundles deploy `dist/`, not `src/` — rebuild every touched bundle before
  deploy. `_shared` is Vite-inlined, so editing it means rebuilding ALL THREE.
- Every deploy captures `--json`; check `status` + `numberComponentErrors`;
  stop on hard failure; never `--ignore-conflicts`.
- New Apex is v67.0, `with sharing`, SOQL `WITH USER_MODE`.
- Self-hosted-fonts + AppShell chrome already shipped; do not regress them.
- No new npm deps (SpeechSynthesis + fetch are platform/browser APIs).

## Out of scope

- Enabling Einstein Models API (org-admin entitlement).
- Changing the already-working CRM-write modals.
- Authoring new Einstein prompt templates (Option B not chosen).
