# AGENTS.md — DC_AgentForce_Markdown_Renderer

Context for AI coding agents working on the **Markdown Renderer** Lightning component for Agentforce. This is a Salesforce DX project shipping one LWC, one Lightning Type definition, and a renderer override — no Apex, no Flow.

# Product context

A renderer for Agentforce GenAI Function responses formatted as markdown. Wired in via the platform's Lightning Type renderer-override mechanism: `c__markdownResponse` is a custom Lightning type whose `lightningDesktopGenAi` renderer is `c/markdownRenderer`. Any GenAiFunction whose `output/schema.json` types `promptResponse` as `c__markdownResponse` is auto-routed through this LWC by the Agentforce panel.

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
  ├─ parseMarkdown: escapeHtml -> headings -> bold/italic -> links -> lists -> paragraphs
  └─ renderedCallback: container.innerHTML = parsed (lwc:dom="manual")
```

## Why `lwc:dom="manual"` + `innerHTML`

LWC's template compiler does not allow injecting HTML strings via the standard template syntax. The component needs to emit `<h1>`, `<strong>`, `<a>`, etc. dynamically based on parsed markdown. Two patterns are available:

1. **Recursive template rendering of a parsed AST** — verbose, requires an in-memory AST + per-tag template branches.
2. **`lwc:dom="manual"` + `innerHTML` injection** — bypasses the compiler; renderedCallback fills the container directly.

This project uses pattern 2 because the markdown grammar is small and the security boundary is straightforward (escape first, allowlist links). The injected DOM still inherits the shadow-scoped CSS from `markdownRenderer.css`, so styling works exactly like template-rendered nodes.

## Security boundaries

The component trusts the LLM-generated text only as far as: (a) `escapeHtml` runs first, neutralizing raw `&<>"`, then (b) the markdown regex inserts a curated tag set, and (c) the link parser enforces a URL scheme allowlist with control-character stripping.

- **escapeHtml** — `markdownRenderer.js:67-70`. Only neutralizes `& < > "`. Single-quote and backtick pass through but the curated tag set never opens an attribute context where they'd matter.
- **URL allowlist** — `markdownRenderer.js:35-40`. Strips whitespace + `0x00-0x1F` + DEL `0x7F` BEFORE scheme matching, then tests against `/^(https?:|mailto:|\/|#|\.\/)/i`. Anything else collapses to `href="#"`. This defeats `javascript:`, `data:`, `vbscript:`, plus padded variants like `java\tscript:` (browsers ignore intra-scheme whitespace, so post-cleaned matching is mandatory).
- **`rel="noopener noreferrer"`** — emitted on every `<a>`. `noopener` blocks reverse tabnabbing; `noreferrer` prevents the `Referer` header from leaking the Agentforce panel URL (which can encode session/record IDs) to externally-linked sites.

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
- Order matters: `escapeHtml` first, then headings (line-anchored, multi-line flag), then bold/italic (italic uses lookbehind/lookahead to avoid eating bold markers), then links, then lists, then paragraphs/breaks.
- Lookbehind `(?<!\*)` on the italic regex is fine for desktop browsers but has poor mobile Safari coverage (< iOS 16.4). If mobile becomes a target surface, refactor to a stateful tokenizer.
- The wrap-list regex `/((?:<li[^>]*>.*?<\/li>\s*)+)/g` greedily wraps consecutive `<li>` runs in `<ul>`. Don't reorder — it must run AFTER the `<li>` substitution and BEFORE paragraph wrapping.

# Testing

```bash
npm install
npm run test:unit
```

(No `package.json` ships with this project today; if you add one, mirror `DC_Multiclass_Prediction_LWC/package.json` — `@salesforce/sfdx-lwc-jest` + `sfdx-lwc-jest` script.)

Coverage targets when adding tests:
- `escapeHtml` — every special char + idempotency
- `parseMarkdown` — each markdown construct + edge cases (nested bold inside list, link-in-paragraph)
- **URL allowlist** — `javascript:`, `data:`, `vbscript:`, padded variants (`java\tscript:`, `java\nscript:`, `  https://x  `), legit schemes preserved

# Deploy gotchas

- **Deploy this project BEFORE any consumer.** Any GenAiFunction whose `output/schema.json` references `c__markdownResponse` will fail to deploy if the Lightning Type isn't already in the org. `Cumulus_Assistant/` (sibling project) is one such consumer.
- **API version mismatch.** If you back-port to an org running an API version < 66.0, the `lightning__AgentforceOutput` target won't resolve. Check the org's Agentforce/Einstein Copilot version before deploying.
- **No `forceignore`.** Everything in `force-app/` deploys. If you add Jest tests, add `__tests__/` to `.forceignore` (sibling pattern: see `Web_Engagements_RT_Timeline/.forceignore`).

# Common mistakes

- **Reaching for `textContent`** when the security plugin warns about `innerHTML`. `textContent` defeats the feature (no markdown rendering). The security boundary is `escapeHtml` + URL allowlist, not `innerHTML`-avoidance.
- **Adding DOMPurify** without checking the dependency cost. ~50KB static resource + `lightning/platformResourceLoader` import. Sibling `DC_AgentForce_Output_LWC` does this; the explicit choice for this project was to avoid it. Re-evaluate only if the input trust boundary widens (e.g. user-typed markdown vs. LLM-output).
- **Hardcoding inline styles in `parseMarkdown` output.** Move to `markdownRenderer.css` — shadow-scoped CSS still applies to `lwc:dom="manual"` injected DOM.
- **Adding `style="..."` attributes via parser regex** — also creates an attribute-injection vector if the regex template strings ever interpolate user-controlled values. Keep emitted tags attribute-free and let CSS do the work.

# Related projects

- `../Cumulus_Assistant/` — sibling project containing the Cumulus Bank `.agent` definition and the `DC_Product_Offers` GenAiFunction that consumes `c__markdownResponse`.
- `../DC_AgentForce_Output_LWC/` — older renderer pattern (Apex sanitizer + `marked.js` static resource).
- `../docs/MONOREPO_OVERVIEW.md` — JDO monorepo index.
