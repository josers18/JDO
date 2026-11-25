# Commercial Atlas verification

Run from `React-Headless` while the existing study server serves port 5187:

```sh
node --test docs/design-studies/2026-11-12-directions/tests/commercial-*.test.cjs
node docs/design-studies/2026-11-12-directions/tests/commercial-journeys.browser.cjs
node docs/design-studies/2026-11-12-directions/tests/commercial-edge.browser.cjs
```

Browser scripts use the existing cached module and binary unless overridden with `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH`:

```text
/Users/jsifontes/.npm/_npx/31e32ef8478fbf80/node_modules/playwright
/Users/jsifontes/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell
```

The browser must be allowed to launch outside the restricted process sandbox; this is local UI verification, not a deployment. No dependencies are downloaded by these scripts. Each uses a fresh browser context, records page errors and non-GET requests, and writes screenshots/reports only under `output/playwright/commercial-journeys`. Source capture `.sql`/`.soql` files are dated read-only evidence, never executed automatically.

Open the build at [Commercial Atlas](http://127.0.0.1:5187/docs/design-studies/2026-11-12-directions/workspace.html?direction=atlas&persona=commercial&page=today). Company dossiers include [Cameron-Olson](http://127.0.0.1:5187/docs/design-studies/2026-11-12-directions/workspace.html?direction=atlas&persona=commercial&page=relationships&client=001am00002AAAvtAAH&tab=intel) and [Oliver-Leonard](http://127.0.0.1:5187/docs/design-studies/2026-11-12-directions/workspace.html?direction=atlas&persona=commercial&page=relationships&client=001am00002AYRm2AAH&tab=intel).
