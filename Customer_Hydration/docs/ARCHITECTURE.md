# Architecture

This document expands on §1 of the [Phase 1 spec](superpowers/specs/2026-05-19-customer-hydration-design.md).
It covers the seven-phase pipeline, wave dependencies, the ID resolver
pattern, the fieldmap module, dual-lineage strategy, the package layout,
and the testing approach.

## Pipeline phases

Every full hydration run executes the same seven phases in order. A flag
like `--data-cloud-only` short-circuits to a subset; `--skip-natives`,
`--skip-apex-wireup`, and `--skip-data-cloud` selectively disable later
phases.

```
hydrate.py CLI
   |
   v
Phase 0  Pre-flight
         describe target sObjects, cache field lists, drop missing columns,
         compute External-ID seek pointer, load existing HYDRATE-* set,
         verify production guard.
   |
   v
Phase 1  Generation
         anchor-driven persona generators -> in-memory dicts ->
         CSVs under output/run-<ts>/.
   |
   v
Phase 2  Bulk-load legacy lineage  (Waves A -> E)
         A  Account
         B  Contact
         C  AccountContactRelation
         D  FA, Card, Goal, LifeEvent, Campaign, Opportunity (parallel)
         E  FA Role, Holding, Case, Task, Event, CampaignMember (parallel)
   |
   v
Phase 3  Resolve native parent Ids
         post-Wave-D query-back: legacy FA External_ID__c -> SF Id;
         post-Wave-A query-back: Account External_ID__c -> Contact Id
         (auto-Contact under Person Account).
   |
   v
Phase 4  Bulk-load native lineage  (Waves F -> G)
         F  FinancialAccount, FinancialGoal, BusinessMilestone,
            PartyRelationshipGroup, PartyProfile,
            ContactPointAddress / Email / Phone (parallel)
         G  FinancialAccountParty (depends on F's queryback)
   |
   v
Phase 5    Apex post-load wireup
           anonymous-Apex script kicks FSC Group Builder, escalates aged
           Cases, sets denormalized flags.
   |
   v
Phase 5.5  Data Cloud stream refresh (fire-and-forget)
           discover Data Streams whose source object matches a hydrated
           object, POST /run on each, log run Ids.
   |
   v
Phase 6    Verify + write manifest + regenerate banker briefs
```

Phases 0 / 1 / 2 / 3 / 4 are blocking (later phases need their Ids /
records). Phase 5 is blocking because Phase 5.5 wants the rolled-up
denormalized flags in place. Phase 5.5 is fire-and-forget — the runner
exits after POSTing the trigger, with run Ids stashed in the manifest
for `dc-status` to poll.

## Wave dependencies

Source: `customer_hydration/loader/wave.py` (`WAVE_DEFS` dict).

| Wave | sObjects | Depends on | Parallel |
|---|---|---|---|
| A | `Account` | none | n/a (single) |
| B | `Contact` | A | n/a (single) |
| C | `AccountContactRelation` | A, B | n/a (single) |
| D | `FinServ__FinancialAccount__c`, `FinServ__Card__c`, `FinServ__FinancialGoal__c`, `FinServ__LifeEvent__c`, `Campaign`, `Opportunity` | A, B | yes |
| E | `FinServ__FinancialAccountRole__c`, `FinServ__FinancialHolding__c`, `Case`, `Task`, `Event`, `CampaignMember` | A, B, C, D | yes |
| F | `FinancialAccount`, `FinancialGoal`, `BusinessMilestone`, `PartyRelationshipGroup`, `PartyProfile`, `ContactPointAddress`, `ContactPointEmail`, `ContactPointPhone` | A, B, C, D, E | yes |
| G | `FinancialAccountParty` | F | n/a (single) |

Within a wave, the `parallel.py` ThreadPoolExecutor wrapper runs up to
`--parallel N` concurrent `sf data import bulk` subprocesses (default 4).
Between waves the runner blocks until every job in the wave reports
success.

### Why these dependencies

- **B before C** — `AccountContactRelation` needs both endpoints, but Person
  Account auto-Contacts are queried back rather than emitted directly; the
  runner still loads any business Contacts in B before C resolves.
