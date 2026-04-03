# DC AgentForce Output

## In everyday terms

**DC AgentForce Output** is a read-only **console card** for **generative answers**. You connect it to an **autolaunched Flow** that already called Agentforce, Prompt Builder, or other logic; when the Flow finishes, the card shows the **text, HTML, or Markdown** result. Users can **copy**, open **full screen**, or **print** (including save-as-PDF from the browser). Optional **thumbs up/down** works only if your Flow returns a **generation Id** from the platform models API.

**This component does not replace** Flow or Agent Builder—it **displays** what the Flow produced.

<div align="center">

[![Salesforce DX](https://img.shields.io/badge/Salesforce-DX-00A1E0?style=for-the-badge&logo=salesforce&logoColor=white)](https://developer.salesforce.com/developer-centers/salesforce-dx)
[![LWC](https://img.shields.io/badge/Lightning-Web_Components-0176D3?style=for-the-badge)](https://developer.salesforce.com/docs/component-library/overview/components)
[![Apex](https://img.shields.io/badge/Apex-04844B?style=for-the-badge)](https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/)
[![Flow](https://img.shields.io/badge/Flow-Autolaunched-5865F2?style=for-the-badge)](https://help.salesforce.com/s/articleView?id=sf.flow.htm&type=5)
[![SF CLI](https://img.shields.io/badge/SF_CLI-v2-111111?style=for-the-badge&logo=gnu-bash&logoColor=white)](https://developer.salesforce.com/tools/salesforcecli)
[![Monorepo](https://img.shields.io/badge/Monorepo-JDO-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/josers18/JDO)

**Flow-driven UI** · **Rich text & Markdown** · **Print / copy** · **Optional feedback**

</div>

---

## Where to start

| Step | Document |
|------|----------|
| 1 | **[docs/INDEX.md](docs/INDEX.md)** — full table of contents |
| 2 | **[docs/REQUIREMENTS.md](docs/REQUIREMENTS.md)** — org and licensing notes |
| 3 | **[docs/DEPLOY.md](docs/DEPLOY.md)** — install |
| 4 | **[docs/SETUP_GUIDE.md](docs/SETUP_GUIDE.md)** — Flow + App Builder |
| 5 | **[docs/HOW_TO.md](docs/HOW_TO.md)** — quick recipes |

---

## Documentation map (plain language)

| Document | What it is for |
|----------|----------------|
| [docs/INDEX.md](docs/INDEX.md) | Master index |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Deploy commands |
| [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) | What the org must have |
| [docs/SETUP_GUIDE.md](docs/SETUP_GUIDE.md) | After install: permissions, Flow, page |
| [docs/HOW_TO.md](docs/HOW_TO.md) | Short how-tos |
| [docs/FLOW_GUIDE.md](docs/FLOW_GUIDE.md) | Flow variable contract |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Diagrams |
| [docs/COMPONENT_REFERENCE.md](docs/COMPONENT_REFERENCE.md) | Every property |
| [docs/UI_LAYOUT.md](docs/UI_LAYOUT.md) | Layout |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Fixes |
| [artifacts.md](artifacts.md) | File inventory |
| [docs/GIT.md](docs/GIT.md) | Repo path |

---

## Features (short)

- **Run / auto-run** Flow on load or on demand.  
- **Output formats:** auto-detect, or force plain text / HTML / Markdown.  
- **Actions:** copy, expand, print.  
- **Optional thumbs** when generation Id is wired.  
- **Sanitization** of common LLM footer text and safe rich rendering.

---

## Quick deploy

```bash
cd DC_AgentForce_Output_LWC
sf project deploy start --source-dir force-app --target-org <alias> --wait 10
```

Then assign **DC AgentForce Output User** and follow **[docs/SETUP_GUIDE.md](docs/SETUP_GUIDE.md)**.

---

## Project layout

| Path | Role |
|------|------|
| `lwc/dcAgentforceOutputLwc/` | Main card |
| `lwc/dcAgentforceOutputModal/` | Expand modal |
| `classes/DcAgentforceOutputController.cls` | Runs Flow + feedback |
| `staticresources/marked.*` | Markdown (MIT license) |

---

## License / third party

**marked** (v4.3.0) — [marked license](https://github.com/markedjs/marked) (MIT).
