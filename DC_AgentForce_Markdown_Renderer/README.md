# DC_AgentForce_Markdown_Renderer

A reusable Lightning Web Component that renders markdown-formatted Agentforce prompt responses as styled HTML, wired in via Salesforce's Lightning Type renderer-override mechanism — no Flow plumbing or Apex sanitizer required.

<div align="center">

[![Salesforce DX](https://img.shields.io/badge/Salesforce-DX-00A1E0?style=for-the-badge&logo=salesforce&logoColor=white)](https://developer.salesforce.com/developer-centers/salesforce-dx)
[![API Version](https://img.shields.io/badge/API_Version-66.0-181717?style=for-the-badge)](force-app/main/default/lwc/markdownRenderer/markdownRenderer.js-meta.xml)
[![Target](https://img.shields.io/badge/Target-AgentforceOutput-2EA44F?style=for-the-badge)](force-app/main/default/lwc/markdownRenderer/markdownRenderer.js-meta.xml)

</div>

---

## What it does

Agentforce GenAI Functions return text. When that text is markdown (`**bold**`, `# headings`, lists, `[links](url)`) **or** raw HTML (`<p>`, `<strong>`, `<ul>`, etc.), the default Agentforce panel renders it as an unformatted blob. This component intercepts responses typed `markdownResponse` and renders them with proper HTML formatting.

**Dual-input support.** The renderer auto-detects whether the input is markdown or HTML and routes it through the appropriate path:
- Markdown → regex-based parser → emits sanitized HTML
- HTML → `DOMParser` + tag/attribute allowlist → emits sanitized HTML

Both paths produce the same set of safe tags and apply the same URL allowlist on links. See [docs/INTEGRATION_GUIDE.md](docs/INTEGRATION_GUIDE.md) for the routing rules and security model.

## How it wires up

```
GenAiFunction returns promptResponse
  ├─ output/schema.json types it as "lightning:type": "markdownResponse"
  │
  ▼
Lightning Type registry (lightningTypes/markdownResponse/)
  ├─ schema.json        — declares markdownResponse + its properties
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
| `lightningTypes/markdownResponse/schema.json` | Declares the `markdownResponse` Lightning type with a single `text` property. |
| `lightningTypes/markdownResponse/lightningDesktopGenAi/renderer.json` | Tells Agentforce desktop GenAI to render `markdownResponse` values via `c/markdownRenderer`. |

## Markdown syntax supported

| Syntax | Renders as |
|--------|------------|
| `# H1` / `## H2` / `### H3` | `<h1>` / `<h2>` / `<h3>` |
| `**bold**` | `<strong>` |
| `*italic*` | `<em>` |
| `[label](url)` | `<a href="url" target="_blank" rel="noopener noreferrer">` (URL scheme allowlist enforced) |
| `- item` | `<ul><li>` |
| Blank line | Paragraph break |

Code blocks (```` ``` ````), ordered lists (`1.`), blockquotes (`>`), and tables are not yet supported. Configure your prompt template to avoid emitting them, or extend `parseMarkdown` in `markdownRenderer.js`.

## Security posture

Both code paths apply the same defenses; only the implementation differs.

**Markdown path:**
- **HTML escape first.** `escapeHtml` neutralizes `& < > "` before any markdown regex inserts tags. User-supplied `<script>` becomes `&lt;script&gt;`.
- **URL scheme allowlist.** Markdown links restricted to `http(s):`, `mailto:`, `/`, `#`, and `./`.
- **Code fences round-trip.** Content inside `` ``` ``...`` ``` `` is preserved verbatim and escaped at restore time, so HTML inside fences renders as literal text.

**HTML path:**
- **Inert parsing.** `DOMParser.parseFromString(s, 'text/html')` returns a detached doc — no scripts run, no `<img>` resources load, no event handlers fire during parsing.
- **Tag allowlist.** Only the tags the markdown parser would emit (`p`, `h1-3`, `strong`, `em`, `ul`/`ol`/`li`, `blockquote`, `code`, `pre`, `a`, `table` family, `br`, `hr`) survive. Disallowed tags (`<div>`, `<form>`, `<iframe>`, etc.) get unwrapped — children survive as text.
- **`<script>` and `<style>` special-cased.** Tag AND contents dropped.
- **Per-tag attribute allowlist.** Only `<a href>` is allowed. Strips `onclick`, `onerror`, `onload`, `style`, `class`, `id`, `src`, `data-*`, etc.

**Both paths:**
- **URL scheme allowlist on `<a href>`** with control-char stripping (defeats `java\tscript:` padding).
- **`rel="noopener noreferrer"`** force-added to every emitted anchor — blocks reverse tabnabbing and prevents `Referer` leakage.
- **No external libraries.** No DOMPurify, no `marked.js` static resource. Smaller deploy surface, no version pinning.

If your prompts will pass through arbitrary user input or untrusted retrieval results, also audit `parseMarkdown` and `sanitizeHtml` and consider widening tests for your specific input distribution. Sibling project `DC_AgentForce_Output_LWC` shows the older Apex-sanitizer + DOMPurify pattern if your trust boundary requires it.

## Deploy

```bash
cd DC_AgentForce_Markdown_Renderer
sf project deploy start --source-dir force-app --target-org my-org --wait 10
```

**Important:** Deploy this project BEFORE any GenAiFunction whose `output/schema.json` references `markdownResponse`, otherwise the type lookup fails at deploy time. Sibling project `Cumulus_Assistant/` (in this monorepo) is one such consumer.

## Related

- `Cumulus_Assistant/` — Cumulus Bank Agentforce agent + DC_Product_Offers GenAiFunction; consumes this renderer.
- `DC_AgentForce_Output_LWC/` — Older sibling that uses an Apex sanitizer + `marked.js` static resource for a similar purpose; predates the Lightning Type renderer-override pattern.
- `AGENTS.md` — Context for AI coding agents working on this project.
