# AGENTS.md — DC_AgentForce_Output_LWC

Context for AI coding agents working on the **AgentForce Output** Lightning card. Salesforce DX project shipping three LWC bundles, two Apex controllers, and a shared sanitizer.

# Product context

A record-page (and AppPage / HomePage) LWC that runs an autolaunched Flow producing generative output (typically from an Einstein Prompt Builder template), then renders the result with format auto-detection (text / HTML / Markdown), copy-to-clipboard, expand-in-modal, print/PDF, and optional Models API thumbs-up / thumbs-down feedback.

Sibling projects in the same monorepo: `DC_Prediction_Model_LWC`, `DC_Multiclass_Prediction_LWC`, `DC_Query_to_Table_LWC`, and `DC_AgentForce_Markdown_Renderer`. The `LlmOutputSanitizer.cls` here is **byte-identical** to the multiclass sibling — both must stay in sync.

## When to use this LWC vs. DC_AgentForce_Markdown_Renderer

- **This project** — configurable record-page card with a Run button that invokes a user-owned autolaunched Flow, renders the response, and ships a copy/expand/print/feedback toolbar. Use for Lightning pages where the *Flow* is the contract.
- **`DC_AgentForce_Markdown_Renderer`** — a renderer-override LWC wired in via the `c__markdownResponse` Lightning Type. Auto-routed for any GenAiFunction whose `output/schema.json` types `promptResponse` as `c__markdownResponse`. No Flow, no toolbar, no Apex. Use for Agentforce conversation panels.

# Tech stack

- **Apex** — `with sharing` controller; `Flow.Interview` for prompt execution; `aiplatform.ModelsAPI.submitFeedback` for Models API thumbs feedback
- **LWC** — three bundles: `dcAgentforceOutputLwc` (main), `dcAgentforceOutputModal` (expand), `dcAgentforceCopyModal` (clipboard fallback)
- **Static resource** — `marked` for Markdown → HTML rendering, loaded on demand via `loadScript`
- **`lightning-formatted-rich-text`** for HTML output rendering (relies on its built-in HTML allowlist for safety)
- **Salesforce DX** — `sourceApiVersion: 66.0`, `sf` CLI v2 (NOT `sfdx`)

# Project structure

```
DC_AgentForce_Output_LWC/
├── force-app/main/default/
│   ├── classes/
│   │   ├── DcAgentforceOutputController.cls       ← runPromptFlow + submitGenerationFeedback
│   │   ├── DcAgentforceOutputControllerTest.cls   ← 8 tests (3 boundary + 5 helper-coverage on flowOutputToDisplayString)
│   │   ├── LlmOutputSanitizer.cls                 ← strips LLM closing courtesy text; mirror of multiclass sibling
│   │   └── LlmOutputSanitizerTest.cls
│   ├── lwc/dcAgentforceOutputLwc/                 ← main bundle (553-line .js)
│   ├── lwc/dcAgentforceOutputModal/               ← expand-in-popup modal (LightningModal)
│   ├── lwc/dcAgentforceCopyModal/                 ← copy-fallback modal (LightningModal)
│   └── staticresources/                           ← marked.js for Markdown rendering
├── docs/                                          ← INDEX.md is the entry point
├── README.md
└── sfdx-project.json
```

# Commands

```bash
# Deploy (single project, scoped)
sf project deploy start --source-dir force-app/main/default --wait 10 --concise

# Validate-only deploy with tests
sf project deploy validate --source-dir force-app \
  --test-level RunSpecifiedTests \
  --tests DcAgentforceOutputControllerTest LlmOutputSanitizerTest --wait 30

# Run Apex tests against an org
sf apex run test --tests DcAgentforceOutputControllerTest LlmOutputSanitizerTest \
  --result-format human --code-coverage --wait 10
```

**IMPORTANT:** Use `sf` (CLI v2). The `sfdx` commands are deprecated and the JDO repo guardrail will flag them.

# Architecture

## Data contract

