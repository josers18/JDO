# FSC_Audit_Utilities — Guidance for Future Sessions

This is a Salesforce SFDX project for **audit-driven hygiene utilities**
on the Cumulus FSC demo org. Everything here was built to resolve audit
findings in `audits/fsc-master-org-audit.md`. This file captures the
architectural rules and patterns that the audit work surfaced, so any
future LLM session (or human) picks up where the last one stopped
without re-deriving them.

## Architectural rules (the "B11" canon)

### When new code needs Financial Account data

The org has **three** FA-shaped stores. Pick deliberately:

1. **`FinServ__FinancialAccount__c` (legacy FSC managed-package object,
   496 records, canonical for writes).** The org's source of truth.
   Existing widget controllers (`FinancialOverviewController`,
   `BusinessProfileWidgetController`) already read from this. New code
   that needs to *write* FA data should write here. Includes the legacy
   `FinServ__FinancialAccountRole__c`, `FinServ__FinancialHolding__c`,
   etc.

2. **`FinancialAccount` (standard CRM object, 496 records, mirror).**
   Maintained in lockstep with the legacy by `FscParityBatch` (Phase
   A10). Read this for CRM-local single-source needs that prefer the
   standard schema. **Don't write to it directly** — the parity batch
   owns its content.

3. **`ssot__FinancialAccount__dlm` (Data Cloud DMO, harmonized).**
   Pulls from the legacy FSC + a separate `Deposits_Latest__dll`
   banking-core source. Reach this via Named Credential
   `callout:DataCloud`. Use for cross-source / unified-profile
   patterns where you want DC's identity-resolution and dedup.

The FSC repo's `DC_PersonProfileWidget/CustomerProfileWidgetController`
demonstrates path 3; `Financial_KPI_Widget/FinancialOverviewController`
demonstrates path 1.

### Other parity pairs maintained by `FscParityBatch`

The same legacy↔standard pattern applies to:

| Legacy | Standard | Notes |
|---|---|---|
| `FinServ__FinancialAccount__c` (496) | `FinancialAccount` (496) | Mirror via `LegacyId__c` external key |
| `FinServ__Card__c` (185) | `IssuedCard` (185) | Cascade after FA mirror |
| Retail Mortgage tier loans | `ResidentialLoanApplication` (78) | Synthesis from rebalanced FAs |
| `FinServ__FinancialGoal__c` (277) | `FinancialGoal` (277) | Mirror |
| `FinServ__LifeEvent__c` (139) | `PersonLifeEvent` (139) | Mirror with PersonContactId resolution |

### Things that don't fit the parity pattern

- `FinServ__FinancialAccountRole__c` (564 rows) — no standard
  equivalent in this org's schema. **Stays legacy-only.**
- `FinServ__FinancialHolding__c` (860 rows post-B3) — no standard
  equivalent. **Stays legacy-only.** Surfaced via
  `ssot__FinancialHolding__dlm` for DC consumers.
- `BusinessMilestone` (286 rows) — already canonical on the standard
  side; no legacy `FinServ__BusinessMilestone__c` exists.
- `FinancialAccountTransaction` — empty on CRM by design. Transaction
  story lives in DC: `Financial_Transactions_AWSRedshift__dlm` (2,188),
  `ssot__FinancialAccountTransaction__dlm` (17,890),
  `Financial_Trades__dlm` (1,610,388 investment trades).

## Patterns that emerged from the audit work

### Idempotency markers

Every Phase B seed utility uses a Checkbox marker field for idempotent
re-runs. Convention:

| Utility | Marker field |
|---|---|
| `FscLoanRebalanceOnce` (A13) | `FinServ__FinancialAccount__c.IsRebalanced__c` (boolean gate; `OriginalSnapshot__c` LongText holds payload) |
| `FscParityBatch` (A10) | `IsParitySync__c` on 5 standard parity targets |
| `FscEngagementSeed` (B1) | `Activity.IsSeededEngagement__c` (Event/Task), `Interaction.IsSeededEngagement__c`, `InteractionSummary.IsSeededEngagement__c` |
| `FscHoldingsBackfill` (B3) | `FinServ__FinancialHolding__c.IsSeededHolding__c` |
| `FscIsEnrichAndExpand` (B5) | uses B1's marker + `AccountId IS NULL` as an enrichment gate |
| `FscContactPointSeed` (B6) | `IsSeededContactPoint__c` on ContactPointEmail + ContactPointPhone |
| `FscGoalMigrate` (B13) | `IsSeededMigration__c` Checkbox + `OriginalLegacyGoalId__c` external-id-unique Text on ActionPlan + BusinessMilestone + Opportunity |
| `FscInsuranceSeed` (B12) | `IsSeededInsurance__c` on InsurancePolicy + Producer |

