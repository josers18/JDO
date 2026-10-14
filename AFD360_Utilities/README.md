# AFD360_Utilities

Local test bench for Agentforce and Data 360 APIs, built for SEs to demo live to customers.

- **Chat (Agent API).** Pick any agent and keep a live multi-turn session going. The chat shows:
  - Ask-page-style tool cards with the full step trail;
  - approval cards for proposed record updates and creates;
  - **HXL cards for any agent's action outputs**, with widget buttons that send your next message;
  - a **Wire** panel with every Salesforce call.
- **MCP.** An MCP Apps host for Salesforce-hosted MCP servers: list and call tools, and render their HXL widgets
  in a sandbox.
- **Admin → Orgs.** Org profiles (My Domain plus External Client App key and secret): test them and switch.
- **17 themes.** Pick one with the picker at the bottom of the rail. HXL cards follow the theme.

```bash
npm install
npm run dev        # http://localhost:5173 (API :3001, widget sandbox :3002, loopback only)
npm test           # stream normalizer + HXL resolver tests
```

**First run:**
- The app generates `AFD360_MASTER_KEY` in `.env`, which encrypts org secrets in `data/orgs.json`.
- Add an org in **Admin → Orgs**: the My Domain URL plus the consumer key and secret of an External Client App with
  the client credentials flow (example: `../Agentforce_Agent_API`).
- The External Client App needs the scopes `api`, `chatbot_api`, `sfap_api` (Agent API) and `mcp_api` (MCP).

**HXL cards live:** chat with **Cumulus Assistant** in finsdc3 (v26) and ask "Show me Omega, Inc. and its top open
opportunity". The Search Agent (Coworker) only returns text, so it shows no cards.

**`salesforce/`** holds the HXL pieces deployed to finsdc3:
- four Apex actions (Lead, Account and Opportunity snapshots, Create Task);
- four widgets and their Lightning types;
- the `AFD360Demo` MCP server.

Details, the deploy order and how chat resolves widgets: [docs/hxl.md](docs/hxl.md).

**Docs:**
- [docs/architecture.md](docs/architecture.md): architecture, stream normalization, routes and known issues.
- [docs/hxl.md](docs/hxl.md): HXL in chat and MCP, theming, buttons, org artifacts.
- [DESIGN.md](DESIGN.md): visual system (themes, components).
- [PRODUCT.md](PRODUCT.md): who it's for and the design principles.
- [docs/bug-coworker-create-record-agent-api.md](docs/bug-coworker-create-record-agent-api.md): Coworker
  create-record bug report.

`data/` (orgs, conversations, wire logs, HXL caches) and `.env` are gitignored.
