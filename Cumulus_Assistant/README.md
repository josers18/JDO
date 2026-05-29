# Cumulus_Assistant

The Cumulus Bank Agentforce agent definition + the GenAiFunctions that drive it. Renders responses through the sibling `DC_AgentForce_Markdown_Renderer/` project.

<div align="center">

[![Salesforce DX](https://img.shields.io/badge/Salesforce-DX-00A1E0?style=for-the-badge&logo=salesforce&logoColor=white)](https://developer.salesforce.com/developer-centers/salesforce-dx)
[![API Version](https://img.shields.io/badge/API_Version-66.0-181717?style=for-the-badge)](sfdx-project.json)
[![Agent](https://img.shields.io/badge/Agentforce-Cumulus_Assistant-2EA44F?style=for-the-badge)](force-app/main/default/aiAuthoringBundles/Cumulus_Assistant/Cumulus_Assistant.agent)

</div>

---

## What's in the box

| Path | Purpose |
|------|---------|
| `aiAuthoringBundles/Cumulus_Assistant/Cumulus_Assistant.agent` | 3.3K-line Agent Script defining the Cumulus Bank assistant — agent_router subagent, 18+ topic subagents, action wirings, prompts, knowledge config. |
| `aiAuthoringBundles/Cumulus_Assistant/Cumulus_Assistant.bundle-meta.xml` | Bundle metadata: `bundleType=AGENT`. |
| `genAiFunctions/DC_Product_Offers/` | GenAiFunction wrapping the `Product_Offers` retriever. Output `promptResponse` is typed `markdownResponse` so Agentforce auto-routes it through the markdown renderer. |

## Agent surface

The Cumulus Assistant is an **AgentforceEmployeeAgent** template targeted at Cumulus Bank employees: wealth advisors, retail bankers, commercial bankers, and treasury managers. It routes user input through 18+ topic subagents covering Case creation, communication, post-meeting follow-up, general CRM, proactive notifications, sales record creation, web search, client meetings, personalized recommendations, record management, product Q&A, FAQs, financial accounts, client insights, referrals, and product offers.

Agent Script details live in `Cumulus_Assistant.agent` — too large to summarize here. Open the file and search for `start_agent agent_router:` for the routing logic.

## Cross-project dependency

The `DC_Product_Offers` GenAiFunction's `output/schema.json` types `promptResponse` as `markdownResponse`. That type is owned by sibling project `DC_AgentForce_Markdown_Renderer/` (Lightning Type + LWC). **Deploy the renderer project FIRST**, otherwise this project's deploy will fail at the type lookup.

## Deploy

```bash
# Step 1: deploy the renderer (creates the Lightning type)
cd ../DC_AgentForce_Markdown_Renderer
sf project deploy start --source-dir force-app --target-org my-org --wait 10

# Step 2: deploy this project (agent + GenAiFunction)
cd ../Cumulus_Assistant
sf project deploy start --source-dir force-app --target-org my-org --wait 10
```

The agent bundle is large (~3.3K lines) — deploys take longer than typical metadata. Allow a 10+ minute wait window.

## Related

- `../DC_AgentForce_Markdown_Renderer/` — sibling project owning the `markdownResponse` Lightning type + `c/markdownRenderer` LWC.
- `AGENTS.md` — context for AI coding agents working on this project.