**Rule for new utilities:** add a Checkbox marker (or use an existing
relevant gate field). Long Text Areas can't appear in `WHERE` clauses —
if you need a JSON snapshot, store it in LongText AND add a separate
Checkbox to gate.

### Field-level Salesforce constraints learned the hard way

- **`LongTextArea` fields can't be filtered in SOQL `WHERE` clauses.**
  Hit on `OriginalSnapshot__c` (A13) and `MeetingNotes` (B5). Always
  use a separate Checkbox or reference field as the queryable gate.
- **`Event` and `Task` custom fields must live on `Activity`** (the
  polymorphic parent), not directly on Event or Task. Hit during B1
  deploy with `Entity Enumeration Or ID: bad value for restricted
  picklist field: Event`.
- **`desc` is a reserved word in Apex** even as a local variable name
  (collides with SOQL ORDER BY syntax). Hit during B1.
- **Polymorphic `ParentId` lookups vary by org configuration.** In
  this org, `ContactPointEmail.ParentId` only accepts `Account` or
  `Individual`, NOT `Contact` (hit during B6). Always query
  `referenceTo` from the describe before writing.
- **Person Account `Name` is auto-derived from FirstName + LastName.**
  Don't include it in the SELECT clause when you intend to update the
  Account, or the update tries to write Name back and fails. Hit
  during A6b and B4. Build update list with only Id + the field you
  actually want to change.
- **FSC managed-package triggers silently roll back some writes.**
  Confirmed for `FinServ__FinancialAccount__c.FinServ__Household__c`
  during B7 (`Database.SaveResult.isSuccess() = true` but field
  reverts). Confirmed NOT applied to `Account.PersonHomePhone`
  during B9. Behavior is field-specific. **When a programmatic
  backfill matters, test with one record first and re-query before
  the bulk run.**
- **RecordType resolution: when an org has duplicate RT names**
  (e.g., two RTs both named "Household" in this org), resolve by
  "find the RT existing records actually use" rather than by
  DeveloperName. Hit during B4.
- **Apex bulk DML returns `isSuccess()=true` per row even when an
  org-level trigger silently reverts the change.** Always re-query
  after a bulk update to verify persistence on a sample.
- **`ActionPlanTemplate.TargetEntityType` is a whitelist that the
  template version inherits.** `ActionPlan.TargetId` must point to
  a record of that whitelisted type or the insert fails with
  *"The X template isn't available for a Y target record."* Common
  templates target `FinancialGoal` (standard) or `Account`, NOT
  the namespaced legacy `FinServ__FinancialGoal__c`. Confirmed via
  `SELECT TargetEntityType FROM ActionPlanTemplate`.
- **ActionPlan inserts are CPU-heavy under sync Apex.** Each insert
  materializes the full template hierarchy (steps, assignments).
  ~30 inserts can exhaust the sync 10s CPU budget. Pattern: chunk
  at ≤10 records, check `Limits.getCpuTime()` against an 85% floor,
  bail and rely on idempotency to resume on the next run. Used in
  `FscGoalMigrate.runOnDemand`.
- **`BusinessMilestone` description field is `MilestoneDescription`,
  not `EventDescription`** (despite the type-similarity to Event).
  Standard, not custom; verify with describe before writing.
- **`FinServ__FinancialAccount__c.FinServ__Household__c` cannot be
  written programmatically** (C9). The packaged `FinancialAccountTrigger`
  silently reverts the field in `before update`; `Database.update`
  returns `isSuccess=true` with 0 errors but a same-transaction
  re-query shows null. None of these worked: direct DML, ACR-touch,
  `FinServ.GroupAssignmentBatchable`, `FinServ.HouseholdAssignmentBatchable`,
  flipping `FinServ__Record_Rollup_Configuration__c.FinServ__Skip_Record_Rollup_Triggers__c`
  to false. The 48 already-linked FAs were apparently set at insert
  time before the trigger logic activated. The FSC-blessed path
  is the UI "Update Household" action; no public Apex equivalent
  exists. **Don't try to backfill this field programmatically.**
- **`Account.FinServ__Household__c` does NOT exist as a field on
  the member side** — household membership is ACR-driven (find ACRs
  whose `Account.RecordType.Name='Household'`). Don't search for a
  member-side household lookup.
