# Cumulus Snowflake Pipelines — Umbrella Design

> **Status:** Drafted 2026-05-27. Source brainstorming doc: `~/Downloads/cumulus_bank_dataset_brainstorming.md` (21 sections).
> **Scope:** 13 synthetic FSC datasets in Snowflake `FINS.PUBLIC`, mirroring `Snowflake_CSAT_NPS` / `Financial_Trades_Generation`, flowing back to Salesforce via Data Cloud zero-copy.
> **Phasing pattern:** umbrella spec + phased plans (mirrors `Customer_Hydration`).

---

## 1. Architecture

```
                ┌─────────────────────────────────────────────┐
                │  FSC Org (jdo-uqj0jr)                       │
                │  Source of truth for accounts,              │
                │  hydrated by Customer_Hydration Phases 1-4  │
                └────────────────────┬────────────────────────┘
                                     │ outbound DC zero-copy share
                                     ▼ FINSDC3_DATASHARE.schema_Jedi_Snowflake
                ┌────────────────────────────────────────────┐
                │  Snowflake — FINS.PUBLIC                   │
                │                                            │
                │  ┌──────────────────┐  ┌────────────────┐  │
                │  │ MASTER_ACCOUNTS  │  │ ssot__Account  │  │
                │  │ (existing)       │  │ __dlm (share)  │  │
                │  └────────┬─────────┘  └───────┬────────┘  │
                │           └──────┬─────────────┘           │
                │                  ▼                         │
                │     ┌─────────────────────────┐            │
                │     │ V_ACCOUNT_ANCHORS       │  ← NEW     │
                │     │ (shared view; one row   │            │
                │     │  per active account)    │            │
                │     └────────────┬────────────┘            │
                │                  │                         │
                │  ┌───────────────┼───────────────────────┐ │
                │  │  13 generators (Snowpark Python SPs)  │ │
                │  │  Tier 1 (7) + Tier 2 (6)              │ │
                │  │  ─ idempotent MERGE                   │ │
                │  │  ─ TASK_EXECUTION_LOG                 │ │
                │  │  ─ daily/weekly/monthly TASK schedule │ │
                │  └───────────────┬───────────────────────┘ │
                │                  ▼                         │
                │     13 fact/reference tables in            │
                │     FINS.PUBLIC                            │
                └──────────────────┬─────────────────────────┘
                                   │ DC "Snowflake (Federate / Zero Copy)"
                                   ▼  connector — already configured.
                                   │  One Data Stream per FINS.PUBLIC table.
                ┌──────────────────────────────────────────────┐
                │  Data Cloud — DLOs/DMOs from connector       │
                │  (Cumulus<Vendor><Topic>__dlm × 13)          │
                └──────────────────┬───────────────────────────┘
                                   │
        ┌──────────────────┬───────┴───────┬──────────────────┐
        ▼                  ▼               ▼                  ▼
 Agentforce grounding   Phase 3d-style    LWC widgets /     Tableau Next
 (retrievers, prompts)  cross-DMO segs    FlexCards/UI      dashboards
```

**The shape in one paragraph:** 13 new sister-projects to `Snowflake_CSAT_NPS` / `Financial_Trades_Generation`, each owning one Snowflake table populated by a Snowpark Python stored procedure on a daily/weekly/monthly task. All 13 generators read account context from a single new view `FINS.PUBLIC.V_ACCOUNT_ANCHORS` that joins `MASTER_ACCOUNTS` to the existing `FINSDC3_DATASHARE.schema_Jedi_Snowflake.ssot__Account__dlm` zero-copy share — so anchor fields stay live without any sync task. Each Snowflake table is then federated into Data Cloud as a new Data Stream via the **already-configured DC "Snowflake (Federate / Zero Copy)" connector**, materialized as a DLO and promoted to a DMO that drives segments, Agentforce grounding, and demo UI surfaces.

**Key architectural property:** zero-copy on **both** ingress (anchors via inbound share) and egress (per-table federation through the existing DC Snowflake connector — no outbound share, no data copy into DC, no CREATE SHARE privilege). Snowflake is the system of record; DC reads through. The only hand-rolled data movement inside Snowflake is the synthesis itself — no API pumps, no sync drift.

---

## 2. Scope reconciliation vs source brainstorming doc

The source `cumulus_bank_dataset_brainstorming.md` ranks 50+ data providers across 21 sections. Our 13-dataset cut deliberately diverges from its own §20 priority stack because the source predates Customer_Hydration / Phase 4 backfill — many of its "datasets" are now redundant once FSC standard objects + the existing trades/CSAT pipelines are in scope.

