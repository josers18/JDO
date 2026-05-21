# HOW TO — CLI cookbook

Reference for every subcommand and every flag, plus 8 worked scenarios
that cover the day-to-day demand.

The CLI entrypoint is `hydrate.py`; it dispatches to subcommands in
`customer_hydration/cli.py`.

## Subcommand summary

```
python hydrate.py <SUBCOMMAND> [OPTIONS]

  hydrate          (default)  Generate + load customers and related data
  briefs                      Regenerate banker brief MD files from live SOQL
  reset                       Wipe HYDRATE-* records (with --confirm)
  status                      Show what's in the org under HYDRATE-*
  dc-status                   Poll Data Cloud stream-run state from manifest
  validate-config             Lint config/*.yaml without touching the org
  resume                      Continue an interrupted run from its checkpoint
```

If you omit the subcommand, `hydrate` is the default. The README's
Quick Start uses the explicit form, which is the recommended style.

## Flag reference

### Global flags (accepted at any level)

| Flag | Default | Notes |
|---|---|---|
| `--target-org ALIAS` | `$TARGET_ORG` or sf default | sf org alias |
| `--output-dir PATH` | `./output/` | Where run artifacts (`run-<ts>/`) land |
| `--config-dir PATH` | `./config/` | Where YAML configs live |
| `--quiet` | off | Suppress progress output |
| `--verbose` | off | Extra logging |
| `--dry-run` | off | Generate CSVs but don't load — useful for diffing |

### `hydrate` subcommand options

| Flag | Default | Notes |
|---|---:|---|
| `--retail N` | 7000 | Retail Person Account count |
| `--wealth N` | 1200 | Wealth Person Account count |
| `--smb N` | 1500 | Small Business count |
| `--commercial N` | 300 | Commercial count |
| `--rm "Name"` | none | Restrict assignment to a single banker (name or `User Id`) |
| `--append` | off | Add to existing HYDRATE-* book; don't refuse on conflict |
| `--reset` | off | Delete all HYDRATE-* before generating (REQUIRES `--confirm`) |
| `--confirm` | off | Required for `--reset`; types the destructive intent |
| `--seed N` | 42 | RNG seed |
| `--parallel N` | 4 | Concurrent bulk-load jobs per wave |
| `--skip-natives` | off | Legacy lineage only — skip Wave F + G |
| `--skip-apex-wireup` | off | Skip Phase 5 |
| `--skip-data-cloud` | off | Skip Phase 5.5 (DC stream refresh) |
| `--data-cloud-only` | off | Skip Phases 0-5; run Phase 5.5 only |
| `--personas LIST` | all | `retail,wealth` — limit to subset |
| `--waves LIST` | all | `A,B,C,D,E` — limit to specific waves (debug) |
| `--persona-density LEVEL` | `heavy` | `light` / `medium` / `heavy` |
| `--allow-production` | off | Bypass IsSandbox check (required for `jdo-fw51xz`) |

### `briefs` subcommand options

| Flag | Default | Notes |
|---|---|---|
| `--output PATH` | `../docs/briefs/` | Where to write `*.md` |
| `--rm "Name"` | none | Generate a single brief |

### `reset` subcommand options

| Flag | Default | Notes |
|---|---|---|
| `--confirm` | required | Must be passed |
| `--persona LIST` | all | Reset only specific personas |
| `--keep-campaigns` | off | Reset customers but leave the 10 campaigns |
| `--allow-production` | off | Required for `jdo-fw51xz` |

### `dc-status` subcommand options

| Flag | Default | Notes |
|---|---|---|
| `--run-id ID` | latest | Manifest to read |
| `--json` | off | Machine-readable output |
| `--watch` | off (no-op v1) | Poll every 30s until done — Plan 6 polish |

### `status` subcommand options

| Flag | Default | Notes |
|---|---|---|
| `--json` | off | Machine-readable output |

## Worked scenarios

### Scenario 1 — Fresh demo org hydration

You inherit a brand-new sandbox or a freshly-reset demo and want the
canonical 10K customer mix.

```bash
cd Customer_Hydration
source .venv/bin/activate
python hydrate.py hydrate \
    --target-org jdo-fw51xz \
    --allow-production
```

That's the full default (`--retail 7000 --wealth 1200 --smb 1500
--commercial 300 --seed 42 --parallel 4`). Wall-clock budget ~50 min.

Watch progress in the terminal. If anything fails, the runner exits
with code 2 and writes `output/run-<ts>/manifest.json` plus
`bulkapi-failures.csv` per failing object.

### Scenario 2 — Top up Vince West's book

Demo prep needs a few more wealth clients on Vince's books. Don't touch
anyone else's customers.

```bash
python hydrate.py hydrate \
    --target-org jdo-fw51xz \
    --wealth 50 \
    --retail 0 --smb 0 --commercial 0 \
    --rm "Vince West" \
    --append \
    --allow-production
```

`--append` advances the seek pointer to the next free wealth sequence
(e.g. starts at `HYDRATE-WL-000701`). Existing records are untouched.

### Scenario 3 — Reset and re-seed deterministically

You want the org back to a known canonical state. Same seed = same
data, byte-identical CSVs.

```bash
# Step 1 — reset
python hydrate.py reset \
    --target-org jdo-fw51xz \
    --confirm \
    --allow-production
