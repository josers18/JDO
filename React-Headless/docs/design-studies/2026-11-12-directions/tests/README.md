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
