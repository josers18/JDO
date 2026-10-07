# AFD360_Utilities

Local test bench for Agentforce + Data 360 APIs:

- **Chat** — Agent API: agent gallery, live multi-turn sessions, Ask-page style tool cards, approval cards for
  agent-proposed actions (Confirm → Reply/Cancel), Wire view of every Salesforce call.
- **MCP** — MCP Apps host for Salesforce-hosted MCP servers: list/call tools and render returned widgets
  (HXL / `ui://` resources) in a sandboxed frame, with the MCP traffic in the Wire panel.
- **Admin → Orgs** — org profiles (My Domain + External Client App key/secret), test, switch.

```bash
npm install
npm run dev        # http://localhost:5173 (API on :3001, widget sandbox on :3002, loopback only)
npm test           # stream normalizer tests (recorded Agent API streams)
```

First run generates `AFD360_MASTER_KEY` in `.env` (encrypts org secrets in `data/orgs.json`).
Add an org in **Admin → Orgs**: My Domain URL + consumer key/secret of an External Client App with the
client credentials flow (see `../Agentforce_Agent_API/force-app` for the `Agent_API_Client` example).

The External Client App needs scopes `api`, `chatbot_api`, `sfap_api` (Agent API) and `mcp_api` (MCP).

`salesforce/` holds the HXL demo deployed to finsdc3: `AFD360LeadSnapshot` Apex action, `afd360LeadCard` widget,
two MCP Lightning types, and the `AFD360Demo` MCP server (`/platform/mcp/v1/custom/AFD360Demo`, tool `getLeadSnapshot`).
Deploy order: widget → Apex + Lightning types → MCP server, then **Activate** it in Setup → MCP Servers.
The org needs Setup → Headless Experience Layer Settings turned on.

`data/` (orgs, conversations, wire logs) and `.env` are gitignored. Design: [docs/architecture.md](docs/architecture.md).
