# AGENTS.md — DC_AgentForce_Markdown_Renderer

Context for AI coding agents working on the **Markdown Renderer** Lightning component for Agentforce. This is a Salesforce DX project shipping one LWC, one Lightning Type definition, and a renderer override — no Apex, no Flow.

# Product context

A renderer for Agentforce GenAI Function responses formatted as **markdown**. Wired in via the platform's Lightning Type renderer-override mechanism: `c__markdownResponse` is a custom Lightning type whose `lightningDesktopGenAi` renderer is `c/markdownRenderer`. Any GenAiFunction whose `output/schema.json` types `promptResponse` as `c__markdownResponse` is auto-routed through this LWC by the Agentforce panel.

The component handles markdown only — `parseMarkdown` is a regex pipeline that handles headings, bold/italic/triple-asterisk, code fences + inline code, ordered/unordered lists, blockquotes, tables, and links.

Sibling project `DC_AgentForce_Output_LWC` solves a similar problem with an Apex sanitizer + `marked.js` static resource; this project is the newer, leaner pattern that avoids both.

# Tech stack

- **LWC only** — no Apex, no Flow
- **Salesforce DX** — `sourceApiVersion: 66.0` (required for `lightning__AgentforceOutput` target)
- **`sf` CLI v2** for deploys (NOT `sfdx`)
- **No external libraries** — inline regex markdown parser, no DOMPurify, no `marked.js`

# Project structure

```
DC_AgentForce_Markdown_Renderer/
├── force-app/main/default/
│   ├── lwc/markdownRenderer/
│   │   ├── markdownRenderer.js          ← regex-based markdown parser + escapeHtml + URL allowlist
│   │   ├── markdownRenderer.html        ← single <div class="markdown-container" lwc:dom="manual">
│   │   ├── markdownRenderer.css         ← scoped styles for emitted h1-3 / p / ul / li / a
│   │   └── markdownRenderer.js-meta.xml ← target: lightning__AgentforceOutput
│   └── lightningTypes/markdownResponse/
│       ├── schema.json                                   ← c__markdownResponse type with text property
│       └── lightningDesktopGenAi/renderer.json           ← maps "$" -> "c/markdownRenderer"
├── README.md
├── AGENTS.md                            ← this file
└── sfdx-project.json                    ← name: dc-agentforce-markdown-renderer
```

# Architecture

## Renderer-override flow

```
GenAiFunction.output.schema.json
  └─ promptResponse: { "lightning:type": "c__markdownResponse" }
       │
       ▼
Lightning Type registry (this project)
  ├─ markdownResponse/schema.json              — type declaration
  └─ markdownResponse/lightningDesktopGenAi/renderer.json
       └─ componentOverrides["$"].definition = "c/markdownRenderer"
       │
       ▼
Agentforce panel binds renderer at runtime
  └─ instantiates <c-markdown-renderer value={promptResponse}> automatically
       │
       ▼
markdownRenderer.js
  ├─ markdownText getter unwraps value to string
  ├─ renderedCallback runs parseMarkdown(text):
  │     escapeHtml -> tables -> headings -> blockquotes -> bold/italic -> links
  │     -> lists -> code restore -> paragraphs
  └─ container.innerHTML = result (lwc:dom="manual")
```

## Why `lwc:dom="manual"` + `innerHTML`

LWC's template compiler does not allow injecting HTML strings via the standard template syntax. The component needs to emit `<h1>`, `<strong>`, `<a>`, etc. dynamically based on parsed markdown. Two patterns are available:

1. **Recursive template rendering of a parsed AST** — verbose, requires an in-memory AST + per-tag template branches.
2. **`lwc:dom="manual"` + `innerHTML` injection** — bypasses the compiler; renderedCallback fills the container directly.

This project uses pattern 2 because the markdown grammar is small and the security boundary is straightforward (escape first, allowlist links). The injected DOM still inherits the shadow-scoped CSS from `markdownRenderer.css`, so styling works exactly like template-rendered nodes.

## Security boundaries

- **escapeHtml runs first** — neutralizes raw `& < > "` before any regex inserts a tag.
- **Curated tag emission** — only the tags the parser explicitly emits (`<h1-3>`, `<strong>`, `<em>`, `<ul>/<ol>/<li>`, `<blockquote>`, `<code>`, `<pre>`, `<a>`, `<table>` family, `<p>`, `<br>`) end up in the output.
- **URL allowlist on `<a href>`** — strips whitespace + `0x00-0x1F` + DEL `0x7F` BEFORE scheme matching, then tests against `/^(https?:|mailto:|\/|#|\.\/)/i`. Anything else collapses to `href="#"`. Defeats `javascript:`, `data:`, `vbscript:`, plus padded variants (`java\tscript:`).
- **`rel="noopener noreferrer"` + `target="_blank"`** — emitted on every `<a>`. `noopener` blocks reverse tabnabbing; `noreferrer` prevents `Referer` leakage of the Agentforce panel URL (which can encode session/record IDs).
- **Code fences round-trip** — content extracted to placeholders BEFORE escapeHtml, escaped at restore time. HTML inside a fence renders as literal text.

# Conventions

## LWC
- API version `66.0` is required for the `lightning__AgentforceOutput` target — it became available with the Agentforce/Einstein Copilot release.
- The component is `isExposed: true` with target `lightning__AgentforceOutput` only — it is not intended for record pages or app pages.
- Public API is a single `@api value` that may be a string OR an object with a `text` / `promptResponse` property OR any JSON-serializable value (falls back to `JSON.stringify`).
- Reactivity comes from re-running `renderedCallback` on `@api` change. The `if (container.innerHTML !== newHtml)` guard at the bottom of the callback short-circuits idempotent re-renders without breaking reactivity.