| | Source doc §20 | This spec |
|---|---|---|
| Claritas | T1 | T1 ✓ |
| D&B | T1 | T1 ✓ |
| Plaid | T1 | T1 ✓ |
| MoneyGuidePro | T2 | T1 (promoted — Wealth copilot value) |
| CoreLogic | T2 | T1 (promoted — Mortgage/HELOC) |
| World-Check | T2 | T1 (promoted — AML demo) |
| Relationship graph (§17) | not ranked | T1 (added — flagship demo) |
| BoardEx, Equilar, ZoomInfo, Esri, Gong, MSCI, S&P, Moody's | mix of T1/T2/T3 | T2 |
| LinkedIn, Seismic, Salesforce Data Cloud | T1 | dropped (integration target, not synthesizable source) |
| NICE Actimize, Chainalysis | T3 | dropped or folded into T1 AML |
| Bloomberg, FactSet, Refinitiv, Murex, Calypso | T3 | deferred to Phase 3 |
| §2 Retail core, §4 Cards, §9 ERP, §10 Capital Mkts, §12 Asset Mgmt, §13 Insurance, §17 Synth Behavior | various | dropped (FSC standard already covers, or derivable) |

---

## 3. The shared anchor view

```sql
CREATE OR REPLACE VIEW FINS.PUBLIC.V_ACCOUNT_ANCHORS AS
SELECT
    ma.ACCOUNT_ID,
    ma.ACCOUNT_NAME,
    ma.SNAPSHOT_DATE,

    -- Type discriminators
    a.FinServ_ClientCategory_c__c               AS CLIENT_CATEGORY,
    CASE WHEN a.PersonBirthdate__c IS NOT NULL
         THEN 'PERSON' ELSE 'BUSINESS' END      AS ACCOUNT_TYPE_FLAG,

    -- Person anchors
    a.PersonBirthdate__c                        AS BIRTHDATE,
    a.FinServ_AnnualIncome_pc__c                AS ANNUAL_INCOME,
    a.FinServ_CreditScore_c__c                  AS CREDIT_SCORE,

    -- Business anchors
    a.ssot__PrimaryIndustry__c                  AS INDUSTRY,
    a.ssot__AnnualRevenueAmount__c              AS ANNUAL_REVENUE,
    a.ssot__EmployeeCount__c                    AS EMPLOYEE_COUNT,

    -- Geo anchor (for CoreLogic / Esri / Placer.ai)
    -- v1.1: address fields live denormalized on ssot__Account__dlm —
    -- ssot__ContactPointAddress__dlm is not in the inbound share. PersonMailing*
    -- is populated for persons; Billing* for businesses.
    COALESCE(a.PersonMailingPostalCode__c, a.BillingPostalCode__c)  AS POSTAL_CODE,
    COALESCE(a.PersonMailingState__c,      a.BillingState__c)       AS STATE_CODE,
    COALESCE(a.PersonMailingCountry__c,    a.BillingCountry__c)     AS COUNTRY_CODE,

    -- Namespace flag
    a.External_ID_c__c                          AS EXTERNAL_ID
FROM FINS.PUBLIC.MASTER_ACCOUNTS ma
INNER JOIN FINSDC3_DATASHARE.schema_Jedi_Snowflake.ssot__Account__dlm a
        ON a.ssot__Id__c = ma.ACCOUNT_ID
WHERE ma.SNAPSHOT_DATE = (SELECT MAX(SNAPSHOT_DATE) FROM FINS.PUBLIC.MASTER_ACCOUNTS);
```

**Design notes:**
- `INNER JOIN` on the share so an account in the view *means* anchors are real. Accounts not yet in the share are invisible to all 13 generators by design.
- Address fields come from denormalized columns on `ssot__Account__dlm` (PersonMailing* / Billing*) via COALESCE — `ssot__ContactPointAddress__dlm` is not currently in the `FINSDC3_DATASHARE` inbound share. If the address DMO is added later, swap COALESCE → LEFT JOIN with no schema change to the view.
- `WHERE SNAPSHOT_DATE = MAX(...)` pin keeps the view to today's roster, not a historical Cartesian product.

