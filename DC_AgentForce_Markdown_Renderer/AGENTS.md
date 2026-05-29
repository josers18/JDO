# AGENTS.md — DC_AgentForce_Markdown_Renderer

Context for AI coding agents working on the **Markdown Renderer** Lightning component for Agentforce. This is a Salesforce DX project shipping one LWC, one Lightning Type definition, and a renderer override — no Apex, no Flow.

# Product context

A renderer for Agentforce GenAI Function responses formatted as **markdown OR HTML**. Wired in via the platform's Lightning Type renderer-override mechanism: `c__markdownResponse` is a custom Lightning type whose `lightningDesktopGenAi` renderer is `c/markdownRenderer`. Any GenAiFunction whose `output/schema.json` types `promptResponse` as `c__markdownResponse` is auto-routed through this LWC by the Agentforce panel.

The component auto-detects which format it received and routes through the appropriate path:
- **Markdown path** — regex-based parser (`parseMarkdown`) handles headings, bold/italic/triple-asterisk, code fences + inline code, ordered/unordered lists, blockquotes, tables, and links.
- **HTML path** — `DOMParser`-based sanitizer (`sanitizeHtml`) walks an inert detached document, allowlists tags + attributes, force-adds `rel="noopener noreferrer" target="_blank"` on links, and applies the same URL allowlist used by the markdown link parser.

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
  ├─ renderedCallback dispatches based on isHtml(text):
  │     ├─ isHtml=false → parseMarkdown(text)
  │     │     └─ escapeHtml -> headings -> bold/italic -> links -> lists -> tables -> code -> paragraphs
  │     └─ isHtml=true  → sanitizeHtml(text)
  │           └─ DOMParser -> walk tree -> tag/attr allowlist -> force rel/target on <a>
  └─ container.innerHTML = result (lwc:dom="manual")
```

## Why `lwc:dom="manual"` + `innerHTML`

LWC's template compiler does not allow injecting HTML strings via the standard template syntax. The component needs to emit `<h1>`, `<strong>`, `<a>`, etc. dynamically based on parsed markdown. Two patterns are available:

1. **Recursive template rendering of a parsed AST** — verbose, requires an in-memory AST + per-tag template branches.
2. **`lwc:dom="manual"` + `innerHTML` injection** — bypasses the compiler; renderedCallback fills the container directly.

This project uses pattern 2 because the markdown grammar is small and the security boundary is straightforward (escape first, allowlist links). The injected DOM still inherits the shadow-scoped CSS from `markdownRenderer.css`, so styling works exactly like template-rendered nodes.

## Security boundaries

Both paths land at the same emitted-tag set and the same URL/attribute guarantees, but the mechanisms differ.

### Markdown path
- **escapeHtml runs first** — neutralizes raw `& < > "` before any regex inserts a tag.
- **Curated tag emission** — only the tags the parser explicitly emits (`<h1-3>`, `<strong>`, `<em>`, `<ul>/<ol>/<li>`, `<blockquote>`, `<code>`, `<pre>`, `<a>`, `<table>` family, `<p>`, `<br>`) end up in the output.
- **Code fences round-trip** — content extracted to placeholders BEFORE escapeHtml, escaped at restore time. HTML inside a fence renders as literal text.

### HTML path
- **DOMParser inert parsing** — the parsed tree never executes scripts, never loads resources, never fires events. Only structural data, available for traversal.
- **Tag allowlist (`ALLOWED_TAGS`)** — disallowed tags get unwrapped (children survive as text). `<script>` and `<style>` special-cased: tag AND contents dropped.
- **Per-tag attribute allowlist (`ALLOWED_ATTRS`)** — currently only `<a href>` survives. Strips event handlers (`onclick`, `onerror`, ...), `style="..."`, `class="..."`, `id="..."`, `src` on `<img>`, `data-*`, etc.
- **Re-escape at serialize time** — text node values run through `escapeHtml` when serializing back to a string, since the browser already decoded entities during parse.

### Both paths
- **URL allowlist on `<a href>`** — strips whitespace + `0x00-0x1F` + DEL `0x7F` BEFORE scheme matching, then tests against `/^(https?:|mailto:|\/|#|\.\/)/i`. Anything else collapses to `href="#"`. Defeats `javascript:`, `data:`, `vbscript:`, plus padded variants (`java\tscript:`).
- **`rel="noopener noreferrer"` + `target="_blank"`** — force-added to every emitted `<a>`. `noopener` blocks reverse tabnabbing; `noreferrer` prevents `Referer` leakage of the Agentforce panel URL (which can encode session/record IDs).

### Detect heuristic (`isHtml`)

The dispatcher uses a regex that matches structural and inline HTML tags but **excludes** `<script>` and `<style>`. A markdown doc containing literal `<script>foo</script>` text continues through the markdown path, where `escapeHtml` neutralizes it to `&lt;script&gt;foo&lt;/script&gt;`. This is intentional: it avoids false positives on documents that mention HTML tags in prose without wrapping them in a fence.

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

