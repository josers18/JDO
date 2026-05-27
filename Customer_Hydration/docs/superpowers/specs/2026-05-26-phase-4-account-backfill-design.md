# Phase 4 — Account Field Backfill — Design Spec

**Status:** approved 2026-05-26 · **Author:** Jose Sifontes (with AI co-author) · **Target org:** `jdo-uqj0jr` (initial), generic via `--target-org` thereafter.

## 1. Why

The 2026-05-26 Account audit (`output/account-audit-2026-05-26/REPORT.md`) found that of 186 fields backing the `Account_demo__dlm` Data Cloud Account DMO:

- **30** are platform-managed system fields — populated automatically.
- **2** are DC-derived (`UnifiedProfileId_c__c`, `SourceSystemIdentifier__c`) — set by Identity Resolution / connector.
- **25** are already ≥90% populated in CRM — they only need a DC stream refresh.
- **26** are partially populated (5–89%) and need *logical* coverage rules so segment-correct gaps stay visible while genuine gaps are filled.
- **101** are <5% populated — the core of Phase 4's backfill list.
- **2** are not present in the org's CRM Account schema and are out of scope.

Phase 4 closes the gap between "every column described on `Account_demo__dlm`" and "every column actually has a value an Agentforce demo or Customer 360 panel can render." It is a CRM-side backfill followed by a DC stream refresh — no new DLOs, DMOs, or segments. The synthetic data is keyed off `Account.Id` so re-runs are deterministic.

## 2. Scope

### 2.1 In scope

1. **CRM-side backfill** of the 101 empty fields across **every Account in the target org**, regardless of External_ID__c namespace.
2. **Logical-coverage top-off** of the 26 partial fields — fill where the absence is a gap (e.g., a Wealth account missing `RiskTolerance`), leave where the absence is segment-correct (e.g., a Person Account missing `AnnualRevenue`).
3. **Deterministic synthetic generation** keyed off `seeded_rng(account.Id)` so values are stable across runs and computable independently per-deriver in tests.
4. **Paired-field consistency** — when one half of a paired set is populated (e.g., `CreditScore` populated, `CreditRating` null), the deriver reads the existing value and produces the partner deterministically rather than re-rolling.
5. **DC stream refresh trigger** at the end of the run via `phase5/data_cloud.refresh_stream` for the SF-source Account stream that backs `Account_demo__dlm`.
6. **CLI subcommand** `python hydrate.py backfill-accounts` mirroring the Phase 3c `mirror-life-events` shape.
7. **Idempotent re-runs** — fill-nulls-only contract guarantees that re-running never overwrites real or previously-backfilled data.
8. **Integration with existing infrastructure** — preflight, csv_writer, loader (Bulk API 2.0 upsert via External_ID__c), manifest, phase5/data_cloud.

### 2.2 Out of scope

- New DLO / DMO / segment / activation / Calculated Insight definitions.
- Native FSC standard objects (the `native/` mirror lineage). Phase 4 only writes to CRM Account.
- Real-data enrichment from external bureaus, D&B, Experian, etc. — all values are synthetic.
- Long-text AI-summary fields (`KYC_Summary__c`, `FINS_Summary_of_*`, `Engagement_Summary__c`, `Transaction_Summary__c`) — these are intentionally produced downstream by Agentforce, not by Phase 4.
- `pi__*` (Pardot/Account-Engagement), `xDO_MDC_Cust360_*`, `SDO_*` sandbox/demo fields without a source system — Phase 4 leaves these null.
- Legacy `FINS_Retail_*` schema (Income, Other_Income, Liabilities, Personal_Assets) — superseded by `FinServ__*pc` and `FinServ__Total*`. Documented as deprecated; no backfill.

### 2.3 Out-of-scope edge cases that Phase 4 surfaces but does not solve

- If the Account DC stream is `refreshMode: UPSERT`, REST `actions/run` returns 412 (AGENTS.md note 18). Phase 4 logs the failure and prints the exact `dc-stream-full-refresh-via-ui` skill invocation; the operator runs the playwright fallback.
- 2 fields in the user's DMO list (`Equifax_Failure_Score_c__c`, `SfdcOrganizationId__c`) don't reverse-map to a CRM field. Verification with the SF Org schema is documented as a follow-up; if either is reachable under a different name, it joins a future Phase 4 minor.