**Live-data discoveries (Plan 0 verification, 2026-05-28):**
1. **`MASTER_ACCOUNTS` has duplicate rows within today's snapshot** — 37,445 view rows / 36,813 distinct ACCOUNT_IDs (1.7% over-count). Generators MUST `GROUP BY ACCOUNT_ID` or `SELECT DISTINCT` when reading the audience; raw row iteration will double-process some accounts. Per-dataset audience SQL in §5 should use `SELECT DISTINCT` defensively until the upstream MASTER_ACCOUNTS dedup ships.
2. **`CLIENT_CATEGORY` has 9 distinct values, not 4** — beyond `{Retail, Wealth Management, Small Business, Commercial Banking}` the source carries near-equivalents (e.g., wealth sub-bands). Audience predicates that filter on a specific category (Plans 3, 8, 10, 12) MUST probe the actual set of values before locking the predicate; `=` may be too strict, prefer `IN (...)` with the discovered list. Plan 1 should add a `Snowflake_Cumulus_Common/output/client_category_probe.json` capture as the first step before instantiating downstream plans.
3. **`ACCOUNT_TYPE_FLAG` discriminator misclassifies 12,021 accounts as BUSINESS** — `PersonBirthdate__c IS NULL → BUSINESS` is a heuristic and Phase 4 backfill didn't fully populate birthdate on Person Accounts. The 25,424 PERSON / 12,021 BUSINESS split is plausible enough for the demo, but Plans 2/9/11 (`BUSINESS`-scoped) should validate row counts against expected business cardinality from CRM (which is closer to 5K) and warn if `BUSINESS_actual > BUSINESS_expected × 2`. Long-term fix is upstream backfill, not view-layer change.

**v1.5 — Plan 4 string-quality discoveries (2026-05-28):**

4. **`POSTAL_CODE` has 10,798 empty-string rows** alongside ~25K real ZIPs and 1,223 actual NULLs. `WHERE POSTAL_CODE IS NOT NULL` lets the empty strings through; the safe predicate is `WHERE POSTAL_CODE IS NOT NULL AND POSTAL_CODE <> ''`. Plans that filter on POSTAL_CODE (4 Esri, 5 CoreLogic) MUST use both checks. Long-term fix is `NULLIF(..., '')` in the V_ACCOUNT_ANCHORS view itself, but until then audience SQL is defensive at the consumer.
5. **`COUNTRY_CODE` has 4 rows with `'USA'` or `'United States'` literals** instead of the canonical `'US'`. Tables that declare `COUNTRY_CODE VARCHAR(2)` will fail to insert these rows. Two safe patterns: project `'US' AS COUNTRY_CODE` literally if the dataset is US-only, or use `LEFT(COUNTRY_CODE, 2)` to truncate. Plan 4's SP uses the literal projection.

The general rule going forward: **assume any string column from V_ACCOUNT_ANCHORS may carry empty strings, dirty values, or unexpected widths.** Defensive SQL beats post-deploy fix-up.

---

## 4. The 13 dataset tables

| # | Tier | Snowflake table | Repo dir | DC DMO | Mimics | Cadence | Audience predicate | Coverage check |
|---|---|---|---|---|---|---|---|---|
| 1 | T1 | `CLARITAS_DEMOGRAPHICS` | `Snowflake_Claritas_Demographics/` | `CumulusClaritasDemographics__dlm` | Claritas | monthly | `ACCOUNT_TYPE_FLAG = 'PERSON'` | rows = audience |
| 2 | T1 | `DNB_BUSINESS_CREDIT` | `Snowflake_DnB_BusinessCredit/` | `CumulusDnBBusinessCredit__dlm` | D&B | monthly | `ACCOUNT_TYPE_FLAG = 'BUSINESS'` | rows = audience |
| 3 | T1 | `MGP_FINANCIAL_PLANS` | `Snowflake_MoneyGuidePro_Plans/` | `CumulusMGPFinancialPlans__dlm` | MoneyGuidePro | monthly | `CLIENT_CATEGORY = 'Wealth Management'` | distinct accts = audience |
| 4 | T1 | `PLAID_HELD_AWAY` | `Snowflake_Plaid_HeldAway/` | `CumulusPlaidHeldAway__dlm` | Plaid | weekly | `CLIENT_CATEGORY IN ('Retail','Wealth Management')` | distinct accts = audience |
| 5 | T1 | `CORELOGIC_PROPERTY` | `Snowflake_CoreLogic_Property/` | `CumulusCoreLogicProperty__dlm` | CoreLogic | quarterly | `ACCOUNT_TYPE_FLAG = 'PERSON' AND POSTAL_CODE IS NOT NULL` | distinct accts = audience |
| 6 | T1 | `WORLDCHECK_AML` | `Snowflake_WorldCheck_AML/` | `CumulusWorldCheckAML__dlm` | World-Check | daily | `1=1` (all accounts) | rows = `COUNT(MASTER_ACCOUNTS)` |
| 7 | T1 | `SYNTH_RELATIONSHIP_GRAPH` | `Snowflake_Synth_RelationshipGraph/` | `CumulusRelationshipGraph__dlm` | composition | weekly | `1=1` (all accounts) | distinct src_acct = audience |
| 8 | T2 | `BOARDEX_EXEC_INTEL` | `Snowflake_BoardEx_ExecIntel/` | `CumulusBoardExExecIntel__dlm` | BoardEx | monthly | `CLIENT_CATEGORY = 'Commercial Banking'` | distinct accts = audience |
| 9 | T2 | `ZOOMINFO_FIRMOGRAPHICS` | `Snowflake_ZoomInfo_Firmographics/` | `CumulusZoomInfoFirmographics__dlm` | ZoomInfo | monthly | `ACCOUNT_TYPE_FLAG = 'BUSINESS'` | rows = audience |
| 10 | T2 | `GONG_CALL_SENTIMENT` | `Snowflake_Gong_CallSentiment/` | `CumulusGongCallSentiment__dlm` | Gong | weekly | `CLIENT_CATEGORY IN ('Wealth Management','Commercial Banking')` | distinct accts = audience |
| 11 | T2 | `MSCI_ESG_SCORES` | `Snowflake_MSCI_ESG/` | `CumulusMSCIESG__dlm` | MSCI | monthly | `ACCOUNT_TYPE_FLAG = 'BUSINESS'` | rows = audience |
| 12 | T2 | `ESRI_GEO_FOOTPRINT` | `Snowflake_Esri_GeoFootprint/` | `CumulusEsriGeoFootprint__dlm` | Esri | monthly | (branch × ZIP, not account-scoped) | rows = `COUNT(DISTINCT BRANCH_ZIP)` |
| 13 | T2 | `MOODYS_MARKET_CONTEXT` | `Snowflake_Moodys_MarketContext/` | `CumulusMoodysMarketContext__dlm` | Moody's | daily | (instrument-scoped) | rows = `COUNT(INSTRUMENT_UNIVERSE)` |