## HTML sanitizer
- `sanitizeHtml(text)` parses into a `DOMParser` doc, then `_serializeChildren` recurses through every node, calling `_serializeNode` per node.
- `_serializeNode` handles three cases: text node (re-escape), allowed element (emit with allowlisted attrs + recurse), disallowed element (drop wrapper, recurse into children — except `<script>`/`<style>` which drop both tag and contents).
- All attribute values pass through `_sanitizeAttrValue` for context-specific cleaning. Currently only `<a href>` has a non-passthrough rule (URL allowlist + control-char strip); add new rules here as new attributes are allowlisted.
- Void elements (`<br>`, `<hr>`) self-close. Other tags recurse and emit closing tags.
- The `ALLOWED_TAGS` set is intentionally narrower than what the markdown parser CAN emit, but it's a strict superset of what `parseMarkdown` actually emits today. Don't widen without considering attribute sanitization for the new tag.

# Testing

```bash
npm install
npm run test:unit
```

(No `package.json` ships with this project today; if you add one, mirror `DC_Multiclass_Prediction_LWC/package.json` — `@salesforce/sfdx-lwc-jest` + `sfdx-lwc-jest` script.)

**Current coverage:** 56 Jest tests across 6 describe blocks (escapeHtml, URL allowlist, markdown constructs, HTML sanitizer, value getter, edge cases). Run with `npm test`.

Coverage targets when adding tests:
- `escapeHtml` — every special char + idempotency
- `parseMarkdown` — each markdown construct + edge cases (nested bold inside list, link-in-paragraph)
- `sanitizeHtml` — each disallowed tag (drop unwrap), `<script>`/`<style>` (drop both), each disallowed attribute (strip), nested allowlisted tags (preserve)
- **URL allowlist (both paths)** — `javascript:`, `data:`, `vbscript:`, padded variants (`java\tscript:`, `java\nscript:`, `  https://x  `), legit schemes preserved
- `isHtml` heuristic — markdown stays markdown; HTML routes correctly; ambiguous cases (markdown with stray `<script>` literal) route to markdown path

# Deploy gotchas

- **Deploy this project BEFORE any consumer.** Any GenAiFunction whose `output/schema.json` references `c__markdownResponse` will fail to deploy if the Lightning Type isn't already in the org. `Cumulus_Assistant/` (sibling project) is one such consumer.
- **API version mismatch.** If you back-port to an org running an API version < 66.0, the `lightning__AgentforceOutput` target won't resolve. Check the org's Agentforce/Einstein Copilot version before deploying.
- **No `forceignore`.** Everything in `force-app/` deploys. If you add Jest tests, add `__tests__/` to `.forceignore` (sibling pattern: see `Web_Engagements_RT_Timeline/.forceignore`).

# Common mistakes

- **Reaching for `textContent`** when the security plugin warns about `innerHTML`. `textContent` defeats the feature (no markdown rendering). The security boundary is `escapeHtml` + URL allowlist + tag/attribute allowlist, not `innerHTML`-avoidance.
- **Adding DOMPurify** without checking the dependency cost. ~50KB static resource + `lightning/platformResourceLoader` import. Sibling `DC_AgentForce_Output_LWC` does this; the explicit choice for this project was to avoid it. Re-evaluate only if the input trust boundary widens (e.g. user-typed markdown vs. LLM-output).
- **Hardcoding inline styles in `parseMarkdown` output.** Move to `markdownRenderer.css` — shadow-scoped CSS still applies to `lwc:dom="manual"` injected DOM.
- **Adding `style="..."` attributes via parser regex** — creates an attribute-injection vector if the regex template strings ever interpolate user-controlled values. Keep emitted tags attribute-free and let CSS do the work.
- **Widening `ALLOWED_TAGS` without sanitizing the new tag's attributes.** Adding `img` to `ALLOWED_TAGS` without adding a `src` URL allowlist to `ALLOWED_ATTRS.img` re-opens the same XSS vector the URL allowlist was designed to close.
- **Widening `isHtml` to include `<script>` or `<style>`.** That would route `<script>` payloads through the HTML path's special-case "drop tag and contents" logic, which is fine — but it would ALSO route benign markdown docs that mention `<script>` in prose through the sanitizer, where the content silently disappears. Current behavior (markdown path → escape) is more visible.
- **Trusting browser-decoded text inside the sanitizer.** When `DOMParser` reads `<p>A &amp; B</p>`, the text node value is `A & B` (entity decoded). The sanitizer MUST re-escape on emit (`_serializeNode` does this for `nodeType === 3`). If you skip this, output corrupts when the same string round-trips through Agentforce.

# Related projects

- `../Cumulus_Assistant/` — sibling project containing the Cumulus Bank `.agent` definition and the `DC_Product_Offers` GenAiFunction that consumes `c__markdownResponse`.
- `../DC_AgentForce_Output_LWC/` — older renderer pattern (Apex sanitizer + `marked.js` static resource).
- `../docs/MONOREPO_OVERVIEW.md` — JDO monorepo index.
