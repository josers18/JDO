# AFD360_Utilities

Local test bench for Agentforce and Data 360 APIs, built for SEs to demo live to customers.

- **Chat (Agent API).** Pick any agent and keep a live multi-turn session going. The chat shows:
  - Ask-page-style tool cards with the full step trail;
  - approval cards for proposed record updates and creates;
  - **HXL cards for any agent's action outputs**, with widget buttons that send your next message;
  - a **Wire** panel with every Salesforce call.
- **MCP.** An MCP Apps host for Salesforce-hosted MCP servers: list and call tools, and render their HXL widgets
  in a sandbox.
- **Query (Data 360).** Browse a data space's objects and run them through the Query API:
  - a SQL editor with catalog autocomplete;
  - REST read forms for data graphs, insights, profiles and Universal ID;
  - a sortable, filterable result grid;
  - vector and hybrid searches joined to their chunk text.
- **Notebook (Python).** Jupyter-style cells on a Python kernel per org, preloaded with the Data Cloud Python
  connector (`salesforce-cdp-connector`): connect, query a DMO into a pandas DataFrame, chart it. Tables and figures
  render under each cell with a one-line summary (time, rows, Data Cloud vs transfer time, size, HTTP calls). The
  connector's HTTP calls show in the Wire panel, masked, and the Stats tab next to it breaks a cell down by query
  (rows, columns, pages, `queryId`, trace ID, rate limit) with totals across cells.
- **Admin → Orgs.** Org profiles (My Domain plus External Client App key and secret, and an optional Data Cloud app
  for the Notebook): test them and switch.
- **17 themes.** Pick one with the picker at the bottom of the rail. HXL cards follow the theme.

```bash
npm install
npm run dev        # http://localhost:5173 (API :3001, widget sandbox :3002, loopback only)
npm test           # stream normalizer, HXL resolver, stats, query, grid and notebook masking tests
npm run notebook:setup   # once, for the Notebook: .venv with the connector, pandas and matplotlib
```

**First run:**
- The app generates `AFD360_MASTER_KEY` in `.env`, which encrypts org secrets in `data/orgs.json`.
- Add an org in **Admin → Orgs**: the My Domain URL plus the consumer key and secret of an External Client App with
  the client credentials flow (example: `../Agentforce_Agent_API`).
- The External Client App needs the scopes `api`, `chatbot_api`, `sfap_api` (Agent API) and `mcp_api` (MCP).
- **Notebook:** the Data Cloud connector can't use that app. The Agent API needs JWT-format tokens, and the
  connector's Data Cloud token exchange rejects them ("invalid subject token"). Add a second External Client App with
  client credentials, JWT tokens **off**, and the scopes `api`, `cdp_api`, `cdp_query_api`, `cdp_profile_api`, then
  enter its key and secret under **Data Cloud app (optional)** in Admin → Orgs. In finsdc3 it's
  `AFD360_Data_Cloud_Client`. Don't add more scopes to the Agent API app: with `cdp_profile_api` added, every token
  request failed with "too many scopes requested".

**HXL cards live:** chat with **Cumulus Assistant** in finsdc3 (v26) and ask "Show me Omega, Inc. and its top open
opportunity". The Search Agent (Coworker) only returns text, so it shows no cards.

**`salesforce/`** holds the HXL pieces deployed to finsdc3:
- four Apex actions (Lead, Account and Opportunity snapshots, Create Task);
- four widgets and their Lightning types;
- the `AFD360Demo` MCP server;
- the `AFD360_Data_Cloud_Client` External Client App for the Notebook (client credentials, JWT tokens off). The
  consumer key isn't in source, so Salesforce generates one on deploy. Set the client credentials run-as user
  (`clientCredentialsFlowUser`, `admin@finsdc3.demo`) for the target org first, then copy the key and secret into
  Admin → Orgs.

Details, the deploy order and how chat resolves widgets: [docs/hxl.md](docs/hxl.md).

**Docs:**
- [AGENTS.md](AGENTS.md): primer for coding agents (structure, commands, conventions, gotchas).
- [docs/architecture.md](docs/architecture.md): architecture, stream normalization, routes and known issues.
- [docs/hxl.md](docs/hxl.md): HXL in chat and MCP, theming, buttons, org artifacts.
- [DESIGN.md](DESIGN.md): visual system (themes, components).
- [PRODUCT.md](PRODUCT.md): who it's for and the design principles.
- [docs/bug-coworker-create-record-agent-api.md](docs/bug-coworker-create-record-agent-api.md): Coworker
  create-record bug report.

`data/` (orgs, conversations, wire logs, HXL caches) and `.env` are gitignored.
