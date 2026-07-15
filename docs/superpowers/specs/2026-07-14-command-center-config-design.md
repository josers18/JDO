# Command Center Configuration — Design

**Date:** 2026-07-14
**Status:** Approved (user delegated full build)
**Branch:** feat/schedule-modal-native (extends PR #25 work) — new work may branch as needed

## Goal

Give each React command center (Retail / Wealth / Commercial) an in-app
**Configuration** page where an admin selects, per generative AI action, which
Agentforce Models API model runs it, plus shared generation parameters
(temperature, max tokens). Settings are org-level, shared, saved instantly, and
independent per command center.

## Origin

User asked whether the Models API model could be selected per item. Today
`AiGenerateRest.cls` hardcodes `gen.modelName = 'sfdc_ai__DefaultGPT4Omni'` for
every action. Rather than a per-chip dropdown, the user chose a centralized
per-command-center configuration surface.

## Decisions (locked during brainstorming)

| Question | Decision |
|---|---|
| Persistence scope | Org-level, shared |
| Edit model / save latency | Edit in-app, **instant save** via Apex bridge (Custom **Object** singleton — see implementation note) |
| v1 scope | **Model per AI action** + **generation parameters** (temperature, maxTokens) |
| Per-center vs shared | **Independent per center** |
| Model catalog source | **Live-queried** from the org, with a curated fallback when the catalog call fails |

## Architecture

**One config page per bundle, one shared store keyed by center.**

- Each bundle gets a new route `/config` + a nav entry "Configuration". The page
  component lives in `_shared` and is rendered by a per-bundle route that passes
  its own center key (`APP_PERSONA` from `shell/appChrome.ts` — already
  `'retail' | 'wealth' | 'commercial'`).
- Config data lives in a single **Custom Object** singleton
  `CommandCenterConfig__c` (DeveloperName `GLOBAL`) with three LongTextArea
  fields, one JSON blob per center. Independent per center; one shared record;
  read via `SOQL … LIMIT 1`; instant write via `upsert`.

> **Implementation note (changed from the original CMDT/Custom-Setting plan):**
> Custom **Settings** cap text fields at 255 chars and reject LongTextArea, so
> the per-center JSON blobs (up to 32 KB) forced a pivot to a normal Custom
> Object singleton. Read is `SELECT … WHERE Name='GLOBAL' LIMIT 1` (not
> `getOrgDefaults()`); write is `upsert`.
>
> **FLS gotcha:** newly deployed LongTextArea fields grant **no** field-level
> security by default — not even to System Administrator — so a metadata-only
> deploy left the fields present but unreadable, and every SOQL/DML against them
> threw (surfacing as REST 500s). Fixed with the `CommandCenterConfigAdmin`
> permission set (object CRUD + field R/W), assigned to the app-domain user.

```
CommandCenterConfig__c  (Custom Object, singleton Name='GLOBAL', Visibility=Public)
  Retail_Config__c     : LongTextArea(32768)
  Wealth_Config__c     : LongTextArea(32768)
  Commercial_Config__c : LongTextArea(32768)
Permission set: CommandCenterConfigAdmin (grants FLS the deploy does not)
```

JSON per center:
```json
{
  "models": {
    "queue_rationale": "sfdc_ai__DefaultGPT4Omni",
    "pipeline_summary": "",
    "followups": "",
    "freeform": ""
  },
  "params": { "temperature": 0.7, "maxTokens": 512 }
}
```
`""` model = fall back to server default (`sfdc_ai__DefaultGPT4Omni`). Adding a
new AI action later needs no schema change — just a new key.

## Server (Apex)

### New: `CommandCenterConfigRest.cls` — `@RestResource(urlMapping='/config/*')`

- `GET  /services/apexrest/config/?center=retail`
  → `{ "config": { models:{...}, params:{...} } }` (defaults-filled if unset).
- `PUT/POST /services/apexrest/config/`  body `{ center, config }`
  → validates center ∈ {retail,wealth,commercial}, validates each model against
    the live catalog **or** the curated allowlist, clamps temperature ∈ [0,2] and
    maxTokens ∈ [1,4096], writes the JSON to the matching field, upserts the
    org-default `CommandCenterConfig__c`, returns the saved config.
- `GET  /services/apexrest/config/models`
  → `{ "models": [{name,label}], "source": "catalog"|"fallback" }`. Attempts the
    Einstein Platform models catalog; on any failure returns the curated
    allowlist with `source:"fallback"`. Never throws.

**Curated fallback allowlist** (also the validation set when catalog is
unavailable) — confirmed against the org where possible:
`sfdc_ai__DefaultGPT4Omni`, `sfdc_ai__DefaultGPT4OmniMini`,
`sfdc_ai__DefaultBedrockAnthropicClaude35Sonnet`,
`sfdc_ai__DefaultBedrockAnthropicClaude3Haiku`,
`sfdc_ai__DefaultVertexAIGemini25Flash`, `sfdc_ai__DefaultOpenAIGPT4`.

### Modified: `AiGenerateRest.cls`

- `GenRequest` gains `modelName`, `temperature`, `maxTokens`.
- `run()`: if `modelName` blank → keep default; else validate against catalog/
  allowlist, fall back to default on miss.
- `generate()`: use the passed model + params on the `createGenerations_Request`
  / `ModelsAPI_GenerationRequest`. Params only applied when the SDK exposes those
  fields; guarded so a missing field never breaks the call.

## Client (`_shared`)

### New: `data/configClient.ts`
- `type AiActionKey = 'queue_rationale' | 'pipeline_summary' | 'followups' | 'freeform'`
- `interface CommandCenterConfig { models: Record<AiActionKey,string>; params: { temperature:number; maxTokens:number } }`
- `interface ModelOption { name:string; label:string }`
- `fetchConfig(center): Promise<CommandCenterConfig>` (defaults on any error)
- `saveConfig(center, config): Promise<CommandCenterConfig>` (rejects on server error)
- `fetchModelCatalog(): Promise<{models:ModelOption[]; source:'catalog'|'fallback'}>`
- `DEFAULT_CONFIG`, `AI_ACTION_LABELS` constants.

### New: `data/configCache.ts`
- A tiny module-level cache + `loadCenterConfig(center)` used by HomePage so
  every `generateText` call can look up the configured model without refetching.
  Populated once per session; `generateText` calls read `models[task]`.

### Modified: `data/aiGenerateClient.ts`
- `AiGenerateInput` gains optional `modelName`, `temperature`, `maxTokens`;
  forwarded in the POST body.

### New: `components/config/ConfigPage.tsx` (+ small field helpers reused from `home/fields.tsx`)
- Props `{ center: PersonaKey }`.
- On mount: `fetchConfig(center)` + `fetchModelCatalog()` in parallel.
- Renders one model `<select>` per AI action (options = catalog, plus the
  current value if not in catalog, plus an explicit "Default" = `""`), and
  temperature / maxTokens inputs.
- Save button → `saveConfig`; toast on success (reuses Toast); inline error on
  failure. Aurora-glass styling consistent with the modals.

### Modified per bundle (×3): `routes.tsx` + nav
- Add `{ path: 'config', element: <ConfigRoute />, handle: { showInNavigation:true, label:'Configuration' } }`
  under the Home layout. `ConfigRoute` is a 3-line per-bundle wrapper that renders
  `<ConfigPage center={APP_PERSONA} />`.

### Modified per bundle (×3): `home/HomePage.tsx`
- Load center config once (via `configCache`) and pass the resolved
  `modelName`/params into each `generateText({...})` call so the chosen model is
  actually used per action.

## Data flow

```
ConfigPage (per bundle, center=APP_PERSONA)
  ├─ GET /config/models  ──► catalog | fallback  ──► dropdown options
  ├─ GET /config/?center ──► current config       ──► form state
  └─ Save ─ PUT /config/ {center,config} ─► CommandCenterConfigRest
                                              └─ validate + DML upsert Custom Object singleton

HomePage generative chip
  └─ generateText({ task, prompt, context, modelName: cfg.models[task], ...cfg.params })
       └─ POST /ai/generate ─► AiGenerateRest.run()
            └─ validate model ─► ModelsAPI.createGenerations(model, params)
```

## Error handling

- Catalog fetch fails → curated fallback, `source:'fallback'`, page still usable.
- Config read fails → `DEFAULT_CONFIG`, page still renders.
- Save fails → inline error, no toast, form keeps user input for retry.
- Unknown/blank model at generation time → server silently uses default
  (never 500; preserves existing "composed answer" resilience contract).
- Invalid center → 400.

## Testing (authored; execution HELD per user instruction until project declared complete)

- `CommandCenterConfigRestTest`: GET defaults; PUT round-trips per center;
  independent centers don't bleed; invalid center 400; param clamping;
  model validation + fallback; models endpoint returns non-empty.
- `AiGenerateRestTest`: existing tests still pass; new — modelName forwarded &
  validated; blank modelName → default; params accepted.
- Client: `configClient` shape + fallback behavior (vitest — held).

## Out of scope (v1)

- Per-user overrides, AI on/off master toggle, non-AI parameters, audit history,
  a monorepo-wide single config page (bundles have no shared runtime).