- **FSC public Apex constructor discovery pattern.** When the docs
  are missing for a `FinServ.*` global class, brute-force probe the
  constructor signature space — common types (`String`, `Id`,
  `List<Id>`, `Set<Id>`, `Account`, etc.) — against `new FinServ.X(...)`
  in anonymous Apex. Compile errors say "Constructor not defined";
  runtime errors mean you found a real signature. If `runJob` is the
  expected entry, the class will tell you in the runtime exception
  message. Used during C9 to discover that
  `FinServ.HouseholdAssignmentBatchable.runJob(String)` is the
  invocation but Record Rollup Optimization (Beta) gates it.

### FLS gotcha for newly-deployed custom fields

Newly-deployed custom fields default to **no FLS for any profile**.
Even though the field is in the schema, user-facing SOQL returns
"No such column" because the running user can't see it. Apex insert
running as Automated Process or System Administrator works, but the
admin user querying the result via `sf data query` doesn't see the
data.

**Fix:** every utility's PR must extend `FSC_Audit_Utilities_User`
permission set with explicit FLS on the new fields. Pattern is
codified in the existing permset; copy a `<fieldPermissions>` block
when you add a new field.

## What's deployed today

Apex classes (`force-app/main/default/classes/`):

| Class | Phase | Purpose |
|---|---|---|
| `FscLoanRebalanceOnce` + Test | A13 | Re-distribute 101 loan FA balances into retail/SMB/mid-market tiers |
| `FscParityBatch` + Test | A10 | 5-step legacy↔standard parity engine |
| `FscParityScheduler` | A11 | Schedulable wrapper for `FscParityBatch` |
| `FscEngagementSeed` + Test | B1 | Generate 1,200 Events/Tasks/Interactions/IS stubs |
| `FscEngagementShifter` | B1 | Schedulable monthly +30-day date shift on seeded records |
| `FscHoldingsBackfill` + Test | B3 | Fill 35 empty Investment FAs with 432 holdings |
| `FscIsEnrichAndExpand` + Test | B5 | Enrich 200 stubs + create 300 fresh InteractionSummaries |
| `FscContactPointSeed` + Test | B6 | Generate 714 ContactPointEmail/Phone records |
| `FscHouseholdLookupBackfill` + Test | B7 | (Deployed but blocked by FSC trigger; see C9) |
| `FscInsuranceSeed` + Test | B12 | Seed 2 Producers + 8 InsurancePolicies |
| `FscGoalMigrate` + Test | B13 | Forward-create 184 records (56 ActionPlans + 94 BusinessMilestones + 34 Opportunities) from 213 `Type='Other'` legacy goals; source preserved |

Custom objects + fields under `force-app/main/default/objects/` —
each marker field has its own subdir.

Permission set `FSC_Audit_Utilities_User` — extends with class access
+ FLS on every new field. Assign to anyone running these utilities.

## Open items (the next session can pick up)

- **H11** — 36 stuck Flow orchestrations holding paused FlowInterviews
  hostage, blocking the last 11 obsolete-flow-version deletes from A4.
- **A7 actual uninstalls** — inventory complete in
  `audits/cumulus-package-inventory.md`; 13 high-confidence
  candidates; per-package dependency review needed.

## Conventions

- **API version 66.0** on all Apex (`*.cls-meta.xml`).
- **Project SFDX API version 66.0** (`sfdx-project.json`).
- **Apex DML always allowOrNone=false** + count-and-log failures.
  Surface partial-failure modes as ERROR-level debug; never silent.
- **Owner rotation 7-way** for all engagement seeds: Bill South,
  Cindy Central, Ely East, Valerie East, Vanessa Central (Sales),
  Brenda Service, Steven Service.
- **Test classes** typically skip end-to-end DML on FSC managed-package
  objects (license/validation rule complexity). Cover entry-point
  status, helper logic, schema-level field presence. Production data
  paths verified by manual `runOnDemand()` post-deploy.
- **Static analyzer false positives:** the project's Apex validator
  consistently flags bulk DML/SOQL outside loops as "DML inside loop
  (loop started line 0)". The block-scope tracker is broken; ignore
  these warnings unless you actually have DML inside a for-loop body.
- **The audit doc is the durable record.** Every Phase A and B item
  has an audit-doc row that's been updated with execution result or
  closure rationale. Read `audits/fsc-master-org-audit.md` first
  before starting new audit-related work.

## Target org

`jdo-fw51xz` (Cumulus Financial Services, USA844). Production demo org.
**Always validate-before-deploy** for new metadata. **Always test
1-record write before bulk** when the FSC trigger behavior is unknown
for a field.
