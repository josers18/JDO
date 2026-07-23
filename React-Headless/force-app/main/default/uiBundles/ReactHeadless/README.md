# React Headless — local review harness

The **review harness** for the React-Headless cockpit suite: a local sandbox that renders the shared cockpit surfaces (Retail / Wealth / Commercial) as plain routes so you can eyeball changes to the `_shared` library without deploying to an org. Same tech as the persona bundles — React 19 + Vite 7 + TypeScript + Tailwind v4 / shadcn/ui on the **Cumulus Aurora** design language — but scoped to fast visual iteration.

Unlike the three persona bundles, **this one is not a deployable in-org app.** It has no `CustomApplication`, permission set, `CustomTab`, or Visualforce launch card — nothing under `applications/`, `permissionsets/`, `tabs/`, or `pages/` references it. It exists to run `npm run dev` and look at the UI.

It pulls the same `_shared/` source library (Aurora Glass theme, data clients, component primitives, the Configuration page) via the `@shared` alias, so what you see here is what the deployed cockpits render. Data defaults to the per-domain mock fallback (`src/data/dataSource.ts`) so it runs standalone with no org session; point it at live data the same way the persona bundles do when you need it.

## What's inside

- **Home** (`/`) — the cockpit landing surface.
- **Customer 360** (`/client/:id`) — the full customer-360 view for a given client id, the shared surface the persona apps reuse.
- The shared Aurora chrome and component primitives, rendered exactly as the persona bundles compose them.

## Run (development)

From this bundle directory (`force-app/main/default/uiBundles/ReactHeadless`):

```bash
npm install
npm run dev            # Vite dev server (~http://localhost:5173); dev:design for design mode
```

Open `/` for the home surface and `/client/<id>` for the Customer 360 view.

## Build

```bash
npm install
npm run build          # tsc -b && vite build -> dist/
```

The build is a sanity check that the harness (and the `_shared` code it exercises) compiles. There is **no deploy step** — this bundle intentionally ships nowhere. To put a change in front of users, make it in `_shared` and deploy one of the persona bundles (ReactRetail / ReactWealth / ReactCommercial); see their READMEs.

## Test

```bash
npm run test -- run    # single Vitest pass (CI mode)
npm run lint
```

## Related

- [Project README](../../../../../README.md) — quick start, deployed-app URLs, verified deploy facts.
- [AGENTS.md](../../../../../AGENTS.md) — project-context primer (architecture, conventions, common mistakes).
- [CHANGELOG.md](../../../../../CHANGELOG.md) — rolling change history for the whole suite.
- [ReactRetail](../ReactRetail/README.md) / [ReactWealth](../ReactWealth/README.md) / [ReactCommercial](../ReactCommercial/README.md) — the deployable persona cockpits.
