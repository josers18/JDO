# Plan 5 — Phase 5 Apex post-load wireup + Phase 5.5 Data Cloud stream refresh + force-app/

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkpoint (`- [ ]`) syntax for tracking.

**Goal:** Run a one-shot Apex post-load wireup (household roll-ups, FSC Group Builder kickoff, denormalized flag updates) AND trigger the org's existing Data Cloud Data Streams that ingest from any HYDRATE-* hydrated object (fire-and-forget). Add the `--skip-apex-wireup` and `--skip-data-cloud` flags to actually function (no-ops since Plan 1). Add `dc-status` subcommand. Ship the one new field the spec needs (`FinServ__BusinessMilestone__c.External_ID__c`) via a small `force-app/` DX project — but only if the legacy object is installed in the target org (jdo-fw51xz does NOT have legacy BusinessMilestone, so this is conditional).

**Architecture:** Add a new `phase5/` Python package with two sub-modules: `apex_wireup.py` (executes anonymous Apex via `sf apex run`) and `data_cloud.py` (REST client for Data Cloud stream discovery + trigger). Plan 4's runner_p4 (or wherever the runner ends up) gains Phase 5 + Phase 5.5 between Plan 3's last wave and the verification step. New `dc-status` CLI subcommand polls stream-run state from manifest. The `force-app/` directory is conditionally deployed — the implementation plan task that handles it first checks `sf sobject describe FinServ__BusinessMilestone__c` and only deploys if the object exists.