## 3. Architecture

```
              ┌─────────────────────────────────────────────────────────────────┐
              │                  python hydrate.py backfill-accounts            │
              │                       --target-org jdo-uqj0jr                   │
              └─────────────────────────────────────────────────────────────────┘
                                            │
                                            ▼
   ┌────────────────────────────────────────────────────────────────────────────────┐
   │  customer_hydration/backfill_accounts.py  (orchestrator, ~250 lines)            │
   │                                                                                 │
   │   1. preflight.describe(Account) → field set & types                            │
   │   2. load coverage_rules.yaml + load deriver registry                           │
   │   3. for chunk in query_account_chunks(target_org, batch=2000):                 │
   │        for record in chunk:                                                     │
   │           derived = registry.run(record, persona, rt)   # all 7 derivers        │
   │           delta   = null_filter(record, derived)        # only fill nulls       │
   │           coverage_rules.apply(record, delta)           # logical-gap top-off   │
   │           if delta: rows.append({Id|External_ID__c, **delta})                   │
   │   4. write CSV (LF, sorted cols), bulk_upsert via External_ID__c                │
   │   5. (optional --refresh-stream) call phase5/data_cloud.refresh_stream(...)     │
   │   6. write manifest.json + log to output/backfill-accounts-<ts>/                │
   └────────────────────────────────────────────────────────────────────────────────┘
                                            │
        ┌───────────────────┬───────────────┼───────────────┬───────────────┬─────────────┐
        ▼                   ▼               ▼               ▼               ▼             ▼
 derivers/relationship  /credit_personal  /credit_bureau  /profile  /demographics  /addresses  /contact
        │                   │               │               │               │             │
        └────── shared: derivers/_helpers.py (seeded_rng, picklist_pick, money_band) ──────┘
```

**Subsystem boundaries:**

| Module | One job | Knows about |
|---|---|---|
| `backfill_accounts.py` | orchestrate query → derive → upsert → refresh | preflight, derivers, loader, phase5 |
| `derivers/_registry.py` | enumerate derivers, run per record, return merged dict | only deriver modules |
| `derivers/<concern>.py` | take a record + persona + RT, return field updates | `_helpers.py` only |
| `derivers/_helpers.py` | seeded RNG, picklist pickers, address synth utilities | nothing |
| `derivers/_pairs.py` | paired-fields list + read-and-derive helpers | derivers |
| `coverage_rules.py` | apply RT-aware logical-gap rules on partial fields | nothing (pure functions) |
| `config/coverage_rules.yaml` | declare per-field expected coverage | — |
| `config/backfill_picklists.yaml` | picklist value distributions per field | — |

**Reuses from existing codebase:**

- `customer_hydration/preflight.py` — describe-and-drop for schema drift
- `customer_hydration/csv_writer.py` — LF, sorted-cols, UTF-8
- `customer_hydration/loader/` — bulk upsert with External_ID__c
- `customer_hydration/manifest.py` — run manifest schema
- `customer_hydration/phase5/data_cloud.py` — `refresh_stream` for the DC stream trigger
- `customer_hydration/fieldmap.py` — source-of-truth for physical field names

**Net new files:** 8 modules + 2 YAML configs + ~10 test files.

## 4. Components

### 4.1 The deriver contract

```python
# derivers/_base.py
class Deriver(Protocol):
    name: str           # e.g. "relationship"
    fields: list[str]   # CRM field names this deriver owns

    def applies_to(self, record: dict, persona: str, rt: str) -> bool:
        """Return False if this deriver shouldn't run for this row."""

    def derive(self, record: dict, persona: str, rt: str, rng: Random) -> dict[str, Any]:
        """Return desired field values. Caller null-filters and upserts."""
```

`persona` is one of `"retail" | "wealth" | "smb" | "commercial" | "household" | "unknown"` — derived from `External_ID__c` prefix (HYDRATE-RTL-*, HYDRATE-WLT-*, etc.) or from `RecordType.Name` for non-HYDRATE accounts.

