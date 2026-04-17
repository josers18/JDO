# DC Person Profile Widget

A **rich customer profile card** for Salesforce **Account** and **Contact** record pages. It shows a polished header, key metrics, and **seven tabs** by default (Overview, AI Signals, Portfolio, Services, **Structure**, Location, Insight). The **Structure** tab shows related accounts, an org-style chart, and key contacts (Financial Services–friendly).

**In everyday terms:** The card reads data from your Salesforce records (names, addresses, balances, and custom fields you map). Optionally, it can pull extra values from **Flows** (automations with no screens), show **AI-generated text** on the **Insight** tab (`generateSummary` + prediction JSON), and—on **Account** or **Contact** record pages—run optional **Overview** extras: an **Agentforce** narrative inset **above Contact** (`getAgentforceOverviewSummary`, **Contact** → **`Input:Contact.Id`** + **`Input:Contact`**, **Account** → **`Input:Account.Id`** + **`Input:Account`**, mirroring the **Business Profile Widget** pattern), and a **Unified relationships** table **below Relationship** driven by your **`@InvocableMethod`** Apex (`getUnifiedRelationshipsQueryJson` via **`Invocable.Action`**—no Flow required). All of that requires the right licenses, templates, and Apex where your contract allows.

**App and Home pages:** You can place the same component there, but fewer settings are available, and there is no automatic link to a single customer record unless your team builds that.

<div align="center">

[![Salesforce DX](https://img.shields.io/badge/Salesforce-DX-00A1E0?style=for-the-badge&logo=salesforce&logoColor=white)](https://developer.salesforce.com/developer-centers/salesforce-dx)
[![LWC](https://img.shields.io/badge/Lightning-Web_Components-0176D3?style=for-the-badge)](https://developer.salesforce.com/docs/component-library/overview/components)
[![Apex](https://img.shields.io/badge/Apex-04844B?style=for-the-badge)](https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/)
[![Einstein](https://img.shields.io/badge/Einstein-Gen_AI-7F56D9?style=for-the-badge)](https://help.salesforce.com/s/articleView?id=sf.generative_ai_prompt_builder.htm&type=5)

[![SF CLI](https://img.shields.io/badge/SF_CLI-v2-111111?style=for-the-badge&logo=gnu-bash&logoColor=white)](https://developer.salesforce.com/tools/salesforcecli)
[![Metadata API](https://img.shields.io/badge/Bundle_API-v62.0-032D60?style=for-the-badge)](https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_intro.htm)

**Seven tabs (incl. Structure)** · **Themes and colors** · **Optional Flows and AI** · **SOQL or `flow:` / `flows:` field sources**

</div>

---

## Where to start (recommended order)

1. **[docs/DEPLOY.md](docs/DEPLOY.md)** — Install the package into your org (or hand this to whoever runs deployments).  
2. **[docs/SETUP.md](docs/SETUP.md)** — Turn on access, add the card to a page, quick checks.  
3. **[docs/HOW_TO.md](docs/HOW_TO.md)** — Step-by-step tasks (map, theme, Flows, etc.).  
4. **[docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)** — If something does not look right.

**Full index:** [docs/INDEX.md](docs/INDEX.md)

---

## Documentation map (plain language)

| Document | What it is for |
|----------|----------------|
| [docs/INDEX.md](docs/INDEX.md) | Table of contents for all topics below |
| [docs/DEPLOY.md](docs/DEPLOY.md) | How to install; what is included; common deploy issues |
| [docs/SETUP.md](docs/SETUP.md) | After install: permissions, Lightning page, optional AI |
| [docs/HOW_TO.md](docs/HOW_TO.md) | Recipes: add to a page, use a Flow, fix the map, change theme |
| [docs/FLOW_GUIDE.md](docs/FLOW_GUIDE.md) | How the three Flow “hooks” work (profile, Insight, gauges) |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How data moves from Salesforce → card (with diagrams) |
| [docs/COMPONENT_REFERENCE.md](docs/COMPONENT_REFERENCE.md) | Every setting in App Builder (technical names included) |
| [docs/assets/widget_theme_catalog.pdf](docs/assets/widget_theme_catalog.pdf) | **Theme catalog (PDF)** — visual guide to all **42 themes** ([monorepo hub](../docs/THEME_CATALOG.md)) |
| [docs/APEX_REFERENCE.md](docs/APEX_REFERENCE.md) | For builders/developers: server-side API details |
| [docs/PROMPT_TEMPLATE.md](docs/PROMPT_TEMPLATE.md) | Einstein prompt template and JSON sent to AI |
| [docs/DIAGRAMS.md](docs/DIAGRAMS.md) | Extra pictures (data flow, tabs, map, theme) |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Fixes for typical errors |
| [docs/samples/](docs/samples/README.md) | Copy-paste examples for JSON fields |
| [artifacts.md](artifacts.md) | List of files shipped in `force-app/` |
| [docs/GIT.md](docs/GIT.md) | Where this folder lives in the Git repo |

---

## What you see on the page

- **Header:** Photo or initials, name, location, tier, optional enrollment chips, optional KPI strip.  
- **Tabs:** Overview (fields, optional **Agentforce** narrative above **Contact**, optional **Unified relationships** table below **Relationship** from invocable Apex), AI Signals (gauges and bars), Portfolio (chart and account rows), Services (tiles and suggestions), Location (map and address), Insight (prediction text, optional AI summary, recommendation list).  
- **Look and feel:** Choose a **Theme** preset in App Builder or fine-tune colors. The card is custom-styled (not the standard Salesforce “blueprint” layout).

---

## Quick install (for whoever runs Salesforce CLI)

```bash
cd DC_PersonProfileWidget
sf project deploy start --source-dir force-app --target-org <your-org-alias> --wait 10
```

Replace `<your-org-alias>` with the nickname you use for that org. After a successful deploy, follow **[docs/SETUP.md](docs/SETUP.md)** so users get the right permission set and the page is activated.

**No command line?** Ask your Salesforce admin or a developer to deploy from this folder using the same command, a pipeline, or a change set built from the metadata here.

---

## Flows and field sources (simple explanation)

You **do not** need a special “graph JSON” format for the profile. If you use a Flow, it should be **autolaunched** (no screens). The Flow sets **output variables**; you map each widget slot to either a **Flow output** or a **CRM field path**, the same idea as the **Business Profile Widget**:

- Prefix **`flow:`** or **`flows:`** plus the Flow variable API name (for example `flow:Tier_Out`).  
- Or use an **Account** or **Contact** field path for that slot (for example `MailingCity`, `Account.Industry` on Contact).  

**Core custom fields** JSON supports the same pattern. If **every** assembly slot is satisfied from SOQL only, the **profile assembly Flow does not need to run** for those mappings (Insight/prediction Flow may still run separately). See **[docs/FLOW_GUIDE.md](docs/FLOW_GUIDE.md)** and **[docs/COMPONENT_REFERENCE.md](docs/COMPONENT_REFERENCE.md)**.

For branch lists or portfolio rows, the Flow often stores **text** containing JSON—see **[docs/samples/](docs/samples/README.md)**.

---

## Repository context

This folder is a **Salesforce DX project** inside the [JDO monorepo](../README.md). Your team may also use the root [deployment guide](../docs/DEPLOYMENT_GUIDE.md) for org aliases and shared patterns.

---

## License

Demo/educational source; adjust for your org’s policy if you republish.