**Coverage invariant:** for every dataset, every account satisfying the audience predicate gets ≥1 row, even when the "result" is the boring case (AML CLEAR, no property holdings, self-edge in the graph). The generator's exit code asserts this; missing rows fail the task red.

**Parallel-track ship order:** Tier 1 sequential (Claritas → D&B → CoreLogic → Plaid → World-Check → MGP → Relationship graph). Two cheap Tier 2 datasets (`MSCI_ESG_SCORES`, `ESRI_GEO_FOOTPRINT`) ship in parallel — they're pure-hash, no narrative coherence, useful for validating `V_ACCOUNT_ANCHORS` + zero-copy egress on a non-critical path before the heavyweight datasets land. Remaining Tier 2 (BoardEx, ZoomInfo, Gong, Moody's) ships after Tier 1 closes.

**Three datasets break the per-account pattern:** Esri is branch-scoped, Moody's is instrument-scoped, the relationship graph is edge-scoped (account is `src` not the row PK). Coverage assertions for those use the correct audience count (branches, instruments, distinct sources), not `MASTER_ACCOUNTS`.

---

## 5. Generator pattern

Every one of the 13 generators is the same shape — one Snowpark Python stored procedure, one task, one `TASK_EXECUTION_LOG` entry. Differences are confined to (a) audience predicate, (b) row factory, (c) target table.

