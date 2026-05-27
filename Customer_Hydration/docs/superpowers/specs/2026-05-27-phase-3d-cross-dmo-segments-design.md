# Phase 3d — Cross-DMO segment YAML

> **Status:** Drafted 2026-05-27. One-spec scope; produces a single implementation plan.
> **Predecessors:** Phase 2 (segment loader, atomic rule DSL), Phase 3a/3b/3c (loans, treasury, life events, campaign members hydrated to CRM and Data Cloud).
> **Org:** `jdo-uqj0jr` (Account DMO `ssot__Account__dlm`, FSC-aligned).

## 1. Why

Phase 2 shipped 20 Data Cloud segments backed by `ssot__Account__dlm`. Five of them — and ten campaign-aligned ones — could not express their real intent at the time because the underlying related DMOs (`FinancialAccount`, `PersonLifeEvent`, `CampaignMember`) were not yet hydrated. Their YAML descriptions all carry "(placeholder until X DMO hydrated)" and their `rule:` clauses fall back to `FinServ_ClientCategory_c__c = <persona>`.

Phase 3a/3b/3c hydrated the backing CRM data and DC streams. Phase 4 closed out the Account DMO data gap. The 15 segments are now stale-by-design — they pass review on shape but match too many rows. Phase 3d closes the audience-precision gap by encoding the real cross-DMO filters.

## 2. The 15 segments

**5 placeholder segments** (currently `ClientCategory = <persona>`):

| Key | Becomes |
|---|---|
| `retail_family_with_mortgage` | Retail + has Mortgage `FinancialAccount` |
| `retail_heloc_drawn` | Retail + HELOC `FinancialAccount` with drawn ratio ≥ 0.5 |
| `smb_with_sba` | SMB + has SBA-tagged `FinancialAccount` |
| `commercial_with_treasury` | Commercial + has Treasury `FinancialAccount` |
| `wealth_recent_life_event` | Wealth + `PersonLifeEvent` with `EventDate` in last 90 days |

**10 campaign-aligned segments** (currently persona-only; `linked_campaign` is informational):

`cmp_heloc_refi_outreach`, `cmp_auto_loan_rate_drop`, `cmp_premier_checking_onboarding`, `cmp_wealth_tax_strategy_webinar`, `cmp_wealth_estate_planning_roundtable`, `cmp_sba_awareness`, `cmp_treasury_modernization_brief`, `cmp_commercial_rm_roundtable`, `cmp_multi_persona_spring_newsletter`, `cmp_mobile_banking_adoption`. Each adds an `AND CampaignMember.CampaignId = <HYDRATE-CMP-NNN>` clause via the new DSL.

## 3. Architecture

Two-layer change:

1. **DSL layer** in `customer_hydration/phase5/segments.py` — add a new `related_to` rule type that the YAML-to-DC-JSON translator handles. The rule names a related DMO + a foreign-key field back to Account, plus a nested `where:` rule applied on the related DMO's row. The translator emits the corresponding DC `NestedAttribute` / `ProfileEntityCondition` clause referencing the related DMO's native AccountId-style FK.

2. **Loader layer** — add a `--recreate` flag (or new subcommand) that DELETEs each affected segment before POST, with idempotent "already gone is success" handling. PATCH on Dynamic segments returns `ENTITY_SAVE_ERROR` (Phase 2 Task 10), so delete+post is the only viable in-place migration.

**Probe gate:** A live probe (Task 1) confirms whether v62's relative-date semantics work on `ssot__PersonLifeEvent__dlm`. The result selects between relative-date emission and frozen-anchor fallback at translator-build time. This avoids assuming the documented 2026-05-25 v62 quirk is still present without re-verifying.

**Source of truth:** YAML stays canonical. No new pre-compute pipelines, no denormalization transforms. Native DMO FKs are trusted. The persona-only fallback rules stay in YAML history (commit log) but are physically replaced.

## 4. Components

### 4.1 `customer_hydration/phase5/segments.py` — DSL extensions

- New rule type `related_to` with shape:
  ```yaml
  type: related_to
  dmo: ssot__FinServ__FinancialAccount__dlm
  via: AccountId__c           # default: AccountId__c after __c → _c__c rewrite
  where:
    type: text_equals
    field: FinServ_AccountType_c__c
    value: Mortgage
  ```