**Tech Stack:** Salesforce Apex (one anonymous-Apex script + optional batch class for Group Builder fallback), Python (REST client via `sf` CLI's `org open --json`-derived session token, OR `simple-salesforce` if added), SF CLI v2. Target org `jdo-fw51xz`. Anchor 2026-05-21+.

---

## Context the engineer needs

**Working directory:** `/Users/jsifontes/Documents/Git/JDO/.worktrees/customer-hydration-plan-1`. Branch `feat/customer-hydration-plan-1`. Plans 1+2+3+4 fully implemented before Plan 5 starts.

**Reference:** spec §4 Phase 5 (Apex wireup) + Phase 5.5 (Data Cloud stream refresh added 2026-05-19); spec §5 (`dc-status` + `--skip-data-cloud` + `--data-cloud-only` + `--skip-apex-wireup` flag semantics).

**Plan 1 prelude verification facts to honor:**
- `FinServ__BusinessMilestone__c` (legacy) is **NOT installed** in jdo-fw51xz. The `force-app/` Plan 5 ships is conditional — describe before deploy.
- `BusinessMilestone` (native) IS installed and Plan 4 hydrates it.
- FSC Group Builder API surface has shifted between FSC versions; the spec calls out a fallback to a custom `FscGroupRollupBatch.cls` we ship if the documented call doesn't reach.

---

## §1 Phase 5 — Apex post-load wireup

`Customer_Hydration/apex/post_load_wireup.apex` is a single anonymous-Apex script:

```apex
// 1. Household total roll-ups for HYDRATE-* households
//    Aggregate: sum FinServ__Balance__c for assets, FinServ__LoanAmount__c for liabilities
//    Update Account.FinServ__TotalAssets__c and FinServ__TotalLiabilities__c on
//    each HYDRATE-HH-* household
Map<Id, Decimal> assetsByHousehold  = new Map<Id, Decimal>();
Map<Id, Decimal> liabsByHousehold   = new Map<Id, Decimal>();

for (FinServ__FinancialAccount__c fa : [
    SELECT FinServ__PrimaryOwner__c,
           FinServ__PrimaryOwner__r.External_ID__c,
           FinServ__PrimaryOwner__r.FinServ__GroupId__c,  // household lookup
           FinServ__Balance__c,
           FinServ__LoanAmount__c,
           FinServ__FinancialAccountType__c
    FROM   FinServ__FinancialAccount__c
    WHERE  FinServ__PrimaryOwner__r.External_ID__c LIKE 'HYDRATE-%'
    WITH USER_MODE
]) {
    Id hhId = fa.FinServ__PrimaryOwner__r.FinServ__GroupId__c;
    if (hhId == null) continue;
    if (fa.FinServ__FinancialAccountType__c == 'Loans') {
        liabsByHousehold.put(hhId, (liabsByHousehold.get(hhId) == null ? 0 : liabsByHousehold.get(hhId)) + (fa.FinServ__LoanAmount__c == null ? 0 : fa.FinServ__LoanAmount__c));
    } else if (fa.FinServ__FinancialAccountType__c == 'Deposits' || fa.FinServ__FinancialAccountType__c == 'Investments') {
        assetsByHousehold.put(hhId, (assetsByHousehold.get(hhId) == null ? 0 : assetsByHousehold.get(hhId)) + (fa.FinServ__Balance__c == null ? 0 : fa.FinServ__Balance__c));
    }
}

List<Account> households = [
    SELECT Id, External_ID__c
    FROM   Account
    WHERE  External_ID__c LIKE 'HYDRATE-HH-%'
    WITH USER_MODE
];
List<Account> updates = new List<Account>();
for (Account hh : households) {
    Account upd = new Account(Id = hh.Id);
    upd.FinServ__TotalAssets__c      = assetsByHousehold.containsKey(hh.Id) ? assetsByHousehold.get(hh.Id) : 0;
    upd.FinServ__TotalLiabilities__c = liabsByHousehold.containsKey(hh.Id) ? liabsByHousehold.get(hh.Id) : 0;
    updates.add(upd);
}
update Security.stripInaccessible(AccessType.UPDATABLE, updates).getRecords();
System.debug(LoggingLevel.INFO, '[CustomerHydration] Updated ' + updates.size() + ' household roll-ups');

// 2. FSC Group Builder kickoff
//    Try FinServ.GroupAssignmentBatch.executeGroupAssignment(); fall back to
//    Database.executeBatch(new FscGroupRollupBatch()) if the published call
//    isn't reachable.
try {
    Type t = Type.forName('FinServ.GroupAssignmentBatch');
    if (t != null) {
        // ... reflective invocation; details in the implementation task
    } else {
        Database.executeBatch(new FscGroupRollupBatch(), 200);
    }
} catch (Exception e) {
    System.debug(LoggingLevel.WARN, '[CustomerHydration] Group Builder fallback: ' + e.getMessage());
    Database.executeBatch(new FscGroupRollupBatch(), 200);
}

// 3. Mark Cases as Escalated where age > SLA
List<Case> escalations = [
    SELECT Id, Status, Priority, CreatedDate
    FROM   Case
    WHERE  External_ID__c LIKE 'HYDRATE-%'
      AND  IsClosed = false
      AND  Status != 'Escalated'
      AND  CreatedDate < :Datetime.now().addDays(-7)
      AND  Priority IN ('High','Critical')
    WITH USER_MODE
];
for (Case c : escalations) {
    c.Status = 'Escalated';
    c.IsEscalated = true;
}
update Security.stripInaccessible(AccessType.UPDATABLE, escalations).getRecords();
System.debug(LoggingLevel.INFO, '[CustomerHydration] Escalated ' + escalations.size() + ' Cases');

// 4. Denormalized flag updates (placeholder — only if the org has fields like Opportunity.IsHydrate__c that the demo uses)
// Leave empty in v1; Plan 5 self-review can add as needed.
```

**Critical design decision**: Apex SOQL uses `WITH USER_MODE`. The runner is admin-context, so it passes; this also means re-runs by non-admins will fail loudly with the right message.

**FscGroupRollupBatch.cls** ships in `Customer_Hydration/force-app/main/default/classes/`:

```apex
public class FscGroupRollupBatch implements Database.Batchable<sObject> {
    public Database.QueryLocator start(Database.BatchableContext bc) {
        return Database.getQueryLocator(
            'SELECT Id FROM Account WHERE External_ID__c LIKE \'HYDRATE-HH-%\''
        );
    }
    public void execute(Database.BatchableContext bc, List<Account> scope) {
        // No-op fallback: just touches the Account so triggers re-fire and the
        // FSC standard Group Builder logic propagates total-asset/liability
        // values. If the org has a properly-installed Group Builder, the
        // documented FinServ.GroupAssignmentBatch path will have already been
        // tried and we shouldn't reach here.
        update scope;
    }
    public void finish(Database.BatchableContext bc) {
        System.debug(LoggingLevel.INFO, '[CustomerHydration] FscGroupRollupBatch finished');
    }
}
```

With matching test class `FscGroupRollupBatchTest.cls` for ≥75% coverage.

---

## §2 Phase 5.5 — Data Cloud stream refresh

After Phase 5 settles, kick the org's existing Data Cloud Data Streams whose source object matches a HYDRATE-* hydrated object. Fire-and-forget — log run Ids, exit. `dc-status` polls later.

**Object → stream discovery:**

```python
HYDRATE_SOURCE_OBJECTS = {
    "Account", "Contact", "Opportunity", "Case", "Task", "Event",
    "Campaign", "CampaignMember", "AccountContactRelation",
    "FinServ__FinancialAccount__c", "FinServ__FinancialAccountRole__c",
    "FinServ__Card__c", "FinServ__FinancialHolding__c",
    "FinServ__FinancialGoal__c", "FinServ__LifeEvent__c",
    "FinServ__BusinessMilestone__c",
    "FinancialAccount", "FinancialAccountParty", "FinancialGoal",
    "BusinessMilestone", "PartyRelationshipGroup", "PartyProfile",
    "ContactPointAddress", "ContactPointEmail", "ContactPointPhone",
}
```

**REST client**:
1. List streams: `GET /services/data/v60.0/ssot/data-streams` (or whatever vXX.0 the org honors)
2. For each stream, read `sourceObject` (or equivalent path; the implementation task probes the response shape)
3. Filter to streams whose source is in `HYDRATE_SOURCE_OBJECTS`
4. POST to each stream's run-now endpoint: `POST /services/data/v60.0/ssot/data-streams/{name}/run`
5. Capture run Id from response

**Authentication**: uses the same `sf` CLI session — `sf org display --target-org X --verbose --json` exposes `accessToken` and `instanceUrl`. The Python REST client reads those.

**Skip flags**:
- `--skip-data-cloud` skips Phase 5.5 entirely
- `--data-cloud-only` skips Phases 0–5, runs Phase 5.5 only

**Production guard**: Phase 5.5 honors `--allow-production` per Plan 1 conventions.

**Manifest output**: appends `data_cloud_stream_refresh` block to `output/run-{ts}/manifest.json` with all triggered stream run Ids + per-stream status.

---

## §3 `dc-status` subcommand

```python
def _run_dc_status(args: argparse.Namespace) -> int:
    """Poll Data Cloud stream-run state from latest manifest."""
    # 1. Locate manifest (--run-id flag, default: latest)
    # 2. Load data_cloud_stream_refresh.stream_runs from manifest
    # 3. For each run_id, query DC REST: GET /services/data/v60.0/ssot/data-stream-runs/{run_id}
    # 4. Print table: stream_api_name | source_object | status | rows_processed
    # 5. If --watch: poll every 30s until all complete or fail
    # 6. If --json: emit machine-readable
```

---

## §4 Conditional `force-app/` deployment

Plan 5 ships:
- `force-app/main/default/objects/FinServ__BusinessMilestone__c/fields/External_ID__c.field-meta.xml` — only deployed if the legacy `FinServ__BusinessMilestone__c` object exists in the target org
- `force-app/main/default/classes/FscGroupRollupBatch.cls` — always deployed (Apex fallback for Phase 5)
- `force-app/main/default/classes/FscGroupRollupBatchTest.cls` — required for ≥75% test coverage

**Conditional deployment task** (one of the Plan 5 tasks): describes `FinServ__BusinessMilestone__c` first; if not present, removes the field-meta.xml from the deploy package OR uses `--ignore-warnings` to skip. jdo-fw51xz definitively does NOT have it (verified Plan 1 prelude).

---

## §5 Tasks (12 total)

| Task | Component |
|---|---|
| 1 | `apex/post_load_wireup.apex` content — full anonymous script (verbatim from §1) |
| 2 | `force-app/main/default/classes/FscGroupRollupBatch.cls` + `FscGroupRollupBatchTest.cls` |
| 3 | `force-app/main/default/objects/FinServ__BusinessMilestone__c/fields/External_ID__c.field-meta.xml` (conditional) |
| 4 | `customer_hydration/phase5/apex_wireup.py` — Python wrapper that runs `sf apex run --file apex/post_load_wireup.apex` + tests |
| 5 | `customer_hydration/phase5/data_cloud.py` — REST client for stream discovery + trigger + tests |
| 6 | Modify runner (runner_p4 or whichever is current) — call apex_wireup at Phase 5, data_cloud at Phase 5.5 |
| 7 | Wire `--skip-apex-wireup` and `--skip-data-cloud` flags (currently no-ops since Plan 1) |
| 8 | New CLI subcommand `dc-status` + tests |
| 9 | Conditional force-app/ deployment via `sf project deploy start` (from runner) |
| 10 | Live smoke: load → Apex wireup runs → DC streams trigger → manifest captures run Ids |
| 11 | `dc-status` smoke test against the live org |
| 12 | README + CHANGELOG closeout |

---

## §6 Plan 5 success criteria

- [ ] All Plan 1+2+3+4+5 tests pass (~370+ unit tests)
- [ ] `python hydrate.py hydrate ...` (without `--skip-apex-wireup`) executes the Apex script and updates household roll-ups (verified via SOQL)
- [ ] `python hydrate.py hydrate ...` (without `--skip-data-cloud`) discovers and triggers all CRM-sourced DC streams in target org; manifest captures stream run Ids
- [ ] `python hydrate.py dc-status` reads manifest + polls DC REST API + prints per-stream status
- [ ] `python hydrate.py dc-status --watch` polls every 30s until all complete or fail
- [ ] `force-app/` deploys `FscGroupRollupBatch.cls` (always) + `External_ID__c` field on `FinServ__BusinessMilestone__c` (only if the legacy object exists)
- [ ] All Apex SOQL uses `WITH USER_MODE`
- [ ] `FscGroupRollupBatch` has ≥75% test coverage
- [ ] Phase 5.5 stream-trigger failures DO NOT cause non-zero exit (per spec §5)

---

## §7 Plan 5 known limitations (deferred to Plan 6)

- Banker briefs (`docs/briefs/*.md` — one per banker) — Plan 6
- AGENTS.md final pass + Customer_Hydration as a "complete" demo asset entry in top-level repo docs — Plan 6
- Top-level repo README "Projects" table row — Plan 6
- Phase 6 verification (live-org spot checks per banker, dashboard rendering checks) — Plan 6