```python
# procedures/sp_generate_claritas_demographics.py
from snowflake.snowpark import Session
from datetime import datetime
import hashlib, uuid

TABLE          = "FINS.PUBLIC.CLARITAS_DEMOGRAPHICS"
TASK_NAME      = "TASK_MONTHLY_CLARITAS_DEMOGRAPHICS"
DATASET_SALT   = "claritas"     # per-dataset hash salt
AUDIENCE_SQL   = "SELECT * FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS WHERE ACCOUNT_TYPE_FLAG = 'PERSON'"
COVERAGE_SQL   = "SELECT COUNT(*) FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS WHERE ACCOUNT_TYPE_FLAG = 'PERSON'"

def main(session: Session) -> str:
    log_id = str(uuid.uuid4())
    started = datetime.utcnow()
    rows_inserted, accounts_processed, status, err = 0, 0, "SUCCEEDED", None

    try:
        # 1. Read audience from the shared view (zero-copy fresh anchors)
        audience = session.sql(AUDIENCE_SQL).collect()
        accounts_processed = len(audience)

        # 2. Build deterministic rows (per-row failure isolation up to 1%)
        records, errors = [], []
        for a in audience:
            try:
                records.append(_row_for(a, started))
            except Exception as exc:
                errors.append((a.ACCOUNT_ID, str(exc)[:200]))
        if len(errors) > max(10, len(audience) // 100):
            raise RuntimeError(f"row factory failed on {len(errors)}/{len(audience)} accounts")
        if errors:
            err = f"row factory failed on {len(errors)}/{len(audience)} accounts; first: {errors[0]}"

        # 3. Idempotent MERGE on PK
        rows_inserted = _merge(session, records)

        # 4. Coverage assertion
        expected = session.sql(COVERAGE_SQL).collect()[0][0]
        actual   = session.sql(f"SELECT COUNT(DISTINCT ACCOUNT_ID) FROM {TABLE}").collect()[0][0]
        if actual < expected:
            raise RuntimeError(f"coverage gap: expected {expected}, got {actual}")

    except Exception as exc:
        status = "FAILED"
        err = str(exc)[:4000]
        raise

    finally:
        # 5. Always log
        duration_ms = int((datetime.utcnow() - started).total_seconds() * 1000)
        session.sql("""
            INSERT INTO FINS.PUBLIC.TASK_EXECUTION_LOG
            (LOG_ID, TASK_NAME, EXECUTION_TIME, STATUS, ROWS_INSERTED,
             ACCOUNTS_PROCESSED, ERROR_MESSAGE, DURATION_MS)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, params=[log_id, TASK_NAME, started, status,
                     rows_inserted, accounts_processed, err, duration_ms]).collect()

    return f"{TASK_NAME}: {status} rows={rows_inserted} accounts={accounts_processed}"


def _row_for(anchor, run_ts) -> dict:
    """Pure function: anchor row → fact row. Deterministic.

    Seed: HASH(ACCOUNT_ID || dataset_salt || YYYY-MM). Re-runs same month replay
    exactly; new month rolls a new value.
    """
    seed = hashlib.sha256(
        f"{anchor.ACCOUNT_ID}|{DATASET_SALT}|{run_ts:%Y-%m}".encode()
    ).digest()
    # ... bias by income/age, draw PRIZM segment, return dict
    return {...}


def _merge(session, records) -> int:
    """MERGE into TABLE on (ACCOUNT_ID, PROFILE_MONTH). Replaces on match."""
    ...
```

### 5.1 Shared vs per-dataset

| Concern | Where | Per-dataset variation |
|---|---|---|
| Retry / wakeup wrapper | `FINS.PUBLIC.SP_RUN_WITH_RETRY` (existing) | None — wrapped at task level |
| TASK_EXECUTION_LOG insert | Inside each SP (`finally`) | None — same columns |
| Coverage assertion | Inside each SP (step 4) | The two SQL strings |
| Idempotent MERGE | Inside each SP (step 3) | PK columns + column list |
| Audience predicate | Inside each SP (`AUDIENCE_SQL`) | Per row of §4 catalog |
| Deterministic seed | Inside `_row_for` | Per-dataset salt (`"claritas"`, `"dnb"`...) |
| Row factory | Inside `_row_for` | Per-dataset synthesis logic |
| Email reporting | Existing `SP_DAILY_EMAIL_REPORT` | None — every dataset's status is free |

### 5.2 Task definition (one per dataset)

> **v1.4 — org-canonical names.** Plan 1's live deploy revealed that the
> umbrella spec's earlier `SP_RUN_WITH_RETRY` / `FINS_WH` / `retries=3` are
> inventions; the actual sister-task pattern in the org (validated against
> `TASK_MONTHLY_CSAT`, `DAILY_TRADE_GENERATOR`, etc.) is
> `SP_RETRY_WRAPPER` / `MAIN_WH_XS` / `retries=2`. The wrapper takes the SP
> call as a quoted string (with parens), not the SP name alone.

```sql
CREATE OR REPLACE TASK FINS.PUBLIC.TASK_MONTHLY_CLARITAS_DEMOGRAPHICS
  WAREHOUSE = MAIN_WH_XS
  SCHEDULE  = 'USING CRON 0 7 1 * * UTC'    -- 1st of month, 07:00 UTC
AS
  CALL FINS.PUBLIC.SP_RETRY_WRAPPER('FINS.PUBLIC.SP_GENERATE_CLARITAS_DEMOGRAPHICS()', 2);

ALTER TASK FINS.PUBLIC.TASK_MONTHLY_CLARITAS_DEMOGRAPHICS RESUME;
```

**Cadence schedule:**
- daily (3): `WORLDCHECK_AML`, `MOODYS_MARKET_CONTEXT`, plus existing trades — `0 1 * * * UTC`
- weekly (3): `PLAID_HELD_AWAY`, `SYNTH_RELATIONSHIP_GRAPH`, `GONG_CALL_SENTIMENT` — `0 5 * * 1 UTC`
- monthly (6): `CLARITAS_DEMOGRAPHICS`, `DNB_BUSINESS_CREDIT`, `MGP_FINANCIAL_PLANS`, `BOARDEX_EXEC_INTEL`, `ZOOMINFO_FIRMOGRAPHICS`, `MSCI_ESG_SCORES` — `0 7 1 * * UTC`
- quarterly (1): `CORELOGIC_PROPERTY` — `0 8 1 1,4,7,10 * UTC`

