# Deployment Guide — React-Headless UI Bundles

How to deploy a React UI bundle in this project so it renders as a Lightning app in the org. Written against `storm-16a17dc388fbe6` (Enterprise Edition, API v67.0) on 2026-07-06; the commands below use the current org alias `jdo-oe0sdd` (org id `00Dam00000Uo32qEAB` — the former `jdo-1lrnov` alias for this same org no longer resolves). Substitute your bundle name for `ReactRetail` throughout.

## TL;DR

1. Build the bundle (`npm run build` → `dist/`).
2. Deploy the bundle **+** its `CustomApplication` **+** its access permission set **together**.
3. Open the app at the **Salesforce App Domain** URL, not `/lightning/app/<name>`.
4. If the bundle was ever deployed during the beta, do the **delete-and-redeploy migration** — a plain redeploy won't clear the stale AppMenuItem.

## Prerequisites

- Target org authenticated (`sf org login web -o jdo-oe0sdd`).
- `sourceApiVersion` in `sfdx-project.json` aligned to the org (**67.0**). Below ~v67 the `UIBundle` metadata type errors with *"Not available for deploy for this API version."*
- The Salesforce App Domain is enabled. Confirm at Setup → **React Development with Agentforce Vibes and Salesforce Multi-Framework**: if there's no "Enable Domain" button, it's already on.

## The three metadata pieces

A UIBundle renders as a Lightning app only when all three exist and agree:

