# LLM Gateway Pattern (Agentforce Models API bridge)

How React-Headless connects its React UI Bundle apps to an LLM, and how to
replicate the same wiring in another app (bundle or otherwise).

There is no "LLM gateway" service in this repo in the Vercel/LiteLLM sense —
there's a narrow Apex REST bridge that calls Salesforce's **native Agentforce
Models API** binding (`aiplatform.ModelsAPI`) server-side. This doc describes
that bridge so it can be reproduced verbatim in ReactWealth/ReactCommercial
(where it's still stubbed) or in a brand-new UI Bundle.

Two genuinely different integration shapes exist depending on where the
calling code runs:

| | Runs inside Salesforce (Apex) | Runs outside Salesforce (Heroku, any external service) |
|---|---|---|
| Used by | This repo's `AiGenerateRest` | Not used in this repo — see below for guidance |
| Call surface | `aiplatform.ModelsAPI` native Apex type | Public REST: `api.salesforce.com/einstein/platform/v1/models/...` |
| Auth | Implicit — runs in the user's session | Explicit OAuth (Client Credentials or JWT Bearer) against a Connected/External Client App |
| Transport | No HTTP callout at all | Real HTTPS callout, needs a bearer token per request |
| Model listing | No list API → probe-based catalog (`ModelCatalogProbe`) | Same constraint — no list endpoint; same problem, different caller |

The first path is documented above. The second — connecting an external app
like Heroku directly to the Models API — is documented next.

## The constraint that forces this shape

A Multi-Framework UI Bundle's app-domain session can **only** reach
`/services/apexrest/*`. It cannot call `@AuraEnabled` Apex, and it cannot call
the platform's generic Agentforce/Models REST endpoints directly from the
browser (no session/CORS path). So every AI call is: **React → custom
`@RestResource` → `aiplatform.ModelsAPI` (native Apex binding, no callout,
no Named Credential) → response**. Same constraint already documented for
`DcBridgeRest`/`CrmWriteRest`/`DcPromptRest` in `CLAUDE.md`.

## The four pieces

### 1. The Apex REST bridge — `AiGenerateRest`

`force-app/main/default/classes/AiGenerateRest.cls`

```
POST /services/apexrest/ai/generate
  body: { task, prompt, context, modelName?, temperature?, maxTokens? }
  200: { text: "<generated>", source: "model" }
  200: { text: "", source: "unavailable" }   // Models API not enabled in this org
  400: { error }
  500: { error }
```

Key mechanics (`AiGenerateRest.cls:114-140`):

```apex
aiplatform.ModelsAPI.createGenerations_Request gen = new aiplatform.ModelsAPI.createGenerations_Request();
aiplatform.ModelsAPI_GenerationRequest reqBody = new aiplatform.ModelsAPI_GenerationRequest();
reqBody.prompt = fullPrompt;
gen.body = reqBody;
gen.modelName = model;  // e.g. 'sfdc_ai__DefaultGPT4Omni'

aiplatform.ModelsAPI api = new aiplatform.ModelsAPI();
aiplatform.ModelsAPI.createGenerations_Response resp = api.createGenerations(gen);
String text = resp?.Code200?.generation?.generatedText;
```

That's the entire "gateway call" — a native platform Apex type, not an HTTP
callout, so **no Remote Site Setting / Named Credential is required**.

Non-obvious pieces worth keeping if you copy this:

- **Never throw for "feature off."** `System.TypeException: Missing dependent
  object` is what this org throws when Models API isn't provisioned. Catch it
  and return `''`, so the REST layer reports `source:'unavailable'` with
  **HTTP 200** — the caller degrades to its own locally-composed text instead
  of seeing a 500.
- **`Test.isRunningTest()` short-circuits before the API call** (line 87-90)
  — Apex tests can't exercise a real generative callout, so the resource
  returns a canned `TEST_AI_TEXT` and the test suite verifies routing/
  validation only, not the model.
- **Model name is server-validated against an allowlist**
  (`ALLOWED_MODELS`, line 33-49), with silent fallback to a
  `DEFAULT_MODEL` constant on blank/unknown input — a stale or typo'd config
  value from the admin page can never break generation.
- **`temperature`/`maxTokens` round-trip but are currently a no-op**
  (`applyParams`, line 142-158) — this org's `aiplatform.ModelsAPI_GenerationRequest`
  binding only exposes `{ prompt, modelName, contentModeration, localization,
  tags }`, no generation-param fields (verified by reflecting the type). Kept
  as a named hook so the UI can honestly label the params "stored, not yet
  applied" instead of pretending they work.

### 2. The self-updating model catalog — `ModelCatalogProbe` + `CommandCenterConfigRest`

There is **no API that lists which foundation models are live** in an org —
`sfdc_ai__Default*` names aren't queryable sObjects, and `ModelsAPI` has no
list method. The only way to know a model works is to call it.

`ModelCatalogProbe.cls` (a `Queueable, Database.AllowsCallouts`) runs a
forward-looking candidate superset (GPT-5.x, Claude 4.x/4.5, Gemini 2.x)
through `createGenerations` with a 1-word `'ping'` prompt; survivors
(`Code200`) become the catalog, cached as JSON on a
`CommandCenterConfig__c.Model_Catalog_Cache__c` singleton field.

`CommandCenterConfigRest.modelCatalog()` (`CommandCenterConfigRest.cls:696-727`)
implements stale-while-revalidate over that cache:

- Fresh cache (< 24h, `CACHE_TTL_MS`) → serve it, no probe.
- Stale/missing → serve last-known (or a hardcoded `FALLBACK_MODELS` list)
  **and** enqueue a background probe, debounced 10 min
  (`PROBE_DEBOUNCE_MS`) so concurrent page loads don't stack ~20-generation
  probe jobs.
- `GET /services/apexrest/config/models?refresh=1` forces a probe
  (still debounced).

This is what lets the admin's model dropdown show new models (e.g. a newly
provisioned Claude/GPT tier) the day they're enabled, with zero code change —
add the candidate name to `ModelCatalogProbe.CANDIDATES` once, and it
auto-appears when it starts returning `Code200`.