### 5.3 Why per-dataset salts

Without a salt, two datasets seeded only by `ACCOUNT_ID` would produce correlated random draws — the same accounts skewing the same direction in every dataset. Per-dataset salts (`"claritas"`, `"dnb"`...) make each dataset's distribution independent.

---

## 6. Error handling & observability

### 6.1 Failure-mode taxonomy

| Failure mode | Detected where | Behavior | Operator action |
|---|---|---|---|
| **Anchor share unavailable** | Audience SELECT raises | Task fails fast; `ERROR_MESSAGE = 'anchor unreachable: <error>'` | Check inbound DC share `FINSDC3_DATASHARE` status |
| **Empty audience** | `accounts_processed == 0` | Task **succeeds**; logs `ROWS_INSERTED=0`. Email flags as warning. | Investigate predicate or upstream loss |
| **MERGE deadlock / transient I/O** | Snowpark raises mid-MERGE | `SP_RUN_WITH_RETRY` retries 3× w/ backoff | None if retry succeeds |
| **Coverage gap** | Step 4 assertion | Task fails red, `ERROR_MESSAGE = 'coverage gap: N missing rows'` | Diagnose row-factory bug |
| **Synthesis bug** | `_row_for` raises | Tolerates ≤1% per-row failures; above that, fails the run | Fix deterministic seed → re-run |

### 6.2 `TASK_EXECUTION_LOG` semantics (no DDL change)

- `STATUS='SUCCEEDED' AND ROWS_INSERTED=0` → empty-audience warning (yellow)
- `STATUS='SUCCEEDED' AND ERROR_MESSAGE IS NOT NULL` → partial per-row failures
- `STATUS='FAILED' AND ERROR_MESSAGE LIKE 'coverage gap:%'` → audit failure
- `STATUS='FAILED' AND ERROR_MESSAGE LIKE 'anchor unreachable:%'` → upstream issue (no retry)

Encoding categories in the message prefix means the daily email and any dashboard can filter without a schema migration. Phase 4 used the same trick.

### 6.3 Daily email — extends existing `SP_DAILY_EMAIL_REPORT`

Each new generator's TASK_NAME automatically appears in the digest — no change required. We add one new section:

```
=================================================================
CUMULUS DATASET PIPELINES (last 24h)
=================================================================

Tier 1 (7 datasets)
  ✓ TASK_MONTHLY_CLARITAS_DEMOGRAPHICS  36,801 rows / 36,813 accts  (12,847 ms)
  ✓ TASK_MONTHLY_DNB_BUSINESS_CREDIT     4,962 rows /  4,962 accts   (3,210 ms)
  ⚠ TASK_WEEKLY_PLAID_HELD_AWAY         47,118 rows / 24,209 accts   (8,402 ms)
       row factory failed on 47/24256 accounts; first: ACCT-9821: invalid ZIP
  ✗ TASK_WEEKLY_SYNTH_RELATIONSHIP_GRAPH coverage gap: 1,247 missing rows
  ...

Tier 2 (6 datasets)
  ✓ TASK_MONTHLY_MSCI_ESG_SCORES         4,962 rows /  4,962 accts   (1,847 ms)
  ✓ TASK_MONTHLY_ESRI_GEO_FOOTPRINT        382 rows /     382 zips   (1,123 ms)
  ...
```

Severity ordering (red → yellow → green) is determined by the message-prefix taxonomy.

### 6.4 Out of scope

- Per-dataset paging (PagerDuty/Slack push). Demo org, not 24/7 SLA.
- Retry policy beyond `SP_RUN_WITH_RETRY`'s 3-attempt default.
- Health-check probe tasks. Daily email is the heartbeat.

---

## 7. Testing strategy

### 7.1 Pyramid

```
                    ┌────────────────────────────────────┐
                    │  L3 — Live smoke (in jdo-uqj0jr)   │  ← thin
                    │  1 manual run/dataset, post-deploy │
                    └────────────────────────────────────┘
                  ┌──────────────────────────────────────────┐
                  │  L2 — SP integration (snow sql + asserts)│  ← medium
                  │  Per-dataset, runs in CI before merge    │
                  └──────────────────────────────────────────┘
              ┌────────────────────────────────────────────────┐
              │  L1 — Pure-function pytest (_row_for, _seed)   │  ← thick
              │  Per-dataset, hundreds of cases per dataset    │
              └────────────────────────────────────────────────┘
```

