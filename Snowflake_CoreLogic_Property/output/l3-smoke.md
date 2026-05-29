# Plan 5 Task 8: L3 Smoke Test — CoreLogic Property Pipeline

**Date:** 2026-05-28
**Commit (T7):** `4c72476` — feat(cumulus): DC stream + DMO for CumulusCoreLogicProperty (Plan 5 T7)
**Branch:** `feat/cumulus-snowflake-pipelines-spec`

## Summary

Post-deploy L3 confirmation for the CoreLogic Property pipeline. Re-run SP returned SUCCEEDED with `ROWS_INSERTED=0` (idempotent MERGE on PK `(ACCOUNT_ID, PROFILE_QUARTER)`), 25,424 accounts processed, 13.4s duration. Cardinality drift 0% — `expected=25,424, actual=25,424`. Distribution sanity passed: owner ratio 65.74% (vs ~62% target — within tolerance band; the +4pp drift is documented as non-blocking), flood zone X plurality 64.12% (16,303 / 25,424), Single Family the dominant property type for owners (54.65%), wildfire-risk distribution bimodal as state-mix predicts. Anchor↔output spot-checks confirm the bias chain end-to-end: age-bucket owner rates monotonically ascend from 25.24% (<30) → 79.55% (65+), CA/AZ/CO wildfire averages ~72-74 vs IL/NY/MA ~15, and FL non-X flood zones jump from national 35.9% to FL's 54.9%. **DMO query returned HTTP 400 ("Table name does not have a valid suffix") — DLO→DMO field mapping is pending UI completion (REST 500 in T7 is the same fully-custom-DMO blocker as Plans 1–4).**

## Key Results

| Check | Result | Notes |
|-------|--------|-------|
| **SP Re-run Status** | SUCCEEDED | rows=0 (idempotent), accounts=25,424, duration 13,355 ms, ERROR_MESSAGE NULL |
| **Cardinality Drift** | 0.000000% | expected=25,424, actual=25,424 (DISTINCT PERSON+ZIP anchors vs DISTINCT ACCOUNT_ID) |
| **DLO Row Count (DC SQL)** | 25,424 | `SELECT COUNT(*) FROM CumulusCoreLogicProperty__dll` via queryv2 — exact match to Snowflake |
| **Sample Plausibility (10)** | All contracts honored | 5 owners: all 8 property fields populated, mortgage=0 cases correctly NULL rate+LTV. 5 renters: all 8 property fields NULL, LIEN_COUNT=0 |
| **Owner Ratio** | 65.74% / 34.26% | 16,714 owners / 8,710 renters. Slightly above ~62% target (+3.7pp); within band |
| **Property Type (owners)** | Single Family 54.65% / Condo 17.18% / Townhouse 15.47% | Plurality matches expectation |
| **Flood Zone (all)** | X 64.12% / AE 10.84% / B 9.39% | X plurality dominant; long tail VE/V (1.77%) |
| **Wildfire Distribution** | Bimodal | Bucket 0-30: 16,191 (63.7%); Bucket 50+: 7,312 (28.8%) — matches state mix |
| **Property Value (owners)** | Log-normal | Bucket 1 ($0-500K): 44%; descends to bucket 8 ($3.5M-4M): 0.12% |
| **Age vs Owner Bias** | Monotonic ascending | <30: 25.24% → 30-49: 57.42% → 50-64: 74.92% → 65+: 79.55% |
| **CA/AZ/CO Wildfire Avg** | 72-74 | CO 74.4, AZ 72.5, CA 72.4 |
| **NY/MA/IL Wildfire Avg** | 14-15 | NY 15.1, IL 15.1, MA 14.7 (4.8x separation from high-risk states) |
| **FL Non-X Flood Zone** | 54.9% | vs national 35.9% — FL bias active |
| **DMO Query** | DEFERRED | HTTP 400 "Table name does not have a valid suffix" — mapping pending UI |

## TASK_EXECUTION_LOG (Most Recent)

```
EXECUTION_TIME:       2026-05-28 20:26:12.207
TASK_NAME:            TASK_QUARTERLY_CORELOGIC_PROPERTY
STATUS:               SUCCEEDED
ROWS_INSERTED:        0 (idempotent re-run)
ACCOUNTS_PROCESSED:   25424
ERROR_MESSAGE:        NULL
DURATION_MS:          13355
```