## Styling
- All visual styling lives in `markdownRenderer.css`. The parser emits unstyled tags. Scoped CSS rules target `.markdown-container h1`, `.markdown-container a`, etc.
- Avoid inline `style="..."` in the parser output — it's harder to theme, doesn't survive future CSP tightening, and won't pick up SLDS design tokens if added later.
- The host stylesheet uses `Salesforce Sans` + `#181818` text + `#0070d2` link color. These are SLDS-default-adjacent but hard-coded — a future improvement is to switch to SLDS design tokens (`--lwc-colorTextDefault`, etc.) for org theming + dark mode.

## Markdown parser
- Each markdown construct is one regex. Pure functions; no state between matches.
- Order matters: code fences/inlines extracted to placeholders FIRST, `escapeHtml` SECOND, then tables → headings → blockquotes → triple-asterisk → bold → italic → links → lists → paragraphs/breaks → cleanup → restore code placeholders (with content escapeHtml'd) LAST.
- Triple-asterisk (`***both***`) handled BEFORE bold-only and italic-only to avoid lazy-match mis-nesting. Without it, the lazy `**...**` regex captures `**` + stray `*text*` and emits `<strong><em>both</strong></em>` (mis-nested).
- No lookbehind regex — replaced with the ordered triple/double/single-asterisk passes above. Mobile Safari < iOS 16.4 doesn't support lookbehind.
- The wrap-list regexes (`<oli>` for ordered, `<uli>` for unordered) use intermediate tags to avoid double-wrapping when both kinds of lists appear in the same document. Replace `<oli>`→`<li>` and `<uli>`→`<li>` happens during the wrap step.
- Table grammar requires three lines: header `| a | b |`, separator `|---|---|`, body `| 1 | 2 |`. Strict separator detection rejects horizontal rules that happen to contain `|`.

# Testing

```bash
npm install
npm test
```

**Current coverage:** 38 Jest tests across 5 describe blocks (escapeHtml, URL allowlist, markdown constructs, value getter, edge cases). Run with `npm test`.

Coverage targets when adding tests:
- `escapeHtml` — every special char + idempotency
- `parseMarkdown` — each markdown construct + edge cases (nested bold inside list, link-in-paragraph)
- **URL allowlist** — `javascript:`, `data:`, `vbscript:`, padded variants (`java\tscript:`, `java\nscript:`, `  https://x  `), legit schemes preserved

# Deploy gotchas

- **Deploy this project BEFORE any consumer.** Any GenAiFunction whose `output/schema.json` references `c__markdownResponse` will fail to deploy if the Lightning Type isn't already in the org. `Cumulus_Assistant/` (sibling project) is one such consumer.
- **API version mismatch.** If you back-port to an org running an API version < 66.0, the `lightning__AgentforceOutput` target won't resolve. Check the org's Agentforce/Einstein Copilot version before deploying.
- **`.forceignore`** excludes `__tests__/` and `*.test.js` from `sf project deploy`.
- **The c__ prefix is a known unresolved gotcha.** In a no-namespace org, the registry stores the Lightning type as `markdownResponse` (no prefix), but the agent compiler validates `c__markdownResponse`. We've observed cases where Setup Agent Builder rejects `c__markdownResponse` with a misleading "from X to X" error even though the source matches the deployed bundle. Source uses `c__markdownResponse` in the Cumulus_Assistant agent + GenAiFunction; if a save fails in Setup, the recovery path is unclear and may require Salesforce support intervention.

# Common mistakes

- **Reaching for `textContent`** when the security plugin warns about `innerHTML`. `textContent` defeats the feature (no markdown rendering). The security boundary is `escapeHtml` + URL allowlist + curated tag emission, not `innerHTML`-avoidance.
- **Adding DOMPurify** without checking the dependency cost. ~50KB static resource + `lightning/platformResourceLoader` import. Sibling `DC_AgentForce_Output_LWC` does this; the explicit choice for this project was to avoid it. Re-evaluate only if the input trust boundary widens (e.g. user-typed markdown vs. LLM-output).
- **Adding HTML auto-detect via `DOMParser`.** Tried 2026-05-29; deployed cleanly via MDAPI but broke the Agent Authoring Builder save validator with a misleading "from c__markdownResponse to c__markdownResponse" error. Reverted same day. If you re-attempt: do it in a sandbox first and confirm the agent compiler still resolves the type on the consumer side.
- **Hardcoding inline styles in `parseMarkdown` output.** Move to `markdownRenderer.css` — shadow-scoped CSS still applies to `lwc:dom="manual"` injected DOM.
- **Adding `style="..."` attributes via parser regex** — creates an attribute-injection vector if the regex template strings ever interpolate user-controlled values. Keep emitted tags attribute-free and let CSS do the work.

# Related projects

- `../Cumulus_Assistant/` — sibling project containing the Cumulus Bank `.agent` definition and the `DC_Product_Offers` GenAiFunction that consumes `c__markdownResponse`.
- `../DC_AgentForce_Output_LWC/` — older renderer pattern (Apex sanitizer + `marked.js` static resource).
- `../docs/MONOREPO_OVERVIEW.md` — JDO monorepo index.