### 4.2 The 7 derivers

| Deriver | Fields owned | How it derives |
|---|---|---|
| **`relationship.py`** | `FinServ__RelationshipStartDate__c`, `FinServ__LengthOfRelationship__c`, `FinServ__KYCDate__c`, `FinServ__KYCStatus__c`, `FinServ__NextReview__c`, `FinServ__LifetimeValue__c`, `FinServ__LastInteraction__c` (top-off) | RelationshipStart = `CreatedDate`. LengthOfRelationship = `(today - start).years`. KYCStatus weighted {Approved 90, Pending 8, Expired 2}. KYCDate = uniform(start, today). LifetimeValue = `AnnualIncome × tenureYears × 0.05`. NextReview = `today + 90d`. |
| **`credit_personal.py`** | `FinServ__CreditScore__c`, `FinServ__CreditRating__c` | FICO 300–850 sampled from a beta distribution centered at 720 keyed off `seeded_rng`. Rating bucketed: <580 Poor, <670 Fair, <740 Good, <800 Very Good, ≥800 Excellent. Person accounts only. |
| **`credit_bureau.py`** | DNB PAYDEX/Delinquency/Failure/Rating; Equifax Credit Risk/Failure/Payment Index; Experian Intelliscore/Risk Band; Fitch Category/Rating; INS_FEIN_Tax_ID | Business/Household/Entity/Partner RTs only. One latent "creditworthiness" 0–1 per account (seeded), translated to each bureau's scale: PAYDEX 1–100, Delinquency 101–670, Failure 1001–1610, Intelliscore 1–100, Equifax 101–992. FEIN = synthetic 9-digit deterministic. Higher AnnualRevenue → narrower variance, slightly higher mean. |
| **`profile.py`** | `Tier__c`, `FinServ__CustomerType__c`, `FinServ__Status__c`, `FinServ__ServiceModel__c`, `FinServ__NetWorth__c`, `FinServ__RiskTolerance__c`, `FinServ__TimeHorizon__c`, `FinServ__BorrowingHistory__c`, `FinServ__InvestmentExperience__c`, `FinServ__TotalRevenue__c` | Tier from AnnualIncome quintile (Bronze/Silver/Gold/Platinum/Diamond). CustomerType from RT. Status = "Active". ServiceModel from Tier. NetWorth = `TotalInvestments + TotalBankDeposits + TotalNonfinancialAssets - TotalLiabilities`. RiskTolerance from persona (Wealth → Aggressive; Retail → Moderate). TimeHorizon paired with RiskTolerance. |
| **`demographics.py`** | `FinServ__HomeOwnership__pc`, `FinServ__EmployedSince__pc`, `FinServ__TaxBracket__pc`, `FinServ__TaxId__pc`, `FinServ__LastFourDigitSSN__pc`, `FinServ__MotherMaidenName__pc`, `FinServ__NumberOfChildren__pc`, `PersonGender`, `PersonGenderIdentity`, `PersonPronouns`, `FinServ__Gender__pc`, `FinServ__LanguagesSpoken__pc`, `FinServ__CountryOfResidence__pc`, `FinServ__CommunicationPreferences__pc`, `FinServ__ContactPreference__pc`, `Cust360_Contact_Picture_URL__pc` | Person accounts only. HomeOwnership weighted {Own 0.65, Rent 0.30, Other 0.05}. EmployedSince = `today - rng(2,30)yrs`. TaxBracket from AnnualIncome. TaxId/LastFourDigitSSN: synthetic 9-digit/4-digit deterministic. MotherMaidenName from a curated 200-name list keyed off seed. NumberOfChildren weighted Poisson(λ=1.2). |
| **`addresses.py`** | `BillingLatitude/Longitude/GeocodeAccuracy`; `ShippingCity/State/Country/PostalCode/Street/Latitude/Longitude/GeocodeAccuracy`; `PersonMailingLatitude/Longitude/GeocodeAccuracy`; `PersonOtherCity/State/Country/PostalCode/Street/Phone/Latitude/Longitude/GeocodeAccuracy`; `Fax`; `FinServ__BillingAddress__pc`, `FinServ__MailingAddress__pc`, `FinServ__OtherAddress__pc`, `FinServ__ShippingAddress__pc` | If `Billing*` is populated, copy to `Shipping*`. PersonMailing usually populated → derive `PersonOther*` from a small US-city pool. Geocode lat/long synthesized within 0.05° of city centroid. `FinServ__*Address__pc` are formula/text summaries. Fax = synthetic phone keyed off seed. |
| **`contact.py`** | `MiddleName`, `PersonTitle`, `PersonAssistantName`, `PersonAssistantPhone`, `PersonDepartment`, `PersonLeadSource`, `Salutation`, `AccountNumber`, `NAICS_Code__c`, `Sic`, `SicDesc`, `Site`, `TickerSymbol`, `Jigsaw`, `JigsawCompanyId`, `Industry` (top-off), `Type`, `Rating`, `Description` (top-off) | MiddleName = single letter from name pool. PersonTitle persona-aware. AccountNumber = formatted external id. NAICS/SIC from a Cumulus-Bank industry mapping. TickerSymbol synthesized for Commercial RT. Jigsaw fields = empty stubs. |

