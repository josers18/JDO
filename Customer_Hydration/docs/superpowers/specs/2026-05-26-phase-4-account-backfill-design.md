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

### 4.1 PersonaArchetype — the coherence layer

A naive design has every deriver roll independently from `seeded_rng(account.Id)`. That produces deterministic but **incoherent** customers — `Tier=Diamond` paired with `CreditScore=520`, `EmployedSince=1995` on a 24-year-old, `NumberOfChildren=4 + NumberOfDependents=0`, etc.

Phase 4 prevents this with a **`PersonaArchetype` dataclass** computed once per record before any deriver runs. The archetype reads existing-data anchors (PersonBirthdate, AnnualIncome, CreatedDate, RecordType, Phase 3c LifeEvents) and computes a small set of latent variables. All 7 derivers consume the archetype instead of rolling independent draws — cross-field coherence becomes structural rather than test-enforced.

```python
# derivers/_archetype.py
@dataclass(frozen=True)
class PersonaArchetype:
    # === Anchors (read from existing data when available) ===
    account_id: str
    created_date: date           # → RelationshipStartDate
    record_type: str
    is_person: bool
    persona: str                 # retail | wealth | smb | commercial | household | unknown

    # === Person latents (derived from Id + existing data) ===
    age: int                     # from PersonBirthdate if present, else seeded
    gender: str                  # from existing PersonGender if present
    marital_status: str          # from existing FinServ__MaritalStatus__pc
    household_size: int          # 1 + dependents

    # === Financial latents (correlated) ===
    income_band: str             # {entry, middle, affluent, hnw, uhnw}
    credit_quality: float        # 0-1; correlated with income_band + tenure + age
    net_worth_multiple: float    # multiplier on income; varies with age

    # === Relationship latents ===
    tenure_years: float          # today - CreatedDate (deterministic)
    engagement_level: str        # {dormant, light, regular, heavy}

    # === Geographic ===
    home_metro: str              # one curated US metro (City, State)

    # === Business latents (B2B only; None on person accounts) ===
    business_size: str | None    # {micro, small, mid, large, enterprise}
    industry_code: str | None    # NAICS, picked from Cumulus catalog
    business_credit_quality: float | None  # 0-1; one latent feeds all bureaus
```

**Construction order (`build_archetype(record, rng)`):**

1. Read anchors (`account_id`, `created_date`, `record_type`, `is_person`, `persona` — `persona` from External_ID prefix or RT).
2. Read person anchors when present: `age` from PersonBirthdate, `gender` from PersonGender, `marital_status` from FinServ__MaritalStatus__pc.
3. Compute `tenure_years` from `(today - created_date).days / 365`.
4. Compute `income_band` from `AnnualIncome` (existing field, 99.7% populated): entry < $50k, middle < $150k, affluent < $400k, hnw < $1M, uhnw ≥ $1M. For B2B, use `AnnualRevenue` band: micro < $1M, small < $10M, mid < $100M, large < $1B, enterprise ≥ $1B.
5. Compute `credit_quality` as `clip(0.4 + 0.4·income_band_score + 0.1·tenure_score + 0.1·age_score + rng.gauss(0, 0.08), 0, 1)` so high-income, long-tenured, older customers have higher and tighter credit quality.
6. Compute `net_worth_multiple` from age band: 25–35 → 1.5×, 35–50 → 4×, 50–65 → 8×, 65+ → 10× (rough wealth-by-life-stage curve).
7. Compute `engagement_level` from `FinServ__LastInteraction__c` if present (heavy < 30d, regular < 90d, light < 365d, dormant ≥ 365d), else seeded from rng with persona-weighted prior.
8. Pick `home_metro` from a 50-metro US pool keyed off `account_id` hash.
9. For person accounts, set `household_size = 1 + max(NumberOfDependents, marital_status_implied)` (Married → +1).
10. For B2B, set `business_size` from revenue band, `industry_code` from `Industry` field's NAICS lookup (if Industry populated; else seeded by hash).
11. For B2B, set `business_credit_quality` analogously to credit_quality but keyed off business_size + tenure.