- **D before E** — `FinServ__FinancialAccountRole__c` and `Holding` reference
  the FA External_ID__c written in D. Cases/Tasks/Events resolve `WhatId`
  to either Account or Opportunity, which exist after D.
- **E before F** — Some native sObjects (e.g. ContactPoint*) need to mirror
  data the generators only finalize after the legacy waves succeed; the
  runner queries back legacy FA Ids post-D so Wave F can build native FAs
  with `LegacyId__c` populated.
- **F before G** — `FinancialAccountParty` carries `FinancialAccountId`
  pointing at native FAs whose Salesforce Ids are only known after F's
  query-back.

## ID resolver pattern

Some references can't be set client-side at generation time:

- `AccountContactRelation.ContactId` — Person Accounts auto-create a
  Contact whose Id we don't know until after Wave A loads.
- `CampaignMember.ContactId` — same problem.
- `Task.WhatId` / `Event.WhatId` — polymorphic reference; could point at
  Account, Opportunity, or Case, all of which exist post-Waves A-D.
- `FinancialAccountParty.FinancialAccountId` — native FA Ids only exist
  after Wave F succeeds.

### `RESOLVE:` markers

Generators emit a string placeholder that the loader rewrites in-place
post-wave:

```python
{"ContactId": f"RESOLVE:{account_external_id}", ...}
```

After Wave A finishes, `IdResolver.populate_from_org()` runs:

```python
SELECT Id, External_ID__c FROM Account WHERE External_ID__c LIKE 'HYDRATE-%'
SELECT Id, AccountId, Account.External_ID__c FROM Contact
WHERE Account.External_ID__c LIKE 'HYDRATE-%' AND Account.IsPersonAccount = true
```

These populate three internal maps:

| Map | Keyed by | Used by |
|---|---|---|
| `by_external_id` | `External_ID__c` | most parent references |
| `by_source_system_id` | `FinServ__SourceSystemId__c` | Holdings, LifeEvents (no `External_ID__c`) |
| `contact_id_by_account_external_id` | Account `External_ID__c` | ACR / CampaignMember `ContactId` |

### `want=` disambiguation

For an external-id like `HYDRATE-RT-000001`, the resolver could return
either the Account Id (`001*`) or the auto-Contact Id (`003*`) under the
same Person Account. Callers pass an explicit `want=` kwarg:

```python
resolver.resolve("RESOLVE:HYDRATE-RT-000001", want="id")       # -> 001 Account Id
resolver.resolve("RESOLVE:HYDRATE-RT-000001", want="contact")  # -> 003 Contact Id
```

This was the bug fixed in commit `3f5b0af` during Plan 3 / Task 12 smoke
— ACR `ContactId` was getting Account Ids and failing
`FIELD_INTEGRITY_EXCEPTION`. See `customer_hydration/loader/id_resolver.py`.

## Fieldmap module

Source: `customer_hydration/fieldmap.py`.

The Phase 1 spec was written against an idealised FSC schema. The target
org `jdo-fw51xz` has subtly different field names and a stricter
picklist surface. The generators emit "logical" (spec-aligned) names;
`JDO_FIELDMAP.apply()` translates them to "physical" (org-actual) names
just before the CSV writer serialises them.

### Two translation layers

