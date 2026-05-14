---
name: sf-tableau-next
description: Build, inspect, and modify Tableau Next visualizations, workspaces, dashboards, and Tableau Semantics Layer (Data 360) models programmatically via Salesforce REST APIs. Use this skill whenever the user mentions Tableau Next, Tableau Semantics, Semantic Models, Semantic Data Models, Data 360 semantics, semantic layer, building or replicating a chart/dashboard/workspace via API, running a semantic query, calculated dimensions/measurements, semantic metrics, or any /tableau/* or /ssot/semantic/* REST endpoint — even if they don't say "API". Also trigger when they ask to clone an existing visualization, list existing dashboards in an org, or compose a request body for one of these endpoints. Do NOT trigger for classic Tableau Desktop/Server (.twb/.twbx files), CRM Analytics / Tableau CRM, or generic Salesforce REST that has nothing to do with analytics.
---

# Building with the Tableau Next + Semantics Layer APIs

This skill captures hard-won knowledge about Salesforce's Tableau Next REST API and Tableau Semantics Layer API — both the schema (from the published AMF spec) and what the published spec gets wrong (from live org probes).

**Why this skill exists:** the public AMF spec at `developer.salesforce.com/static/.../amf.json` is on v64 but real orgs run v66; many `*InputRepresentation` schemas are published as opaque shapes; the actual `fields` and `marks` payload shapes use object-keyed maps rather than the arrays the spec implies. Without this skill, naïve POSTs return `DOWNGRADE_VERSION_ERROR` or 400s on undocumented required fields.

## When to use this skill

Trigger broadly — better to load the reference and skip than to miss a trigger and write a broken payload. Specifically use it when the user:

- Asks to **build, create, modify, or clone** a visualization, dashboard, workspace, or semantic model
- References any path under `/services/data/v*/tableau/...` or `/services/data/v*/ssot/semantic/...`
- Mentions **calculated dimensions**, **calculated measurements**, **semantic metrics**, **semantic relationships**, or **semantic queries**
- Asks "how do I POST to..." anything analytics-related on a Salesforce org
- Wants to inspect what assets / models exist in an org
- Asks to attach a **Flexipage**, **DLO**, **DMO**, **Calculated Insight**, or another asset to a workspace

## Core principles

### 1. GET an existing example before you POST a new one

The AMF spec is incomplete. Real payloads contain fields the spec doesn't declare (e.g. `sourceVersion`, `style.allHeaders`, `permissions`). The reliable build path is:

1. Pick a similar existing asset in the org (`GET /tableau/visualizations` to list, then `GET /tableau/visualizations/{name}` for the full payload).
2. Read its real shape — that's your template.
3. Copy + modify, change identifying fields (`name`, `label`, `id`), rebind to your target semantic model.
4. POST the new asset.

Never compose a viz payload from the AMF spec alone. The spec is the type catalog; the live response is the schema-by-example.

### 2. Use API version v66.0 for Tableau Next, v65.0 for Semantics

This is empirically verified. v64 (what the public docs claim) returns `DOWNGRADE_VERSION_ERROR` on many real visualizations. v67+ returns `NOT_FOUND`. Check the org's `sourceVersion` field on a real viz if v66 ever stops working — it tells you the version that produced the asset.

**Minor versions matter for POST.** Tableau Next runs at v66.0 but features land at granular minor versions like v66.08. A GET on v66.0 will return all fields in the org's stored payload — including ones that only POST back successfully on v66.08+. If your POST fails with `Value for [<fieldName>] not allowed for API version 66.0 - min version is 66.08.`, strip the named field before retrying. Known future-version fields: `startToEndSteps`, `middleToEndSteps`, `startToMiddleSteps` (color palette gradient steps).

### 3. `fields` and `marks` are dictionaries, not arrays

```jsonc
"fields": {
  "F1": { "type": "Field", "role": "Dimension", "fieldName": "...", "objectName": "..." },
  "F2": { "type": "Field", "role": "Measure", "function": "Sum", "fieldName": "...", "objectName": "..." }
}
"visualSpecification": {
  "marks":   { "ALL": { "type": "Bar", "isAutomatic": true, "stack": {...}, "encodings": [...] } },
  "columns": ["F2"],
  "rows":    ["F1"]
}
```

Make up short keys (`F1, F2, ...`) for `fields`, then reference them everywhere via `fieldKey`. The mark-group key (`"ALL"`) is conventional.

### 4. Authenticate via `sf` CLI when possible

Use `sf api request rest <path> --target-org <alias>` for GETs and small POSTs. For large POST bodies, write the JSON to a file and use `--body "@path/to/file.json"` (the `@` prefix tells the CLI to read from a file rather than treat the string as the body). The CLI handles bearer-token rotation and is harder to leak in logs than raw curl.

**`sf` CLI quirks:**
- `--body "@/path/to/file.json"` for file body — without the `@` the CLI sends the path string literally and you'll get `JSON_PARSER_ERROR` on `/`.
- `DELETE` requires `--body '""'` (empty string body) or the CLI errors `No 'mode' found in 'body' entry`. Empty stdout on a successful DELETE is normal.
- The `sf api request rest` command is in beta and prints a warning to stderr; pipe through `grep -v Warning` to clean output.

## End-to-end build workflow

```
1. Discover            sf org list  →  pick org alias
2. Inventory           GET  /tableau/workspaces
                       GET  /tableau/visualizations
                       GET  /ssot/semantic/models