| Piece | File | Key content |
|-------|------|-------------|
| Bundle | `uiBundles/ReactRetail/ReactRetail.uibundle-meta.xml` | `<isActive>true</isActive>`, **`<target>CustomApplication</target>`** |
| App | `applications/ReactRetail.app-meta.xml` | `<uiType>Lightning</uiType>`, **`<uiBundle>c__ReactRetail</uiBundle>`** |
| Access | `permissionsets/ReactRetail_Access.permissionset-meta.xml` | `applicationVisibilities` → `ReactRetail`, `visible=true`; plus `pageAccesses` + `tabSettings` for the launcher tile |
| Launcher page | `pages/ReactRetailLauncher.page` | VF "launch card"; `target="_top"` button → App Domain URL (see [App Launcher tile](#app-launcher-tile)) |
| Launcher tab | `tabs/ReactRetailApp.tab-meta.xml` | `visualforcePage`-type CustomTab → the launcher page; this is the waffle-menu tile |

Use the `c__` prefix on the `<uiBundle>` binding for no-namespace orgs (this org). `<target>CustomApplication</target>` is required — a bundle scaffolded during the beta defaults to `AppLauncher`, which is what breaks post-GA.

## Standard deploy

```bash
# 1. Build first — dist/ is what deploys.
cd force-app/main/default/uiBundles/ReactRetail && npm install && npm run build && cd -

# 2. Deploy bundle + app + permset in ONE command (deploying the app before the
#    bundle exists fails with "no UIBundle named X found").
sf project deploy start \
  --source-dir force-app/main/default/uiBundles/ReactRetail \
  --source-dir force-app/main/default/applications/ReactRetail.app-meta.xml \
  --source-dir force-app/main/default/permissionsets/ReactRetail_Access.permissionset-meta.xml \
  -o jdo-oe0sdd --json
```

The launcher tile (`pages/` + `tabs/`) can deploy in the same command or separately — the tab depends on the page, and the permset's `tabSettings`/`pageAccesses` depend on both, so if deploying piecemeal, order is pages → tabs → permsets.

Always read `result.status` and `result.numberComponentErrors` from the `--json`. Never use `--ignore-conflicts` blindly — it has masked a hard failure as exit code 0.

Assign the permission set to yourself if not already:

```bash
sf org assign permset -n ReactRetail_Access -o jdo-oe0sdd
```

## Where the app actually renders

**Serving URL (use this):**

```
https://storm-16a17dc388fbe6--c.demo.my.salesforce.app/app/c__ReactRetail
```

Note the `--c` segment and the `.my.salesforce.app` App Domain. Client/detail routes append to it, e.g. `/app/c__ReactRetail/client/<accountId>`.

**Do NOT judge success by `/lightning/app/ReactRetail`.** That Lightning path shows *"The app you're trying to view is invalid or inaccessible. We're taking you to your default app instead"* and redirects to the org default (e.g. `qbranch__Q_Home_Lightning`) — even when the app is fine. This is the single biggest red herring; it cost hours of misdiagnosis.

## App Launcher tile

The App Domain URL is the canonical launch path, but users expect a tile in the Lightning App Launcher (waffle). Clicking the raw `CustomApplication` tile does **not** work — it lands on `one:noNavItems`, because:

1. The App Domain sends `frame-ancestors 'self'`, so LEX can't iframe it — and LEX's own `frame-src` CSP omits `*.my.salesforce.app` anyway.
2. A scripted redirect out of the LEX tab iframe is blocked by the browser (cross-origin top-navigation without a user gesture).

The only browser-sanctioned launch is a **user click on a `target="_top"` link**. So each app ships a Visualforce "launch card" page (`pages/<App>Launcher.page`) exposed as a `CustomTab` (`tabs/<App>App.tab-meta.xml`); the card's Open button carries the click gesture and navigates the top window to the App Domain URL. The permission set grants `pageAccesses` (the VF page) + `tabSettings` (Visible) so the tile appears for assigned users.

**VF gotcha:** a `.page` source may **not** contain `<!DOCTYPE html>` — the compiler errors with *"A DOCTYPE is not allowed in content."* Omit it.

## Beta migration (delete + redeploy)

A bundle first deployed during the beta carries a stale `AppMenuItem` (target `AppLauncher`) that a plain redeploy does not regenerate — the app opens blank / `one:noNavItems`. Fix:

1. **Add** `<target>CustomApplication</target>` to the `.uibundle-meta.xml` and confirm the `c__` binding on the app (already done in this repo).

2. **Delete** the app + bundle from the org. `sf project delete source` fails here because it scans the non-deployable `_shared` bundle (`ExpectedSourceFilesError`). Use a destructiveChanges manifest from a throwaway DX project instead:

   ```bash
   mkdir -p /tmp/destroy/force-app && cd /tmp/destroy
   cat > sfdx-project.json <<'EOF'
   {"packageDirectories":[{"path":"force-app","default":true}],"namespace":"","sourceApiVersion":"67.0"}
   EOF
   cat > package.xml <<'EOF'
   <?xml version="1.0" encoding="UTF-8"?>
   <Package xmlns="http://soap.sforce.com/2006/04/metadata"><version>67.0</version></Package>
   EOF
   cat > destructiveChangesPost.xml <<'EOF'
   <?xml version="1.0" encoding="UTF-8"?>
   <Package xmlns="http://soap.sforce.com/2006/04/metadata">
       <types><members>ReactRetail</members><name>CustomApplication</name></types>
       <types><members>ReactRetail</members><name>UIBundle</name></types>
       <version>67.0</version>
   </Package>
   EOF
   sf project deploy start --manifest package.xml \
     --post-destructive-changes destructiveChangesPost.xml \
     -o jdo-oe0sdd --ignore-warnings --json
   ```

3. **Redeploy** the corrected bundle + app + permset together (the standard-deploy command above).

## Verify

```bash
# Bundle exists and is active
sf data query --use-tooling-api \
  -q "SELECT Id, DeveloperName, MasterLabel, IsActive FROM UIBundle WHERE DeveloperName='ReactRetail' WITH USER_MODE" \
  -o jdo-oe0sdd

# App Launcher entry is accessible (IsAccessible flips false→true after a correct deploy)
sf data query \
  -q "SELECT Label, Type, IsAccessible, IsVisible FROM AppMenuItem WHERE Label='React Retail' WITH USER_MODE" \
  -o jdo-oe0sdd
```

Then open the App Domain URL in a browser. **Do not** try to confirm the `<uiBundle>` binding by reading `CustomApplication.Metadata` via the Tooling API — that field isn't surfaced (its `describe` has no `uiBundle` field), so it always looks dropped. The browser is the source of truth.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Invalid Target value 'AppLauncher'` | Beta bundle metadata, gate now on | Set `<target>CustomApplication</target>` |
| `no UIBundle named X found` | App deployed before bundle existed | Deploy bundle + app together (one command) |
| "invalid or inaccessible… default app instead" / redirect to org home | Opened `/lightning/app/<name>` | Use the App Domain URL (`…my.salesforce.app/app/c__<Name>`) |
| App opens blank / `one:noNavItems` after a correct deploy | Stale beta AppMenuItem | Full delete + redeploy (above) |
| Clicking the App Launcher tile → `one:noNavItems` | Opened the raw `CustomApplication` tile (can't render in LEX) | Use the launcher-tile bridge (see [App Launcher tile](#app-launcher-tile)); click that tile, not the app |
| VF page deploy: `A DOCTYPE is not allowed in content` | `<!DOCTYPE html>` in a `.page` source | Remove the DOCTYPE line |
| `ExpectedSourceFilesError … _shared.uibundle-meta.xml` | `delete source`/`retrieve` scanned the non-deployable `_shared` bundle | Use a destructiveChanges manifest deploy |
| `Not available for deploy for this API version` | `sourceApiVersion` below v67 | Align `sfdx-project.json` to 67.0 |
| App still broken after correct redeploy | Running on a 1P pod (`cs*`/`na*`/`eu*`/`ap*`) | Feature not available until ~v264 (Oct 2026); this org (`USA844`) is Hyperforce and works now |

## Related

- `README.md` — deployed-app URLs and layout.
- `AGENTS.md` — project conventions and common mistakes.
- `docs/customer-360-inventory-and-gaps.md` — data contract for the customer 360.