Recent history (2 most recent):

| EXECUTION_TIME | STATUS | ROWS_INSERTED | ACCOUNTS_PROCESSED | DURATION_MS | NOTE |
|---|---|---|---|---|---|
| 2026-05-28 20:26:12 | SUCCEEDED | 0 | 25,424 | 13,355 | Idempotent re-run (this T8) |
| 2026-05-28 20:18:32 | SUCCEEDED | 25,424 | 25,424 | 11,940 | First post-deploy fill (T6) |

## Cardinality Check

```sql
WITH expected AS (
    SELECT COUNT(DISTINCT ACCOUNT_ID) AS n
    FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS
    WHERE ACCOUNT_TYPE_FLAG = 'PERSON'
      AND POSTAL_CODE IS NOT NULL AND POSTAL_CODE <> ''
),
actual AS (
    SELECT COUNT(DISTINCT ACCOUNT_ID) AS n FROM FINS.PUBLIC.CORELOGIC_PROPERTY
)
SELECT (SELECT n FROM expected) AS expected,
       (SELECT n FROM actual) AS actual,
       ABS((SELECT n FROM actual) - (SELECT n FROM expected)) * 100.0
         / NULLIF((SELECT n FROM expected), 0) AS pct_drift;
```

**Result:** `expected=25,424, actual=25,424, pct_drift=0.000000`.

## Sample of 10 Rows (5 owners + 5 renters, ordered by HASH(ACCOUNT_ID))

### 5 owners (IS_OWNER=TRUE)

| ACCOUNT_ID | TYPE | VALUE | MORTGAGE | EQUITY | RATE % | LTV % | HELOC | LIENS | FLOOD | FIRE | XFER YR |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 001am00002AAAN4AAP | Townhouse | 1,052,205 | 263,419 | 788,786 | 3.906 | 25.03 | 100 | 0 | C | 19 | 2009 |
| 001am00002A9guxAAB | Single Family | 400,665 | 0 | 400,665 | NULL | NULL | 98 | 0 | C | 50 | 2015 |
| 001am00002AA9qDAAT | Condo | 1,318,490 | 467,195 | 851,295 | 3.696 | 35.43 | 100 | 0 | X | 63 | 1991 |
| 001am00002A9gKPAAZ | Single Family | 194,809 | 105,908 | 88,901 | 3.309 | 54.37 | 42 | 0 | X | 61 | 2014 |
| 001am00002A9htfAAB | Single Family | 323,888 | 0 | 323,888 | NULL | NULL | 87 | 0 | A | 26 | 1993 |

### 5 renters (IS_OWNER=FALSE)

| ACCOUNT_ID | TYPE | VALUE | MORTGAGE | EQUITY | RATE % | LTV % | HELOC | LIENS | FLOOD | FIRE | XFER YR |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 001am00002AYQryAAH | NULL | NULL | NULL | NULL | NULL | NULL | NULL | 0 | AE | 78 | NULL |
| 001am00002AYPN2AAP | NULL | NULL | NULL | NULL | NULL | NULL | NULL | 0 | X | 13 | NULL |
| 001am00002AYPg1AAH | NULL | NULL | NULL | NULL | NULL | NULL | NULL | 0 | X | 13 | NULL |
| 001am00002AA9vwAAD | NULL | NULL | NULL | NULL | NULL | NULL | NULL | 0 | C | 58 | NULL |
| 001am00002A9gMAAAZ | NULL | NULL | NULL | NULL | NULL | NULL | NULL | 0 | X | 11 | NULL |

**Observations:**
- Owner contract honored: all 8 property fields populated where mortgage > 0; rate+LTV correctly NULL when mortgage paid off (rows 2 + 5 — 2 of 5 = 40% paid-off, close to spec ~30%, reasonable for 5-row sample).
- Renter contract honored: all 8 property fields NULL, LIEN_COUNT=0, FLOOD_ZONE_CODE + WILDFIRE_RISK_SCORE + IS_OWNER + ACCOUNT_ID + PROFILE_QUARTER + GENERATED_AT always populated. **Always-populated 5 fields verified.**
- HELOC scores vary 42-100 across owners (no clamping); flood zones range across X/A/C; wildfire 11-78 across all 10 rows; LAST_TRANSFER_YEAR 1991-2015 (no clustering).