### 3. Per-action model/param config — `CommandCenterConfig__c`

Each cockpit (retail/wealth/commercial) stores one JSON blob per center
(`Retail_Config__c`/`Wealth_Config__c`/`Commercial_Config__c` on the same
singleton) mapping each generative action (`queue_rationale`,
`pipeline_summary`, `followups`, `freeform`) to a chosen `modelName` +
`{temperature, maxTokens}`. `CommandCenterConfigRest.sanitize()` re-validates
on every read/write so a schema change (new action) or a since-retired model
name self-heals instead of erroring.

The `CommandCenterConfigAdmin` permission set exists purely because new
`LongTextArea` fields grant no FLS by default — copy that pattern (object +
field permissions on the singleton custom object) for any new bridge that
needs its own persisted config.

### 4. The frontend client — `aiGenerateClient.ts`

`force-app/main/default/uiBundles/_shared/src/data/aiGenerateClient.ts`

```ts
import { createDataSDK } from '@salesforce/platform-sdk';

export async function generateText(input: AiGenerateInput): Promise<AiGenerateResult> {
  const sdk = await createDataSDK();
  const res = await sdk.fetch('/services/apexrest/ai/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: input.task, prompt: input.prompt, context: input.context ?? '', ... }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? `Text generation failed (HTTP ${res.status})`);
  return { text: json.text ?? '', source: json.source ?? 'unavailable' };
}
```

**Resilience contract**: `generateText` never rejects for "feature off" —
`source:'unavailable'` resolves normally with empty text so the caller falls
back to its own composed copy. It rejects **only** on a transport/5xx error.
Callers (`AiResultModal.tsx`, `DraftFollowupsModal.tsx`, `HomePage.tsx`)
build their own locally-composed answer first, then optionally overwrite it
with the model's text — the UI is never blocked on the LLM being reachable.

`sdk.fetch` is the platform SDK's authenticated fetch — it's what reaches
`/services/apexrest/*` from the app-domain session; a bare browser `fetch()`
to that path won't carry the session.

## To replicate in ReactWealth / ReactCommercial (currently mock)

Both already import `generateText` from `@shared` (same `_shared` library —
no duplication needed) — check `src/data/dataSource.ts` in each bundle and
switch the AI domain from mock to real the same way `core`/`dataCloud` were
switched for ReactRetail. `AiGenerateRest`/`CommandCenterConfigRest` are
already org-wide (not per-bundle), so no new Apex is needed — only the
bundle's own `Config` route needs `wealth`/`commercial` entries in
`CENTERS`/config JSON, which `CommandCenterConfigRest.cls:26` already lists.

## To replicate in a brand-new UI Bundle (or any app that can only reach `/services/apexrest/*`)

1. Add a new `@RestResource` Apex class following `AiGenerateRest`'s shape:
   validate an allowlisted `task`, call `aiplatform.ModelsAPI.createGenerations()`
   inside a try/catch that treats `System.TypeException` as "unavailable" (not
   an error), return `{text, source}` with `source:'unavailable'` on HTTP 200
   rather than a 500.
2. Guard with `Test.isRunningTest()` returning a canned response — you cannot
   exercise a real generative callout in a test context.
3. If you want a self-updating model dropdown, copy `ModelCatalogProbe`
   (Queueable probe of curated candidate names) + the cache/TTL/debounce
   logic in `CommandCenterConfigRest.modelCatalog()`. Otherwise just hardcode
   one `DEFAULT_MODEL` constant and skip this piece entirely.
4. Add a thin client wrapper using `sdk.fetch` from `createDataSDK()`
   (`@salesforce/platform-sdk`) — never a bare `fetch()`.