3. Pick a template     GET  /tableau/visualizations/{nearest_existing_name}
4. Pick a semantic     GET  /ssot/semantic/models/{model}/data-objects
   model and fields    GET  /ssot/semantic/models/{model}/calculated-measurements
5. Compose payload     Modify the template — change `name`, `label`, rebind
                       `dataSource`, swap `fields[*].fieldName` / `objectName`
6. (If new model)      POST /ssot/semantic/models/{newApiName}      ← actually PUT, not POST
                       PUT /services/data/v65.0/ssot/semantic/models/{newApiName}
7. (If new workspace)  POST /services/data/v66.0/tableau/workspaces
                       body: { name, label, description }
8. Create viz          POST /services/data/v66.0/tableau/visualizations
                       body: composed VisualizationInput
9. Validate            GET  the new viz, run a semantic query against the model
                       to confirm numbers
```

## References — load the right one for the task

The detailed schemas are too big for SKILL.md. Read references on demand:

| Task | Read |
|---|---|
| Building/cloning visualizations or dashboards | `references/tableau-next-api.md` |
| Building or modifying semantic models | `references/semantic-layer-api.md` |
| Looking up an enum value (mark types, aggregations, table calcs, sort orders) | `references/enums.md` |
| Resolving a polymorphic filter / color / range type | `references/polymorphism.md` |
| **Reading or composing a real Visualization payload** | `references/empirical-payloads.md` (this is the most important one — has actual GET responses) |

## Bundled scripts — use these instead of reinventing

| Script | Purpose |
|---|---|
| `scripts/list_assets.sh <org-alias>` | One-shot inventory: workspaces, visualizations, semantic models in the org |
| `scripts/get_viz.sh <org-alias> <viz-name>` | Pull a full visualization payload to use as a template |
| `scripts/clone_viz.sh <org-alias> <src> <new-name> [new-label]` | Clone an existing viz under a new name — handles server-field + future-version stripping |
| `scripts/get_model.sh <org-alias> <model-api-name>` | Pull a full semantic model payload |
| `scripts/probe_model_subendpoints.sh <org-alias> <model>` | Hit all 7 sub-endpoints (data-objects, relationships, calculated-dimensions, calculated-measurements, groupings, parameters, shallow) |
| `scripts/extract_amf_spec.sh <static-spec-url>` | Download an AMF JSON-LD spec with the right Referer headers |
| `scripts/parse_amf.py <spec.amf.json> [--max-depth N]` | Walk an AMF spec and print endpoints + resolved schemas |

The `parse_amf.py` script is general-purpose — it works for any developer.salesforce.com REST reference, not just Tableau Next. Useful when the user asks about a different Salesforce REST API.

## Common pitfalls

1. **`DOWNGRADE_VERSION_ERROR`** on Tableau Next → you used v64 (the published doc version). Use **v66.0**.
2. **`Value for [...] not allowed for API version 66.0 - min version is 66.08`** when POSTing a cloned payload → strip the named field. The org stores fields from future versions on assets but rejects them on POST at v66.0. Known: `startToEndSteps`, `middleToEndSteps`, `startToMiddleSteps`.
3. **Required-field 400s** on POST visualization → almost always one of: `style.allHeaders`, `quickTableCalc`, `computeUsing`, `marks.{group}.stack`, `forecasts: {}`, `referenceLines: {}`. The spec marks these required but doesn't say what to put when not using them. Empty objects `{}` work as defaults.
4. **`SemanticDataObjectInputRepresentation` empty in the spec** → don't try to compose it from the AMF spec. GET an existing model, copy a `semanticDataObjects[]` element, modify.
5. **Looking for POST `/semantic/models/`** → it's actually `PUT /ssot/semantic/models/{newApiName}`. The Quick Start guide is stale.
6. **Calculated expressions are HTML-encoded** in stored payloads (`&lt;`, `&#39;`). Decode before reading; encode before writing.
7. **`dataSource.type` only accepts `"SemanticModel"`** — every Tableau Next viz binds to a semantic model. Build the model first.
8. **Semantic Query API expects DLO-namespaced table names**, not semantic-model aliases — `tableField.tableName` wants the full `<ns>__<name>__dlm` (or `__dlo`/`__chc`) entity name, not the model's `apiName`. Look up via `GET /ssot/semantic/models/{m}/data-objects` → `dataObjectName`. The semantic-engine protobuf path is: `structuredSemanticQuery.fields[].expression.tableField.{tableName, name}`.

## When the user wants to do something the spec doesn't cover

Don't guess. The discovery loop:

1. Browse to the relevant developer.salesforce.com Reference page in a browser (or use Playwright).
2. Network-watch for the `*.amf.json` URL.
3. Fetch with the right `Referer: https://developer.salesforce.com/...` header — without it you'll get a 404 HTML page.
4. Parse with `scripts/parse_amf.py`.
5. Cross-check against a real org with `GET` on an existing instance.

This is how this skill itself was built. The pattern generalizes to any Salesforce REST API.
