# AGENTS.md — AFD360_Utilities

Local test bench for Agentforce and Data 360 APIs that SEs use to demo the raw API live to customers. Read
[README.md](README.md) for the feature list, [docs/architecture.md](docs/architecture.md) for how it works, and
[PRODUCT.md](PRODUCT.md) / [DESIGN.md](DESIGN.md) before UI work.

# Product context

- Shown live on screen-shares: what was sent, what came back and how long it took must stay visible (Wire panel).
- Nothing changes in the org without a visible approval.
- Default org: finsdc3 (alias `jdo-gj9q5q`). Orgs are configured in **Admin → Orgs**.

# Tech stack

- Server: Express 5 + TypeScript, run with `tsx` (Node ≥ 20).
- Web: Vite + React 19 + TypeScript + Tailwind v4, `lucide-react` icons.
- Shared pure logic in `shared/`, tested with vitest.
- Salesforce: one External Client App per org, OAuth client credentials (`api`, `chatbot_api`, `sfap_api`, `mcp_api`).

# Project structure

```
server/      Express API: Agent API sessions + stream normalizer, MCP client/host, Data 360 query + REST reads, orgs
shared/      Pure logic used by both sides (types, sqlAssist, gridView, turnStats, citations)
web/src/     React app: chat, MCP, query/ (ObjectBrowser, SqlEditor, ApiForm, ResultsGrid in QueryModule, RecordPanel)
test/        vitest suites + recorded Agent API streams (fixtures/*.sse)
salesforce/  HXL demo metadata deployed to finsdc3 (Apex actions, widgets, Lightning types, AFD360Demo MCP server)
docs/        architecture, HXL, platform bug reports
data/        orgs, conversations, wire logs, caches (gitignored)
```

# Commands

```bash
npm install
npm run dev         # web :5173 (proxies /api), API :3001, widget sandbox :3002 — loopback only
npm test            # vitest run
npm run typecheck   # tsc --noEmit, includes test/
npm run build && npm start   # single Express process serving web/dist
```

# Architecture

- Every Salesforce call goes through the server (tokens never reach the browser) and is recorded as a `wire`
  entry, masked, so the UI can show it.
- Agent API streams are normalized in `server/normalize.ts` into app events relayed over SSE.
- Query module: catalog per data space (cached server-side; reload button refetches), SQL via `/ssot/query-sql`,
  REST reads via `/api/query/read`. Grid sort/filter is client-side over loaded rows (`shared/gridView.ts`).

# Conventions

- Put parsing and SQL-building logic in `shared/` as pure functions and test it there; components stay thin.
- Match the existing terse comment style: one line on *why*, no restating the code.
- Theme colors come from CSS variables (17 themes, some with light sidebars) — mix with `var(--side-ink)` /
  theme tokens rather than hardcoding colors.
- Responsive range 900–2560 px with no horizontal scroll.

# Testing

- Run `npm run typecheck` and `npm test` before committing.
- UI is verified live in the browser against finsdc3; open a new page (`context().newPage()`) rather than resizing
  the user's tab.

# Common mistakes

- `:source` is a reserved word in Data 360 SQL named parameters — use `:src` / `:obj`.
- Unified link DMOs join `Unified<X>__dlm` on `ssot__Id__c = UnifiedRecordId__c`; Universal ID lookup needs
  `ssot__DataSourceId__c` and `ssot__DataSourceObjectId__c` from the link DMO.
- Search-index chunk DMOs join on `RecordId__c`; vector scores are `score__c`, hybrid `hybrid_score__c`. An empty
  chunk DMO returns 0 rows, not an error.
- The Agent API `metrics` field is always empty; token usage comes from Data 360 telemetry minutes later.
- After a Salesforce session timeout a fresh token can still fail with `INVALID_JWT_FORMAT`; the client retries.

# Related docs

- [docs/architecture.md](docs/architecture.md), [docs/hxl.md](docs/hxl.md)
- [DESIGN.md](DESIGN.md), [PRODUCT.md](PRODUCT.md)
- `../Agentforce_Agent_API` — the External Client App setup
- Root [CHANGELOG.md](../CHANGELOG.md)