- Translator function `_translate_related_to(rule, root_dmo)` emits a `NestedAttribute` clause: outer condition matches `<root_dmo>.Id` against `<related_dmo>.<via>`, inner condition is the recursively-translated `where:` rule applied to the related DMO's namespace.
- Existing rule types (`text_equals`, `all_of`, etc.) gain awareness of "current DMO context" so nested rules inside `related_to` resolve fields against the related DMO, not the root.
- New optional rule params `relative_date_after_days` / `relative_date_before_days` — used only if the persisted probe artifact says `RELATIVE_DATES_OK`. Otherwise the translator falls through to existing `date_in_range` with frozen anchors.
- Nested `related_to` inside `related_to` is **rejected** at translate time (`ValueError`) — v62's NestedAttribute doesn't compose cleanly across two hops, and there's no use case in the 15 segments.

### 4.2 `customer_hydration/phase5/segments_probe.py` — new file

- `probe_relative_date_filter(target_dmo, field, days)` — POSTs three throwaway segments:
  1. Relative `before -<days>d`
  2. Relative `after -<days>d`
  3. Frozen anchor equivalent (`date_in_range` after = today-N days)
- Reads row counts via the standard segment-status endpoint, compares: relative-after should match (≈ same count as) frozen anchor; relative-before should NOT match. Returns `RELATIVE_DATES_OK | RELATIVE_DATES_BROKEN | RELATIVE_DATES_UNKNOWN`.
- Persists result to `output/phase3d/probe_<timestamp>.json` with raw counts so re-runs can be diffed.
- Cleanup: DELETEs the three throwaway segments. Names are deterministic (`PROBE_RELDATE_*__seg`); manifest records any cleanup failures so an operator can sweep them.

### 4.3 `customer_hydration/phase5/segments_loader.py` (extend, not new)

- New flag `--recreate <pattern>` accepts a glob (`cmp_*`, `retail_heloc_drawn`, `*`). For each match:
  1. `DELETE /ssot/segments/{developerName}__seg` (404 ⇒ success)
  2. `POST /ssot/segments` with the new translated definition.
- Manifest records `recreated_count`, `created_count`, and per-segment `{deleted: bool, created: bool, rows: int?}`.

### 4.4 `config/segments.yaml` — rewrite 15 entries

- Remove "(placeholder until X DMO hydrated)" from descriptions; replace persona-only rules with `all_of` of persona + `related_to` clause.
- For `wealth_recent_life_event`, the YAML carries both forms — the active branch is selected based on the probe artifact. Frozen-anchor branch documented per the same convention as `wealth_pre_retiree`.

### 4.5 `docs/segment_briefs.md` — regenerated

- Briefs include the new rule shape, expected row counts (probed live post-recreation), and the per-segment campaign linkage.

## 5. Data flow

### 5.1 Translator (build-time, no live calls)

```
config/segments.yaml
  → load_segments_yaml()
  → for each segment:
      translate_rule(rule, root_dmo=ssot__Account__dlm)
        ├─ atomic rule (text_equals, etc) → field comparison on root_dmo
        ├─ all_of/any_of  → recurse, wrap LogicalComparison
        ├─ related_to     → NestedAttribute:
        │     outer = root_dmo.Id MATCHES related_dmo.<via>
        │     inner = translate_rule(rule.where, root_dmo=related_dmo)
        └─ date_in_range  → ISO anchors (always)
           OR relative_date_after_days → ExactlyRelativeDateComparison
                                          (only if probe = OK)
  → DC JSON includeCriteria
```

### 5.2 Probe (one-shot, live, gated)

```
probe_relative_date_filter(ssot__PersonLifeEvent__dlm, EventDate, 90)
  → POST throwaway segment (after -90d, i.e. EventDate within last 90d)
                           → count A_recent
  → POST throwaway segment (before -90d, i.e. EventDate older than 90d)
                           → count B_old
  → POST throwaway segment (date_in_range frozen 90d anchor)
                           → count C_recent_frozen
  if A_recent ≈ C_recent_frozen and A_recent < B_old:
      RELATIVE_DATES_OK     # relative-after agrees with frozen anchor;
                            # the two complementary slices are not equal
                            # (which is the documented v62 bug shape).
  else:
      RELATIVE_DATES_BROKEN
  persist to output/phase3d/probe_<ts>.json
  cleanup: DELETE 3 throwaway segments
```

### 5.3 Migration (live)

```
hydrate.py segments --recreate '*'
  → for each segment matching pattern:
      DELETE /ssot/segments/<DeveloperName>__seg  (404 OK)
      POST   /ssot/segments  with new translated definition
      record manifest: { name, deleted, created, rows }
  → output/phase3d/manifest_<ts>.json
```

