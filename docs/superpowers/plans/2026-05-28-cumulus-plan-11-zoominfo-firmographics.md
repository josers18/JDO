# Cumulus Plan 11 — ZoomInfo Firmographics Implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Stand up the eleventh per-dataset Cumulus pipeline — ZoomInfo-style B2B firmographics per BUSINESS account. BUSINESS-only audience. Monthly cadence. SP emits one row per BUSINESS account per month into `FINS.PUBLIC.ZOOMINFO_FIRMOGRAPHICS` (~12,021 rows), federated as `CumulusZoomInfoFirmographics__dlm`.

**Architecture:** Instantiates the dataset template (v1.5) — structurally identical to Plan 2 (MSCI ESG) and Plan 3 (D&B Business Credit). Two minor structural deviations from those Plans, both inherited from Plan 4's v1.5 string-quality findings (defensive HQ-string projection; two NULLable columns gated by data-availability heuristics rather than enums).

**Depends on:** Plan 0. Per the manifest dependency graph, Plan 11 also waits behind Plan 9 (Synth Relationship Graph) on the ship calendar — but no metadata is shared, so this plan is implementable independently.

---

## §1 Placeholder values

| Placeholder | Value |
|---|---|
| `<<PLAN_N>>` | `11` |
| `<<DATASET_SLUG>>` | `zoominfo-firmographics` |
| `<<DATASET_SLUG_UNDERSCORE>>` | `zoominfo_firmographics` |
| `<<MIMICS_VENDOR>>` | `ZoomInfo` |
| `<<DATASET_TABLE>>` | `ZOOMINFO_FIRMOGRAPHICS` |
| `<<DATASET_TABLE_LOWER>>` | `zoominfo_firmographics` |
| `<<REPO_DIR>>` | `Snowflake_ZoomInfo_Firmographics` |
| `<<DC_DMO>>` | `CumulusZoomInfoFirmographics__dlm` |
| `<<DATASET_SALT>>` | `zoominfo` |
| `<<CADENCE>>` | `MONTHLY` |
| `<<TASK_NAME>>` | `TASK_MONTHLY_ZOOMINFO_FIRMOGRAPHICS` |
| `<<TASK_NAME_LOWER>>` | `task_monthly_zoominfo_firmographics` |
| `<<SP_NAME>>` | `SP_GENERATE_ZOOMINFO_FIRMOGRAPHICS` |
| `<<CRON>>` | `'USING CRON 0 7 1 * * UTC'` |
| `<<AUDIENCE_PREDICATE>>` | `ACCOUNT_TYPE_FLAG = 'BUSINESS'` |
| `<<COVERAGE_RULE>>` | rows = audience (1:1 monthly per BUSINESS account) |
| `<<ROW_PK>>` | `(ACCOUNT_ID, PROFILE_MONTH)` |
| `<<COLUMN_LIST>>` | See rowspec — 14 columns including 2 NULLable (WEBSITE_DOMAIN, TECH_STACK_FLAGS) |

## §2 Audience-predicate probe

`ACCOUNT_TYPE_FLAG = 'BUSINESS'` — same predicate as Plans 2 (MSCI) and 3 (D&B).

**Live cardinality (probed 2026-05-28):** 12,021 distinct BUSINESS anchors. INDUSTRY, ANNUAL_REVENUE, EMPLOYEE_COUNT all populated for the BUSINESS cohort. POSTAL_CODE / STATE_CODE / COUNTRY_CODE present but with the empty-string + dirty-literal drift discovered in Plan 4 (see §4 below).

