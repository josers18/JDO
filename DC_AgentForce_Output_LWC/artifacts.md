# Artifacts inventory

**Project:** `DC_AgentForce_Output_LWC` (see `sfdx-project.json`). **Git:** typically `JDO/DC_AgentForce_Output_LWC/` — see [docs/GIT.md](docs/GIT.md).

Source of truth: `force-app/main/default/`. This file lists deployable artifacts and how they connect.

### Documentation

| Doc | Topic |
|-----|--------|
| [README.md](README.md) | Overview, quick start, feature list |
| [docs/GIT.md](docs/GIT.md) | Monorepo path, naming, contributing |
| [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) | Org prerequisites |
| [docs/SETUP_GUIDE.md](docs/SETUP_GUIDE.md) | Deploy and App Builder |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Mermaid sequences and flowcharts |
| [docs/FLOW_GUIDE.md](docs/FLOW_GUIDE.md) | Flow input/output contract |
| [docs/COMPONENT_REFERENCE.md](docs/COMPONENT_REFERENCE.md) | Designer properties |
| [docs/UI_LAYOUT.md](docs/UI_LAYOUT.md) | Visual structure |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common issues |

---

## Apex

| Artifact | File(s) | Role |
|----------|---------|------|
| **DcAgentforceOutputController** | `classes/DcAgentforceOutputController.cls` (+ `-meta.xml`) | `runPromptFlow`: creates `Flow.Interview`, passes optional **SObject** record shell into Flow Record input, reads **Text** `promptResponse` (configurable) and optional **generation Id** output; returns `text` + `generationId`. `submitGenerationFeedback`: `aiplatform.ModelsAPI.submitFeedback` for thumbs. |
| **DcAgentforceOutputControllerTest** | `classes/DcAgentforceOutputControllerTest.cls` (+ `-meta.xml`) | Validation tests for blank flow, invalid flow, blank generation Id on feedback. |
| **LlmOutputSanitizer** | `classes/LlmOutputSanitizer.cls` (+ `-meta.xml`) | Strips boilerplate closing phrase from display strings server-side. |
| **LlmOutputSanitizerTest** | `classes/LlmOutputSanitizerTest.cls` (+ `-meta.xml`) | Unit tests for sanitizer. |

**Sharing:** `with sharing` on controllers and sanitizer.

---

## Permission set

| Artifact | File | Role |
|----------|------|------|
| **DC AgentForce Output User** | `permissionsets/DC_AgentForce_Output_User.permissionset-meta.xml` | Apex access: `DcAgentforceOutputController`, `LlmOutputSanitizer`. Assign to users who use the DC AgentForce Output component. |

---

## Lightning Web Components

| Bundle | Exposed | Role |
|--------|---------|------|
| **dcAgentforceOutputLwc** | Yes (Record / App / Home) | Main card: Run, output panel (text / rich text), toolbar, clipboard helpers, print iframe, marked loader, thumbs. |
| **dcAgentforceOutputModal** | No | `LightningModal`: expanded output, Copy with inline fallback, Print. |
| **dcAgentforceCopyModal** | No | `LightningModal`: large textarea for manual copy when clipboard APIs fail. |

| File (main bundle) | Role |
|--------------------|------|
| `dcAgentforceOutputLwc.js` | Flow invoke, format detection, Markdown HTML build, clipboard, print, expand modal, feedback Apex call. |
| `dcAgentforceOutputLwc.html` | Header (icon + title + Run), loading sparkles, output templates, toolbar. |
| `dcAgentforceOutputLwc.css` | Shell, output heights, toolbar, generating animation, print hiding. |
| `dcAgentforceOutputLwc.js-meta.xml` | Targets, designer properties, **Account** on record pages (extend `<objects>` for more). |

---

## Static resources

| Name | Files | Role |
|------|-------|------|
| **marked** | `staticresources/marked.js`, `marked.resource-meta.xml` | UMD **marked** 4.3.0 for Markdown → HTML (loaded with `lightning/platformResourceLoader`). |

---

## Flow (sample)

| Artifact | Role |
|----------|------|
| **DC_Agentforce_Output_Prompt** | Sample autolaunched flow: `recordID` (SObject, Account), `promptResponse` (Text output). Replace placeholder assignment with your real Gen AI / assignment logic. |

---

## Not versioned here (org-specific)

| Item | Notes |
|------|--------|
| **Production autolaunched flows** | Your real flow API name is set in App Builder. |
| **Einstein / Prompt Builder steps** | Wired inside Flow in the org. |
| **Permission sets / profiles** | Flow run, Apex class access, Models API. |

---

## Dependency graph (conceptual)

```
dcAgentforceOutputLwc
    ├── Apex: DcAgentforceOutputController.runPromptFlow
    │         └── Flow.Interview(flowApiName, inputs including optional SObject)
    ├── Apex: DcAgentforceOutputController.submitGenerationFeedback (optional)
    │         └── aiplatform.ModelsAPI
    ├── Static: marked (loadScript) when outputFormat/markdown path needs it
    ├── Modal: c/dcAgentforceOutputModal
    └── Modal: c/dcAgentforceCopyModal
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for sequence diagrams.