### 4.3 Coverage rules — the partial-fields layer

`config/coverage_rules.yaml` encodes the "logical coverage" expectation for the 26 partial fields:

```yaml
- field: AnnualRevenue
  expected_when:
    record_type_in: [Business, Household, Entity, Partner]
  ignore_when:
    is_person_account: true
  fill_with: profile.derive_annual_revenue

- field: FinServ__RiskTolerance__c
  expected_when:
    persona_in: [wealth, smb_owner, commercial]
  fill_with: profile.derive_risk_tolerance

- field: FinServ__LastInteraction__c
  expected_when:
    record_type_not_in: [Household]
  fill_with: relationship.derive_last_interaction
```

`coverage_rules.apply(record, delta, registry, rng)` runs **after** the deriver layer and only adds entries to `delta` when `expected_when` matches and the field is still null after derivation.

### 4.4 Picklist value source

`config/backfill_picklists.yaml` holds value distributions:

```yaml
FinServ__KYCStatus__c:
  values: [Approved, Pending, Expired]
  weights: [0.90, 0.08, 0.02]

FinServ__HomeOwnership__pc:
  values: [Own, Rent, Other]
  weights: [0.65, 0.30, 0.05]

Tier__c:
  values: [Bronze, Silver, Gold, Platinum, Diamond]
  weights: [0.40, 0.30, 0.20, 0.08, 0.02]
```

Phase 0 preflight reads the actual picklist values from describe and **fails fast** if YAML lists a value the org doesn't accept.

### 4.5 Paired fields

```python
# derivers/_pairs.py
PAIRED_FIELDS = [
    ('FinServ__CreditScore__c', 'FinServ__CreditRating__c'),
    ('FinServ__RiskTolerance__c', 'FinServ__TimeHorizon__c'),
    ('FinServ__RiskTolerance__c', 'FinServ__InvestmentExperience__c'),
    ('Tier__c', 'FinServ__ServiceModel__c'),
    ('FinServ__CustomerType__c', 'FinServ__ClientCategory__c'),
    ('FinServ__RelationshipStartDate__c', 'FinServ__LengthOfRelationship__c'),
]
```

When any field in a pair is non-null, the deriver *reads* the existing value and *derives* the partner field from it deterministically. Only when both are null do we synthesize from rng.

### 4.6 CLI surface

```
python hydrate.py backfill-accounts \
    --target-org jdo-uqj0jr \
    [--persona retail,wealth,smb,commercial,household]   # filter by persona prefix
    [--record-type "FSC Person Accounts,Business"]       # filter by RT
    [--limit 1000]                                       # process at most N (testing)
    [--dry-run]                                          # diff only, no upsert
    [--skip-refresh-stream]                              # skip the DC stream trigger
    [--strict]                                           # any per-row failure → rc=2
    [--require-external-id]                              # skip rows without External_ID__c
    [--allow-production]                                 # required to run vs prod
```

