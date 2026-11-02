# Cumulus Plan 15 — UserGems Job Changes Implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Stand up the fifteenth per-dataset Cumulus pipeline: UserGems-style **person-level job-change events** for contacts at non-household business accounts. It covers departures, inbound hires and promotions. Each event carries champion/primary-contact flags, a new-employer resolution (existing client / prospect / unknown), opportunity and relationship-risk scores, and a Wealth tie-in. That tie-in flags departing executives who are themselves Cumulus Wealth Management clients (liquidity event). Weekly cadence. The SP emits the events **detected** in the run week into `FINS.PUBLIC.USERGEMS_JOB_CHANGES`, roughly 85 events/week and ~9K events with the 24-month backfill. The table is federated as `CumulusUserGemsJobChanges__dlm`.

**Why this dataset:** the 2026-11-02 vendor-gap assessment found that executive movement exists only as an **account-level** flag (BoardEx `EXEC_TURNOVER_FLAG`, `CEO_TENURE_YEARS`). No dataset says *who* moved, *where they went*, or *whether they were our champion*. That person-level answer is the whole UserGems value proposition. It powers two demo stories:
- **Commercial:** "your CFO champion at Acme just joined Beta Corp, a prospect. Warm intro."
- **Wealth:** "a Wealth client just left a C-suite role. Rollover and liquidity conversation."

**Architecture:** Instantiates the dataset template (v1.5). There are **five structural deviations**, making this the most event-shaped instantiation in the rollout:

1. **Event-scoped, not period-scoped (first in the rollout).** The PK is `EVENT_ID`, a deterministic UUID, not `(ACCOUNT_ID, PROFILE_*)`. Most accounts emit **zero** rows in a given week. `PROFILE_WEEK` is the *detection* week and is a partition attribute, not part of the PK.
2. **Coverage assertion replaced by a volume band + audience-membership check.** "Distinct accounts = audience" can't hold for a sparse event stream. See §2.
3. **Hard cross-plan read of BoardEx (Plan 10), with a one-directional consistency rule.** C-suite departures are only ever emitted in months where BoardEx `EXEC_TURNOVER_FLAG = TRUE` for that account, so UserGems C-suite departures ⊆ BoardEx turnover months. The reverse is **not** enforced; see "BoardEx drift" in §2.
4. **Paired events.** When a departing contact resolves to another audience anchor (`NEW_EMPLOYER_STATUS='Existing Client'`), the row factory also emits a mirrored `Joined` event on the destination account, cross-linked via `PAIRED_EVENT_ID`. The row factory emits rows for accounts *other than* the anchor it's processing, which is a first.
5. **Wealth tie-in reads a second audience.** About 6% of C-suite/VP departures link `PERSON_ACCOUNT_ID` to a deterministic Wealth Management PERSON anchor (3,920 available) and set `LIQUIDITY_EVENT_FLAG`.

**Depends on:** Plan 0, **Plan 10 (BoardEx) — hard dependency**. The SP fails fast if `BOARDEX_EXEC_INTEL` is absent. Independent of Plans 14 and 16.

---

## §1 Placeholder values

