# Retail continuity checks

Run from `React-Headless`:

```sh
node --test docs/design-studies/2026-11-12-directions/tests/retail-context.test.cjs
```

The pure Node tests load committed captures and require no external packages or org session. They check exact Account/product selection, source precedence, owner/account isolation, unavailable balances and no source mutation.

The browser journey requires an available Playwright installation and a local server serving the repository root (default `127.0.0.1:5187`). It does not authenticate or write to Salesforce:

```sh
node docs/design-studies/2026-11-12-directions/tests/retail-context.browser.cjs
```

Use `PLAYWRIGHT_MODULE` for the installed module path if it is outside the normal Node module lookup, `CHROMIUM_PATH` for an existing Chromium executable, and `STUDY_URL` to override the preview URL. Screenshots are local verification artifacts under `output/playwright/retail-context/`; they are not required source fixtures.

The browser path covers main Growth/cohort → Kyle's exact product/history → linked follow-up → Workbench, returning to the cohort, clearing stale source keys when a draft changes Account, Opportunity proposal defaults, another captured Retail customer and known holdings, three viewport sizes, other-persona isolation and no non-GET requests. These mock tests do not establish live production integration parity.

## Today priorities and pulse

```sh
node --test docs/design-studies/2026-11-12-directions/tests/retail-priorities.test.cjs
node docs/design-studies/2026-11-12-directions/tests/retail-priorities.browser.cjs
```

The production-comparison test uses TypeScript from the existing ReactRetail dependencies to evaluate the actual shared blender. The other checks use committed captures and Node built-ins. Browser options are the same as above. Source-failure and recent-browser scenarios use isolated request overrides solely inside the test; committed data remains unchanged. See [capture and behavior notes](../RETAIL_PRIORITY_MILESTONE.md).

## Business development

Run `node --test docs/design-studies/2026-11-12-directions/tests/retail-business.test.cjs`. Run `retail-business.browser.cjs` with the same Playwright/Chromium environment as the other suites. The local preview must listen on port 5187. Checks cover Lead fields and provenance, directed introductions, source-to-opportunity drafts, holder coverage, movers, renter gates, missing aggregates, four widths and persona isolation. Source SQL/SOQL files are read-only capture evidence, not startup scripts. See [milestone bounds](../RETAIL_BUSINESS_MILESTONE.md).

## Customer and execution depth

Run `node --test docs/design-studies/2026-11-12-directions/tests/retail-customer.test.cjs`; run `retail-customer.browser.cjs` with the same Playwright environment and preview server as the other suites. Source evidence is in `retail-customer-capture.soql` and `.sql`. Tests exercise goal/plan fields, historical Event operations, task completion, Contact/Account links, notes, source failure/empty states, planner separation and responsive/persona boundaries. See [customer milestone](../RETAIL_CUSTOMER_MILESTONE.md).

## Intelligence and relationship watch

Run `node --test docs/design-studies/2026-11-12-directions/tests/retail-watch.test.cjs`; run `retail-watch.browser.cjs` with the same Playwright/Chromium environment and port-5187 preview server. The suite covers source state/dates, native AML changes, property overlap/null coordinates, external-case references, exact-account drafts and reassignment, Today/360 continuity, keyboard plot actions, four widths and persona isolation. Read-only source evidence is in `retail-watch-capture.sql` / `.soql`. See [scope and verification](../RETAIL_WATCH_MILESTONE.md).
