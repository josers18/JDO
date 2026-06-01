# DC_AgentForce_Markdown_Renderer

A reusable Lightning Web Component that renders markdown-formatted Agentforce prompt responses as styled HTML, wired in via Salesforce's Lightning Type renderer-override mechanism — no Flow plumbing or Apex sanitizer required.

<div align="center">

[![Salesforce DX](https://img.shields.io/badge/Salesforce-DX-00A1E0?style=for-the-badge&logo=salesforce&logoColor=white)](https://developer.salesforce.com/developer-centers/salesforce-dx)
[![API Version](https://img.shields.io/badge/API_Version-66.0-181717?style=for-the-badge)](force-app/main/default/lwc/markdownRenderer/markdownRenderer.js-meta.xml)
[![Target](https://img.shields.io/badge/Target-AgentforceOutput-2EA44F?style=for-the-badge)](force-app/main/default/lwc/markdownRenderer/markdownRenderer.js-meta.xml)

</div>

---

## What it does

Agentforce GenAI Functions return text. When that text is markdown (`**bold**`, `# headings`, lists, `[links](url)`), the default Agentforce panel renders it as an unformatted blob. This component intercepts responses typed `c__markdownResponse` and renders them with proper HTML formatting.

See [docs/INTEGRATION_GUIDE.md](docs/INTEGRATION_GUIDE.md) for wiring rules and security model.

## How it wires up

```
GenAiFunction returns promptResponse
  ├─ output/schema.json types it as "lightning:type": "c__markdownResponse"
  │
  ▼
Lightning Type registry (lightningTypes/markdownResponse/)
  ├─ schema.json        — declares the type + its properties
  └─ lightningDesktopGenAi/renderer.json
                        — points "$" at "c/markdownRenderer"
  │
  ▼
Agentforce panel auto-routes the value through
  c/markdownRenderer (lwc/markdownRenderer/)
  └─ parses markdown → emits sanitized HTML via lwc:dom="manual"
```

No Flow, no Apex sanitizer, no static-resource library. The platform binds renderer to type at runtime.

## What's in the box

| Path | Purpose |
|------|---------|
| `lwc/markdownRenderer/` | The LWC. Regex-based markdown parser → HTML, scoped CSS. Target: `lightning__AgentforceOutput`. |
| `lightningTypes/markdownResponse/schema.json` | Declares the `c__markdownResponse` Lightning type with a single `text` property. |
| `lightningTypes/markdownResponse/lightningDesktopGenAi/renderer.json` | Tells Agentforce desktop GenAI to render `c__markdownResponse` values via `c/markdownRenderer`. |

## Markdown syntax supported

| Syntax | Renders as |
|--------|------------|
| `# H1` / `## H2` / `### H3` | `<h1>` / `<h2>` / `<h3>` |
| `**bold**` / `*italic*` / `***both***` | `<strong>` / `<em>` / `<strong><em>` |
| `[label](url)` | `<a href="url" target="_blank" rel="noopener noreferrer">` (URL scheme allowlist enforced) |
| `- item` | `<ul><li>` |
| `1. item` | `<ol><li>` |
| `> text` | `<blockquote>` |
| `` `code` `` / ```` ```...``` ```` | `<code>` / `<pre><code>` |
| `\| h1 \| h2 \|` + separator + body | `<table>` |
| Blank line | Paragraph break |

This component renders **markdown only**. Configure your prompt template accordingly. If your input format is HTML, see sibling project `DC_AgentForce_Output_LWC/` (Apex-sanitizer + `marked.js` pattern).

## Security posture

- **HTML escape first.** `escapeHtml` neutralizes `& < > "` before any markdown regex inserts tags. User-supplied `<script>` becomes `&lt;script&gt;`.
- **URL scheme allowlist.** Markdown links restricted to `http(s):`, `mailto:`, `/`, `#`, and `./`. `javascript:`, `data:`, and `vbscript:` URIs (including padded variants like `java\tscript:`) collapse to `href="#"`.
- **`rel="noopener noreferrer"`** on every emitted anchor — blocks reverse tabnabbing and prevents `Referer` leakage of the Agentforce panel URL to externally-linked sites.
- **Code fences round-trip.** Content inside `` ```...``` `` is preserved verbatim and escaped at restore time, so HTML inside fences renders as literal text.
- **No external libraries.** No DOMPurify, no `marked.js` static resource. Smaller deploy surface, no version pinning.

If your prompts will pass through arbitrary user input or untrusted retrieval results, audit `parseMarkdown` and consider adding DOMPurify as a static resource (sibling project `DC_AgentForce_Output_LWC` shows that pattern).

## Deploy

```bash
cd DC_AgentForce_Markdown_Renderer
sf project deploy start --source-dir force-app --target-org my-org --wait 10
```

**Important:** Deploy this project BEFORE any GenAiFunction whose `output/schema.json` references `c__markdownResponse`, otherwise the type lookup fails at deploy time. Sibling project `Cumulus_Assistant/` (in this monorepo) is one such consumer.

## Related

- `Cumulus_Assistant/` — Cumulus Bank Agentforce agent + DC_Product_Offers GenAiFunction; consumes this renderer.
- `DC_AgentForce_Output_LWC/` — Older sibling that uses an Apex sanitizer + `marked.js` static resource for a similar purpose; predates the Lightning Type renderer-override pattern.
- `AGENTS.md` — Context for AI coding agents working on this project.