**Field-name renames.** Per-sObject dict mapping logical -> physical
field name. A `None` value means "drop this field entirely" — used when
the org has no equivalent (e.g. `LeadSource` doesn't exist on `Account`
in this org's FSC version).

```python
"Account": {
    "FinServ__TotalAnnualIncome__c": "FinServ__AnnualIncome__pc",
    "FinServ__Occupation__c": "FinServ__Occupation__pc",
    "FinServ__YearsWithEmployer__c": None,  # dropped
    "FinServ__BankingPreference__c": None,  # dropped
    ...
}
```

The `__pc` shadow fields are FSC's Person Account custom-field idiom: the
custom field is defined on `Contact`, the Person Account exposes it on
the Account record via a `__pc` shadow that the platform proxies into
the underlying Contact. Standard Person fields (`FirstName`, `LastName`,
`PersonBirthdate`) work *without* `__pc`; FSC custom person fields
require it in this org.

**Picklist value translation.** Per-(sObject, field) dict mapping logical
-> physical picklist value. The org's `FinServ__FinancialAccountType__c`
has only six values (`Deposits`, `Loans`, `Credit Cards`, `Investments`,
`Merchant Services`, `Treasury Management`); the spec invented many
more. The fieldmap collapses logical types like `"Checking"`,
`"Savings"`, `"HYSA"`, `"CD"` -> `"Deposits"`.

```python
("FinServ__FinancialAccount__c", "FinServ__FinancialAccountType__c"): {
    "Checking": "Deposits", "Savings": "Deposits", "HYSA": "Deposits",
    "Mortgage": "Loans", "HELOC": "Loans", "Auto Loan": "Loans",
    ...
}
```

### Defense in depth

After the fieldmap rename, the CSV writer runs a Phase-0-driven describe
pass and silently drops any column the org doesn't expose. The fieldmap
is the *primary* schema-translation surface; the describe-driven drop is
a backstop for novel drift the fieldmap hasn't caught.

When the org schema changes, `fieldmap.py` is the **only** file that
should need updates. Generators and tests stay schema-agnostic.

## Dual-lineage strategy

The org has both legacy `FinServ__*` managed-package objects AND native
FSC standard objects in active use across different solutions
(DC_PersonProfileWidget vs Web_Engagements_RT_Timeline, etc.). Phase 1
hydrates **both lineages in parallel**:

- The legacy record is authoritative.
- The native record is a mirror linked back via `LegacyId__c` (or
  `OriginalLegacyGoalId__c` for `BusinessMilestone`).

| Concern | Legacy | Native | Bridge |
|---|---|---|---|
| Financial account | `FinServ__FinancialAccount__c` | `FinancialAccount` | `LegacyId__c` |
| Account-party linkage | `FinServ__FinancialAccountRole__c` | `FinancialAccountParty` | natural key (FA + party + role) |
| Holdings | `FinServ__FinancialHolding__c` | (none) | n/a |
| Goals | `FinServ__FinancialGoal__c` | `FinancialGoal` | `LegacyId__c` |
| Life events | `FinServ__LifeEvent__c` | (none) | n/a |
| Business milestones | `FinServ__BusinessMilestone__c` | `BusinessMilestone` | `OriginalLegacyGoalId__c` |
| Cards | `FinServ__Card__c` | (none) | n/a |
| Households / groups | RT=Household + ACR + `FinServ__ReciprocalRole__c` | `PartyRelationshipGroup` + `PartyProfile` | shared `AccountId` |
| Contact points | `Account` / `Contact` direct fields | `ContactPointAddress` / `Email` / `Phone` | shared parent reference |
| Transactions | n/a (Phase 2) | `FinancialAccountTransaction` (Phase 2) | n/a |

Cost: ~30-40% more rows. Benefit: total coverage without forcing a
lineage choice on whichever solution is open in the demo.

See [DATA_MODEL.md](DATA_MODEL.md) for per-object field coverage and
[IDEMPOTENCY.md](IDEMPOTENCY.md) for the per-object idempotency-field
matrix.

## Package layout

```
Customer_Hydration/
  hydrate.py                       # CLI entrypoint -> customer_hydration.cli.main
  customer_hydration/
    __init__.py
    cli.py                         # argparse + subcommand dispatch
    fieldmap.py                    # JDO_FIELDMAP — spec -> physical translator
    preflight.py                   # Phase 0 — describe + field-drop policy
    csv_writer.py                  # LF-terminated, sorted-column CSV writer
    seek.py                        # External-ID seek pointer per object
    sf_runner.py                   # `sf` CLI wrapper used everywhere
    manifest.py                    # run-level manifest schema
    runner_p1.py                   # Plan 1 — retail-only smoke runner
    runner_p2.py                   # Plan 2 — sequential 4-persona runner
    runner_p3.py                   # Plan 3 — parallel multi-wave runner
    runner_p4.py                   # Plan 4 — adds Wave F + G native mirrors
    runner_p5.py                   # Plan 5 — adds Apex wireup + DC refresh
    briefs.py                      # Plan 6 — banker brief generator
    generators/                    # Phase 1 generation
      retail.py wealth.py smb.py commercial.py
      activity.py campaigns.py cards.py goals.py
      holdings.py households.py lifecycle.py
    native/                        # Phase 4 native FSC mirror generators
      financial_account.py financial_goal.py business_milestone.py
      contact_points.py party_profile.py party_relationship_group.py
      financial_account_party.py
    loader/                        # Phase 2-4 bulk loader internals
      wave.py                      # WAVE_DEFS A-G (single source of truth)
      parallel.py                  # ThreadPoolExecutor + retry/backoff
      checkpoint.py                # RunCheckpoint persistence
      id_resolver.py               # post-wave queryback + RESOLVE: rewrite
      reset.py                     # reverse-wave HYDRATE-* deletion
      _legacy.py                   # bulk_upsert subprocess wrapper
    phase5/                        # Phase 5 + 5.5 wireup
      apex_wireup.py               # deploy force-app + sf apex run
      data_cloud.py                # DC stream discovery + trigger + poll
  config/                          # YAML configs (personas, RM pool, holding universe)
  generators -> generators/        # (note: generators dir lives under customer_hydration)
  apex/post_load_wireup.apex       # Phase 5 anonymous-Apex script
  force-app/                       # DX project for new fields + FscGroupRollupBatch
  output/                          # run artifacts (gitignored)
  tests/                           # pytest — 399 tests at last count
  docs/                            # this directory
```

## Test strategy

The package follows TDD throughout. Every generator, every loader
component, and every CLI subcommand has a paired test file under
`tests/`. Live-org integration tests are deliberately absent — the
"smoke" step in each plan runs the real CLI against `jdo-fw51xz` as a
manual verification gate, not a CI check.

| Test category | Files | What's covered |
|---|---|---|
| Generator shape | `test_retail_generator.py`, `test_wealth_generator.py`, `test_smb_generator.py`, `test_commercial_generator.py`, `test_holdings_generator.py`, `test_goal_generator.py`, ... | Per-persona row counts, field shapes, anchor-driven derivations, deterministic seeding |
| Native mirrors | `test_native_financial_account.py`, `test_native_financial_goal.py`, `test_native_business_milestone.py`, `test_party_relationship_group.py`, `test_party_profile.py`, `test_contact_points.py`, `test_native_financial_account_party.py` | Bridge-field correctness, RESOLVE: marker emission |
| Fieldmap | `test_fieldmap.py` | Renames, drops (`None`), picklist translation, identity for unknown sObjects |
| Loader | `test_loader_wave.py`, `test_loader_parallel.py`, `test_loader_checkpoint.py`, `test_loader_id_resolver.py`, `test_loader_reset.py`, `test_loader_bulk_upsert.py` | Wave registry, retry/backoff, checkpoint round-trip, RESOLVE: rewrite, alias-confirmation reset |
| Phase 5 | `test_apex_wireup.py`, `test_data_cloud.py` | Apex deploy/run wrapper, DC REST discovery + trigger + status |
| CLI | `test_cli.py`, `test_cli_briefs.py`, `test_cli_dc_status.py` | Argparse surface, subcommand dispatch, brief subcommand wireup |

Total: 399 tests pass on the `feat/customer-hydration-plan-1` branch.

The `tests/fixtures/` directory holds frozen CSV samples so generator
output diffs cleanly between commits — handy when refactoring a
generator without changing semantics.

## Cross-references

- [DATA_MODEL.md](DATA_MODEL.md) — every field on every object
- [IDEMPOTENCY.md](IDEMPOTENCY.md) — External-ID namespace, reset semantics
- [HOW_TO.md](HOW_TO.md) — CLI cookbook
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) — failure modes
- [Phase 1 spec §1](superpowers/specs/2026-05-19-customer-hydration-design.md)
  for the original design discussion
