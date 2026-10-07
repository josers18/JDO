# AFD360_Utilities — Design (v1)

Local test bench for Agentforce + Data 360 APIs. v1 ships one module (Agent API chat) plus Admin → Orgs.
Runs locally now; structured to move to Heroku as a single Node process later.

## Decisions

| Area | Decision |
|---|---|
| Runtime | Local dev tool. `npm run dev` = Vite (:5173) proxying `/api` to Express (:3001). `npm run build && npm start` = one Express process serving `web/dist` (Heroku shape). |
| Stack | Express + TypeScript (server), Vite + React + TypeScript + Tailwind v4 (web), shared types in `shared/`. |
| Auth to Salesforce | Per-org External Client App, OAuth client credentials. Token cached per org, re-fetched on 401. |
| Org storage | `data/orgs.json` (gitignored). Client secrets AES-256-GCM encrypted with `AFD360_MASTER_KEY` from `.env` (generated on first run if missing). Secrets never returned to the browser — UI shows last 4 only. |
| App auth | None while local. Must be added before any Heroku deploy. |
| Sessions | One Agent API session per conversation, persisted (session id + next sequenceId) in the conversation file so it survives page reloads and server restarts. Marked **expired** when the API rejects it; transcript stays readable; "New session" reconnects. |
| Streaming | Sessions request `chunkTypes: ["Text","LightningChunk"]`. Server normalizes raw stream events into app events (below) and relays them to the browser over SSE. |
| Persistence | `data/conversations/<id>.json`: metadata, messages, wire log (capped). |

## Stream normalization

Verified 2026-10-07 against Search Agent (`0Xxam000000thvZCAQ`):

- `["Text"]` → `ProgressIndicator` events carry tool steps as text; answer in `Inform.message`.
- `["Text","LightningChunk"]` → `LightningChunk` deltas (partial JSON of `{"content": "..."}`, `lightningType: propertyType/search__agentMessage`) stream the text; the final `Inform.result[]` holds structured parts: `search__agentMessage {content}` and `search__toolBatch {tools:[{description,count,status,category}]}`. **`Inform.message` is empty in this mode.**

- `Confirm` (agent asks approval before running actions): `confirm[]` = agentMessage / toolBatch / `copilotActionInput/*` items.
  Approve = `{type:"Reply", inReplyToMessageId:<Confirm id>, reply:[approved copilotActionInput items]}`; reject = `{type:"Cancel", inReplyToMessageId}`.
  Typing a text reply does **not** approve (verified: agent re-proposes). Verified live 2026-10-07 (Lead Rating updates).

App events: `text-delta`, `tool`, `progress`, `part`, `final`, `end-of-turn`, `session-expired`, `error`, `wire`.
`message-final` parts are authoritative: `text` (markdown) and `tools` (tool cards). When an agent returns no structured `result`, parts are built from `Inform.message`, with `ProgressIndicator` lines shown as tool steps.

## Modules

- **Chat**: org switcher, conversation sidebar (live ● / expired ○), agent picker (inactive and `Employee` default-assistant agents disabled; bypassUser defaults on for service agents, off for employee agents), thread with markdown + tool cards, session header (status, turns, idle, End/New session, Stop).
- **Wire tab**: every Salesforce HTTP exchange per conversation — method, URL, status, duration, request/response headers + bodies, stream events with time offsets. Tokens and secrets masked. Copy-as-curl (`$TOKEN` placeholder), download JSON.
- **Admin → Orgs**: add / edit / delete org (name, My Domain URL, consumer key, consumer secret), Test connection (token + userinfo), set active org.

- **MCP**: server-side Streamable HTTP client (org client-credentials token, `mcp_api` scope; only
  `https://api.salesforce.com/platform/mcp/v1/...` URLs accepted so the token can't leak). Advertises the MCP Apps
  extension `io.modelcontextprotocol/ui`. Tools with `_meta.ui.resourceUri` render via `@modelcontextprotocol/ext-apps`
  `AppBridge` in a double-iframe sandbox served from :3002 with a CSP header built from the resource's declared domains.
  Widget-initiated `tools/call` / `resources/read` are proxied through the server (`/api/mcp/app-call`, `/read`).

## HXL demo (finsdc3)

`salesforce/`: Apex invocable `AFD360LeadSnapshot` → MCP payload CLT `afd360LeadSnapshotOutputValues` (references
`@apexClassType/c__AFD360LeadSnapshot$Snapshot`) → result wrapper CLT `afd360LeadSnapshotResult` whose `renderer.json`
maps `$attrs.outputValues.lead.*` to `@widget/c/afd360LeadCard`. MCP server `AFD360Demo` (names: letters/digits only)
links tool `getLeadSnapshot` to resource `ui://widget/lightningType/c__afd360LeadSnapshotResult`. Deploying the full
McpServerDefinition directly works (no Setup create/retrieve round trip needed); activation is Setup-only.
For Agentforce (Lightning) action output, `afd360LeadSnapshotCard` is the single Apex-based CLT
(`@apexClassType/c__AFD360LeadSnapshot$Snapshot`, direct `{!$attrs.x}` mapping); it needs an agent action output
set to render with it (not wired to any agent). Full HXL reference: personal skill `hxl-widgets`.

## Out of scope (v1)

App login, Postgres, Data 360 modules, resuming a session after Salesforce expires it.
