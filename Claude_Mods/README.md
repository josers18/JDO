# Claude_Mods

[Claude Code mods](https://code.claude.com/docs/en/plugins/mods/overview) for working in JDO. Each mod is an in-process plugin of function hooks that turns a lesson learned the hard way into an automatic guard or an always-available view. They need Claude Code **≥ 2.1.287**.

| Mod | What it does |
|-----|--------------|
| [`jdo-guardrails`](jdo-guardrails/) | **sf-deploy-guard** + **git-safety** + **gotcha-lint** (below) |
| [`jdo-org-cockpit`](jdo-org-cockpit/) | **`/org`** pane: org auth, UI Bundles, Data Cloud stream health (below) |

## Install

```sh
Claude_Mods/install.sh
```

The script syncs each mod into `~/.claude/mods/<mod>` and prints the line to put in `~/.claude/settings.json` under `env`:

```json
"CLAUDE_CODE_PLUGIN_DIRS": "~/.claude/mods/jdo-guardrails:~/.claude/mods/jdo-org-cockpit"
```

Every new session then loads both. Edit the mods here, then re-run `install.sh`. For a hot-reloading dev loop, run `claude --plugin-dir Claude_Mods/<mod>`. Don't also load the installed copy in that session, or every hook runs twice.

Check a mod with `claude plugin validate Claude_Mods/<mod>` and `claude plugin test Claude_Mods/<mod>`.

## jdo-guardrails

**sf-deploy-guard** wraps Bash `sf project deploy start` (only when `sf` starts a command segment, so quoted text never trips it):

| Check | Action | Bypass |
|-------|--------|--------|
| `--ignore-conflicts` / `-c` (has masked a hard failure as exit 0) | deny | `JDO_ALLOW_IGNORE_CONFLICTS=1` in the command |
| `--source-dir` casing differs from `git ls-files` (macOS "duplicate value found: \<unknown\>") | deny, naming the tracked casing | — |
| A UI bundle's `dist/index.html` is older than `src/` or `_shared/src` by more than 2 s (git checkouts stamp both in the same second) | deny: build first | `JDO_ALLOW_STALE_DIST=1` |
| No `--json` | add it | — |
| After the run | toast `status · deployed · errors`; tell the model when the deploy did not cleanly succeed, whatever the exit code | — |

**git-safety** wraps Bash `git …` segments (including `cd X &&` and `git -C X`):

| Check | Action |
|-------|--------|
| A broad discard (`reset --hard`, `checkout -- .` / `-f`, `restore .`, `switch --discard-changes`, `clean -f`) would destroy changes this session's Edit/Write didn't make. Tracked changes are weighed for the reset-style commands, untracked files for `clean`; `restore --staged .` only unstages, so it passes. | ask **Cancel / Run anyway**, listing the files; deny on Cancel. With no one to ask (`claude -p`) it denies without opening a dialog. |
| The check itself can't run | deny (fails closed) |
| `git push` to a repo whose owner is a logged-in gh account that isn't the active one on that host (the 403 on josers18/JDO) | deny, with the exact `gh auth switch --hostname … --user …`. Org-owned or unknown owners pass. |

**gotcha-lint** runs after every Edit/Write. It adds warnings that only the model reads, so it fixes them itself without the edit being blocked:

| Rule | Files |
|------|-------|
| `in` used as a variable name (reserved Apex keyword) | `.cls`, `.trigger` |
| `Decimal.valueOf((Double) o)` float artifacts | `.cls`, `.trigger` |
| `AuraHandledException` without `setMessage()` | `.cls` |
| Boolean `@api x = true` (LWC1503) | `lwc/**/*.js|ts` |
| `fonts.googleapis.com` (App Domain CSP blocks it) | `uiBundles/**` |
| `lg:grid-cols-*` viewport grids (use container queries) | `uiBundles/**/*.tsx|ts|jsx` |
| `global.css` missing `@source '…/_shared/src'` | `uiBundles/<App>/src/**/global.css` |
| `&` in a `snow sql -f` file (template substitution) | `.sql` |

## jdo-org-cockpit

Type **`/org`** to open a pane for the configured org:

- **Header** — the org's alias, user, instance, connection state and API version; **Refresh** (`r`) and **DC Setup** (`d`, opened via `sf org open`).
- **UI Bundles** — each bundle's last deploy (Tooling `UIBundle`) and whether its local `dist/` is fresh or stale, plus **Open** (`1`–`9`) for its App Domain URL (`https://<myDomain>--c.<sub>.my.salesforce.app/app/c__<Name>`).
- **Deploy** — on a bundle whose local `dist/` is stale or missing. It queues a prompt to Claude (`$.prompt.submit`) to build it and deploy it, so both run as ordinary visible steps under your permissions and the deploy guard. It never deploys behind your back.
- **Recent deploys** — the last 5 `DeployRequest`s (Tooling): start time, status, components, errors, validate-only, who.
- **Data Cloud streams** — a heat map with two streams per cell, colored failing / running / never run / ok, then counts and the failing streams by name. The data comes from SOQL on `DataStream` (~3 s for 447 streams; the SSOT REST list took ~100 s per 200-stream page).

The snapshot is saved across sessions, so the pane opens instantly and refreshes in the background when the data is more than 5 minutes old. Options, set in `/config` or under `pluginConfigs` in settings: `orgAlias` (default `jdo-oe0sdd`) and `projectDir` (default `~/Documents/Git/JDO/React-Headless`).