### 4.1.1 Worked example — what coherence produces

For `Account 001xx000000ABC`, `External_ID HYDRATE-WLT-001`, `PersonBirthdate=1968-04-12`, `AnnualIncome=$425,000`, `CreatedDate=2014-09-01`, `LastInteraction=14d ago`, `home_metro=Boston, MA` (seeded):

```
Latents (computed once by build_archetype):
  age:              58
  income_band:      hnw
  tenure_years:     11.3
  engagement_level: heavy
  credit_quality:   0.92
  household_size:   3
  home_metro:       Boston, MA

Derived (all 7 derivers read the same archetype, so all coherent):
  Tier:                       Platinum         (rule 1, hnw quintile)
  ServiceModel:               Premier          (rule 1, paired with Tier)
  CreditScore:                792              (rule 2, hnw band 790±30)
  CreditRating:               Very Good        (rule 3, paired)
  RelationshipStartDate:      2014-09-01       (rule 4)
  KYCDate:                    2025-08-12       (rule 5, after start)
  KYCStatus:                  Approved         (rule 6, heavy → 98%)
  LifetimeValue:              ~$1.3M           (rule 7, 425k×11.3×0.18×1.5)
  NextReview:                 today + 60d      (rule 8, Platinum cadence)
  RiskTolerance:              Aggressive       (rule 16, the wealth triple)
  TimeHorizon:                Long-term
  InvestmentExperience:       Experienced
  NumberOfDependents:         2                (rule 11, household_size − 1)
  NumberOfChildren:           2                (rule 11, ≤ dependents)
  HomeOwnership:              Own              (rule 9, 58yo + hnw → 92%)
  EmployedSince:              1992-04-15       (rule 10, ≥ birth + 18y)
  TaxBracket:                 37%              (rule 14, hnw)
  PersonTitle:                Mr               (rule 24, 58yo male)
  BillingCity / ShippingCity: Boston, MA       (rule 23, home_metro)
  PersonOtherCity:            Cambridge, MA    (rule 23, work address, same state)
```

Without the archetype, each of these would be an independent random draw — the same Id might produce `Tier=Diamond` paired with `CreditScore=520`, `EmployedSince=1995` for a 24-year-old, etc.

### 4.2 The 24 coherence rules

Each rule is enforced by a deriver reading the archetype rather than by a post-hoc consistency check. Tests assert each rule fires correctly.