## 6. Error handling

### 6.1 Probe

- Live API auth/network failure → `RELATIVE_DATES_UNKNOWN`, log loudly, default to **frozen anchors**. Probe never blocks migration.
- Cleanup failure → log, continue. Manifest records orphans for operator cleanup.
- Inconclusive counts → treat as `RELATIVE_DATES_BROKEN` (safer default).

### 6.2 Translator

- `related_to` references unknown DMO → fail at YAML-load time with the segment + DMO named. Use a describe cache (one call per unique DMO) to validate before building.
- `related_to` references field not in related DMO → fail at YAML-load with available fields listed.
- Nested `related_to` inside `related_to` → reject; document as unsupported.

### 6.3 Loader (`--recreate`)

- DELETE 404 → idempotent success.
- DELETE other 4xx/5xx → log, skip POST, mark `recreate_failed` in manifest. Don't proceed.
- POST after DELETE fails → segment is now missing. Manifest marks `created=false, deleted=true`; operator reruns to retry POST. Don't auto-roll-back the DELETE — YAML is source of truth and a missing segment is safer than a stale persona-only one.
- POST `ENTITY_SAVE_ERROR` (already exists) → contradicts our DELETE; treat as race/policy bug. Log and continue with existing live segment.

### 6.4 Exit codes

- `0` OK
- `2` partial recreate failure (some segments failed)
- `3` translator/YAML hard failure (no recreate attempted)
- `4` schema drift (related DMO/field missing from describe)

## 7. Testing strategy

### 7.1 Unit (offline, ~25 new tests)

- `test_segments_translator_related_to.py` — translates `related_to` over the 5 cross-DMO shapes (Mortgage, HELOC, SBA, Treasury, LifeEvent) into expected DC JSON. Includes nested `all_of` inside `where:`, persona + related_to compound, and rejection of nested-`related_to` (raises `ValueError`).
- `test_segments_translator_relative_date.py` — emits `ExactlyRelativeDateComparison` when probe artifact says OK; emits `date_in_range` when broken/unknown.
- `test_segments_yaml_validation.py` — every `related_to` rule in committed YAML resolves against a captured describe fixture (`tests/fixtures/dmo_describes/`). Runs without network; the fixture is checked in.
- `test_segments_loader_recreate.py` — DELETE 404 is success; DELETE 4xx aborts POST; POST failure marks `recreate_failed` in manifest. Mocked HTTP.

### 7.2 Integration (offline)

- `test_segments_e2e_offline.py` — full YAML → translator → JSON for all 15 segments. Snapshot-tested against committed expected-JSON fixtures.

### 7.3 Live (gated by `RUN_LIVE_TESTS=1`)

- `test_segments_e2e_live.py` — runs probe, runs `--recreate '*'` against `jdo-uqj0jr`, asserts each segment's row count is non-zero and **strictly less than** its persona-only baseline (proves the cross-DMO clause is filtering, not no-op'd).
- Persists baseline counts to `tests/fixtures/segment_baselines.json` (committed) so future runs detect regressions.

### 7.4 Coverage gates

- Suite stays green: existing 787 PASS + ~30 new = ~817 PASS.
- New code in `phase5/segments.py` translator branches: 100% line coverage required.

## 8. Out of scope (deferred)

- Calculated-Insight-driven boolean fields on Account (Approach C from brainstorming). Could be added later if non-Account-rooted segments need to compose with these.
- Activation refresh — Phase 3d does not re-trigger any Marketing Cloud / Loyalty Activation that consumes the affected segments. Operator runs that separately.
- DC stream Full Refresh — not required; no DLO schema is changing. The existing rows in `Account_Home__dll` and the related DLOs already carry the AccountId FKs the new segments depend on.
- Activations test — `test_segments_e2e_live` only validates row-count drops, not downstream activation behavior. That's a Phase 3e or beyond concern.

## 9. Implementation slice

Single plan, ~7 tasks:

1. Live probe of relative-date semantics on `PersonLifeEvent`.
2. DSL extension: `related_to` rule type + nested `where:` translator.
3. Date support: relative-date or frozen-anchor builder, branched on probe artifact.
4. YAML rewrite: 15 segment entries with new rules.
5. Loader extension: `--recreate` flag with DELETE-then-POST.
6. Live execution: full migration, manifest captures before/after row counts.
7. Briefs refresh + AGENTS.md "Plans history" entry.

Plan to be written by `superpowers:writing-plans` after spec approval.