## 5. Data flow

### 5.1 End-to-end pipeline

```
T0   preflight.describe(Account)
     verify backfill fields exist; load coverage_rules + picklists;
     verify picklist values ⊆ org picklist values; verify Account DC stream exists.

T1   Build SELECT clause from registry.all_fields() — ~110 columns
     (97 owned by derivers + ~13 read-only inputs: CreatedDate, AnnualRevenue,
      RecordType.Name, External_ID__c, IsPersonAccount, FinServ__Total*, etc.)

T2   Stream Account in chunks of 2000 via SOQL (not Bulk Query — column-count limits).

T3   For each record in chunk:
       persona = derive_persona(record)        # HYDRATE prefix or RT.Name
       rng     = seeded_rng(record.Id)         # deterministic
       candidates = {}
       for d in registry.derivers:             # 7 derivers
           if d.applies_to(record, persona, rt):
               candidates.update(d.derive(record, persona, rt, rng))
       delta = {f: v for f, v in candidates.items() if record.get(f) is None}
       coverage_rules.apply(record, delta, registry, rng)
       if delta:
           output_buffer.append({External_ID__c: ext_id_or_fallback, **delta})

T4   Flush output buffer to CSV (LF, sorted columns, UTF-8).

T5   Bulk API 2.0 upsert via External_ID__c.

T6   (Unless --skip-refresh-stream) phase5.data_cloud.refresh_stream(...)

T7   Write manifest.json + derivation_log.jsonl.

T8   Exit 0 (or rc=2 if --strict and any field-level errors).
```

**Total wall-clock: ~6–8 minutes** for a full 36,222-account backfill on `jdo-uqj0jr`.

### 5.2 Persona inference

```
External_ID__c.startswith('HYDRATE-RTL-')  → 'retail'
                          'HYDRATE-WLT-')  → 'wealth'
                          'HYDRATE-SMB-')  → 'smb'
                          'HYDRATE-COM-')  → 'commercial'
                          'HYDRATE-HH-')   → 'household'
otherwise:
    if IsPersonAccount → 'retail' (default for unknown person accounts)
    elif RecordType.Name in {'Business', 'Entity', 'Partner'} → 'commercial'
    elif RecordType.Name == 'Household' → 'household'
    else → 'unknown' (derivers fall back to defaults; logged in derivation_log)
```

### 5.3 External_ID__c fallback