# Type the alias when prompted: jdo-fw51xz

# Step 2 — re-load with the canonical seed
python hydrate.py hydrate \
    --target-org jdo-fw51xz \
    --seed 42 \
    --allow-production
```

The reset deletes in reverse-wave order (G -> F -> E -> ... -> A) using
Bulk API 2.0 hard-delete jobs gated by `External_ID__c LIKE 'HYDRATE-%'`.
Pre-existing 178 non-HYDRATE accounts are never touched.

### Scenario 4 — Quick smoke for CI

On every PR you want to confirm the legacy generators still produce
loadable CSVs. Skip the natives, skip the Apex wireup, skip Data Cloud.

```bash
python hydrate.py hydrate \
    --target-org $CI_SCRATCH_ORG \
    --retail 50 \
    --wealth 0 --smb 0 --commercial 0 \
    --personas retail \
    --skip-natives --skip-apex-wireup --skip-data-cloud \
    --seed 42
```

50 retail customers, ~3 minutes. No production guard needed for a
scratch org. Verify with:

```bash
sf data query --target-org $CI_SCRATCH_ORG \
    --query "SELECT COUNT() FROM Account WHERE External_ID__c LIKE 'HYDRATE-RT-%'"
```

### Scenario 5 — Test natives only after legacy is loaded

Debug the Wave F + G generators without re-running A-E.

```bash
python hydrate.py hydrate \
    --target-org jdo-fw51xz \
    --waves F,G \
    --allow-production
```

The `--waves` flag is intentionally a debug knob — it bypasses the
normal phase ordering and runs only the listed waves. Useful when you
just changed `customer_hydration/native/financial_account_party.py` and
want a fast iteration loop.

### Scenario 6 — Resume after an interrupted run

The loader crashed during Wave E (network blip, RTT timeout, whatever).
Pick up where it left off.

```bash
python hydrate.py resume --target-org jdo-fw51xz --allow-production
```

The runner finds the latest checkpoint in `output/run-*/checkpoint.json`,
prompts:

```
Resuming run run-2026-05-19T1430 from wave E…
```

and continues from the in-progress wave. Already-completed waves are
re-run too in Plan 3's implementation; the External_ID upsert makes
them no-ops, but it's wasted RTT. See Plan 3 wart 2 in the README — to
fully skip completed waves, manually edit `checkpoint.json` to mark them
`completed_waves` before resuming.

### Scenario 7 — Just refresh Data Cloud streams

The data is already loaded but you forgot to refresh DC streams (or
streams were just configured).

```bash
python hydrate.py hydrate \
    --target-org jdo-fw51xz \
    --data-cloud-only \
    --allow-production
```

`--data-cloud-only` short-circuits to Phase 5.5: discover streams,
match by source object, POST `/run`, log run Ids to manifest. Fire and
forget. Watch progress with:

```bash
python hydrate.py dc-status --target-org jdo-fw51xz
```

### Scenario 8 — Generate banker briefs without re-loading

The data hasn't changed but you want fresh briefs (e.g. the brief
template was tweaked).

```bash
python hydrate.py briefs \
    --target-org jdo-fw51xz \
    --output ./docs/briefs/
```

Writes 6 banker briefs (`vince-west.md`, `kim-johnson.md`, ...) to the
target directory. Each brief is generated by querying live SOQL — no
generator state is consulted. `BANKER_BRIEFS.md` (the index) is also
rewritten.

To generate a single banker:

```bash
python hydrate.py briefs \
    --target-org jdo-fw51xz \
    --rm "Vince West" \
    --output ./docs/briefs/
```

## Useful `sf data query` recipes

### How many HYDRATE-* records per object?

The `status` subcommand wraps this:

```bash
python hydrate.py status --target-org jdo-fw51xz
```

Output:

```
HYDRATE-* counts in jdo-fw51xz:
  Account                                            14012
  AccountContactRelation                             25002
  Campaign                                              10
  ...
```

Add `--json` for machine-readable.

### Customer mix per banker

```bash
sf data query --target-org jdo-fw51xz \
    --query "SELECT Owner.Name, FinServ__ClientCategory__c, COUNT(Id) \
             FROM Account \
             WHERE External_ID__c LIKE 'HYDRATE-%' \
             GROUP BY Owner.Name, FinServ__ClientCategory__c"
```

### Wave-D failure inspection

If Wave D failed, look in `output/run-<ts>/`:

```bash
ls output/run-2026-05-21T1430/bulkapi-failures.csv \
   output/run-2026-05-21T1430/manifest.json \
   output/run-2026-05-21T1430/checkpoint.json
```

The `bulkapi-failures.csv` columns are `<original-fields>,sf__Id,sf__Error`.
See [TROUBLESHOOTING.md §Bulk job failures](TROUBLESHOOTING.md#1-bulk-job-failures)
for common error codes.

## Cross-references

- [ARCHITECTURE.md §Pipeline](ARCHITECTURE.md#pipeline-phases) for what each phase does
- [IDEMPOTENCY.md](IDEMPOTENCY.md) for re-run / append / reset semantics
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for common failures
- [Phase 1 spec §5](superpowers/specs/2026-05-19-customer-hydration-design.md)
  for the original CLI surface design
