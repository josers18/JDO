# Dependency Management

How this project handles npm dependency security advisories (Dependabot). The
short version: **every alert here is a *transitive* dependency, so the fix is an
npm `overrides` entry — not a direct version bump.**

## Why direct bumps don't work

None of the flagged packages appear directly in any `package.json` — they're
pulled in by the Salesforce SDK / tooling several levels down. Two consequences:

- Bumping or widening a direct dependency's range does **not** force the
  transitive resolution. (PR #17 widened `esbuild`'s allowed range but the
  lockfile stayed on the vulnerable version; the alert persisted.)
- The reliable lever is npm [`overrides`](https://docs.npmjs.com/cli/v10/configuring-npm/package-json#overrides):
  it forces the resolved version regardless of who requested it.

## The fix pattern

1. Add the package to the `overrides` block in the affected `package.json`.
2. `npm install` to regenerate the lockfile.
3. Verify: `npm audit` should report **0 vulnerabilities**.
4. For the React bundles, `npm run build` — confirm the bundle still builds and
   (for telemetry/build/test-only deps) that `dist/` output hashes are unchanged.

`dist/` is generally **unaffected** by these fixes: the flagged packages are
telemetry (`o11y`), build (`esbuild`, `@babel/core`), or test (`js-yaml` via
coverage tooling), none of which ship in the runtime bundle. If a fix ever *does*
change `dist/`, commit the rebuilt `dist/` too — it is the deploy artifact (see
[the dist rebuild note in AGENTS.md](../AGENTS.md)).

## The two clusters (cleared in PR #19, 2026-07-07)

### React UI bundles — `ReactRetail` / `ReactWealth` / `ReactCommercial` / `ReactHeadless`

Identical dependency trees (all scaffolded from `reactbasic`), so the same
`overrides` apply to all four:

```json
"overrides": {
  "lodash": "^4.18.1",
  "protobufjs": "^7.6.3",
  "esbuild": "^0.28.1"
}
```

- **protobufjs** — pulled by the `o11y` telemetry SDK; cleared 2 critical
  (arbitrary code execution, prototype pollution) + 5 high + medium advisories.
- **esbuild** — dev/build; cleared the dev-server file-read advisory.

### Sibling LWC projects — `DC_Goals_Cockpit_lwc`, `DC_Multiclass_Prediction_LWC`, `DC_AgentForce_Markdown_Renderer`, `Web_Engagements_RT_Timeline`

```json
"overrides": {
  "@tootallnate/once": "3.0.1",
  "@babel/core": "^7.29.6",
  "@istanbuljs/load-nyc-config": {
    "js-yaml": "^3.15.0"
  }
}
```

- **@babel/core** — build/lint; cleared the sourceMappingURL file-read advisory.
- **js-yaml** — cleared the quadratic-DoS advisory (see the scoped-override note).

## Scoped vs. top-level overrides (important)

A top-level `overrides: { "js-yaml": "^3.15.0" }` forces **every** copy of
js-yaml in the tree to 3.x — including a safe top-level `js-yaml 4.2.0` whose
consumers need the 4.x API. That's a breaking downgrade.

Only the **nested** copy under `@istanbuljs/load-nyc-config` (test-coverage
tooling, which requires `js-yaml ^3.13.1`) was vulnerable. The correct tool is a
**scoped/nested override** that targets only that dependency path:

```json
"@istanbuljs/load-nyc-config": { "js-yaml": "^3.15.0" }
```

**Rule:** when only a nested copy is vulnerable and a sibling copy is already
safe on a different major, use a scoped override — never a top-level one.

## Related docs

- `AGENTS.md` — project-context primer (Common mistakes references this doc).
- `docs/DEPLOYMENT_GUIDE.md` — deploy runbook; note that `dist/` is the deploy artifact.