### 7.2 L1 — Pure-function pytest (90% of value)

Five property classes per dataset's `tests/test_<dataset>_row_factory.py`:

1. **Determinism** — same `(anchor, ts)` → same dict
2. **Audience scoping** — predicate-violating anchors raise
3. **Boring-case coverage** — emits a row even when the result is the null case (AML CLEAR, no property)
4. **Anchor influence** — biased fields actually shift with anchors (low vs high income → different PRIZM band distribution)
5. **Schema contract** — output dict keys exactly match the table's columns

Property #4 is the test that catches the sneakiest synthesis bug — a row factory that ignores its anchor and just returns hash-derived values would pass determinism + schema, but produce demographically-incoherent data.

### 7.3 L2 — SP integration test (per dataset, runs in CI)

`snow sql` against `FINS.TEST` schema:

```sql
USE SCHEMA FINS.TEST;
CREATE OR REPLACE TABLE TEST_ANCHORS AS SELECT * FROM SAMPLE_ANCHORS_FIXTURE;
CREATE OR REPLACE VIEW V_ACCOUNT_ANCHORS AS SELECT * FROM TEST_ANCHORS;
CALL SP_GENERATE_CLARITAS_DEMOGRAPHICS();
-- assert COUNT(DISTINCT ACCOUNT_ID) FROM CLARITAS_DEMOGRAPHICS == COUNT(*) FROM TEST_ANCHORS WHERE ACCOUNT_TYPE_FLAG='PERSON'
-- assert idempotency on re-run
-- assert TASK_EXECUTION_LOG row with STATUS='SUCCEEDED'
```

Catches MERGE syntax errors, log-insert failures, that the assertion-after-MERGE step actually runs.

### 7.4 L3 — Live smoke (manual, post-deploy)

After each plan ships, run the SP once against `jdo-uqj0jr`'s `FINS.PUBLIC` and verify:
1. `TASK_EXECUTION_LOG` has a `STATUS='SUCCEEDED'` row
2. Table row count is within ±5% of expected audience size
3. A random sample of 10 rows looks plausible

### 7.5 Shared anchor fixture

100 anchors at `tests/fixtures/sample_anchors.py` (50 person × age/income bands, 50 business × industry/revenue/employee bands). All L1 + L2 tests reuse it — no per-dataset fixture sprawl.

### 7.6 Out of scope

- Snowflake's MERGE semantics (trust the platform)
- TASK schedule cron correctness (PR review + daily email)
- Zero-copy share latency (Salesforce/DC behavior)
- Visual coherence of generated data (manual L3 spot check)

---

## 8. DC zero-copy egress (federation via existing connector)

**Egress shape:** each `FINS.PUBLIC.<DATASET_TABLE>` is exposed to Data Cloud as its own Data Stream via the **already-configured "Snowflake (Federate / Zero Copy)" connector** in the org's DC instance. No outbound Snowflake share is created; no `CREATE SHARE` privilege is needed. DC federates queries through to Snowflake live — Snowflake stays the system of record.

**Strictly one physical table per dataset.** The 13 dataset tables in §4 are 13 separate `CREATE TABLE` statements producing 13 distinct objects in `FINS.PUBLIC` (`CLARITAS_DEMOGRAPHICS`, `DNB_BUSINESS_CREDIT`, `MGP_FINANCIAL_PLANS`, `PLAID_HELD_AWAY`, `CORELOGIC_PROPERTY`, `WORLDCHECK_AML`, `SYNTH_RELATIONSHIP_GRAPH`, `BOARDEX_EXEC_INTEL`, `ZOOMINFO_FIRMOGRAPHICS`, `GONG_CALL_SENTIMENT`, `MSCI_ESG_SCORES`, `ESRI_GEO_FOOTPRINT`, `MOODYS_MARKET_CONTEXT`). No combined view, no "wide" union table — each table has its own column list driven by the per-dataset rowspec attachment, its own primary key, its own MERGE in its own SP. DC federates one Data Stream per table → one DLO → one DMO.

**Naming conventions:**
- DLO: `Cumulus<Vendor><Topic>__dll`
- DMO: `Cumulus<Vendor><Topic>__dlm`
- Primary key column: `ACCOUNT_ID` → DC field `ssot__AccountId__c` (joinable to `ssot__Account__dlm`)
- Snake_case Snowflake columns → camelCase DC fields via standard SSOT mapper