| # | Rule | Owner |
|---|---|---|
| 1 | `Tier ⊃ ServiceModel ⊃ income_band` — Diamond→Private; Platinum→Premier; Gold→Standard; Silver/Bronze→Self-Service | profile |
| 2 | `CreditScore` narrows + shifts up with income_band — entry: 580±60; middle: 680±50; affluent: 740±40; hnw: 790±30; uhnw: 810±20 | credit_personal |
| 3 | `CreditRating` derives from `CreditScore` deterministically (paired-field) | credit_personal |
| 4 | `RelationshipStartDate = CreatedDate` exactly | relationship |
| 5 | `KYCDate ∈ [RelationshipStartDate, today]` — never pre-relationship | relationship |
| 6 | `KYCStatus` skews by `engagement_level` — dormant {Approved 60, Pending 5, Expired 35}; light {80,10,10}; regular {92,6,2}; heavy {98,2,0} | relationship |
| 7 | `LifetimeValue = AnnualIncome × tenure_years × engagement_multiplier × tier_multiplier` (heavy/Diamond 0.30 → dormant/Bronze 0.02) | relationship |
| 8 | `NextReview` cadence by Tier — Diamond:30d, Platinum:60d, Gold:90d, Silver:180d, Bronze:365d | relationship |
| 9 | `HomeOwnership` weights by age × income_band — under 25 {Rent 80, Own 15, Other 5}; 25–40 + middle+ {Own 60, Rent 35, Other 5}; 40+ + affluent+ {Own 92, Rent 5, Other 3} | demographics |
| 10 | `EmployedSince ≥ PersonBirthdate + 18 years` (hard floor; clipped before write) | demographics |
| 11 | `NumberOfDependents ∈ [0, household_size − 1]`; `NumberOfChildren ≤ NumberOfDependents` | demographics |
| 12 | `MaritalStatus + WeddingAnniversary` consistency — Married/Divorced/Widowed have anniversary; Single → null | demographics |
| 13 | `NumberOfDependents` mean varies by persona — Wealth ~1.2, Retail middle ~1.8, Wealth uhnw ~0.8 | demographics |
| 14 | `TaxBracket` strict mapping from `AnnualIncome` (no rng) — 10/12/22/24/32/35/37 by 2025 single-filer brackets | demographics |
| 15 | `TaxId__pc` and `LastFourDigitSSN__pc` always populated together (paired-fields) | demographics |
| 16 | `RiskTolerance + TimeHorizon + InvestmentExperience` is one of three coherent triples — {Conservative+Short+Beginner, Moderate+Medium+Intermediate, Aggressive+Long+Experienced}. Never mix. | profile |
| 17 | All bureau scores derive from one `business_credit_quality` latent — PAYDEX, Delinquency, Failure, Intelliscore correlate; Failure score is *inversely* correlated (high credit_quality → low failure) | credit_bureau |
| 18 | `AnnualRevenue + NumberOfEmployees + business_size` triple coherent — micro: $50k–$1M & 1–10 emp; small: $1M–$10M & 10–50; mid: $10M–$100M & 50–500; large: $100M–$1B & 500–5000; enterprise: $1B+ & 5000+ | profile/contact |
| 19 | `TickerSymbol` only when `business_size ∈ {large, enterprise}` (privately-held SMBs don't have tickers) | contact |
| 20 | `NAICS_Code__c` and `Sic` derive from one `industry_code` (paired) | contact |
| 21 | `Industry` top-off respects existing `AccountSource` — never overwrite Industry that came from a real source (`AccountSource ∈ {Web, Phone Inquiry, Partner Referral}`) | contact |
| 22 | **LifeEvent integration** — recent `Marriage` LifeEvent → `MaritalStatus=Married`, `WeddingAnniversary=event.date`. Recent `Home Purchase` → `HomeOwnership=Own`. Recent `Birth of Child` → `NumberOfChildren += 1` | archetype build step |
| 23 | Address blocks pick consistently — one `home_metro` drives `BillingCity = ShippingCity = PersonMailingCity` (unless distinct existing values); `PersonOther*` uses a different metro in the same state (work address) | addresses |
| 24 | `PersonTitle` distribution by age × gender — under 30 + female {Ms 70, Miss 25, Dr 5}; 30–50 + female {Ms 60, Mrs 30, Dr 10}; 50+ + male {Mr 60, Dr 25, Sr 10, Hon 5} | contact |

### 4.3 The deriver contract

```python
# derivers/_base.py
class Deriver(Protocol):
    name: str           # e.g. "relationship"
    fields: list[str]   # CRM field names this deriver owns

    def applies_to(self, archetype: PersonaArchetype) -> bool:
        """Return False if this deriver shouldn't run for this archetype."""

    def derive(
        self,
        archetype: PersonaArchetype,
        record: dict,
        rng: Random,
    ) -> dict[str, Any]:
        """Return desired field values. Caller null-filters and upserts.

        archetype: pre-computed coherence layer (read-only)
        record:    raw SOQL response for the account (for reading existing values)
        rng:       seeded by archetype.account_id; available for any remaining
                   variation that isn't archetype-bound (e.g., picking from
                   a list of equivalent placeholder values)
        """
```

`persona` (used for filtering, etc.) is `archetype.persona`, one of `"retail" | "wealth" | "smb" | "commercial" | "household" | "unknown"` — derived from `External_ID__c` prefix (HYDRATE-RTL-*, HYDRATE-WLT-*, etc.) or from `RecordType.Name` for non-HYDRATE accounts.

### 4.4 The 7 derivers

All derivers consume the archetype computed in 4.1 and apply the rules in 4.2.

| Deriver | Fields owned | How it derives (archetype-driven) |
|---|---|---|
| **`relationship.py`** | `FinServ__RelationshipStartDate__c`, `FinServ__LengthOfRelationship__c`, `FinServ__KYCDate__c`, `FinServ__KYCStatus__c`, `FinServ__NextReview__c`, `FinServ__LifetimeValue__c`, `FinServ__LastInteraction__c` (top-off) | RelationshipStart = `archetype.created_date` (rule 4). LengthOfRelationship = `archetype.tenure_years`. KYCStatus from `engagement_level` weights (rule 6). KYCDate uniform(`created_date`, today) (rule 5). LifetimeValue = income × tenure × engagement_mult × tier_mult (rule 7). NextReview cadence by Tier (rule 8). |
| **`credit_personal.py`** | `FinServ__CreditScore__c`, `FinServ__CreditRating__c` | FICO from `archetype.income_band`-conditioned distribution (rule 2): mean shifts up + variance narrows with income. Rating from score (rule 3). Person accounts only via `archetype.is_person`. |
| **`credit_bureau.py`** | DNB PAYDEX/Delinquency/Failure/Rating; Equifax Credit Risk/Failure/Payment Index; Experian Intelliscore/Risk Band; Fitch Category/Rating; INS_FEIN_Tax_ID | All scores derive from `archetype.business_credit_quality` (rule 17): PAYDEX 1–100 (positive), Delinquency 101–670 (positive), Failure 1001–1610 (inverse), Intelliscore 1–100 (positive), Equifax 101–992 (positive). FEIN = synthetic 9-digit deterministic from account_id. Business RTs only. |
| **`profile.py`** | `Tier__c`, `FinServ__CustomerType__c`, `FinServ__Status__c`, `FinServ__ServiceModel__c`, `FinServ__NetWorth__c`, `FinServ__RiskTolerance__c`, `FinServ__TimeHorizon__c`, `FinServ__BorrowingHistory__c`, `FinServ__InvestmentExperience__c`, `FinServ__TotalRevenue__c`, `AnnualRevenue` (B2B), `NumberOfEmployees` | Tier from `income_band` quintile; ServiceModel from Tier (rule 1). CustomerType from RT. Status = "Active". NetWorth = sum-of-rollups already populated, multiplied by `archetype.net_worth_multiple`. Risk triple picked from one of three coherent options keyed off persona + age (rule 16). AnnualRevenue + NumberOfEmployees coherent with `business_size` (rule 18). |
| **`demographics.py`** | `FinServ__HomeOwnership__pc`, `FinServ__EmployedSince__pc`, `FinServ__TaxBracket__pc`, `FinServ__TaxId__pc`, `FinServ__LastFourDigitSSN__pc`, `FinServ__MotherMaidenName__pc`, `FinServ__NumberOfChildren__pc`, `FinServ__NumberOfDependents__pc`, `FinServ__WeddingAnniversary__pc`, `PersonGender`, `PersonGenderIdentity`, `PersonPronouns`, `FinServ__Gender__pc`, `FinServ__LanguagesSpoken__pc`, `FinServ__CountryOfResidence__pc`, `FinServ__CommunicationPreferences__pc`, `FinServ__ContactPreference__pc`, `Cust360_Contact_Picture_URL__pc` | Person accounts only. HomeOwnership by `age × income_band` weights (rule 9). EmployedSince clipped to `birth + 18y` (rule 10). Dependents/Children household-bounded (rule 11). MaritalStatus + WeddingAnniversary consistency (rule 12). TaxBracket strict from income (rule 14). TaxId + LastFourDigitSSN paired (rule 15). |
| **`addresses.py`** | `BillingLatitude/Longitude/GeocodeAccuracy`; `ShippingCity/State/Country/PostalCode/Street/Latitude/Longitude/GeocodeAccuracy`; `PersonMailingLatitude/Longitude/GeocodeAccuracy`; `PersonOtherCity/State/Country/PostalCode/Street/Phone/Latitude/Longitude/GeocodeAccuracy`; `Fax`; `FinServ__BillingAddress__pc`, `FinServ__MailingAddress__pc`, `FinServ__OtherAddress__pc`, `FinServ__ShippingAddress__pc` | All address blocks rooted in `archetype.home_metro` (rule 23). Billing/Shipping/PersonMailing share home_metro unless an existing value differs. PersonOther* uses a different metro in the same state (work address). All-or-nothing per block. Geocode synthesized within 0.05° of metro centroid. Fax = synthetic phone keyed off `account_id`. |
| **`contact.py`** | `MiddleName`, `PersonTitle`, `PersonAssistantName`, `PersonAssistantPhone`, `PersonDepartment`, `PersonLeadSource`, `Salutation`, `AccountNumber`, `NAICS_Code__c`, `Sic`, `SicDesc`, `Site`, `TickerSymbol`, `Jigsaw`, `JigsawCompanyId`, `Industry` (top-off), `Type`, `Rating`, `Description` (top-off) | MiddleName from name pool. PersonTitle by `age × gender` (rule 24). AccountNumber = formatted external id. NAICS + SIC from `archetype.industry_code` (rule 20). TickerSymbol only for `business_size ∈ {large, enterprise}` (rule 19). Industry top-off skipped if `AccountSource` indicates real-source data (rule 21). |

### 4.5 Coverage rules — the partial-fields layer

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

### 4.6 Picklist value source

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

### 4.7 Paired fields

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

### 4.8 CLI surface

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
       rng       = seeded_rng(record.Id)                # deterministic
       archetype = build_archetype(record, rng)         # coherence layer (4.1)
                                                        # reads anchors + computes
                                                        # all latents in one pass
       candidates = {}
       for d in registry.derivers:                      # 7 derivers
           if d.applies_to(archetype):
               candidates.update(d.derive(archetype, record, rng))
       delta = {f: v for f, v in candidates.items() if record.get(f) is None}
       coverage_rules.apply(archetype, record, delta, registry, rng)
       if delta:
           output_buffer.append({External_ID__c: ext_id_or_fallback, **delta})

T4   Flush output buffer to CSV (LF, sorted columns, UTF-8).

T5   Bulk API 2.0 upsert via External_ID__c.

T6   (Unless --skip-refresh-stream) phase5.data_cloud.refresh_stream(...)

T7   Write manifest.json + derivation_log.jsonl.

T8   Exit 0 (or rc=2 if --strict and any field-level errors).
```

**Total wall-clock: ~6–8 minutes** for a full 36,222-account backfill on `jdo-uqj0jr`.

### 5.2 Persona inference (consumed by `build_archetype`)

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

The persona is one of several anchors the archetype reads. The archetype-build step runs a single `LifeEvent` query batched per chunk (rule 22) — for every account in the chunk, fetch the most recent `Marriage`, `Home Purchase`, `Birth of Child` events from `FinServ__LifeEvent__c` (Phase 3c data). These bias the archetype's `marital_status`, `home_ownership_anchor`, and `children_count` so Phase 3c LifeEvents flow forward into Phase 4 demographics.

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
                │   ~24 coherence-narrative tests  │  one per rule + 7 sample customers
                │   (cross-field invariants)       │
                ├────────────────────────────────┤
                │   ~12 integration tests          │  pytest with org-response fixtures
                │   (orchestrator + loader wiring) │
                ├────────────────────────────────┤
                │   ~15 archetype-build tests      │  pure-function, anchors → latents
                │   (build_archetype + life events)│
                ├────────────────────────────────┤
                │   ~80 unit tests                 │  pytest, pure-function level
                │   (derivers + coverage rules)    │
                └──────────────────────────────────┘
                Target: ~131 new tests → suite goes from 527 to ~660
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

### 7.6 Archetype-build tests

`tests/test_archetype.py` — verify the coherence-layer construction (rules in 4.2 are inputs):

| Test | Verifies |
|---|---|
| `test_age_from_person_birthdate_when_present` | Birthdate=1985 → age=40 (deterministic, no rng) |
| `test_age_seeded_when_birthdate_missing` | Same Id → same age across runs |
| `test_income_band_thresholds` | $25k→entry, $80k→middle, $250k→affluent, $750k→hnw, $2M→uhnw |
| `test_credit_quality_correlates_with_income_and_tenure` | hnw + 10y tenure → mean ≈ 0.85; entry + 1y → mean ≈ 0.45 |
| `test_engagement_level_from_last_interaction` | LastInteraction 14d → heavy; 60d → regular; 200d → light; 800d → dormant |
| `test_engagement_level_seeded_when_no_interaction` | No LastInteraction → seeded with persona prior |
| `test_household_size_includes_self_plus_dependents` | NumberOfDependents=2 → household_size=3 |
| `test_marital_status_from_existing_field` | FinServ__MaritalStatus__pc='Married' → archetype.marital_status='Married' |
| `test_business_size_from_revenue_band` | $500k → micro; $50M → mid; $2B → enterprise |
| `test_industry_code_from_existing_industry_field` | Industry='Banking' → NAICS=522110 |
| `test_lifeevent_marriage_sets_married` | Recent Marriage event → archetype.marital_status='Married' (rule 22) |
| `test_lifeevent_home_purchase_sets_home_anchor` | Recent Home Purchase event → archetype.home_ownership_anchor='Own' |
| `test_lifeevent_birth_increments_children` | Recent Birth of Child → children_count = existing + 1 |
| `test_home_metro_deterministic_per_id` | Same Id → same metro across runs |
| `test_persona_unknown_falls_back_to_retail_defaults` | RT not matching → persona='unknown', archetype still constructible |

### 7.7 Coherence-narrative tests

`tests/test_coherence.py` — assert each of the 24 rules holds end-to-end (post-derivation, pre-write). One test per rule plus 7 sample-customer narrative tests:

| Test | Asserts |
|---|---|
| `test_rule_01_tier_servicemodel_alignment` | Tier=Diamond → ServiceModel=Private; Tier=Bronze → ServiceModel=Self-Service |
| `test_rule_02_credit_score_band_by_income` | uhnw archetype → CreditScore ∈ [770, 850]; entry → ∈ [400, 720] |
| `test_rule_05_kyc_date_after_relationship_start` | For 100 generated archetypes: `KYCDate ≥ RelationshipStartDate` always |
| `test_rule_07_lifetimevalue_engagement_multiplier` | heavy/Diamond LV ≫ dormant/Bronze LV for same income |
| `test_rule_09_homeownership_age_income_distribution` | 1000 archetypes → under-25 owns ≤ 20%, 40+/affluent owns ≥ 85% |
| `test_rule_10_employed_since_after_18yo` | EmployedSince ≥ PersonBirthdate + 18y for all 1000 |
| `test_rule_11_dependents_children_consistent` | NumberOfChildren ≤ NumberOfDependents always |
| `test_rule_12_marital_anniversary_consistency` | MaritalStatus=Single → WeddingAnniversary is null; Married → not null |
| `test_rule_14_tax_bracket_strict_mapping` | $50k → 22%; $500k → 35%; $1M → 37% |
| `test_rule_16_risk_triple_only_three_combos` | RiskTolerance/TimeHorizon/InvestmentExperience always one of 3 valid triples |
| `test_rule_17_bureau_scores_correlate` | High PAYDEX → low Failure (corr < -0.5 across 1000 samples) |
| `test_rule_18_revenue_employees_business_size` | $50M revenue → NumberOfEmployees ∈ [50, 500]; size=mid |
| `test_rule_19_ticker_only_for_large_enterprise` | business_size=micro → TickerSymbol null; size=enterprise → not null |
| `test_rule_22_marriage_event_drives_marital_status` | Account with Marriage life event 2025-06-12 → MaritalStatus=Married, WeddingAnniversary=2025-06-12 |
| `test_rule_23_address_blocks_consistent_metro` | BillingCity = ShippingCity = PersonMailingCity unless explicitly different |
| `test_narrative_22yo_entry_band_renter` | Full archetype + derivation: 22yo with $28k income → CreditScore ~580, Tier=Bronze, HomeOwnership=Rent, NumberOfChildren=0 |
| `test_narrative_58yo_hnw_long_tenure` | 58yo + $425k income + 11y tenure + heavy engagement → Tier=Platinum, ServiceModel=Premier, CreditScore≥770, NumberOfDependents=2, HomeOwnership=Own, NextReview=today+60d |
| `test_narrative_uhnw_diamond_private_banking` | uhnw archetype → Tier=Diamond, ServiceModel=Private, RiskTolerance=Aggressive, NumberOfDependents low |
| `test_narrative_dormant_account_stale_kyc` | Last interaction > 365d → engagement=dormant → KYCStatus=Expired prob ≥ 30% |
| `test_narrative_smb_owner_split_persona` | SMB owner persona → has both wealth-side fields (RiskTolerance) and business-side fields (NAICS) |
| `test_narrative_commercial_enterprise_with_ticker` | Commercial enterprise → has TickerSymbol, AnnualRevenue ≥ $1B, NumberOfEmployees ≥ 5000 |
| `test_narrative_household_aggregate_no_kyc` | Household RT → KYCStatus null (households are aggregates), but NetWorth populated |
| `test_narrative_lifeevent_marriage_propagates_to_demographics` | Phase 3c Marriage event last month → Phase 4 sets MaritalStatus=Married + WeddingAnniversary |
| `test_narrative_24_no_age_pre_18_employment` | All 1000 generated archetypes: EmployedSince - PersonBirthdate ≥ 18 years |

### 7.8 Live-org smoke test

`tests/test_live_smoke.py` — gated by `RUN_LIVE_TESTS=1`. CI skips it.

1. **Dry-run on jdo-uqj0jr** — proves describe + SOQL parse without crashing.
2. **Apply with `--limit 50`** — proves bulk job + DC refresh round-trip.

### 7.9 Out-of-scope for tests

- Statistical realism of synthetic distributions — coherence tests assert *invariants* (e.g., "no Diamond customer has CreditScore < 700") and *direction of effect* (e.g., "high engagement correlates with low Expired-KYC rate"), not population fidelity to real-world data.
- Real DC stream ingest correctness — that's `dc-status`'s job.
- Coherence rules beyond the 24 listed — future invariants are added by appending to `tests/test_coherence.py`, not as a v1 commitment.

## 8. Acceptance criteria

Phase 4 ships when:

- [ ] `python hydrate.py backfill-accounts --target-org jdo-uqj0jr --dry-run` runs to completion with rc=0 and produces a non-empty diff.
- [ ] `python hydrate.py backfill-accounts --target-org jdo-uqj0jr` (full run) populates the 101 empty fields across all 36,222 accounts, exits rc=0, and triggers the Account DC stream refresh.
- [ ] All 26 partial fields have logical-coverage rules; manifest shows per-rule fill counts.
- [ ] All paired fields are consistent (no contradictory CreditScore + CreditRating pairs).
- [ ] All 24 coherence rules in §4.2 pass their corresponding `tests/test_coherence.py` test.
- [ ] All 7 narrative tests in §7.7 produce internally-consistent customer profiles (e.g., 22yo entry-band → renter with no kids; 58yo HNW → Premier-tier, owns home, 2 dependents).
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
