# HXL in AFD360_Utilities

HXL (Salesforce Headless Experience Layer, beta) renders structured agent and tool output as widgets. In this app
HXL works in two places:

- **MCP tab:** tools on Salesforce-hosted MCP servers that declare a `ui://` resource. Salesforce returns the
  widget page plus the resolved widget tree, and the app hosts them.
- **Chat:** action outputs from **any agent**. The Agent API returns only the action's data, so the app works out
  the widget from the org's own metadata and builds the same tree itself.

There are no per-agent or per-card bindings in the app. Card designs, actions and agents all live in the org.

## How a chat action output becomes a card

The Agent API sends an action result as `Inform.result[] = {type: "copilotActionOutput/<function>", value: {<prop>: {...}}}`.
`server/hxl.ts` (`renderActionOutput`) resolves it in these steps:

1. **Function.** Tooling API `GenAiFunctionDefinition` (by DeveloperName) gives `IsLocal` and `PluginId`. Then
   `GenAiPlannerFunctionDef` gives the planner, and `GenAiPlannerDefinition` gives the planner's DeveloperName
   (e.g. `Cumulus_Assistant_v26`).
2. **Output types.** A SOAP Metadata API retrieve of that `GenAiPlannerBundle` (`server/metadata.ts`, using the
   app's client-credentials token and fflate to unzip) gives each `localActions/*/<fn>/output/schema.json` and the
   `lightning:type` of every output property. Standalone (non-local) functions retrieve `GenAiFunction` instead.
3. **Widget.** For a custom type (e.g. `c__afd360AccountSnapshotCard`), the app retrieves the `LightningTypeBundle`.
   `renderer.json` `componentOverrides.$.definition = "@widget/c/<name>"` names the `UiWidgetBundle`, which the
   app retrieves next.
4. **Resolve.** The renderer's attribute mapping is applied to the data, and the widget tree is filled in. That
   covers `{!$attrs.a.b}`, `meta.if`, `meta.forEach`/`forItem`/`forIndex` with loop variables, and
   `{!$meta.env.orgUrl}`.
5. **No widget?** `autoCard` builds a generic HXL card from the data's shape: a field card (columns of at most 10),
   a `tile/table` for lists (rows that are `lightning__recordInfoType` records become columns of their `data` fields, and the Name column links to `orgUrl/lightning/r/<id>/view` through a `{type: "link", urlKey}` column type; `Currency` fields become right-aligned `{type: "number", format: "currency"}` columns holding the raw value, with the ISO code from the display value as `currencyCodeKey`), flattened single records, and a link for the first URL.
6. **Render.** `web/src/chat/HxlCard.tsx` hands the tree to the HXL runtime in the result shape a hosted-MCP
   `tools/call` has (`_meta["salesforce/uiMetadata"]`), through `WidgetFrame`.

Prose answers from a delegated agent (a string `response`) stay as markdown.

**Runtime page.** The HXL runtime HTML (~0.9 MB) is identical for every widget, so `/api/mcp/hxl-runtime` loads
it once per org from any `ui://` resource on `custom/AFD360Demo`. The org therefore needs at least one MCP server
with a UI resource.

**Caches.**
- Planner output-type maps are stored on disk (`data/hxl-planners/`, gitignored), one per published planner
  version. Versions never change, and a cold retrieve of a large agent takes about 40 s.
- They're warmed in the background when a chat starts (`warmAgent` in `routes.ts`).
- Lightning type and widget lookups are cached in memory for 10 minutes. After redeploying a widget, touch
  `server/hxl.ts` to drop that cache.

## Buttons (`action/sendMessage`)

`tile/button` `actions.click: [{definition: "action/sendMessage", attributes: {content}}]` reaches the host as an
MCP Apps `ui/message`. The runtime only offers it when the host advertises `message: {text: {}}`. In chat,
`WidgetFrame` `onSendMessage` sends the text as the user's next turn. While a turn is running, or the session
isn't live, the widget is told the message wasn't delivered. The MCP tab only logs it.

## Theming (in this app)

The HXL runtime merges `hostContext.styles.variables` over its own defaults.

- **Colors, radii and shadows.** `web/src/themes.ts` `widgetHostStyles()` maps the active app theme onto the
  runtime's tokens:
  - base: `--color-background|text|border-*`;
  - tones: `info` uses the sent palette, `caution`/`warning` the received palette, and `success`/`danger` use
    ok/err;
  - primary (buttons, focus ring) uses the action color;
  - plus `--border-radius-*` and `--shadow-*`.
- **Fonts.** `--font-sans` and `--font-mono` are set to Archivo and JetBrains Mono. `server/sandbox.ts` serves
  those fonts from the sandbox origin and injects the `@font-face` rules into the widget document.
- **Theme changes.** Cards re-render when the theme picker changes.
- **Frame.** HXL cards are rendered `frameless`, because the runtime draws its own card.

Other surfaces (Lightning, Claude, ChatGPT) apply their own look. The card *structure* travels everywhere.

## Org artifacts (`salesforce/`, deployed to finsdc3)

| Piece | Names |
|---|---|
| Apex invocables (+ tests, 100%) | `AFD360LeadSnapshot`, `AFD360AccountSnapshot`, `AFD360OpportunitySnapshot`, `AFD360CreateTask` |
| Widgets (`UiWidgetBundle`) | `afd360LeadCard`, `afd360AccountCard`, `afd360OpportunityCard`, `afd360TaskCard` |
| Agentforce CLTs (Apex-based, direct mapping) | `afd360LeadSnapshotCard`, `afd360AccountSnapshotCard`, `afd360OpportunitySnapshotCard`, `afd360CreateTaskCard` |
| MCP CLTs (result wrapper + payload) | `afd360<X>Result` + `afd360<X>OutputValues` for Lead/Account/Opportunity snapshot and CreateTask |
| MCP server | `AFD360Demo` at `/platform/mcp/v1/custom/AFD360Demo`: `getLeadSnapshot`, `getAccountSnapshot`, `getOpportunitySnapshot`, `createTask` |
| Agents | **Cumulus Assistant v26** (`../Cumulus_Assistant`; the GeneralCRM topic has the four card actions, rollback = activate v25). `AFD360_HXL_Agent` is deactivated, but its source is kept. |

**Card design.** Every card follows the same layout:
- an avatar icon header with a title and summary line, in a row with `isWrapped: false`;
- headline stats, with the label above the value;
- badges;
- a separator;
- a two-column details grid;
- an action row: a follow-up `sendMessage` button with an icon, plus "Open in Salesforce".

All four widgets validate against the official v68 schemas and the `childBlocks` limits (from the Playground's AI
Toolkit, installed as the personal skill `hxl-widget-authoring`).

The buttons and their messages:

| Card | Button | Message sent |
|---|---|---|
| Lead | Create follow-up task | "Create a follow-up task for the lead …" |
| Account | Show top opportunity | "Show me the top open opportunity for …" |
| Opportunity | Create follow-up task | "Create a follow-up task on the opportunity …" |
| Task | Mark complete | "Mark the task "…" (Id) as Completed" |

**Deploy order.** Widget first, then Apex and CLTs (payload before wrapper), then the MCP server, then Activate it
in Setup → MCP Servers. HXL must be on: Setup → Headless Experience Layer Settings.
Agent Script `complex_data_type_name` uses `c__<CLT>` in this org.

## Seeing cards live

Chat with **Cumulus Assistant** and ask, for example, "Show me Omega, Inc. and its top open opportunity", or
"create a task …". The Search Agent (Coworker) only ever returns text, so it shows no cards.