**Refresh / latency:** federation queries Snowflake live, so DLO/DMO contents reflect Snowflake state at query time (within DC's caching window for federated sources, typically minutes). The Snowpark SP's MERGE timing controls when new rows appear in DC — no separate DC refresh schedule to manage. Generators that re-run idempotently mid-cadence are safe since DC reads the current row state on next query.

**One-time setup per dataset (folded into each plan, Task 8):**
1. **Snowflake:** nothing. The table is already query-eligible by the connector's role once it lands in `FINS.PUBLIC`.
2. **DC:** in Data Cloud Setup → Data Streams → New, pick the existing "Snowflake (Federate / Zero Copy)" connection, select `FINS.PUBLIC.<DATASET_TABLE>`, name the stream `Cumulus<Vendor><Topic>__dll`.
3. **DC:** map the DLO's columns to a new DMO `Cumulus<Vendor><Topic>__dlm`. `ACCOUNT_ID` → `ssot__AccountId__c` with a Foreign Key relationship to `ssot__Account__dlm.ssot__Id__c`. Snake_case → camelCase per the standard SSOT mapper.
4. **DC:** add the DMO to the foundational-streams allowlist in `Customer_Hydration/docs/foundational_streams.md` (the existing per-DMO catalog).

**Per-dataset DC setup is manual** in DC Setup UI for now (skill: `dc-connect-api` if scripting later). 13 datasets × ~5 min each = ~1h of UI work spread across the per-dataset plans, not a Plan 0 deliverable. Each plan's Task 8 captures the dataset-specific column mapping.

**Why federation, not a share or Bulk API:** federation requires zero net-new infrastructure (the connector already exists), no `CREATE SHARE` account privilege, and no API write throttling. The cost is read-time latency (Snowflake compute on every DC query); for the demo workload (≤ daily refresh on 36K accounts × 13 datasets) this is well within free-tier compute headroom. If federation latency becomes a bottleneck for a specific high-volume dataset (e.g., daily AML at 36K rows/day), that dataset can be promoted to a materialized DC stream later — design unchanged.

---

## 9. Phasing — 14 implementation plans

Each plan is a phased implementation following `Customer_Hydration` style — gets its own `tasks.md` and ships independently.

| Plan | Scope | Dependency |
|---|---|---|
| **Plan 0** | `V_ACCOUNT_ANCHORS` view + `tests/fixtures/sample_anchors.py` shared fixture + `cumulus_common` Python helpers (no outbound share — DC federates via the existing Snowflake connector) | none |
| **Plan 1** | `CLARITAS_DEMOGRAPHICS` (Tier 1) | Plan 0 |
| **Plan 2** | `MSCI_ESG_SCORES` (Tier 2 — parallel track) | Plan 0 |
| **Plan 3** | `DNB_BUSINESS_CREDIT` (Tier 1) | Plan 0 |
| **Plan 4** | `ESRI_GEO_FOOTPRINT` (Tier 2 — parallel track) | Plan 0 |
| **Plan 5** | `CORELOGIC_PROPERTY` (Tier 1) | Plan 0 |
| **Plan 6** | `PLAID_HELD_AWAY` (Tier 1) | Plan 0 |
| **Plan 7** | `WORLDCHECK_AML` (Tier 1) | Plan 0 |
| **Plan 8** | `MGP_FINANCIAL_PLANS` (Tier 1) | Plan 0 |
| **Plan 9** | `SYNTH_RELATIONSHIP_GRAPH` (Tier 1 — last; cross-joins prior tables) | Plans 1–8 |
| **Plan 10** | `BOARDEX_EXEC_INTEL` (Tier 2) | Plan 9 |
| **Plan 11** | `ZOOMINFO_FIRMOGRAPHICS` (Tier 2) | Plan 9 |
| **Plan 12** | `GONG_CALL_SENTIMENT` (Tier 2) | Plan 9 |
| **Plan 13** | `MOODYS_MARKET_CONTEXT` (Tier 2) | Plan 9 |

**Plan completion bar:** L1 + L2 tests pass, table populated in `jdo-uqj0jr`, DC inbound stream verified, daily email shows green.

---

## 10. Status

Approval gate before invoking `superpowers:writing-plans`. After this spec is approved, the next step is producing 14 implementation plans (one per phase above), starting with Plan 0.

## 11. Out of scope (explicit)

- **§6 source doc — Bloomberg, FactSet, Refinitiv, Morningstar.** Deferred to Phase 3.
- **§15 source doc — CX integrations** (Adobe, Genesys, Five9, Seismic, raw Salesforce Data Cloud). These are integration targets, not synthesizable sources.
- **§16 weather/news, §19 Agentforce use cases.** Consumers of data, not new datasets.
- **Activation refresh** of existing Phase 3d segments to include new DMOs. Each plan creates the DMO; segment retargeting is a separate Customer_Hydration phase.
- **UnifiedProfile-rooted segments.** Same scope decision as Phase 3d v1.2.