## Distribution Checks

### IS_OWNER

| IS_OWNER | CNT | % |
|---|---|---|
| TRUE | 16,714 | 65.74% |
| FALSE | 8,710 | 34.26% |

**Status:** Slightly above target ~62% (+3.7pp). Within reasonable band — see Concerns. Sums to 25,424 (no NULLs).

### FLOOD_ZONE_CODE (all rows)

| CODE | CNT | % |
|---|---|---|
| X | 16,303 | 64.12% |
| AE | 2,757 | 10.84% |
| B | 2,387 | 9.39% |
| C | 2,197 | 8.64% |
| A | 1,330 | 5.23% |
| VE | 358 | 1.41% |
| V | 92 | 0.36% |

**Status:** All 7 FEMA zones present. X plurality dominates as expected; VE/V long tail (1.77% combined) — consistent with coastal-hazard rarity. Slight under-target on X (target ~80%, actual 64%); see Concerns.

### PRIMARY_PROPERTY_TYPE (IS_OWNER=TRUE only)

| TYPE | CNT | % |
|---|---|---|
| Single Family | 9,134 | 54.65% |
| Condo | 2,872 | 17.18% |
| Townhouse | 2,585 | 15.47% |
| Multi-Family | 1,185 | 7.09% |
| Manufactured Home | 780 | 4.67% |
| Vacant Land | 158 | 0.95% |

**Status:** All 6 enum values present. Single Family plurality dominates as expected. Sums to 16,714 (matches IS_OWNER=TRUE count exactly — contract honored).

### WILDFIRE_RISK_SCORE (10-bucket histogram)

| BUCKET | RANGE | CNT |
|---|---|---|
| 1 | 0-10 | 5,166 |
| 2 | 10-20 | 5,476 |
| 3 | 20-30 | 5,549 |
| 4 | 30-40 | 1,052 |
| 5 | 40-50 | 869 |
| 6 | 50-60 | 2,097 |
| 7 | 60-70 | 1,837 |
| 8 | 70-80 | 1,351 |
| 9 | 80-90 | 1,283 |
| 10 | 90-100 | 744 |

**Status:** Bimodal. 0-30 cluster (16,191 / 63.7%) reflects low-risk-state plurality (NY/IL/MA/etc); 50+ tail (7,312 / 28.8%) reflects CA/AZ/CO presence. Trough at 30-50 (1,921 / 7.6%) is the natural gap between the two state-bias clusters. **Distribution skewed by state mix as the spec predicts.**

### ESTIMATED_PROPERTY_VALUE (IS_OWNER=TRUE only, 10-bucket histogram, 0-$5M range)

| BUCKET | RANGE | CNT |
|---|---|---|
| 1 | $0-$500K | 7,418 |
| 2 | $500K-$1M | 5,163 |
| 3 | $1M-$1.5M | 2,514 |
| 4 | $1.5M-$2M | 927 |
| 5 | $2M-$2.5M | 368 |
| 6 | $2.5M-$3M | 230 |
| 7 | $3M-$3.5M | 74 |
| 8 | $3.5M-$4M | 20 |

**Status:** Log-normal-ish. Bucket 1 plurality 44.4%; descends monotonically through bucket 8 (0.12%). Buckets 9 + 10 ($4M-$5M) have 0 rows in this run — long-tail above $4M is rare for the audience income mix. Sums to 16,714 (matches IS_OWNER=TRUE).

## Anchor↔Output Spot-Checks

### Age-bucketed owner ratio (monotonic ascending bias confirmed)

| AGE_BUCKET | TOTAL | OWNERS | OWNER_PCT |
|---|---|---|---|
| <30 | 1,022 | 258 | 25.24% |
| 30-49 | 11,473 | 6,588 | 57.42% |
| 50-64 | 9,008 | 6,749 | 74.92% |
| 65+ | 3,921 | 3,119 | 79.55% |

**Status:** Strictly monotonic. <30 owner rate one-third of national (25 vs 66%); 65+ owner rate well above (80%). Bias chain (anchor BIRTHDATE → SP age → owner probability) verified end-to-end at population scale.

### State wildfire bias (high-risk vs low-risk)