Accounts without an `External_ID__c` (the org's pre-existing seed records) get a synthetic `BACKFILL-<Id>` stamped at upsert time. This gives stable handles for re-runs without polluting the HYDRATE-* namespace.

If `--require-external-id` is set, those rows are skipped instead and counted in `manifest.derivation.rows_skipped_no_external_id`.

### 5.4 CSV shape

Sparse columns are normal. Bulk API 2.0 treats blank cells as "don't update":

```csv
External_ID__c,FinServ__CreditScore__c,FinServ__CreditRating__c,FinServ__KYCStatus__c,FinServ__KYCDate__c,FinServ__RelationshipStartDate__c,FinServ__NetWorth__c,Tier__c,...
HYDRATE-RTL-000001,742,Good,Approved,2024-03-15,2023-06-12,127500.00,Silver,...
HYDRATE-RTL-000002,,Good,Approved,,,,,...
HYDRATE-WLT-000001,815,Excellent,,,,,Diamond,...
BACKFILL-001a000000xyz,,,,Approved,2025-11-01,,,...
```

### 5.5 Output directory

```
output/backfill-accounts-2026-05-26T2030/
├── manifest.json                     # run summary, per-field counts, errors
├── account_backfill.csv              # the upserted CSV
├── derivation_log.jsonl              # per-row: account_id, persona, fields_filled
├── bulk_job_<id>.log                 # Bulk API 2.0 job result
└── dc_refresh_run.json               # DC stream run id + initial status
```

### 5.6 Concurrency / re-run / resumability

- **Single-threaded by default.** Read-modify-write — parallelism risks lost-update.
- **Re-runs are no-ops** for any row where every field is now populated. The null-filter ensures this without a separate "skip if seen" check.
- **Crash recovery:** if Bulk job fails mid-load, re-running picks up where it left off.
- **`--limit`** is testing-only; `--offset` is not implemented in v1.

## 6. Error handling

### 6.1 Exit codes

| rc | Meaning |
|---|---|
| 0 | Clean run |
| 2 | Partial failure (Bulk per-row failures > 1%, or DC stream returned 412) |
| 3 | Bulk job hard failure |
| 4 | Schema picklist drift detected (preflight) |
| 5 | Production guardrail tripped |

`--strict` upgrades any non-zero per-row failure to rc=2 even if under the 1% threshold.

### 6.2 Error class table

| Class | Where it surfaces | Detection | Action |
|---|---|---|---|
| Schema drift — field renamed/removed | `preflight.describe(Account)` | Field listed in deriver but absent in describe | Drop column at preflight, log to manifest, continue |
| Schema drift — picklist values changed | preflight | YAML value not in describe's picklistValues | **Fail fast** — rc=4 |
| Persona inference fails | T3 derive_persona | RT.Name unknown + no HYDRATE prefix | persona='unknown'; derivers fall back to retail defaults; logged |
| Deriver raises exception | T3 inner loop | try/except per deriver | Log to errors list; row gets partial fill |
| Coverage rule expects field but no deriver produces it | T3 coverage_rules.apply | Lookup miss in registry.field_owner | Warn at startup; skip rule |
| Bulk API 2.0 returns 200 but per-row failures | T5 bulk_upsert | parse `failedResults.csv` | If failedRowPct > 1%, rc=2; save failed CSV |
| Bulk API 2.0 connection drop / 5xx | T5 | exception bubbles | Retry once (idempotent), then rc=3 |
| DC stream not found by name | T6 refresh_stream | 404 from `actions/run` | Skip with warning, rc unchanged |
| DC stream is `refreshMode: UPSERT` | T6 | 412 PRECONDITION_FAILED | Print `dc-stream-full-refresh-via-ui` skill invocation; don't fail run |
| No External_ID__c on row, --require-external-id set | T3 | record.External_ID__c is None | Skip row; manifest.skipped_no_external_id++ |
| Already-full row, zero deltas | T3 | empty candidates | Skip silently; manifest.skipped_already_full++ |
| Production-org guardrail tripped | startup | not `--allow-production` and target org id matches known prod | rc=5 before any query |

### 6.3 Address-block atomicity

Address blocks are atomic. Three-rule guard in `addresses.py`:

1. **All-or-nothing per address block.** `derive_shipping(record)` returns either all 9 ShippingX fields or none. Same for PersonMailing / PersonOther / Billing.
2. **Source-of-truth precedence.** If `BillingCity` is populated, `Shipping*` derives by *copying* from Billing. Only synthesize when Billing is also null.
3. **Geocode lat/long are atomic with the address.** Don't fill lat without long, or either without `GeocodeAccuracy='Address'`.

### 6.4 Coverage rule guards

- `expected_when` predicates are tested independently; each rule has at least one positive and one negative example.
- Coverage rule output goes through the same null-filter — rules can only *fill*, never overwrite.
- Manifest reports per-rule fill counts. A rule that filled 0 rows is a smell (either every record already has it, or the rule is wrong).

### 6.5 Manifest schema

```json
{
  "run_id": "backfill-accounts-2026-05-26T2030",
  "target_org": "jdo-uqj0jr",
  "started_at": "2026-05-26T20:30:11Z",
  "completed_at": "2026-05-26T20:36:42Z",
  "rc": 0,
  "phase_0": {
    "fields_described": 538,
    "fields_owned_by_derivers": 97,
    "schema_drift_dropped": [],
    "picklist_drift_failed": []
  },
  "query": {
    "chunks": 19,
    "rows_queried": 36222,
    "filter": {"persona": null, "record_type": null}
  },
  "derivation": {
    "rows_with_deltas": 35987,
    "rows_skipped_already_full": 235,
    "rows_skipped_no_external_id": 0,
    "rows_with_deriver_errors": 0,
    "per_field_fill_counts": {
      "FinServ__CreditScore__c": 25316,
      "FinServ__KYCStatus__c": 36087,
      "FinServ__RelationshipStartDate__c": 36222
    },
    "per_persona_counts": {
      "retail": 21000, "wealth": 4000, "smb": 3000,
      "commercial": 1500, "household": 5095, "unknown": 392
    },
    "per_rule_fill_counts": {
      "AnnualRevenue": 0,
      "FinServ__RiskTolerance__c": 412
    }
  },
  "bulk_load": {
    "job_id": "750xx0000004ABC",
    "rows_attempted": 35987,
    "rows_succeeded": 35987,
    "rows_failed": 0,
    "duration_sec": 142
  },
  "dc_refresh": {
    "stream_name": "Account_jdo",
    "trigger_status": "queued",
    "run_id": "07Lxx00000004XY",
    "trigger_response_code": 200
  },
  "errors": []
}
```

## 7. Testing strategy

### 7.1 Test pyramid

```
                ┌────────────────────────────────┐
                │   1 live-org smoke test         │  manual, gated by env var
                │   (full CLI run on jdo-uqj0jr)  │
                ├────────────────────────────────┤
                │   ~12 integration tests          │  pytest with org-response fixtures
                │   (orchestrator + loader wiring) │
                ├────────────────────────────────┤
                │   ~80 unit tests                 │  pytest, pure-function level
                │   (derivers + coverage rules)    │
                └──────────────────────────────────┘
                Target: ~92 new tests → suite goes from 527 to ~620
```

### 7.2 Unit tests — per deriver

| Deriver | Tests | Focus |
|---|---:|---|
| `relationship.py` | 12 | RelationshipStart from CreatedDate; LengthOfRelationship math; KYC weight distribution; LifetimeValue formula; NextReview = today+90 |
| `credit_personal.py` | 10 | FICO range; rating bands; paired-fill from existing score; persona-aware variance; person-only gating |
| `credit_bureau.py` | 14 | All 11 bureau fields produced together; correlations between PAYDEX/Delinquency/Failure; AnnualRevenue band → variance; FEIN format; business-only gating |
| `profile.py` | 14 | Tier from income quintile; ServiceModel paired with Tier; NetWorth = sum-of-rollups math; RiskTolerance per-persona distribution; TotalRevenue derivation |
| `demographics.py` | 12 | Person-only gating; HomeOwnership weights; TaxBracket from income; SSN/TaxId determinism; pronouns/gender consistency |
| `addresses.py` | 10 | All-or-nothing per address block; copy-from-Billing-to-Shipping; geocode lat/long range; PersonOther synth from city pool; atomicity guard |
| `contact.py` | 8 | NAICS/SIC mapping by Industry; ticker only for commercial; AccountNumber format; Industry top-off |

Each deriver test asserts:

- **Determinism:** `derive(r, ..., seeded_rng(r.Id))` returns equal values across two calls.
- **Range:** numeric outputs fall in valid band.
- **Gating:** `applies_to` returns False for off-persona records.
- **Paired-fill consistency:** when one field of a pair is populated, the partner derives from the existing value.

### 7.3 Unit tests — coverage rules

`tests/test_coverage_rules.py` — every YAML rule gets a positive and negative case. ~26 rules × 2 cases compressed into ~15 parameterized test functions.

### 7.4 Integration tests — orchestrator + loader

`tests/test_backfill_accounts.py`:

| Test | Verifies |
|---|---|
| `test_full_run_writes_csv_and_calls_bulk_upsert` | End-to-end: SOQL stub → CSV produced → bulk_upsert called |
| `test_dry_run_skips_bulk_upsert` | `--dry-run` builds CSV + manifest but never calls loader |
| `test_persona_filter_narrows_query` | `--persona retail` → SOQL contains `WHERE External_ID__c LIKE 'HYDRATE-RTL-%'` |
| `test_record_type_filter_narrows_query` | `--record-type Business` → SOQL contains the RT filter |
| `test_skip_already_full_rows_not_in_csv` | Records with no nulls produce 0-row CSV |
| `test_paired_field_uses_existing_value` | Record with CreditScore=720 + null Rating → derived Rating='Good' |
| `test_schema_drift_drops_field_at_preflight` | If describe lacks `Tier__c`, it's dropped from SELECT and from output |
| `test_picklist_drift_fails_fast` | YAML has KYCStatus value 'Unknown' not in describe → rc=4 |
| `test_bulk_partial_failure_exits_rc_2` | failedRowPct=2% → rc=2; failed CSV saved |
| `test_dc_stream_412_does_not_fail_run` | `actions/run` → 412 → log warning, rc unchanged |
| `test_production_guard_blocks_run_without_flag` | target org id matches prod → rc=5 before query |
| `test_manifest_per_field_counts_match_csv` | Sum of per_field_fill_counts == cells in CSV |

### 7.5 Determinism tests

`tests/test_backfill_idempotency.py`:

- `test_two_runs_produce_identical_csv` — first run writes CSV; mock-org applies it; second run produces empty CSV.
- `test_third_run_with_partial_manual_edit_does_not_overwrite` — user edits CreditScore on one account → re-run leaves it alone.

### 7.6 Live-org smoke test

`tests/test_live_smoke.py` — gated by `RUN_LIVE_TESTS=1`. CI skips it.

1. **Dry-run on jdo-uqj0jr** — proves describe + SOQL parse without crashing.
2. **Apply with `--limit 50`** — proves bulk job + DC refresh round-trip.

### 7.7 Out-of-scope for tests

- Statistical realism of synthetic distributions — tests assert range and determinism, not fidelity.
- Real DC stream ingest correctness — that's `dc-status`'s job.
- Cross-deriver semantic consistency beyond paired-fields.

## 8. Acceptance criteria

Phase 4 ships when:

- [ ] `python hydrate.py backfill-accounts --target-org jdo-uqj0jr --dry-run` runs to completion with rc=0 and produces a non-empty diff.
- [ ] `python hydrate.py backfill-accounts --target-org jdo-uqj0jr` (full run) populates the 101 empty fields across all 36,222 accounts, exits rc=0, and triggers the Account DC stream refresh.
- [ ] All 26 partial fields have logical-coverage rules; manifest shows per-rule fill counts.
- [ ] All paired fields are consistent (no contradictory CreditScore + CreditRating pairs).
- [ ] Re-running with no manual edits produces an empty CSV and rc=0.
- [ ] Re-running after a manual edit on one row leaves that row untouched.
- [ ] ~92 new tests pass; total suite green.
- [ ] AGENTS.md updated with the new CLI subcommand and a "Things that bite" entry for any non-obvious org-specific behavior surfaced during build.
- [ ] README updated with Phase 4 status badge and quick-start.
- [ ] A re-run of the audit (`python3 -c "..."` from `output/account-audit-2026-05-26/`) shows the 101 fields move from <5% to ≥95% populated.

## 9. Open questions for v1.1+

- The 2 fields not found in the CRM Account schema (`Equifax_Failure_Score_c__c`, `SfdcOrganizationId__c`) — verify and potentially add a single-field deriver.
- Apex post-load batch alternative for fields where Python derivation is awkward (e.g., true rollups that benefit from FSC's Group Builder).
- Multi-org backfill — extend to `jdo-fw51xz` and `jdo-new-mga6cl` after first run on `jdo-uqj0jr`.
- A `--report-only` mode that re-runs the original audit's COUNT-per-field aggregates and emits the post-backfill REPORT.md without doing any writes.

## 10. References

- `output/account-audit-2026-05-26/REPORT.md` — the audit that motivated this phase.
- `output/account-audit-2026-05-26/dmo_field_map.json` — DMO ↔ CRM cross-reference.
- `customer_hydration/mirror_life_events.py` — Phase 3c read-modify-write reference implementation.
- `customer_hydration/phase5/data_cloud.py` — DC stream refresh primitives.
- `docs/IDEMPOTENCY.md` — HYDRATE-* namespace contract.
- `AGENTS.md` notes 6, 12, 13, 18 — restrictive picklists, read-only rollups, DMO field naming, UPSERT-mode stream refresh.