```
Autolaunched Flow (user-owned)
   ├─ input: <recordIdVariableName>      ← Record (single) — passed when passRecordIdToFlow=true
   ├─ output: <promptResponseVariableName>  ← Text — generative output (default 'promptResponse')
   └─ output: <generationIdVariableName>    ← Optional Text — Models API generation Id for feedback
        │
        ▼
DcAgentforceOutputController.runPromptFlow(flowApiName, recordId,
                                           recordIdVariableName, promptResponseVariableName,
                                           passRecordId, generationIdVariableName)   ← 6 params
        │  case-tolerant variable lookup via resolveFlowOutput (tries exact → first-upper → all-lower)
        │  output text routed through LlmOutputSanitizer.stripClosingCourtesy
        ▼
FlowPromptResult { text: String, generationId: String }
        │
        ▼
dcAgentforceOutputLwc renders:
   header (icon + title + Run button)
     ↓
   loading spinner / error / output panel (text | html | markdown auto-detect)
     ↓
   toolbar: Copy / Expand / Print/PDF / Thumbs up / Thumbs down
```

## Optional Models API feedback

When the Flow returns a non-blank value in the `generationIdVariableName` Text output:
- The thumbs buttons enable.
- On click, `submitGenerationFeedback(generationId, thumbsUp, feedbackText)` calls `aiplatform.ModelsAPI.submitFeedback`.
- The `aiplatform` namespace requires the **Einstein for Developers** managed package or equivalent platform support.

## Format detection