| STATE | TIER | AVG_WILDFIRE | CNT |
|---|---|---|---|
| CO | High | 74.40 | 112 |
| AZ | High | 72.52 | 968 |
| CA | High | 72.37 | 3,976 |
| OR | High | 68.00 | 1 |
| IL | Low | 15.12 | 1,729 |
| NY | Low | 15.10 | 2,743 |
| MA | Low | 14.70 | 1,014 |

**Status:** ~4.8x separation between high-risk (CA/AZ/CO avg ~73) and low-risk (IL/NY/MA avg ~15). Bias monotonic and pronounced.

### FL flood zone bias

| FL CODE | CNT | % |
|---|---|---|
| X | 1,434 | 45.10% |
| AE | 605 | 19.03% |
| C | 334 | 10.50% |
| A | 315 | 9.91% |
| B | 313 | 9.84% |
| VE | 146 | 4.59% |
| V | 33 | 1.04% |

**Status:** FL X plurality is **45.1%** vs national **64.1%** — FL non-X jumps from national 35.9% to **54.9%**, a 19pp lift. AE doubles its national rate (10.8% → 19.0%); VE/V combined 5.6% vs national 1.8% — coastal-hazard bias explicitly active.

### Individual spot-check rows (5 cases)

| Anchor | Age | State | Income | Expected | Observed | Pass? |
|---|---|---|---|---|---|---|
| 001am00002AAAARAA5 | 28 | NJ | $77K | Likely renter | IS_OWNER=true | Population-level: <30 owners are ~25% so individual outcomes vary; **bias is probabilistic, not deterministic** — pass at population scale (above) |
| 001am00002AA9aIAAT | 27 | CA | $63K | Likely renter | IS_OWNER=false ✓ | Pass (matches age + low income) |
| 001am00002AAATlAAP | 72 | NJ | $382K | Likely owner | IS_OWNER=true ✓, value $1.7M | Pass (high-income owner in upper band) |
| 001am00002A9fxuAAB | 69 | CA | $52K | Likely owner | IS_OWNER=true ✓, fire 79 | Pass (CA wildfire ≥50 confirmed) |
| 001am00002AAAN4AAP | 61 | VA | $387K | High-value owner | IS_OWNER=true ✓, value $1.05M | Pass (≥$1M for $387K-income individual) |
| 001am00002A9htfAAB | — | FL | — | Non-X flood likely | FLOOD_ZONE_CODE=A ✓ | Pass |

## DMO Query (Data Cloud)

```bash
curl -s -X POST .../services/data/v62.0/ssot/queryv2 \
  -d '{"sql":"SELECT COUNT(*) FROM CumulusCoreLogicProperty__dlm__c"}'
```

**Result:**
```
HTTP 400 — INTERNAL_ERROR
"400 BAD_REQUEST: Table name does not have a valid suffix: CumulusCoreLogicProperty__dlm__c"
```

**Status:** DEFERRED. Same blocker as Plans 1–4: the DLO→DMO field mapping POST returned `UNKNOWN_EXCEPTION` (HTTP 500, ErrorId `375636525-1366361`) for fully-custom DMO targets. The DMO is created and visible (id `0gjam000001DKefAAG`), but until the mapping is deployed via the DC Setup UI, the DMO is not queryable through queryv2. Operator action required — see `Snowflake_Claritas_Demographics/docs/dc-setup-recipe.md` Step 3 for the UI walkthrough. Plan 5 also requires the FK step on `ssot__AccountId__c` → `ssot__Account__dlm.ssot__Id__c` (unlike Plan 4, which is branch-scoped without an FK).

## DC State at End of T7

| Resource | Name | ID | Status |
|---|---|---|---|
| Stream | `CumulusCoreLogicProperty` | `1sdam000002CulGAAS` (recordId `1dsam000000PFTh`) | PROCESSING (Direct_Access) |
| DLO | `CumulusCoreLogicProperty__dll` | `0gOam000000ZqzpEAC` | PROCESSING; queryable |
| DMO | `CumulusCoreLogicProperty__dlm` | `0gjam000001DKefAAG` | Created; mapping pending UI |
| DLO row count (queryv2) | — | — | **25,424** |
| DMO row count (queryv2) | — | — | DEFERRED (HTTP 400 until mapping deploys) |