| Placeholder | Value |
|---|---|
| `<<PLAN_N>>` | `15` |
| `<<DATASET_SLUG>>` | `usergems-job-changes` |
| `<<DATASET_SLUG_UNDERSCORE>>` | `usergems_job_changes` |
| `<<MIMICS_VENDOR>>` | `UserGems` |
| `<<DATASET_TABLE>>` | `USERGEMS_JOB_CHANGES` |
| `<<DATASET_TABLE_LOWER>>` | `usergems_job_changes` |
| `<<REPO_DIR>>` | `Snowflake_UserGems_JobChanges` |
| `<<DC_DMO>>` | `CumulusUserGemsJobChanges__dlm` |
| `<<DATASET_SALT>>` | `usergems` (per account-month event draw) + `usergems_person` (names, titles, champion flags — keyed by EVENT_ID) — two salts |
| `<<CADENCE>>` | `WEEKLY` |
| `<<TASK_NAME>>` | `TASK_WEEKLY_USERGEMS_JOB_CHANGES` |
| `<<TASK_NAME_LOWER>>` | `task_weekly_usergems_job_changes` |
| `<<SP_NAME>>` | `SP_GENERATE_USERGEMS_JOB_CHANGES` |
| `<<CRON>>` | `'USING CRON 0 9 * * 1 UTC'` (Monday 09:00 UTC; after BoardEx's 1st-of-month 07:00 run, so a Monday-the-1st sees the new BoardEx month) |
| `<<AUDIENCE_PREDICATE>>` | `ACCOUNT_TYPE_FLAG = 'BUSINESS' AND COALESCE(CLIENT_CATEGORY, '') <> 'Household'` (employers); secondary pool `CLIENT_CATEGORY = 'Wealth Management'` (PERSON_ACCOUNT_ID targets) |
| `<<COVERAGE_RULE>>` | **Volume band + membership** (see §2): weekly rows in [30, 200]; 100% of `ACCOUNT_ID` and non-NULL `NEW_ACCOUNT_ID` ∈ employer audience; 100% of non-NULL `PERSON_ACCOUNT_ID` ∈ Wealth pool |
| `<<ROW_PK>>` | `EVENT_ID` |
| `<<COLUMN_LIST>>` | See rowspec — 22 data columns (+ `ORG_ID`, `RECORD_ID`) including 6 NULLable, 3 BOOLEAN |

## §2 Audience-predicate probe

**Employer audience:** `ACCOUNT_TYPE_FLAG = 'BUSINESS' AND COALESCE(CLIENT_CATEGORY, '') <> 'Household'`, which is **6,435 anchors** (probed 2026-11-02; same audience as Plan 14, with the same `COALESCE` rationale). **Wealth pool:** `CLIENT_CATEGORY = 'Wealth Management'`, which is **3,920 PERSON anchors**.

**Coverage deviation.** A job-change feed is sparse by nature: in a given week ~98.7% of accounts have no detected move. Padding with "no-change" rows would turn an event stream into a dense snapshot and destroy the shape. The template's `assert_coverage(audience_sql, actual_sql)` call is replaced by `_assert_event_contract(session, week)`, which raises if any of these fail:
- (a) the week's row count is outside [30, 200];
- (b) any `ACCOUNT_ID` / `NEW_ACCOUNT_ID` falls outside the employer audience;
- (c) any `PERSON_ACCOUNT_ID` falls outside the Wealth pool;
- (d) any C-suite `Departed` event falls in a BoardEx-FALSE month.

`SP_RETRY_WRAPPER` retry semantics are unchanged.

**Expected volume.** Tracked contacts per account scale with EMPLOYEE_COUNT (2 / 3 / 5 / 8 / 12 by band). The monthly move hazard per tracked non-C-suite contact is 1.4% (≈16%/yr, in line with UserGems' published ~20% annual B2B contact churn). There's an additional C-suite departure draw only in BoardEx-TRUE months. The audience is ~87% 1–10-employee firms, giving roughly:

| Source | Events / month |
|---|---|
| Non-C-suite hazard (Departed / Promoted / Joined) | ~230 |
| C-suite departures (BoardEx-gated) | ~95 |
| Paired `Joined` mirrors (~12% of departures) | ~25 |
| **Total** | **~350 / month ≈ 85 / week → ~8.5K over 24 months** |

L3 accepts 6K–13K for the backfill.

**BoardEx drift (found at draft time, 2026-11-02).** Plan 10's rowspec describes `EXEC_TURNOVER_FLAG` as "any C-suite change in the trailing 12 months", which should be sticky for ~12 months after a change. Live it is drawn **independently each month**:
- Over 2024-06 → 2026-11 on the employer audience: 26,450 FALSE→TRUE rises vs 26,433 TRUE→FALSE falls and only 6,511 TRUE→TRUE stays.
- 5,770 of 6,433 accounts have been TRUE at least once.

Enforcing "every TRUE month implies a departure" would therefore force ~26K C-suite departures at mostly 1–10-person firms, which is not credible. Plan 15 enforces only the **subset** direction. A follow-up to make BoardEx's flag trailing-window-sticky is listed in §6. Once that lands, the C-suite gate here can tighten to "a FALSE→TRUE rise in month M emits exactly one C-suite departure in M" with no code change beyond the gate function.

**BoardEx fix landed (2026-11-02, branch `feat/cumulus-chainA-boardex-plan15`).** Plan 10 now derives `EXEC_TURNOVER_FLAG` and `CEO_TENURE_YEARS` from a per-account C-suite change timeline (see the Plan 10 rowspec, "C-suite change timeline"). The flag is trailing-12-month sticky: a rise in month M stays TRUE for M..M+11. The new SP is deployed as `SP_GENERATE_BOARDEX_EXEC_INTEL(NUM_MONTHS, HISTORY_UPDATE_ONLY)`. Offline synthetic run (4,000 live-band-mix anchors × 36 months): 20.3% TRUE, 2,094 rises / 26,356 stays / 2,084 falls. **Live history re-run still pending:** `CALL ...SP_GENERATE_BOARDEX_EXEC_INTEL(30, TRUE)` regenerates 2024-06 → 2026-11 in place. Until it runs, the live numbers above (pre-fix) still describe the table. After it runs, re-probe rises/stays/falls here, then tighten the gate to the bidirectional rule.

## §3 Rowspec attachment

`docs/superpowers/plans/attachments/cumulus-plan-15-usergems-job-changes-rowspec.md`

The attachment contains:
- 22-data-column DDL (16 NOT NULL + 6 NULLable) plus `ORG_ID` + `RECORD_ID`, and PK `EVENT_ID`.
- The event-generation model: per (account, event_month) draws, detection lag and week filtering.
- The BoardEx C-suite gate and paired-event construction.
- The persona/title vocabulary by employee band and new-employer resolution.
- Champion / primary-contact logic, opportunity and relationship-risk scoring, and the Wealth liquidity tie-in.
- `_events_for(anchor, event_month, boardex_flag, ctx)` skeleton.
- L1 targets.

## §4 What changes from the v1.5 template

1. **Task 1 (scaffold).** AGENTS.md gotchas:
   - **Event-scoped.** One row per event, not per account-period. Most anchors return `[]` for most months, and **that is correct**. Do not "fix" it.
   - **Events are generated per event month and filtered by detection week.** For run week W, candidate event months are `month(W_end)` and the 3 prior months, because detection lag is up to 52 days (45, plus the 7-day mirror offset) and a week can straddle a month boundary. The SP keeps events with `DETECTED_DATE ∈ [W, W+6]` and `DETECTED_DATE ≤ run_ts.date()`. The same event is always generated with the same EVENT_ID, whichever week computes it.
   - **EVENT_ID** = `record_id_for(account_id, event_month, slot, kind)`, where `kind ∈ {hazard, csuite, pair}`. Paired mirrors use `kind='pair'` with the *source* event's coordinates, so they're deterministic too.
   - **BoardEx hard dependency.** Read `BOARDEX_EXEC_INTEL` once per run, restricted to the 4 candidate months: `{(ACCOUNT_ID, PROFILE_MONTH): EXEC_TURNOVER_FLAG}`. If a candidate month's BoardEx row is missing (pre-history, or the new month not yet generated), the C-suite gate is FALSE for that month, and **no** C-suite departure is emitted. If the table itself is missing, raise.
   - **Paired events write to another account.** The destination is a different employer-audience anchor, picked deterministically from a same-INDUSTRY-preferred pool. It must never be the source account.
   - **Wealth pool read.** Load the Wealth Management PERSON `ACCOUNT_ID`s sorted ascending once per run. Pick by `int(sha256(event_id)) % len(pool)` so the choice is stable as long as the pool is stable.
   - DC mapping descriptions ≤521 chars.

2. **Task 2 (table DDL).**
   - Leading `ORG_ID VARCHAR(18) NOT NULL DEFAULT 'JDO'`, then `RECORD_ID VARCHAR(36) NOT NULL` = `record_id_for(org_id, event_id)`.
   - PK `(ORG_ID, EVENT_ID)`.
   - `_STAGING` sibling.
   - Cluster key `(PROFILE_WEEK)` is optional; the table is small.
   - Schema at `Snowflake_UserGems_JobChanges/schemas/usergems_job_changes.sql`.

3. **Task 3 (L1 tests).** Inline **10-anchor** employer fixture across all 5 employee bands, plus a 5-anchor Wealth pool and a synthetic BoardEx dict. Property #4 classes:
   - **4a Range:** OPPORTUNITY_SCORE and RELATIONSHIP_RISK_SCORE in [0,100]; `EVENT_DATE ≤ DETECTED_DATE ≤ EVENT_DATE + 45d`.
   - **4b Vocabulary:** EVENT_TYPE ∈ {Departed, Joined, Promoted}; SENIORITY ∈ {C-Suite, VP, Director, Manager}; CONTACT_PERSONA ∈ the 9-value set; NEW_EMPLOYER_STATUS ∈ {Existing Client, Prospect, Unknown, Not Applicable}.
   - **4c BoardEx gate (load-bearing):** with BoardEx all-FALSE, 0 C-suite departures over 24 synthetic months × 10 anchors. With BoardEx all-TRUE, ≥1. Every C-suite departure's event month maps to a TRUE entry.
   - **4d Pairing:**
     - Every `Existing Client` departure has a `PAIRED_EVENT_ID` pointing to a `Joined` row on `NEW_ACCOUNT_ID`, with the same CONTACT_NAME and `EVENT_DATE`.
     - The mirror's `PAIRED_EVENT_ID` points back.
     - `NEW_ACCOUNT_ID != ACCOUNT_ID`.
   - **4e Cross-field:**
     - `Promoted` gives `NEW_EMPLOYER_STATUS='Not Applicable'` and NULL NEW_EMPLOYER_NAME/NEW_ACCOUNT_ID.
     - `Departed` + `Unknown` gives NULL NEW_TITLE.
     - `LIQUIDITY_EVENT_FLAG` ⇒ `PERSON_ACCOUNT_ID IS NOT NULL AND EVENT_TYPE='Departed' AND SENIORITY IN ('C-Suite','VP')`.
   - **Schema:** dict keys = 22 data columns.
   - **Determinism:** generating month M from week W1 and from week W2 yields an identical EVENT_ID set and identical rows.

4. **Task 4 (SP).**
   - Signature: `SP_GENERATE_USERGEMS_JOB_CHANGES(BACKFILL_WEEKS INTEGER DEFAULT 0)`, using the Plan 14 pattern; one SP, no inter-SP imports.
   - MERGE `ON (ORG_ID, EVENT_ID)` with `WHEN MATCHED THEN UPDATE` / `WHEN NOT MATCHED THEN INSERT`. Events are immutable in practice, and the UPDATE only exists so a rowspec fix can be re-run.
   - Boolean casts on 3 columns; the v1.4 `TO_TIMESTAMP_NTZ(... / 1e9)` fix on GENERATED_AT.
   - `TO_DATE(TO_TIMESTAMP_NTZ(col::NUMBER/1e9))` on 3 DATE columns. EVENT_DATE and DETECTED_DATE are never NULL, but use the same cast for uniformity.
   - Then `_assert_event_contract`.

5. **Task 5 (L2).**
   - Fixtures: `V_ACCOUNT_ANCHORS_FIXTURE` (10 employers + 5 Wealth) and `BOARDEX_EXEC_INTEL_FIXTURE` covering 26 months, with TRUE on a known set of (account, month).
   - **Assertions:**
     - `CALL SP(104)` (24 months) gives row count within the fixture's expected band.
     - C-suite departures appear only in fixture-TRUE months.
     - Every pair is cross-linked.
     - An idempotent re-run leaves the count and checksum unchanged.
   - **Overlap proof:** run weeks W and W+1 separately, and confirm that no EVENT_ID appears in both weeks' detected sets.

6. **Task 6 (deploy).**
   - Clone Plan 12's `deploy_sp.py`, then swap the coverage inline for `_assert_event_contract`.
   - Cron `0 9 * * 1 UTC`, `MAIN_WH_XS`, `SP_RETRY_WRAPPER('FINS.PUBLIC.SP_GENERATE_USERGEMS_JOB_CHANGES()', 2)`.
   - After deploy: `CALL FINS.PUBLIC.SP_GENERATE_USERGEMS_JOB_CHANGES(104)` once, for the 24-month backfill. That stays inside BoardEx's 2024-06 → present history.

7. **Task 7 (DC stream + DMO).** Mapping table:

   | Snowflake | DC field | Type |
   |---|---|---|
   | RECORD_ID | recordId__c | Text (PK) |
   | ORG_ID | orgId__c | Text |
   | EVENT_ID | eventId__c | Text |
   | ACCOUNT_ID | ssot__AccountId__c | Text (KQ → `ssot__Account__dlm`) |
   | PROFILE_WEEK | profileWeek__c | Date (MM/dd/yyyy) |
   | EVENT_TYPE | eventType__c | Text |
   | EVENT_DATE | eventDate__c | Date (MM/dd/yyyy) |
   | DETECTED_DATE | detectedDate__c | Date (MM/dd/yyyy) |
   | CONTACT_NAME | contactName__c | Text |
   | CONTACT_PERSONA | contactPersona__c | Text |
   | SENIORITY | seniority__c | Text |
   | OLD_TITLE | oldTitle__c | Text (NULLable) |
   | NEW_TITLE | newTitle__c | Text (NULLable) |
   | NEW_EMPLOYER_NAME | newEmployerName__c | Text (NULLable) |
   | NEW_ACCOUNT_ID | newAccountId__c | Text (NULLable; second relationship to `ssot__Account__dlm`) |
   | NEW_EMPLOYER_STATUS | newEmployerStatus__c | Text |
   | PAIRED_EVENT_ID | pairedEventId__c | Text (NULLable) |
   | WAS_CHAMPION | wasChampion__c | Boolean |
   | WAS_PRIMARY_CONTACT | wasPrimaryContact__c | Boolean |
   | OPPORTUNITY_SCORE | opportunityScore__c | Number |
   | RELATIONSHIP_RISK_SCORE | relationshipRiskScore__c | Number |
   | PERSON_ACCOUNT_ID | personAccountId__c | Text (NULLable; third relationship to `ssot__Account__dlm` — the Wealth client) |
   | LIQUIDITY_EVENT_FLAG | liquidityEventFlag__c | Boolean |
   | GENERATED_AT | generatedAt__c | DateTime |

   **Three relationships to the Account DMO** (employer, new employer, Wealth person). This is the first Cumulus DMO with more than one. Create the primary `ssot__AccountId__c` relationship via the API path. If the API rejects the second and third, add them through the DC Setup UI (DMO → Relationships), and record which path worked in AGENTS.md.

8. **Task 8 (L3 smoke).** Backfill rows in 6K–13K; weekly rows in [30, 200]. Spot-check:
   - **BoardEx subset:** `SELECT COUNT(*)` of C-suite `Departed` joined to BoardEx on `(ACCOUNT_ID, DATE_TRUNC('month', EVENT_DATE))` where the flag is FALSE or missing must be **0**.
   - **Pairs:** 0 orphan `PAIRED_EVENT_ID`s; 0 self-pairs.
   - **Mix:** Departed ~55–65%, Promoted ~20–30%, Joined ~12–20% (inbound + mirrors).
   - **Resolution:** among Departed rows, `Existing Client` ~10–15%, `Prospect` ~45–55%, `Unknown` the rest.
   - **Champion:** WAS_CHAMPION ~15–25% overall and ≥35% on Finance personas (CFO / Controller / Treasurer / VP Finance).
   - **Wealth tie-in:** `LIQUIDITY_EVENT_FLAG` rows ≈ 5–8% of C-suite+VP departures; every `PERSON_ACCOUNT_ID` resolves to a Wealth Management anchor.
   - **Size scaling:** events per account per year for 201+ employee anchors ≥ 3× the 1–10 cohort.
   - **Demo pick:** list the Commercial Banking `Departed` + `WAS_CHAMPION` + `Prospect` events in the last 90 days, ordered by OPPORTUNITY_SCORE desc. That's the warm-intro list.

## §5 Self-review checklist

- [ ] PK `EVENT_ID`; `PROFILE_WEEK` = detection week, not in PK.
- [ ] EVENT_ID derives from `(account, event_month, slot, kind)` only, so recomputing from any week gives the same ID.
- [ ] C-suite departures gated on BoardEx TRUE for the event month; missing BoardEx row means no C-suite departure; missing table raises.
- [ ] Paired mirror: different account, cross-linked both ways, same contact + date.
- [ ] `_assert_event_contract` replaces `assert_coverage`; all 4 checks implemented.
- [ ] Wealth pool pick via sha256 mod over sorted IDs; LIQUIDITY flag only on C-suite/VP departures with PERSON_ACCOUNT_ID.
- [ ] 6 NULLable / 3 BOOLEAN handled in the MERGE casts.
- [ ] DMO: three Account relationships documented (API or UI path recorded).
- [ ] No `<<` placeholders left.

## §6 Out of scope

- Real UserGems / LinkedIn data, contact PII fidelity, emails or phone numbers. CONTACT_NAME is synthetic, drawn from the same name banks as Plan 10.
- Writing back to CRM `Contact` records, or creating Leads/Tasks from events. Downstream Flow/Agentforce work.
- ~~**Making BoardEx `EXEC_TURNOVER_FLAG` trailing-12-month sticky.**~~ Landed 2026-11-02 (Plan 10 C-suite timeline; see §2 "BoardEx fix landed"). Remaining: the live 30-month in-place re-run, then §2's gate can tighten to the bidirectional rule.
- `SYNTH_RELATIONSHIP_GRAPH` `TALENT_FLOW` edges (source employer → destination employer from paired events). Natural Plan 9 extension once this table is LIVE. Plan 9's soft-dep pattern supports adding it as a new edge type.
- A persistent contact roster (the same named person across multiple events over years). Names are seeded per event.
- PERSON-anchor employers (Retail/Wealth individuals as companies).

## §7 Status

Pending implementation. Drafted 2026-11-02 from the vendor-gap assessment. Plans 0–13 are LIVE.

Plan 15 is the **first event-scoped dataset** (PK is an event ID, sparse per account). It's the first to **replace the coverage assertion** with an event contract, the first to emit rows on **accounts other than the anchor being processed** (paired mirrors), and the first DMO with **three relationships** to `ssot__Account__dlm`.