`detectFormat(raw)` distinguishes text / html / markdown:
- `looksLikeHtml`: starts with `<` and matches an opening tag, or has both `</` and `>`.
- `looksLikeMarkdown`: leading heading (`# `), fenced code (`` ``` ``), list bullet, or `**bold**` somewhere.
- Otherwise → text (rendered as plain `<div>` content, no escaping needed because LWC text-binding auto-escapes).

## Markdown rendering safety

Markdown output is parsed via `window.marked.parse(raw, { breaks: true, headerIds: false, mangle: false })` and the result piped into `lightning-formatted-rich-text`, which applies the **same HTML allowlist** as `lightning-rich-text-toolbar` (a documented SLDS safety boundary). Do **NOT** switch the markdown render path to `lwc:dom="manual"` without adding DOMPurify — the `marked` call has no built-in sanitizer.

# Conventions

## Apex
- `with sharing` on all controllers. Never `without sharing` for `@AuraEnabled` code.
- `@AuraEnabled` on every DTO field (see `FlowPromptResult.text` and `.generationId`).
- **Reserved keyword `in`** — Apex parses it as the SOQL IN operator. Never use it as a local variable name (use `inVal`, `input`, `arg`).
- **`AuraHandledException` requires both the constructor argument AND `setMessage()`** to surface a custom message to the LWC layer. Without `setMessage()` the JS toast falls back to a generic "Script-thrown exception" string. Use the `buildAuraException(safeMsg)` helper pattern from the prediction-model siblings.
- Catch by exception subclass where the message is known to be safe (`aiplatform.ModelsAPI.submitFeedback_ResponseException` is Salesforce-curated; bare `Exception` is not). Log full detail via `System.debug(LoggingLevel.ERROR, ...)` before sanitizing for the user.

## LWC
- **LWC1503 — Boolean `@api` defaults must be `false`.** Compiler rejects `@api foo = true;`. The codebase uses two workarounds: invert to a `hideX` toggle, or leave the JS field undeclared and set `default="true"` in `js-meta.xml`, reading via `this.foo !== false`.
- **All three `targetConfig` blocks must stay in sync** (RecordPage, AppPage, HomePage). New `@api` properties must appear in all three. Note that `passRecordIdToFlow` deliberately defaults to `true` on RecordPage and `false` on AppPage / HomePage — that asymmetry is intentional (AppPage / HomePage typically lack record context).
- **`setTimeout` in `connectedCallback` is a trap.** Use `requestAnimationFrame` + a `_flag` consumed in `renderedCallback`, or a direct call if the work is already async. The lint rule `@lwc/lwc/no-async-operation` will flag setTimeout — don't suppress it without a documented reason.
- Reactivity uses plain class fields (no `@track`); reassignment triggers re-render. Modals are invoked via `LightningModal.open({...})`, which instantiates a fresh component each time — modal state is per-open.
- The `marked` static resource is loaded **once per session** via a memoized promise (`_markedLoadPromise`). Don't bypass the memoization — `loadScript` is not idempotent across re-renders.

## CSS
- Component-private tokens use the `--dc-output-*` prefix (e.g. `--dc-output-title-color` for the configurable title color).
- Official SLDS styling hooks (`--slds-c-icon-color-foreground`) are used for `lightning-icon` overrides — these are documented Salesforce-supported hooks, not internal `--lwc-*` tokens (which would compile-fail).
- This project does **NOT** use the `--wp-*` theme catalog from the prediction-model siblings. That's deliberate — AgentForce Output isn't part of the FSI demo card family. Don't retrofit `predictionThemes.js` here without a product-level decision.

## Documentation
- `README.md` is the entry point; `docs/INDEX.md` is the table of contents.
- `LlmOutputSanitizer.cls` is byte-identical to `DC_Multiclass_Prediction_LWC/force-app/main/default/classes/LlmOutputSanitizer.cls`. If you change one, change both. Run `diff` to verify.

# Testing

```bash
# Apex (org-side)
sf apex run test --tests DcAgentforceOutputControllerTest LlmOutputSanitizerTest \
  --result-format human --code-coverage --wait 10

# LWC Jest (no harness for these bundles currently — manual smoke tests on a record page)
```

Apex test patterns:
- `runPromptFlow` paths that hit `Flow.Interview` cannot be stubbed; tests use a known-bogus flow API name and assert the catch path throws.
- `submitGenerationFeedback` paths that hit `aiplatform.ModelsAPI` cannot be stubbed in the standard Apex test runner; tests cover the validation guards (blank generation Id, >1024-char feedback text).
- `flowOutputToDisplayString` is `@TestVisible` and unit-tested directly across the 4 type branches (String passthrough, null, SObject mistype, Decimal mistype) without going through `Flow.Interview`. Use the same `@TestVisible` pattern when extracting future pure-helper logic from un-stubbable platform boundaries.

# Common mistakes

- **`AuraHandledException` without `setMessage()`** — toast falls back to "Script-thrown exception". Use the `buildAuraException(msg)` helper pattern.
- **Leaking raw `e.getMessage()`** to the user-facing toast — sanitize, log full detail via `System.debug`.
- **`setTimeout` inside `connectedCallback`** — drop the `eslint-disable` and use a direct call or RAF-pattern.
- **Editing `LlmOutputSanitizer.cls` in only one project** — must mirror the change in `DC_Multiclass_Prediction_LWC/force-app/main/default/classes/LlmOutputSanitizer.cls` to maintain byte-identity.
- **Adding `@api` properties to only one `targetConfig` block** — the App Builder UX silently drops the property on the unconfigured pages. Always update all three.
- **Boolean `@api foo = true;`** — fails with LWC1503. See the two workarounds documented above.
- **`Decimal in = ...;`** — Apex compile error; rename to `inVal`/`input`.
- **Switching the markdown render path to `lwc:dom="manual"` without adding DOMPurify** — bypasses the `lightning-formatted-rich-text` HTML allowlist and re-opens the XSS surface.

# Related docs

- @docs/INDEX.md — full table of contents
- @docs/ARCHITECTURE.md — sequence + data flow diagrams
- @docs/COMPONENT_REFERENCE.md — every App Builder property, with defaults
- @docs/FLOW_GUIDE.md — Flow contract (inputs/outputs)
- @docs/HOW_TO.md — common recipes
- @docs/UI_LAYOUT.md — output rendering modes (text / html / markdown)
- @docs/REQUIREMENTS.md — Models API and Einstein prerequisites
- @docs/SETUP_GUIDE.md — admin install path
- @docs/TROUBLESHOOTING.md — common issues + fixes
- @docs/DEPLOY.md — deploy commands and tests
- @docs/GIT.md — clone path
- @../DC_Multiclass_Prediction_LWC/AGENTS.md — sibling project; shares `LlmOutputSanitizer.cls`
- @../DC_Prediction_Model_LWC/AGENTS.md — sibling project; reference for `buildAuraException` helper pattern
- @../DC_AgentForce_Markdown_Renderer/AGENTS.md — sibling AgentForce project; renderer-override LWC for GenAiFunction responses (different use case from this project's Flow-driven card; see "When to use this LWC vs. DC_AgentForce_Markdown_Renderer" above)