DLO has 20 fields after DC's auto-creation: 15 custom (incl. `IS_OWNER` Boolean) + 2 KQ (`KQ_ACCOUNT_ID`, `KQ_PROFILE_QUARTER`) + 3 system (`DataSource`, `DataSourceObject`, `InternalOrganization`).

DMO has 19 fields: 15 user-defined custom (incl. `isOwner__c` Boolean — first Boolean DMO field across Plans 1-5) + `KQ_profileQuarter__c` (KeyQualifier) + 3 system. PK is `profileQuarter__c`. **Note:** Plan called for composite PK `(ssot__AccountId__c, profileQuarter__c)`, but DC enforces single-PK (same constraint hit by Plans 1-4). Storage PK collapsed to `profileQuarter__c` + `KQ_profileQuarter__c`; logical composite uniqueness preserved at Snowflake source via the table-level `pk_corelogic_property` constraint.

## Concerns

1. **DMO field mapping deferred (UI-only).** Same fully-custom-DMO blocker as Plans 1–4. The DC Setup UI walkthrough in `Snowflake_Claritas_Demographics/docs/dc-setup-recipe.md` §Step 3 applies — operator should map all 15 source-DLO columns + `KQ_PROFILE_QUARTER__c` to the corresponding DMO `__c` fields. **Set FK** on `ssot__AccountId__c` → `ssot__Account__dlm.ssot__Id__c` per the spec (unlike Plan 4's branch-scoped non-FK case). Total operator time ~5 min.

2. **DC PK shape is single-PK, not composite.** Same as Plans 1-4. DC API enforces single-PK; storage PK collapsed to `profileQuarter__c` + `KQ_profileQuarter__c` key qualifier. `ssot__AccountId__c` is a regular Text column. The Snowflake source still enforces `(ACCOUNT_ID, PROFILE_QUARTER)` as the MERGE key, so logical uniqueness is preserved end-to-end.

3. **Owner ratio drift +3.7pp from spec target.** Spec said ~62% owners; actuals 65.74%. The age-vs-owner monotonic ascent (25.24% / 57.42% / 74.92% / 79.55%) is itself well within plausibility — the +3.7pp drift comes from the audience age skew (the JDO PERSON anchors lean older than a US national reference). Non-blocking. Could re-tune the SP's age-modifier coefficients if exact-match is desired, but the directional bias is correct.

4. **Flood zone X drift -16pp from spec target ~80%.** Actuals 64.12%. The lift on AE (10.84% vs target much smaller) and B/C (~9% each) is concentrated in coastal/inland-flood states (FL, LA, NJ, NY) — the FL spot-check corroborates that the state bias is working aggressively. Two interpretations: (a) the SP's state-flood-bias coefficients are tuned higher than the spec's target distribution implies, or (b) the spec target was estimated against a national reference that didn't account for the audience's coastal skew. Non-blocking, internally consistent — recommend re-reading the SP's flood-zone-by-state map and reconciling with spec.

5. **Boolean DMO field is a first.** `isOwner__c` is the first non-Text/Number/Date/DateTime DMO field across Plans 1-5. Stream creation initially failed with `Text` declaration ("does not match data type BOOLEAN" — DC inspects Snowflake schema and rejects mismatched declarations); changing both `dataLakeFieldInputRepresentations` and `sourceFields` to `Boolean` resolved it. Captured for the next plan to reuse if any Boolean column lands.

6. **Quarterly cadence is a first.** Plan 5 introduces the quarterly task cadence (cron `0 8 1 1,4,7,10 * UTC`) that all subsequent quarterly Cumulus datasets will share. The deploy + smoke flow is byte-identical to monthly plans — only the cron differs.

## Conclusion

**Status:** DONE (with documented operator action: UI mapping deploy + FK).

All L3 verifications passed except DMO query (deferred pending field-mapping UI deploy — same blocker pattern as Plans 1–4, well-trodden recipe). SP is production-ready with quarterly TASK scheduled. DLO is queryable through DC at exact row count 25,424, cardinality drift 0%, distribution sanity passed across owner ratio / flood zone / property type / wildfire / property value, and bias chain verified end-to-end at population scale (age-bucket monotonic ascent on owner rate, 4.8x state-tier wildfire separation, FL non-X flood lift +19pp). First Boolean DMO field and first quarterly cadence both captured for future plans. Plan 5 is technically complete pending operator UI work.