**BUSINESS over-count caveat (spec §3 v1.2 finding #3):** real CRM BUSINESS cardinality is closer to 5K — the 12,021 includes ~7K Person Accounts misclassified by the `PersonBirthdate__c IS NULL → BUSINESS` heuristic. The SP must warn (not fail) when `accounts_processed > 10000`, identical to Plans 2 and 3. Long-term fix is upstream backfill, not view-layer change.

**Volume parity:**
- Plan 2 (MSCI ESG): 11,389 rows
- Plan 3 (D&B Business Credit): 11,389 rows
- Plan 11 (this one): 12,021 rows — same scale; the small delta vs Plans 2/3 reflects an audience snapshot that captured slightly more BUSINESS-misclassified rows.

## §3 Rowspec attachment

`docs/superpowers/plans/attachments/cumulus-plan-11-zoominfo-firmographics-rowspec.md`

Contains:
- 14-column table DDL inputs (12 NOT NULL + 2 NULLable: WEBSITE_DOMAIN, TECH_STACK_FLAGS)
- PK `(ACCOUNT_ID, PROFILE_MONTH)`
- 7-bucket EMPLOYEE_BAND ladder (1-10 / 11-50 / 51-200 / 201-1000 / 1001-5000 / 5001-25000 / 25001+)
- 6-bucket REVENUE_BAND ladder (<$1M / $1M-$10M / $10M-$50M / $50M-$200M / $200M-$1B / $1B+)
- INDUSTRY → NAICS / SIC mapping table (10 entries covering V_ACCOUNT_ANCHORS' BUSINESS industries + an unclassified default)
- FOUNDED_YEAR industry-bias table
- LINKEDIN_FOLLOWERS employee-band-bias table
- TECH_STACK_FLAGS industry-biased pool (12 indicators)
- Defensive HQ-string projection (literal `'US'`, ZIP synth-fallback, STATE-from-ZIP fallback)
- WEBSITE_DOMAIN synthesis from ACCOUNT_NAME
- L1 anchor-influence test targets (5 properties: per-anchor consistency, ranges, vocabularies, defensive-string invariants, schema contract)

## §4 What changes from the v1.5 template

Plan 11 is the **most "boring" Plan structurally** in the rollout — same audience predicate as Plans 2 + 3, same monthly cadence, same 1:1 row shape, same MERGE pattern. Only TWO structural deviations from the canonical template, both inherited from prior plans:

1. **Defensive string handling (per Plan 4 v1.5 findings).** Three V_ACCOUNT_ANCHORS string columns require defensive projection in the SP — none can be passed through raw:
   - `COUNTRY_CODE` — 4 rows carry `'USA'` / `'United States'` literals instead of canonical `'US'` (v1.5 finding #5). The SP projects the literal `'US'` regardless of source value, identical to Plan 4's approach. The `HQ_COUNTRY_CODE VARCHAR(2)` DDL would otherwise fail to insert dirty-literal rows.
   - `POSTAL_CODE` — 10,798 empty-string rows (v1.5 finding #4). The SP synth-fallbacks to a deterministic 5-digit ZIP from the seed bytes when raw is empty, guaranteeing every row carries a non-empty `HQ_POSTAL_CODE`.
   - `STATE_CODE` — same empty-string drift as POSTAL_CODE. The SP fallbacks via a `_state_from_zip` helper (10-entry ZIP-first-digit → state mapping) when raw is blank, guaranteeing `len(HQ_STATE_CODE) == 2`.

   The L1 tests assert these as **defensive string invariants**: `len(HQ_COUNTRY_CODE) == 2`, `len(HQ_STATE_CODE) == 2`, `len(HQ_POSTAL_CODE) == 5 and != ''` for every row. This is property #4 in the L1 invariant set — symmetric in shape with Plan 8's NULL-semantic invariants but lighter-weight (no enum-driven gating).

2. **Two NULLables gated by data-availability heuristics, not enums.** Where Plan 8 introduced status-driven NULL semantics (PLAN_STATUS = `Draft` → LAST_REVIEW_DATE NULL etc.), Plan 11 has simpler heuristic gating:
   - `WEBSITE_DOMAIN` is NULL when normalized account-name length < 3 (~0.5% of rows — almost all rows have it).
   - `TECH_STACK_FLAGS` is NULL when the industry-biased tag count rolls 0 (~10% of rows — concentrated in Personal Services / Construction / F&B).

   The L1 tests assert these distributionally (boring-case rates: ~99.5% non-null and ~90% non-null) rather than per-anchor. This is meaningfully simpler than Plan 8's enum-driven gating because the BUSINESS audience is large enough (12,021 rows) for distributional rate convergence to work, unlike Plan 8's narrow 3,920-row Wealth cohort.

Otherwise the recipe is verbatim Plan 2 / Plan 3:

- **Task 1 (scaffold).** Repo dir `Snowflake_ZoomInfo_Firmographics` (no `&` sanitize needed; "ZoomInfo" is path-clean). README/AGENTS.md identical-shape to Plans 2/3, substituting ZoomInfo for MSCI/D&B. Salt `"zoominfo"` (single salt, monthly).
- **Task 2 (table DDL).** 14 columns. 12 NOT NULL + 2 NULLable (WEBSITE_DOMAIN, TECH_STACK_FLAGS). PK `(ACCOUNT_ID, PROFILE_MONTH)`. NAICS / SIC declared as VARCHAR (string codes, not numeric).
- **Task 3 (L1 tests).** Plans 2/3's conftest pattern (importlib spec_from_file_location). BUSINESS audience override. Property #4 has FIVE assertions (per-anchor consistency / range / vocabulary / defensive-string / schema) per the rowspec. Multi-month roll (3+ months) gives ~30 rows per anchor cohort, enough for the distributional NULL-rate checks on WEBSITE_DOMAIN and TECH_STACK_FLAGS.
- **Task 4 (SP).** Implement `_row_for` per the rowspec bias-logic skeleton. The defensive-string helpers (`_state_from_zip`, ZIP synth-fallback) are SP-local; cumulus_common stays untouched. The SP also needs `_anchor_in_audience` returning `anchor.get("ACCOUNT_TYPE_FLAG") == "BUSINESS"`. Include the BUSINESS over-count warning at step 1.5 just like Plans 2/3. The MERGE handles 2 NULLable VARCHAR columns (WEBSITE_DOMAIN, TECH_STACK_FLAGS) — NULL passes through write_pandas → MERGE without special-casing.
- **Task 5 (L2).** 14-anchor fixture (12 BUSINESS spanning the 7 EMPLOYEE_BAND × 6 REVENUE_BAND grid + 2 PERSON to verify audience filter excludes them). Plan 11-specific assertions: `COUNT(DISTINCT ACCOUNT_ID) = 12`, `COUNT(DISTINCT EMPLOYEE_BAND) ≥ 5`, every row has `len(HQ_COUNTRY_CODE) = 2 AND len(HQ_STATE_CODE) = 2 AND len(HQ_POSTAL_CODE) = 5`, idempotent re-run yields ROWS_INSERTED=0.
- **Task 6 (deploy).** Clone Plan 3's `scripts/deploy_sp.py`. Inline-source `procedures/sp_create_procedure.sql`. Monthly cron, `MAIN_WH_XS`, wrapper `SP_RETRY_WRAPPER('FINS.PUBLIC.SP_GENERATE_ZOOMINFO_FIRMOGRAPHICS()', 2)`.
- **Task 7 (DC stream + DMO).** API path identical to Plans 2/3. Mapping table:

   | Snowflake | DC field | Type |
   |---|---|---|
   | ACCOUNT_ID | ssot__AccountId__c | Text (FK) |
   | PROFILE_MONTH | profileMonth__c | Date (PK; format MM/dd/yyyy) |
   | EMPLOYEE_BAND | employeeBand__c | Text |
   | REVENUE_BAND | revenueBand__c | Text |
   | INDUSTRY_NAICS_CODE | industryNaicsCode__c | Text |
   | INDUSTRY_SIC_CODE | industrySicCode__c | Text |
   | FOUNDED_YEAR | foundedYear__c | Number |
   | HQ_COUNTRY_CODE | hqCountryCode__c | Text |
   | HQ_STATE_CODE | hqStateCode__c | Text |
   | HQ_POSTAL_CODE | hqPostalCode__c | Text |
   | WEBSITE_DOMAIN | websiteDomain__c | Text (nullable) |
   | LINKEDIN_FOLLOWERS | linkedinFollowers__c | Number |
   | TECH_STACK_FLAGS | techStackFlags__c | Text (nullable) |
   | LAST_DATA_REFRESH_DATE | lastDataRefreshDate__c | Date (format MM/dd/yyyy) |
   | GENERATED_AT | generatedAt__c | DateTime |

   `PROFILE_MONTH` and `LAST_DATA_REFRESH_DATE` need `format: "MM/dd/yyyy"`. DC PK collapses to `profileMonth__c` + KQ on `ssot__AccountId__c` (single-column-PK rule from Plan 4).
- **Task 8 (L3 smoke).** Verify SP run, ~12,021 rows (matches Plans 2/3 BUSINESS cardinality plus ~600 row delta). Spot-check: 5 random rows for plausibility, BUSINESS over-count warning logged, EMPLOYEE_BAND distribution skewed toward `1-10` (BUSINESS-misclassified cohort default), defensive-string invariants hold (no row has `len(HQ_COUNTRY_CODE) != 2`, no row has empty HQ_POSTAL_CODE), WEBSITE_DOMAIN NULL-rate ~0.5%, TECH_STACK_FLAGS NULL-rate ~10%.

## §5 Self-review checklist

- [ ] Audience predicate `ACCOUNT_TYPE_FLAG = 'BUSINESS'` in 4 places (SP `_AUDIENCE_PREDICATE`, audience SQL, coverage SQL, L1 fixture override).
- [ ] Salt `"zoominfo"` in SP module constant only.
- [ ] PK `(ACCOUNT_ID, PROFILE_MONTH)` in DDL and MERGE ON.
- [ ] 2 NULLable columns (WEBSITE_DOMAIN, TECH_STACK_FLAGS); the other 12 are NOT NULL.
- [ ] BUSINESS-cardinality warning at SP step 1.5 (`accounts_processed > 10000`).
- [ ] HQ_COUNTRY_CODE projected as literal `'US'`; HQ_POSTAL_CODE synth-fallback when empty; HQ_STATE_CODE fallback via `_state_from_zip`.
- [ ] L1 property #4 includes the four defensive-string invariants (country length=2, state length=2, postal length=5 and non-empty).
- [ ] L1 NULL-rate checks for WEBSITE_DOMAIN (~0.5%) and TECH_STACK_FLAGS (~10%) over multi-month roll.
- [ ] No `<<` placeholders left.

## §6 Out of scope

- Real ZoomInfo license / live ZoomInfo API.
- Contact-level enrichment (titles, direct dials, work emails) — explicitly out of scope; this dataset is company-level only.
- Lead scoring / intent signals / website-visitor data.
- Org-chart traversal (overlap with Plan 10 BoardEx).
- Technographics depth (per-product spend, contract renewal dates).
- Funding round / M&A history (overlap with Plan 3 D&B's corporate family).

## §7 Status

Pending implementation. **Plan 11 is the most "boring" Plan structurally in the Cumulus rollout** — same audience predicate, cadence, and row shape as Plans 2 (MSCI ESG) and 3 (D&B Business Credit), with two minor deviations both inherited from prior plans (defensive HQ-string projection per Plan 4 v1.5 findings; two NULLables gated by simple data-availability heuristics rather than Plan 8's enum-driven gating). The vendor specifics — NAICS/SIC mapping, employee/revenue bands, tech-stack flags — carry the differentiation, not the architecture.

8 of 13 Plans LIVE (Plans 1-8, 171,363 rows total). Plans 9, 10, 12, 13 in parallel doc-drafting. Plan 11 follows the same v1.5 recipe Plans 2/3 already proved at this scale; the rowspec is the only new artifact.
