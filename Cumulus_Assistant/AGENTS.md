# AGENTS.md — Cumulus_Assistant

Context for AI coding agents working on the **Cumulus Bank Agentforce agent** definition and its GenAiFunctions. This is a Salesforce DX project shipping one Agent Script bundle and one GenAiFunction — no LWC, no Apex.

# Product context

The Cumulus Assistant is an `AgentforceEmployeeAgent` template aimed at Cumulus Bank employees (wealth advisors, retail bankers, commercial bankers, treasury managers). It routes user prompts through 18+ topic subagents and dispatches to actions (Flows, GenAiFunctions, knowledge retrievers).

This project contains **only** the agent definition + the Cumulus-specific GenAiFunction. The renderer surface that visualizes responses is in the sibling project `DC_AgentForce_Markdown_Renderer/` (the `c__markdownResponse` Lightning type + `c/markdownRenderer` LWC).

# Tech stack

- **Agent Script** (`.agent` files) — Salesforce's Agentforce DSL for agent topology
- **GenAiFunction metadata** — XML + JSON schemas declaring inputs/outputs
- **Salesforce DX** — `sourceApiVersion: 66.0`
- **`sf` CLI v2** for deploys

# Project structure

```
Cumulus_Assistant/
├── force-app/main/default/
│   ├── aiAuthoringBundles/Cumulus_Assistant/
│   │   ├── Cumulus_Assistant.agent           ← 3.3K lines: agent topology, subagents, actions, prompts
│   │   └── Cumulus_Assistant.bundle-meta.xml ← bundleType=AGENT
│   └── genAiFunctions/DC_Product_Offers/
│       ├── DC_Product_Offers.genAiFunction-meta.xml  ← invocationTarget: Product_Offers retriever
│       ├── input/schema.json                          ← Input:ProductOfferQuestion (text)
│       └── output/schema.json                         ← promptResponse: c__markdownResponse
├── README.md
├── AGENTS.md                                  ← this file
└── sfdx-project.json                          ← name: cumulus-assistant
```

# Architecture

## Agent topology

```
start_agent agent_router (Cumulus_Assistant.agent line ~50)
  └─ EinsteinHyperClassifier picks subagent based on user intent
        │
        ├─ go_to_off_topic                ← redirects off-topic queries
        ├─ go_to_ambiguous_question       ← asks for clarification
        ├─ go_to_Create_a_Case            ← Flow: SvcCopilotTmpl__CreateCase
        ├─ go_to_Create_a_new_Case        ← Flow + AddCaseComment
        ├─ go_to_SlackExecutiveBrief
        ├─ go_to_CommunicateWithCustomers
        ├─ go_to_WealthAdvisorClient...   ← multiple wealth-advisor topic subagents
        ├─ go_to_GeneralCRM
        ├─ go_to_RecordManagement
        ├─ go_to_Product_Questions
        ├─ go_to_Product_Offers           ← GenAiFunction: DC_Product_Offers (THIS PROJECT)
        ├─ go_to_Financial_Accounts
        ├─ go_to_Client_Insights
        ├─ go_to_Referrals
        └─ ...18+ subagents total
```

## DC_Product_Offers GenAiFunction

| Field | Value |
|-------|-------|
| `invocationTarget` | `Product_Offers` (Data Cloud retriever) |
| `invocationTargetType` | `generatePromptResponse` |
| Input | `Input:ProductOfferQuestion` (text) — product inquiry |
| Output | `promptResponse` typed `c__markdownResponse` — auto-rendered via sibling renderer |

## Cross-project dependency on DC_AgentForce_Markdown_Renderer

The output schema's `lightning:type: "c__markdownResponse"` references a custom Lightning type owned by `../DC_AgentForce_Markdown_Renderer/`. That project must deploy first or this one's deploy fails at the type lookup. Same is true for the `complex_data_type_name: "c__markdownResponse"` reference inside `Cumulus_Assistant.agent` line ~3303.

# Conventions

## Agent Script (.agent files)
- Indentation is significant — 4 spaces, not tabs.
- Block keywords: `system:`, `config:`, `language:`, `variables:`, `knowledge:`, `start_agent`, `subagent`, `connection`, `actions:`.
- Subagent transitions use `@utils.transition to @subagent.<name>` — every transition must reference an existing subagent or the bundle fails to compile.
- Action references use `@actions.<ActionName>` — must match an `actions:` block somewhere in the file.
- Variable visibility: `Internal` (agent-scoped) vs `External` (caller-scoped, e.g. the Lightning panel passes `currentRecordId` from the page).
- Comments use `#`. Inline comments after a directive are sometimes tolerated, sometimes not — keep them on their own line.

## GenAiFunctions
- `genAiFunction-meta.xml` is the metadata header (description, developerName, invocationTarget, invocationTargetType, isConfirmationRequired, etc.).
- `input/schema.json` declares the parameters the planner can pass; `output/schema.json` declares what the function returns.
- For markdown-formatted output, type `promptResponse` as `lightning:type: "c__markdownResponse"`. This auto-routes the value through `c/markdownRenderer` in the Agentforce panel.
- The function output type `lightning__objectType` wraps the inner properties.

# Testing

There are no automated tests for `.agent` bundles or GenAiFunctions in this project. Verification flow:

1. **Deploy to a sandbox/scratch org** — `sf project deploy start --source-dir force-app --target-org <sandbox>`.
2. **Open the Agentforce panel** in App Builder, set the agent to `Cumulus_Assistant`, and probe each topic subagent with representative prompts.
3. **Verify GenAiFunction routing** — ask a product-offers question, confirm the response renders as styled markdown (via the sibling renderer) rather than raw `**bold**` text.

# Deploy gotchas

- **Deploy `DC_AgentForce_Markdown_Renderer/` first.** The `c__markdownResponse` type referenced by this project's `output/schema.json` and `.agent` file lives there.
- **Large `.agent` files take time.** 3.3K lines is the largest agent bundle in the JDO monorepo. Allow 10+ minutes for the deploy.
- **Subagent reference integrity.** If you remove a subagent, scrub all `go_to_<name>` and `@subagent.<name>` references first or the bundle fails to compile with a cryptic "subagent not found" error.
- **GenAiFunction `invocationTarget`.** If `Product_Offers` (the retriever) doesn't exist in the target org, the GenAiFunction deploy succeeds but the action fails at runtime. Check Setup → Data Cloud → Retrievers before deploying.

# Common mistakes

- **Editing `.agent` indentation by hand without re-validating.** The DSL is whitespace-sensitive. Use a Salesforce-aware editor or run `sf project deploy validate` after any non-trivial change.
- **Removing a subagent without scrubbing references.** Always grep for the subagent name before deletion.
- **Deploying without the renderer project.** First-deploy failures are recoverable — just deploy the renderer first, then this — but the error message is misleading ("type c__markdownResponse not found" rather than "wrong project order").
- **Adding new GenAiFunctions that emit markdown without typing the output as `c__markdownResponse`** — they'll work, but the response will render as raw text instead of formatted HTML in the Agentforce panel.

# Related projects

- `../DC_AgentForce_Markdown_Renderer/` — sibling project owning the markdown renderer surface.
- `../docs/MONOREPO_OVERVIEW.md` — JDO monorepo index.
