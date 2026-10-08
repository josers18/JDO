# AFD360_Utilities: Architecture

Local test bench for Agentforce and Data 360 APIs, used by SEs to demo the raw API to customers (see
`../PRODUCT.md`). It runs locally now and is structured to move to Heroku as a single Node process later. The
visual system is in `../DESIGN.md`, and HXL is covered in [hxl.md](hxl.md).

## Decisions

| Area | Decision |
|---|---|
| Runtime | `npm run dev` runs Vite (:5173), which proxies `/api` to Express (:3001), plus the widget sandbox on its own origin (:3002). All of them bind to loopback only. `npm run build && npm start` runs one Express process that serves `web/dist` (the Heroku shape). |
| Stack | Server: Express 5 + TypeScript, run with tsx watch. Web: Vite + React 19 + TypeScript + Tailwind v4. Shared types live in `shared/`. Tests use vitest. |
| Auth to Salesforce | One External Client App per org, using OAuth client credentials. The token is cached per org. On a 401 the app fetches a fresh token and retries, twice: the second retry waits 1.5 s first. All of an org's tokens share one Salesforce session, and right after that session times out (e.g. overnight) a fresh token can still be rejected with `INVALID_JWT_FORMAT`. The same token is used for the Agent API, hosted MCP (`mcp_api` scope), REST, Tooling and SOAP Metadata. |
| Org storage | `data/orgs.json` (gitignored). Client secrets are AES-256-GCM encrypted with `AFD360_MASTER_KEY` from `.env`, which is generated on first run. Secrets are never sent to the browser. |
| App auth | None while local. **Must be added before any Heroku deploy.** |
| Sessions | One Agent API session per conversation, persisted (session id + next sequenceId) so it survives reloads and restarts. Marked **expired** when the API rejects it; "New session" reconnects. |
| Streaming | Sessions request `chunkTypes: ["Text","LightningChunk"]`. The server normalizes raw stream events into app events and relays them to the browser over SSE. |
| Persistence | `data/conversations/<id>.json` holds metadata, messages and the wire log. `data/hxl-planners/` holds HXL output-type maps. All of `data/` is gitignored. |

## Stream normalization (`server/normalize.ts`)

Verified against the Search Agent (`0Xxam000000thvZCAQ`) and Cumulus Assistant:

- With `LightningChunk`, deltas stream partial JSON for `search__agentMessage` (text) and `search__toolBatch`
  (tools). `Inform.result[]` is authoritative. `Inform.message` is empty, **except** when the result holds only
  action outputs (`copilotActionOutput/*`): then the reply text is in `message`, and it's kept as the first part.
- **Tool trail.** One tool id is reported again with a new description for each step, and the final Inform only
  carries the last state. `steps[]` keeps the full trail, which renders as a checklist.
- **Approvals.** On `Confirm`, the `confirm[]` items include proposals:
  - `copilotActionInput/*` (e.g. UpdateRecordFields);
  - any other item that carries a `toolId` and `recordDetailInput`, such as the Coworker's `search__recordDraft`
    for creating a record.

  Approve sends `{type:"Reply", inReplyToMessageId, reply:[approved items]}`; reject sends `{type:"Cancel"}`.
  Typing a message instead doesn't approve: the proposal is marked "superseded".
- **Failed tool steps.** They arrive only as `status: "error"`. The Agent API sends no error detail, and the card
  says so.

App events: `text-delta`, `tool`, `progress`, `part`, `final`, `end-of-turn`, `session-expired`, `error`, `wire`,
`user-message`.

Tests: `test/normalize.test.ts` (recorded streams in `test/fixtures/*.sse`) and `test/hxl.test.ts` (widget
resolver and generated cards).

## Modules (`web/src/`)

- **Chat:**
  - org switcher;
  - conversation sidebar with Today/Earlier groups, a time column, and live/expired/ended dots;
  - agent gallery;
  - session bar;
  - thread of sent and received cards;
  - Ask-page-style tool cards with a step trail;
  - approval cards for updates and creates;
  - HXL cards for action outputs, with widget buttons that send chat messages.
- **Wire panel:** every Salesforce HTTP exchange for the conversation, with timestamps, newest/oldest sort,
  filters, a sent/received split, headers, bodies and stream events. Tokens are masked. Calls can be copied as
  curl or downloaded as JSON.
- **Turn stats** (top of the Wire panel, `shared/turnStats.ts`): for the hovered or latest turn, computed from the
  captured stream with no extra calls. Salesforce processing time (last event `timestamp` minus `originEventId`),
  network overhead (our measured time minus that), time to first text, tool step timings, `isContentSafe`, cited
  source count, and `traceId` / `planId` / `x-request-id` with copy buttons. The API's `metrics` field is always
  empty, so token counts come from Data 360 instead: a **Usage (Data 360)** row queries
  `AiAgentGenerativeAiUsage_std__dlm` by `TelemetryTraceIdentifier__c` (= the turn's `traceId`) and shows total,
  input and output tokens, LLM calls, and tokens per model. Telemetry lands minutes after the turn; until then the
  row says so and offers a re-check.
- **Sources tab** (next to Wire, `shared/citations.ts`): every `citedReferences` item from the conversation's
  Inform messages, as chips grouped by turn. The item shape isn't documented, so each chip shows the first field
  that looks like a title or a link, and expands to the raw item. No finsdc3 agent has returned a citation yet.
- **MCP:** a server-side Streamable HTTP client. It accepts only `https://api.salesforce.com/platform/mcp/v1/...`
  URLs, so the token can't leak. It advertises `io.modelcontextprotocol/ui`. Tools with `_meta.ui.resourceUri`
  render through `@modelcontextprotocol/ext-apps` `AppBridge` in the double-iframe sandbox (:3002, CSP header
  built from the resource's declared domains). Widget-initiated `tools/call` and `resources/read` go through the
  server.
- **Admin → Orgs:** add, edit, delete, test and activate org profiles.
- **Theme picker:** 17 runtime themes (`themes.ts`), at the foot of the rail. HXL cards follow the active theme.

## Server routes

| Route | Purpose |
|---|---|
| `/api/orgs*` | Org profiles, test, activate |
| `/api/orgs/:id/agents` | Agent list (BotDefinition and Agent API support) |
| `/api/conversations*` | Create (starts a session and warms HXL), list, get, delete; `messages` and `confirm` stream a turn over SSE |
| `/api/orgs/:id/usage/:traceId` | One turn's LLM token usage from Data 360 (`server/usage.ts`) |
| `/api/mcp/connect`, `/call`, `/app-call`, `/read` | Hosted MCP client and MCP Apps host proxy |
| `/api/mcp/hxl`, `/hxl-runtime` | HXL cards for an agent action output, and the HXL runtime page |

## Known platform issues

- **Coworker create-record over the Agent API:** Case works; Lead and Task fail on create-layout required fields.
  See [bug-coworker-create-record-agent-api.md](bug-coworker-create-record-agent-api.md). Cumulus Assistant's
  `create_task` (`AFD360CreateTask`) works.
- **Masked URLs:** the Agent API masks URLs inside action data (`URL_Redacted`); record URLs are kept.

## Out of scope

App login, Postgres, Data 360 modules, and resuming a session after Salesforce expires it.
