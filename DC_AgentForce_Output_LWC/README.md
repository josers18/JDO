# DC AgentForce Output LWC

## What is it?

**DC AgentForce Output** is a Lightning Web Component that acts as a **read-only console for generative answers**. You wire it to an **autolaunched Flow** that calls your Agentforce, Prompt Builder, or other automation; when the flow finishes, the card shows the **text, HTML, or Markdown** the flow produced. Users can **copy** the answer, open it **full screen**, or **print** it (including a print-to-PDF style workflow from the browser). If your flow returns a **generation Id** from the platform’s models API, you can optionally show **thumbs up / down** so feedback is sent back for quality tracking. The component does not replace Flow or Agent Builder—it **displays** what the flow already generated and gives everyday actions around that content.

<div align="center">

[![Salesforce DX](https://img.shields.io/badge/Salesforce-DX-00A1E0?style=for-the-badge&logo=salesforce&logoColor=white)](https://developer.salesforce.com/developer-centers/salesforce-dx)
[![LWC](https://img.shields.io/badge/Lightning-Web_Components-0176D3?style=for-the-badge)](https://developer.salesforce.com/docs/component-library/overview/components)
[![Apex](https://img.shields.io/badge/Apex-04844B?style=for-the-badge)](https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/)
[![Metadata API](https://img.shields.io/badge/API-v66.0-032D60?style=for-the-badge)](https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_intro.htm)
[![Flow](https://img.shields.io/badge/Flow-Autolaunched-5865F2?style=for-the-badge)](https://help.salesforce.com/s/articleView?id=sf.flow.htm&type=5)

[![SF CLI](https://img.shields.io/badge/SF_CLI-v2-111111?style=for-the-badge&logo=gnu-bash&logoColor=white)](https://developer.salesforce.com/tools/salesforcecli)
[![Monorepo](https://img.shields.io/badge/Monorepo-JDO-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/josers18/JDO)

<br/>

**Flow-driven generative UI** · **Rich text & Markdown** · **Print / PDF** · **Optional feedback**

</div>

---

## Documentation map

| Document | Purpose |
|----------|---------|
| [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) | Org capabilities, licensing, and security assumptions |
| [docs/SETUP_GUIDE.md](docs/SETUP_GUIDE.md) | Deploy, wire Flow, add to Lightning pages |
| [artifacts.md](artifacts.md) | Source inventory and dependency graph |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Data flow, sequences, and Mermaid diagrams |
| [docs/FLOW_GUIDE.md](docs/FLOW_GUIDE.md) | Flow contract: inputs, outputs, generation Id |
| [docs/COMPONENT_REFERENCE.md](docs/COMPONENT_REFERENCE.md) | Every App Builder property |
| [docs/UI_LAYOUT.md](docs/UI_LAYOUT.md) | Header, toolbar, output surface, loading state |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common failures and fixes |
| [docs/GIT.md](docs/GIT.md) | Monorepo path, naming, contributing |

---

## Features

- **Run / auto-run** — Executes configured autolaunched Flow; optional **auto-run on load**.
- **Output formats** — **auto** (detect HTML vs Markdown vs plain), or force **text**, **html**, or **markdown** (Markdown via static **marked** library + `lightning-formatted-rich-text`).
- **Actions** — **Copy** (clipboard + fallback modal), **Expand** (modal with inline copy fallback), **Print / PDF** (iframe + blob fallback).
- **Header branding** — Configurable **SLDS icon** (default `utility:agent_astro`) and **title color** (hex via CSS variable).
- **Thumbs feedback** — Optional; requires Flow to output **Models API generation Id** into a Text variable wired in App Builder.
- **Sanitization** — `LlmOutputSanitizer` strips a common LLM closing line from Apex-returned strings; HTML is sanitized by `lightning-formatted-rich-text`.

---

## Quick start

From the monorepo:

```bash
cd JDO/DC_AgentForce_Output_LWC
sf org login web --alias my-org
sf project deploy start --source-dir force-app --target-org my-org
```

Add **DC AgentForce Output** to a **record**, **app**, or **home** page in Lightning App Builder. Set **Autolaunched Flow API name** and align **Flow input/output** variable names with your flow (see [FLOW_GUIDE.md](docs/FLOW_GUIDE.md)).

---

## Prerequisites

Summarized in [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md): Salesforce org with Flow, LWC deployment, and (for thumbs) **Einstein / Models API** where `aiplatform.ModelsAPI` is available.

---

## Project layout

| Path | Role |
|------|------|
| `force-app/main/default/lwc/dcAgentforceOutputLwc/` | Main exposed component |
| `force-app/main/default/lwc/dcAgentforceOutputModal/` | Expand modal (LightningModal) |
| `force-app/main/default/lwc/dcAgentforceCopyModal/` | Copy fallback modal (internal) |
| `force-app/main/default/classes/DcAgentforceOutputController.cls` | Flow execution + feedback |
| `force-app/main/default/staticresources/marked.*` | Markdown parser (marked v4.3.0) |
| `force-app/main/default/flows/` | Sample `DC_Agentforce_Output_Prompt` (placeholder) |

---

## License / third party

- **marked** (v4.3.0) is bundled as a static resource; [marked license](https://github.com/markedjs/marked) (MIT).

---

## See also

- [Salesforce Lightning Design System](https://www.lightningdesignsystem.com/)
- [LWC developer guide](https://developer.salesforce.com/docs/platform/lwc/guide)