5. No Remote Site Setting, no Named Credential, no external API key — the
   model call is a native platform Apex binding. The only requirement is that
   **Models API be provisioned in the org** (Data Cloud/Einstein Generative AI
   enabled) and that the running user has Apex class access to your new
   `@RestResource` class (System Administrator has this by default; other
   profiles need an explicit permission-set grant).

## Connecting an external app (e.g. Heroku) to the Models API

Everything above assumes Apex runs inside the org's session, which is why
`AiGenerateRest` never touches OAuth or an HTTP callout. **A Heroku app (or
any service outside Salesforce) cannot use `aiplatform.ModelsAPI` — it has no
Apex context.** It must call Salesforce's public REST surface for the Models
API instead, which means real OAuth and a real HTTPS call.

Grounded against the official docs (`developer.salesforce.com/docs/ai/agentforce/guide/access-models-api-with-rest.html`,
2026-08-24):

### 1. Set up an External Client App (one-time, in the org)

In Setup → **External Client Apps** (the modern replacement for the classic
Connected App for this purpose), create an app with:
- OAuth scopes: `sfap_api` (Access the Salesforce API Platform), `api`
  (Manage user data via APIs), `refresh_token, offline_access`.
- **Enable Client Credentials Flow** — this is what lets Heroku authenticate
  as the app itself with no interactive user, using only a client id/secret.
  Map the flow to a **run-as user** (a dedicated integration user, not an
  admin's personal user) — that user's licenses/permissions gate what the
  token can do.
- Grab the **Consumer Key** and **Consumer Secret** from the app's OAuth
  Settings, and note the org's **My Domain URL**.

### 2. Exchange credentials for a bearer token

```bash
curl -X POST https://{my_domain}.my.salesforce.com/services/oauth2/token \
  -d "grant_type=client_credentials" \
  -d "client_id={consumer_key}" \
  -d "client_secret={consumer_secret}"
```

Returns `{ "access_token": "...", ... }`. This token is short-lived —
**cache it in the Heroku dyno's process memory (or Redis if you're running
multiple dynos) and refresh it on expiry/401**, rather than exchanging on
every request; the token endpoint is not meant to be called per-generation.

### 3. Call the Models API directly

```bash
curl --location 'https://api.salesforce.com/einstein/platform/v1/models/sfdc_ai__DefaultOpenAIGPT4OmniMini/generations' \
  --header 'Authorization: Bearer {access_token}' \
  --header 'Content-Type: application/json' \
  --header 'x-sfdc-app-context: EinsteinGPT' \
  --header 'x-client-feature-id: ai-platform-models-connected-app' \
  --data '{ "prompt": "Your prompt text here" }'
```

For a conversational shape use `.../chat-generations` instead of
`.../generations` on the same base path. Response shape:

```json
{
  "generation": { "generatedText": "...", "contentQuality": { "scanToxicity": { "isDetected": false } } },
  "parameters": { "usage": { "prompt_tokens": 39, "completion_tokens": 607, "total_tokens": 646 } }
}
```

Both `x-sfdc-app-context` and `x-client-feature-id` are **required** headers,
not optional telemetry — omitting them is a documented way this call fails.
The model name in the URL path is the same `sfdc_ai__Default*` naming this
repo already validates against an allowlist (`AiGenerateRest.ALLOWED_MODELS`)
— reuse that list as your Heroku app's allowlist too, rather than trusting a
caller-supplied model name verbatim into the URL.

### 4. On the Heroku side

- Store `client_id`/`client_secret`/`my_domain` as Heroku **config vars**
  (`heroku config:set SF_CLIENT_ID=... SF_CLIENT_SECRET=... SF_MY_DOMAIN=...`),
  never in source.
- Mirror the "degrade, don't 500" contract from `AiGenerateRest`: a 401 on
  the Models call after a token refresh, or a non-2xx from `/generations`,
  should return an "unavailable"-style response to your frontend rather than
  bubbling a raw 5xx — the org may have Models API disabled, over quota, or
  mid-rate-limit, and callers should have already-composed fallback content
  the same way this repo's `generateText()` client does.
- There's still **no "list models" endpoint** on this public API either — if
  you want a self-updating model dropdown on Heroku, port the same
  probe-and-cache idea as `ModelCatalogProbe` (try a `sfdc_ai__Default*`
  candidate with a `generations` call; a non-error response means it's live;
  cache survivors with a TTL) rather than hand-maintaining a model list.
- Rate limits and billing are metered as **Einstein Requests** against the
  org's Agentforce/Generative AI usage allotment — the same billing surface
  as the in-org Apex path, so a Heroku integration adds directly to the same
  quota, it doesn't get a separate one.
- If the goal is simpler than "reach *this specific org's* Models API" —
  e.g. you just want an LLM behind a Heroku app with no Salesforce data
  grounding requirement — consider whether **Heroku's own AI add-ons**
  (Heroku Inference / Managed Inference) are a better fit before building the
  OAuth dance above; that's a separate product from Salesforce's Models API
  and worth an explicit choice, not a default.
