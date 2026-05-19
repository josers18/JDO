# Customer Hydration — Phase 1 Design

**Status:** Approved through brainstorming on 2026-05-19. Awaiting user review of this written spec before invoking `superpowers:writing-plans`.

**Authors:** Jose Sifontes (product), Claude (drafting partner).

**Goal:** Build a reusable Python CLI artifact that hydrates the JDO demo org with ~10,000 realistic Cumulus Bank customers — Retail, Wealth, Small Business, and Commercial — distributed across the org's 5 internal banker users with full FSC party-model linking and dual coverage of both legacy `FinServ__*` objects and native FSC standard objects. The artifact must be re-invokable forever — append more customers, reset and regenerate, or scope to a single RM — without manual cleanup or duplicate records.

**Non-goal (Phase 2):** Data Cloud DLO/DMO mapping, Identity Resolution, Calculated Insights, Segments, Activations, and `FinancialAccountTransaction` ingestion. These will be handled by a separate Phase 2 spec written after Phase 1 lands. See §6 below for the explicit non-goals list.

**Tech stack:** Python 3.11+ (Faker, PyYAML, python-dateutil), Salesforce CLI v2 (`sf data import bulk`, `sf apex run`, `sf sobject describe`), one anonymous-Apex post-load script, one custom field deployed via DX (`FinServ__BusinessMilestone__c.External_ID__c`).

**Target org for Phase 1:** `jdo-fw51xz` → `admin@finsdc3.demo`. Generator is org-portable via Phase 0 pre-flight describe.

**Anchor date:** 2026-05-19 (today). All calendar-aware activity shapes are anchored to this date.

---

## §1 Architecture and artifact shape

### Package location

A new top-level DX package **`Customer_Hydration/`**, mirroring the structure of `Financial_Trades_Generation/`. Top-level placement was chosen over folding into `FSC_Audit_Utilities/` (different concern: seeding vs. correcting) or `Cumulus_Products/` (which is currently a Python-only product catalog and breaks the "each top-level folder is a DX package" convention).

### File tree

```
Customer_Hydration/
├── README.md                         # what it does, prereqs, hello-world
├── AGENTS.md                         # context for AI agents (full structure in §6)
├── CLAUDE.md                         # `See @AGENTS.md` shim, gitignored at repo root
├── artifacts.md                      # per-JDO-monorepo-convention file inventory
├── .gitignore                        # output/, *.pyc, .venv, etc.
├── hydrate.py                        # CLI entrypoint with subcommands
├── requirements.txt                  # faker, pyyaml, python-dateutil, simple-salesforce
├── config/
│   ├── personas.yaml                 # distribution rules + density toggles
│   ├── product_catalog.yaml          # frozen mirror of Cumulus PRODUCT_SPECS.md SKUs
│   ├── rm_pool.yaml                  # 5 internal banker User Ids + caseload weights
│   └── holding_universe.yaml         # ~200-ticker investment universe for wealth holdings
├── generators/
│   ├── __init__.py
│   ├── retail.py                     # Person Account + child records
│   ├── wealth.py                     # Person Account + brokerage/IRA/trust + holdings
│   ├── smb.py                        # Business Account + 1–3 Contacts + business products
│   ├── commercial.py                 # Business Account + 3–8 Contacts + treasury products
│   ├── households.py                 # Household Account + ACR + reciprocal roles
│   ├── activity.py                   # Cases, Tasks, Events, Opportunities (calendar-aware)
│   ├── lifecycle.py                  # LifeEvents, BusinessMilestones, FinancialGoals
│   ├── campaigns.py                  # Campaign + CampaignMember
│   └── natives.py                    # native FSC mirror records (after Phase 3 Id resolution)
├── output/                           # CSVs and run artifacts (GITIGNORED)
│   └── run-{ts}/                     # one timestamped dir per run
│       ├── *.csv
│       ├── manifest.json
│       ├── checkpoint.json
│       └── bulkapi-failures.csv
├── apex/
│   └── post_load_wireup.apex         # Phase 5 anonymous-Apex script
├── force-app/                        # DX project for the one new field
│   └── main/default/objects/
│       └── FinServ__BusinessMilestone__c/fields/
│           └── External_ID__c.field-meta.xml
├── tests/
│   ├── test_generators.py            # unit tests per persona generator
│   ├── test_internal_consistency.py  # cross-object reconciliation
│   ├── test_idempotency.py           # same seed → same output
│   ├── test_reset.py                 # reset deletes only HYDRATE-*
│   └── fixtures/                     # frozen CSV samples for diff testing
└── docs/
    ├── INDEX.md
    ├── ARCHITECTURE.md
    ├── PERSONA_PROFILES.md
    ├── DATA_MODEL.md
    ├── HOW_TO.md                     # CLI cookbook
    ├── BANKER_BRIEFS.md              # index page with summary table
    ├── briefs/                       # 6 per-banker briefs (auto-generated)
    │   ├── vince-west.md
    │   ├── kim-johnson.md
    │   ├── adam-watson.md
    │   ├── justin-chen.md
    │   ├── standard-user.md
    │   └── allen-carter.md
    ├── IDEMPOTENCY.md
    ├── TROUBLESHOOTING.md
    └── superpowers/
        ├── specs/2026-05-19-customer-hydration-design.md   ← this file
        └── plans/                                          ← created by writing-plans
```

### Pipeline overview

```
hydrate.py CLI
  ↓ Phase 0: pre-flight (describe, External-ID seek, manifest header)
  ↓ Phase 1: generation (in-memory + serialize CSVs)
  ↓ Phase 2: bulk-load legacy lineage (waves A–E, External-ID-bound)
  ↓ Phase 3: resolve native-lineage parent Ids (query LegacyId__c → nativeId map)
  ↓ Phase 4: bulk-load native lineage (waves F–G, Id-bound where no external id)
  ↓ Phase 5: Apex post-load wireup (household rollups, Group Builder, denormalized flags)
  ↓ Phase 6: verify + write manifest + regenerate banker briefs
```

### Reusability contract

The artifact is a CLI with subcommands. Examples:

```bash
# First run — full hydration (~10K customers, ~880K total rows, ~50 min)
python hydrate.py --target-org jdo-fw51xz

# Add 500 more retail customers
python hydrate.py --retail 500 --smb 0 --wealth 0 --commercial 0 --append

# Add 50 wealth customers to a specific RM
python hydrate.py --wealth 50 --rm "Vince West" --append

# Wipe and start over (only HYDRATE-* records — never the 178 pre-existing accounts)
python hydrate.py --reset --confirm

# Reproducible: same seed → same data
python hydrate.py --reset --confirm --seed 42

# Just regenerate banker briefs without touching data
python hydrate.py briefs --output ../docs/briefs/

# What's currently in the org under HYDRATE-*?
python hydrate.py status

# Resume a crashed run
python hydrate.py resume
```

The full CLI surface is specified in §5.

---

## §2 Persona profiles and record shape

### Volume mix

| Persona | Customers | Persona Anchor attributes |
|---|---:|---|
| Retail | 7,000 | age, life_stage, household_income, credit_tier, state, marital_status |
| Wealth | 1,200 | age, life_stage, investable_assets, household_income, complexity_tier |
| Small Business | 1,500 | industry, annual_revenue, employee_count, years_in_business, owner_age |
| Commercial | 300 | industry, annual_revenue, employee_count, treasury_complexity, parent_relationship |
| **Total** | **10,000** | |

Each persona's *anchor attributes* are drawn first; every downstream record is derived from them so the data is internally consistent. A wealth client with $2M brokerage cannot also have a 540 FICO and a payday-loan-grade card — anchor-driven derivation prevents these contradictions.

### RM distribution (role-matched)

| Banker | Title | Retail | Wealth | SMB | Commercial | Total |
|---|---|---:|---:|---:|---:|---:|
| Vince West | Relationship Manager (Wealth) | 0 | 700 | 0 | 0 | 700 |
| Kim Johnson | Wealth Advisor | ~50 | 350 | 0 | 0 | ~400 |
| Adam Watson | Financial Advisor Associate | ~50 | 150 | 0 | 0 | ~200 |
| Justin Chen | Relationship Banker | 3,400 | 0 | ~50 | 0 | ~3,450 |
| Standard User | Relationship Banker | 3,400 | 0 | ~50 | 0 | ~3,450 |
| Allen Carter | Commercial RM | 0 | 0 | 1,400 | 300 | 1,700 |
| (slack) | randomly redistributed within the same role family | | | | | ±5% |

The 5% slack adds organic variety so no banker's book is perfectly clean. Acme Partners users (Sarah Phillips, Paul Partner) are excluded. The pre-existing 178 non-HYDRATE accounts are untouched.

### Per-persona record shape

Density level: **heavy** (per Section 2 of the brainstorming).

#### Retail

| Object | Count per customer | Shape |
|---|---:|---|
| FA — Checking | 1.0 (always) | Cumulus Everyday Checking (PD-CHK-EVD), balance $500–$8K |
| FA — Savings/HYSA/MM | 0.6 | type by income tier; balance 0.5–4× monthly income |
| FA — CD ladder | 0.15 (retiree=0.45) | per PRODUCT_SPECS rates |
| FA — Mortgage | 0.45 (family_building=0.7) | 30yr Fixed or 5/1 ARM, balance from state median home × LTV |
| FA — HELOC | 0.18 (only with mortgage) | line $25K–$200K, drawn 0–60% |
| FA — Auto Loan | 0.5 | $8K–$55K |
| FA — Personal Loan | 0.12 | $3K–$25K |
| Card | 1.4 avg | type matches credit_tier (Secured if FICO<640) |
| Goal | 1.0 | drawn by life_stage |
| LifeEvent | 0.8 | calendar-aware |
| Case | 1.5 avg | disputed transaction / lost card / Zelle / fee waiver |
| Task | 2.5 avg | RM follow-ups |
| Event | 0.4 | branch consultations |
| Opportunity | 0.25 | HELOC / refi / auto |
| Household member | 65% | spouse + children, linked via ACR |
| Campaign membership | 1–3 | active campaigns |

#### Wealth

| Object | Count | Shape |
|---|---:|---|
| FA — Premier Checking | 1.0 | balance = 2–6mo income |
| FA — Brokerage | 1.0 | 0.4–0.7× investable_assets |
| FA — Managed Advisory | 0.75 | fee-based wrap |
| FA — Roth IRA | 0.55 | with rollover history |
| FA — Traditional / Rollover IRA | 0.85 | often largest single |
| FA — 529 | 0.35 | beneficiary = household child |
| FA — Trust (Rev/Irrev/Charitable) | 0.4 (legacy=0.85) | own Account record (RT=Trust), wealth client = Trustee |
| FA — HELOC | 0.4 | for liquidity |
| Card | 1.8 avg | premium tier |
| Holdings | 8–25 per investment FA | from holding_universe.yaml; market_value rolls up to FA balance |
| Goal | 2 avg | estate / college / income / charitable |
| LifeEvent | 1.2 avg | sale of business / inheritance / spouse retirement |
| Case | 0.8 avg | trust admin / wire / tax docs |
| Task | 4.0 avg | annual review / rebalance / estate plan |
| Event | 1.5 avg | quarterly portfolio review |
| Opportunity | 0.6 | trust / insurance / held-away |
| Household member | 90% | spouse + adult children |
| Campaign membership | 1–2 | curated only |

#### Small Business

| Object | Count | Shape |
|---|---:|---|
| Contact | 2–4 | Owner + COO/CFO + signers, linked via ACR with reciprocal roles |
| FA — Business Checking | 1.0 | Fundamentals (<$1M rev) or Analyzed (≥$1M) |
| FA — Business Savings/Sweep | 0.3 | |
| FA — Business LOC | 0.55 | $50K–$1.5M, 60–90% utilized |
| FA — Business Term Loan | 0.35 | equipment / expansion |
| FA — SBA Loan | 0.18 | 7(a) or 504, $150K–$2M |
| FA — Equipment Loan/Lease | 0.25 | high for Construction/Trucking |
| FA — Commercial Real Estate | 0.15 | owner-occupied |
| Card — Corporate/Purchasing | 1.2 avg | tied to authorized signers |
| BusinessMilestone | 1.5 avg | founded / hires / revenue / acquisition |
| LifeEvent (on owner Person Account) | 0.4 | cross-pollination with retail |
| Case | 1.0 avg | ACH return / lockbox / Positive Pay |
| Task | 3.0 avg | LOC renewal / quarterly review |
| Event | 1.0 | onsite visits |
| Opportunity | 0.7 | LOC renewal / treasury / equipment |
| Linked owner Person Account | 1.0 (always) | linked via ACR with role=Beneficial Owner |
| Owner is also wealth client | 30% | their AUM in their Person Account |
| Campaign membership | 0.8 | SBA Awareness / Treasury Brief |

#### Commercial

| Object | Count | Shape |
|---|---:|---|
| Contact | 5–10 | CFO/Controller/Treasurer/AP/Procurement + signers, rich ACR roles |
| FA — Business Analyzed Checking (multi-account) | 2–5 | Operating + payroll + concentration + ZBA |
| FA — Commercial Real Estate Loan | 0.6 | $5M–$80M |
| FA — Syndicated Loan | 0.25 | $25M–$200M, with co-lender notation |
| FA — Asset-Based Lending | 0.35 | borrowing base from industry+revenue |
| FA — SBA Loan | 0.05 | smaller commercial only |
| FA — Treasury Services (Lockbox/Sweep/ZBA/Positive Pay) | 1.2 avg per service | each is an FA-as-service |
| Card — Corporate Card program | 1.0 | 5–50 cardholders |
| BusinessMilestone | 2.5 avg | founded / IPO / acquisition / facilities |
| Case | 1.5 avg | wire / fraud / annual review |
| Task | 5.0 avg | credit review / covenants / treasury optimization |
| Event | 2.0 | quarterly business review |
| Opportunity | 1.2 | treasury / LOC / equipment / swaps |
| Account.ParentId | 25% | holding co → operating subs |
| Campaign membership | 0.6 | curated executive briefs |

### Cross-persona stitching rules

- **Households.** ~65% of retail and 90% of wealth are members of a Household Account (RT=`IndustriesHousehold` or org-default Household RT). Members link via `AccountContactRelation` + `FinServ__ReciprocalRole__c` (`Spouse`, `Dependent`, `Sibling`, `Power of Attorney`).
- **Business owner ↔ personal account.** Every SMB/Commercial has an owner Contact. For SMBs (90%) and Commercial (50%) that owner is also a Person Account. Linked via `AccountContactRelation` with reciprocal role = `Beneficial Owner`.
- **Wealth ↔ Trust.** A Trust is its own Account (RT=Trust) with the wealth client linked as Trustee. The Trust's investment FA is owned by the Trust, not the individual.
- **Holdings → FA balance reconciliation.** For investment FAs, `FinServ__Balance__c` = sum of related Holdings' `FinServ__MarketValue__c`. Generator produces holdings first, sums them, writes the FA balance.
- **FA Owner roles.** Every FA gets one or more `FinServ__FinancialAccountRole__c` rows (Primary Owner, Joint Owner, Beneficiary, Authorized Signer, Trustee, Power of Attorney).
- **OwnerId.** Customer Accounts owned by role-aligned RM ±5% slack within the same role family.
- **Calendar-aware activity.** All Cases/Tasks/Events: ~30% of Tasks have ActivityDate in the next 14 days, ~10% are overdue, ~60% historical. Opportunities spread across CloseDate Q-1, Q0, Q+1, Q+2. LifeEvents/BusinessMilestones span 0–5 years back.

---

## §3 Object coverage matrix and dual-lineage strategy

### Coverage philosophy

The org has both legacy `FinServ__*` managed-package objects AND native FSC standard objects in active use across different solutions. **Phase 1 hydrates both lineages in parallel**, with the legacy record as authoritative and a mirror in the native lineage linked via `LegacyId__c`. This costs ~30–40% more rows but gives total coverage without forcing a lineage choice.

### Lineage map

| Concern | Legacy (`FinServ__*`) | Native FSC (standard) | Bridge |
|---|---|---|---|
| Financial account | `FinServ__FinancialAccount__c` | `FinancialAccount` | `LegacyId__c` on native |
| Account-party linkage | `FinServ__FinancialAccountRole__c` | `FinancialAccountParty` | natural key (FA + Account/Contact + Role) |
| Holdings | `FinServ__FinancialHolding__c` | *(no native — legacy only)* | n/a |
| Goals | `FinServ__FinancialGoal__c` | `FinancialGoal` | `LegacyId__c` on native |
| Life events | `FinServ__LifeEvent__c` | *(no native — legacy only)* | n/a |
| Business milestones | `FinServ__BusinessMilestone__c` | `BusinessMilestone` | `OriginalLegacyGoalId__c` on native (existing field) |
| Cards | `FinServ__Card__c` | *(no native — legacy only)* | n/a |
| Households / groups | Account RT=Household + ACR + `FinServ__ReciprocalRole__c` | `PartyRelationshipGroup` + `PartyProfile` | shared AccountId |
| Contact points | Account/Contact direct fields | `ContactPointAddress / Email / Phone` | shared parent reference |
| **Transactions** | **n/a — owned by Phase 2 Data Cloud spec** | `FinancialAccountTransaction` (skipped) | n/a |

### Idempotency field per object (existing org schema)

| Object | Field | Notes |
|---|---|---|
| Account, Opportunity, Case, Task, Campaign, Card, FA, Goal, native BusinessMilestone | `External_ID__c` (capital ID, unique=True) | Dominant pattern |
| Contact | `External_Id__c` (lowercase d) | Existing oddity, not ours to fix |
| `FinServ__FinancialHolding__c`, `FinServ__LifeEvent__c` | `FinServ__SourceSystemId__c` | No External_ID__c on these objects |
| `FinServ__BusinessMilestone__c` | **NEW: `External_ID__c`** | Phase 1 deploys this field via `force-app/` |
| `FinancialAccount` (native) | `LegacyId__c` (existing) | Bridge to legacy FA Id |
| `FinancialAccountParty`, `PartyProfile`, `PartyRelationshipGroup`, `ContactPoint*` | none | Use Id-binding via Phase 3 query-back |

### External-ID namespace

```
HYDRATE-{TYPE}-{SEQ}        (zero-padded sequence, type prefix)
```

| Prefix | Object family |
|---|---|
| `HYDRATE-RT-{n}` | Retail Person Account |
| `HYDRATE-WL-{n}` | Wealth Person Account |
| `HYDRATE-SMB-{n}` | Small Business Account |
| `HYDRATE-COM-{n}` | Commercial Account |
| `HYDRATE-HH-{n}` | Household Account |
| `HYDRATE-TR-{n}` | Trust Account |
| `HYDRATE-CT-{n}` | Contact (business officers) |
| `HYDRATE-FA-{n}` | Legacy `FinServ__FinancialAccount__c` |
| `HYDRATE-NFA-{n}` | Native `FinancialAccount` (matches legacy seq) |
| `HYDRATE-CARD-{n}` | `FinServ__Card__c` |
| `HYDRATE-GOAL-{n}` | Legacy `FinServ__FinancialGoal__c` |
| `HYDRATE-NGOAL-{n}` | Native `FinancialGoal` (matches legacy seq) |
| `HYDRATE-LE-{n}` | `FinServ__LifeEvent__c` (in `FinServ__SourceSystemId__c`) |
| `HYDRATE-MS-{n}` | Legacy `FinServ__BusinessMilestone__c` |
| `HYDRATE-NMS-{n}` | Native `BusinessMilestone` (matches legacy seq) |
| `HYDRATE-HOLD-{n}` | `FinServ__FinancialHolding__c` (in `FinServ__SourceSystemId__c`) |
| `HYDRATE-OPP-{n}` | Opportunity |
| `HYDRATE-CASE-{n}` | Case |
| `HYDRATE-TASK-{n}` | Task |
| `HYDRATE-EVT-{n}` | Event |
| `HYDRATE-CMP-{n}` | Campaign (~10 only) |

The `HYDRATE-` prefix is collision-free against the existing 178 accounts (none use it).

### Per-object field coverage

Roughly 25–60 fields per object — enough for realistic dashboards and Cumulus widgets, not so many that we're filling junk. Field source legend:

- 🔹 **Anchor** — drawn from persona anchor attributes
- 🎲 **Faker** — name/address/email/phone/company/etc.
- 📋 **Catalog** — from `Cumulus_Products` PRODUCT_SPECS catalog
- 🔗 **Derived** — computed from anchor or parent values
- 🪪 **Idempotency** — External-ID field
- 🧭 **Reference** — lookup to another generated record
- 🏷️ **Constant** — fixed across all rows

#### Account — Person (Retail + Wealth)

`RecordTypeId`(🏷️=PersonAccount), `FirstName/LastName/Salutation`(🎲), `PersonBirthdate`(🔹), `PersonEmail/PersonHomePhone/PersonMobilePhone`(🎲), `PersonMailingStreet/City/State/PostalCode/Country`(🔹🎲), `Industry`(🔹), `FinServ__ClientCategory__c`(🏷️=Retail|Wealth Management), `FinServ__ClientStatus__c`(🏷️=Active), `FinServ__InvestmentExperience__c`(🔹, wealth-only), `FinServ__RiskToleranceLevel__c`(🔹, wealth-only), `FinServ__MaritalStatus__c`(🔹), `FinServ__Occupation__c`(🎲), `FinServ__Employer__c`(🎲), `FinServ__YearsWithEmployer__c`(🔗), `FinServ__TotalAnnualIncome__c`(🔹), `FinServ__NumberOfDependents__c`(🔹), `FinServ__BankingPreference__c`(🎲), `OwnerId`(🔗 RM), `External_ID__c`(🪪), `FinServ__SourceSystemId__c`(🪪 mirror), `LeadSource`(🏷️=Hydration), `Description`(🔗 — used by DC_PersonProfileWidget Insight tab).

#### Account — Business (SMB + Commercial)

`RecordTypeId`(🏷️=Business), `Name`(🎲), `AccountSource`(🏷️=Hydration), `Industry/Sic`(🔹), `AnnualRevenue`(🔹), `NumberOfEmployees`(🔹), `YearStarted`(🔗), `Phone/Website`(🎲), `BillingStreet/City/State/PostalCode/Country`(🎲), `ShippingStreet…`(🔗 — same as Billing 70%), `Description`(🔗), `OwnerId`(🔗), `ParentId`(🔗 25% commercial), `FinServ__ClientCategory__c`(🏷️=Small Business|Commercial Banking), `FinServ__ClientStatus__c`(🏷️=Active), `External_ID__c`(🪪).

#### Contact (business officers/signers)

`FirstName/LastName/Salutation`(🎲), `Email/Phone/MobilePhone`(🎲 — email domain matches business website), `Title`(🔹 — role pool), `AccountId`(🧭), `MailingStreet…`(🔗), `ReportsToId`(🧭, ~40% commercial), `Department`(🔹), `LeadSource`(🏷️=Hydration), `External_Id__c`(🪪 lowercase), `FinServ__SourceSystemId__c`(🪪 mirror).

#### `FinServ__FinancialAccount__c` (densest object — ~50K rows)

`Name`(🔗), `FinServ__FinancialAccountType__c`(📋), `FinServ__FinancialAccountSource__c`(🏷️=Hydration), `FinServ__Status__c`(🔗 — 92% Active / 6% Closed / 2% Frozen), `FinServ__OpenedDate__c`(🔗), `FinServ__ClosedDate__c`(🔗 — only if Closed), `FinServ__Balance__c`(🔹📋), `FinServ__InterestRate__c`(📋), `FinServ__APR__c`(📋), `FinServ__LoanAmount__c`(🔗), `FinServ__MaturityDate__c`(🔗), `FinServ__OwnershipType__c`(🔗), `FinServ__Branch__c`(🎲, if exists), `FinServ__PrimaryOwner__c`(🧭), `FinServ__FinancialAccountNumber__c`(🪪 masked, unique within run), `FinServ__ProductCode__c`(📋), `External_ID__c`(🪪), `FinServ__SourceSystemId__c`(🪪 mirror).

> **Pre-flight describe:** generator caches the field list per object and silently drops any column that doesn't exist in the org (warning logged to manifest). Protects against FSC version drift.

#### `FinServ__FinancialAccountRole__c`

`FinServ__FinancialAccount__c`(🧭), `FinServ__Account__c` or `FinServ__Contact__c`(🧭), `FinServ__Role__c`(🔹), `FinServ__Active__c`(🏷️=true 95%), `FinServ__StartDate__c`(🔗), `FinServ__EndDate__c`(🔗).

#### `FinServ__Card__c`

`Name`(🔗), `FinServ__CardType__c`(📋), `FinServ__CardSubType__c`(📋), `FinServ__CardStatus__c`(🔗), `FinServ__CardNumber__c`(🔗 masked), `FinServ__ExpirationDate__c`(🔗), `FinServ__CreditLimit__c`(🔹📋), `FinServ__Balance__c`(🔗), `FinServ__Account__c`(🧭), `External_ID__c`(🪪).

#### `FinServ__FinancialHolding__c` (wealth investment FAs only)

`Name`(🔗 `{Ticker} - {SecurityName}`), `FinServ__FinancialAccount__c`(🧭), `FinServ__SecurityName__c/FinServ__SecuritySymbol__c`(🔹 from holding_universe.yaml), `FinServ__Quantity__c`(🔗), `FinServ__PurchasePrice__c`(🔗), `FinServ__CurrentPrice__c`(🔗 — drift from purchase), `FinServ__MarketValue__c`(🔗 = qty × current_price), `FinServ__CostBasis__c`(🔗 = qty × purchase_price), `FinServ__AcquiredDate__c`(🔗), `FinServ__SourceSystemId__c`(🪪 — no External_ID__c on this object).

#### `FinServ__FinancialGoal__c`

`Name`(🔗), `FinServ__GoalType__c`(🔹), `FinServ__TargetAmount__c`(🔗), `FinServ__CurrentAmount__c`(🔗 5–80% of target), `FinServ__TargetDate__c`(🔗), `FinServ__Priority__c`(🏷️), `FinServ__Status__c`(🏷️), `FinServ__PrimaryOwner__c`(🧭), `External_ID__c`(🪪).

#### `FinServ__LifeEvent__c`

`Name`(🔗), `FinServ__EventType__c`(🔹), `FinServ__EventDate__c`(🔗 calendar-aware), `FinServ__Account__c`(🧭), `FinServ__Contact__c`(🧭, business owners), `FinServ__Status__c`(🏷️ Confirmed|Anticipated), `FinServ__SourceSystemId__c`(🪪).

#### `FinServ__BusinessMilestone__c` (legacy — needs new External_ID__c field)

`Name`(🔗), `FinServ__MilestoneType__c`(🔹), `FinServ__MilestoneDate__c`(🔗), `FinServ__Account__c`(🧭), `Notes/Description`(🔗), `External_ID__c`(🪪 — **new field, deployed by us**).

#### Opportunity

`Name`(🔗 `{AccountName} - {Product} - {Q}`), `AccountId`(🧭), `OwnerId`(🔗 inherits Account.OwnerId), `StageName`(🔹 calendar-aware), `Probability`(🔗), `Amount`(🔹📋), `CloseDate`(🔹), `Type`(🏷️ New|Existing), `LeadSource`(🏷️=Hydration), `Description`(🔗), `External_ID__c`(🪪).

#### Case

`Subject`(🔹 persona-flavored), `Description`(🔗), `Status`(🔗 calendar-aware), `Priority`(🏷️ — 5% Critical), `Origin`(🏷️), `Type/Reason`(🔹), `AccountId`(🧭), `ContactId`(🧭, business cases), `OwnerId`(🔗 — RM 50% / queue 50%), `RecordTypeId`(🔗), `External_ID__c`(🪪).

#### Task

`Subject`(🔹 persona+activity-flavored), `Description`(🔗), `Status`(🔗 calendar-aware), `Priority`(🏷️), `Type`(🔹 Call|Email|Meeting|Other), `ActivityDate`(🔗 calendar-aware: 30% next-14d / 10% overdue / 60% historical), `WhatId`(🧭 Account|Opp|Case), `WhoId`(🧭 Contact), `OwnerId`(🔗 RM), `External_ID__c`(🪪).

#### Event

`Subject`(🔹), `StartDateTime/EndDateTime`(🔗 business-hours-shaped), `WhatId/WhoId`(🧭), `OwnerId`(🔗), `Location`(🎲).

#### AccountContactRelation

`AccountId`(🧭), `ContactId`(🧭), `Roles`(🔹 semicolon-separated multi-select: Beneficial Owner|Authorized Signer|Trustee|Spouse|Dependent|Guarantor), `FinServ__ReciprocalRole__c`(🔹 reciprocal label), `IsActive`(🏷️=true 95%), `StartDate`(🔗).

#### Campaign + CampaignMember

~10 active campaigns covering the persona mix. Campaign: `Name`(🔗), `Type`(🏷️), `Status`(🏷️), `StartDate/EndDate`(🔗), `ExpectedResponse/NumberSent`(🔗), `External_ID__c`(🪪 `HYDRATE-CMP-001…010`). CampaignMember: `CampaignId`(🧭), `ContactId/LeadId`(🧭), `Status`(🔹 Sent|Responded|Registered|Attended), `HasResponded`(🔗).

### Native FSC mirror objects

#### `FinancialAccount` (native — mirror of legacy FA)

`Name`(🔗 same as legacy), `FinancialAccountNumber`(🪪 — required, identical to legacy), `Type`(📋 — mapped to native picklist Checking|Savings|Loan|CreditCard|Investment|Mortgage|LineOfCredit), `Status`(🔗), `Balance/OutstandingBalance/AvailableBalance`(🔗 same as legacy), `OpenedDate/ClosedDate/MaturityDate`(🔗), `InterestRate`(📋), `ProductName`(📋), `OwnerId`(🔗), `RelatedFinancialAccountId`(🧭 — for treasury sub-accounts in commercial), **`LegacyId__c`(🪪 — bridge to legacy FA Id)**.

#### `FinancialAccountParty` (native — mirror of FA Role)

`FinancialAccountId`(🧭), `AccountId` or `ContactId`(🧭), `Role`(🔹), `StartDate/EndDate`(🔗). **No external-id field** — natural key (FA + Account|Contact + Role) used for idempotency.

#### `FinancialGoal` (native — has External_ID__c already)

Direct mirror of legacy goal. Same fields. Written with same External_ID__c value as legacy goal but in `HYDRATE-NGOAL-{n}` namespace, plus `LegacyId__c` set to legacy `FinServ__FinancialGoal__c` Id.

#### `BusinessMilestone` (native — has External_ID__c + OriginalLegacyGoalId__c)

Direct mirror of legacy. Uses **`OriginalLegacyGoalId__c` as the bridge** since that field is already defined on the native object specifically for legacy linkage.

#### `PartyRelationshipGroup` + `PartyProfile`

Native equivalent of FSC Household + ACR. Written after legacy household + ACR loaded.

`PartyRelationshipGroup`: `Name`(🔗), `AccountId`(🧭 household or business), `RelationshipGroupType`(🏷️ Household|Trust|Business|Investment Club), `Description`(🔗).

`PartyProfile`: `Name`(🔗), `AccountId` or `ContactId`(🧭), `HouseholdAccountId`(🧭), `RelatedPartyProfileId`(🧭 — spouse-of, parent-of), `ProfileType`(🔹), `Status`(🏷️=Active).

#### `ContactPointAddress / Email / Phone` (Data-Cloud-friendly)

For every Person Account and every business Contact: 1 ContactPointEmail + 1 ContactPointPhone + 1 ContactPointAddress mirroring the parent's direct fields. Why: Data Cloud harmonization prefers `ContactPoint*` objects.

`ParentId/RelatedRecordId`(🧭), `EmailAddress/TelephoneNumber/Address fields`(🔗 — mirror of legacy direct field), `BestTimeToContactStartTime/EndTime`(🔹), `IsPrimary`(🏷️=true for first per kind).

### Fields explicitly NOT populated

- Legacy/audit fields (`UnifiedProfileId__c`, `UCIN_External_ID__c`, `pi__Pardot_Campaign_Id__c`)
- Person Account `__pc` shadow fields where a non-`__pc` equivalent exists (write to non-`__pc`, the platform copies)
- Anything `defaultedOnCreate=true` and not customer-meaningful
- Any field the Phase 0 describe step can't confirm exists

### Row-count estimate

| Object | Approx rows |
|---|---:|
| Account (Person + Business + Household + Trust) | 14,000 |
| Contact | 10,000 |
| AccountContactRelation | 25,000 |
| Legacy `FinServ__FinancialAccount__c` | 50,000 |
| Native `FinancialAccount` | 50,000 |
| Legacy `FinServ__FinancialAccountRole__c` | 75,000 |
| Native `FinancialAccountParty` | 75,000 |
| Legacy `FinServ__FinancialHolding__c` | 150,000 |
| Legacy `FinServ__Card__c` | 22,000 |
| Legacy + Native Goals | 30,000 |
| Legacy `FinServ__LifeEvent__c` | 12,000 |
| Legacy + Native BusinessMilestones | 9,000 |
| `PartyRelationshipGroup` | 9,000 |
| `PartyProfile` | 25,000 |
| `ContactPointAddress / Email / Phone` | 75,000 |
| Opportunity | 10,000 |
| Case | 80,000 |
| Task | 120,000 |
| Event | 25,000 |
| Campaign + CampaignMember | 12,000 |
| **Total** | **~880,000 rows** |

Estimated wall-clock: ~50 min. Estimated storage: ~1.7 GB. **This will exceed Developer Edition data storage limits — Phase 1 targets a sandbox or paid org.**

---

## §4 Data flow, load order, and post-load wireup

### Six-phase pipeline

| Phase | Purpose |
|---|---|
| 0 | Pre-flight — describe objects, cache field lists, drop missing columns, compute External-ID seek pointer, load existing HYDRATE-* set |
| 1 | Generation — anchor-driven derivation, internal-consistency validation, serialize CSVs |
| 2 | Bulk load legacy lineage (Waves A–E) |
| 3 | Resolve native-lineage parent Ids via `SELECT Id, LegacyId__c` query-back |
| 4 | Bulk load native lineage (Waves F–G) |
| 5 | Apex post-load wireup (rollups, Group Builder, denormalized flags) |
| 6 | Verify + write manifest + regenerate banker briefs |

### Wave dependency

| Wave | Objects | Depends on |
|---|---|---|
| A | Account (all RTs in one CSV) | none |
| B | Contact | A |
| C | AccountContactRelation | A + B |
| D | FA, Card, Goal, LifeEvent, Milestone, Campaign, Opportunity (parallel) | A + B |
| E | FA Role, Holding, Case, Task, Event, CampaignMember (parallel) | A + B + C + D |
| F | Native: FinancialAccount, FinancialGoal, BusinessMilestone, PartyRelationshipGroup, ContactPoint* (parallel) | A + B + D |
| G | Native: FinancialAccountParty, PartyProfile | F (resolved Ids) |

### CSV ↔ external-id binding

Legacy + bridged-native CSVs use the standard sf-CLI external-id reference syntax in column headers:

```csv
Name,Type,FinServ__PrimaryOwner__c:Account:External_ID__c,External_ID__c
"Cumulus Premier Checking - 4421",Checking,HYDRATE-WL-000123,HYDRATE-FA-008412
```

Bulk API resolves the parent on the platform — no client-side ID resolution. For natives without external-id fields (`FinancialAccountParty`, `PartyProfile`, `ContactPoint*`), Phase 3 query-back resolves Ids client-side, then Phase 4 writes CSVs with literal 18-char Ids.

### Load command

```bash
sf data import bulk \
    --file output/run-{ts}/{object}.csv \
    --sobject {ApiName} \
    --target-org $TARGET_ORG \
    --line-ending LF \
    --wait 30
```

`--line-ending LF` is required to avoid silent corruption on Windows-line-ending files.

### Parallelism + retry policy

Within a wave, multiple `sf data import bulk` jobs run as concurrent subprocesses (default 4, configurable via `--parallel`).

- HTTP 5xx / 429 / connection reset → exponential backoff, 5 retries (1s → 16s)
- Bulk job `failedRecords > 0` → fail fast. Dump `bulkapi-failures.csv` with row-level errors. User fixes config and re-runs (idempotent).
- Bulk job stuck `InProgress > 30 min` → log + abort (platform issue).

### Checkpoints and resume

After each wave completes, write `output/run-{ts}/checkpoint.json`:

```json
{
  "run_id": "run-2026-05-19T1430",
  "seed": 42,
  "completed_waves": ["A", "B", "C", "D"],
  "in_progress_wave": "E",
  "object_status": {
    "FinServ__FinancialAccount__c": {"loaded": 50114, "failed": 0, "duration_s": 287},
    "FinServ__FinancialAccountRole__c": {"loaded": 0, "failed": 0, "in_progress": true}
  }
}
```

If a re-invocation detects an in-flight checkpoint, prompt:
```
Detected in-progress run run-2026-05-19T1430 (wave E partially loaded).
Resume from wave E? [Y/n]
```

Resume rules:
- Completed waves: skip entirely (External IDs already in org)
- Interrupted wave: re-run; External-ID upsert makes already-loaded rows a no-op

### Apex post-load wireup

`Customer_Hydration/apex/post_load_wireup.apex` is one anonymous-Apex script:

1. Roll up household totals (`FinServ__TotalAssets__c`, `FinServ__TotalLiabilities__c`) for HYDRATE-* households
2. Trigger FSC Group Builder for HYDRATE-* households (try documented FSC API first; fall back to a custom `FscGroupRollupBatch` shipped in `Customer_Hydration/force-app/` if needed — the implementation plan task that builds this picks one and locks it in)
3. Mark Cases as Escalated where age > SLA tier
4. Set denormalized fields like Opportunity `IsClosed` for Closed Won/Lost stages

All SOQL uses `WITH USER_MODE`. The script is idempotent — re-running completes rollups for any new accounts.

### Error reporting

End-of-run terminal summary:

```
==========================================================================
Customer_Hydration run summary  ·  run-2026-05-19T1430  ·  seed=42
==========================================================================
Wave A  Account                       loaded 14,012  ·  failed 0    ·  4m 12s
Wave B  Contact                       loaded 10,387  ·  failed 0    ·  2m 48s
Wave C  AccountContactRelation        loaded 25,002  ·  failed 0    ·  3m 21s
Wave D  FA + Card + Goal + ...        loaded 122,910 ·  failed 0    ·  9m 04s
Wave E  Holding + Role + Case + Task  loaded 437,118 ·  failed 12   ·  18m 33s
Wave F  Native FA + Goal + Milestone  loaded 89,000  ·  failed 0    ·  6m 12s
Wave G  Party + ContactPoint          loaded 100,000 ·  failed 0    ·  4m 47s
--------------------------------------------------------------------------
TOTAL   880,442 records loaded · 12 failures · 49m 17s wall-clock
==========================================================================
```

Failures cause exit code 2. Zero failures, exit 0.

---

## §5 CLI surface, idempotency, and re-run contract

### Subcommand grammar

```
hydrate.py [SUBCOMMAND] [OPTIONS]

Subcommands:
  hydrate         (default)  Generate + load customers and related data
  briefs                     Regenerate banker brief MD files from current org state
  reset                      Wipe HYDRATE-* records (with --confirm)
  status                     Show what's in the org under the HYDRATE-* namespace
  validate-config            Lint config/*.yaml without touching the org
  resume                     Continue an interrupted run from its checkpoint
```

### Global options

```
  --target-org ALIAS         sf org alias (default: $TARGET_ORG or sf config)
  --output-dir PATH          Default: ./output/
  --config-dir PATH          Default: ./config/
  --quiet / --verbose
  --dry-run                  Generate CSVs but don't load — useful for diffing
```

### `hydrate` subcommand options

```
  --retail N                 Default 7000
  --wealth N                 Default 1200
  --smb N                    Default 1500
  --commercial N             Default 300
  --rm "Name" | UserId       Restrict customer assignment to a single RM
  --append                   Add to existing HYDRATE-* book; don't refuse on conflict
  --reset                    Delete all HYDRATE-* records before generating (REQUIRES --confirm)
  --confirm                  Required for --reset; types the destructive intent
  --seed N                   RNG seed (default 42)
  --parallel N               Concurrent bulk-load jobs per wave (default 4)
  --skip-natives             Legacy lineage only — skip native FSC mirrors
  --skip-apex-wireup         Skip Phase 5
  --personas LIST            "retail,wealth" — limit to subset
  --waves LIST               "A,B,C,D,E" — limit to specific waves (debug)
  --persona-density LEVEL    light|medium|heavy (default heavy)
```

### `briefs` subcommand options

```
  --output PATH              Default: ../docs/briefs/
  --rm "Name"                Generate brief for a single banker only
```

### `reset` subcommand options

```
  --confirm                  Required
  --persona LIST             Reset only specific personas
  --keep-campaigns           Reset customers but leave the 10 campaigns in place
```

### Re-run scenarios

| Scenario | Command | Result |
|---|---|---|
| Fresh hydrate | `python hydrate.py --target-org jdo-fw51xz` | Phase 0 finds 0 HYDRATE-*. Generates seed=42 distribution. ~880K rows, ~50 min. |
| Add 500 retail | `python hydrate.py --retail 500 --smb 0 --wealth 0 --commercial 0 --append` | Adds 500 starting at HYDRATE-RT-007001. ~30K rows, ~3 min. |
| Top up Vince's book | `python hydrate.py --wealth 50 --rm "Vince West" --append` | 50 wealth all owned by Vince, starting at next free wealth seq. |
| Persona-logic regen | `python hydrate.py --reset --confirm` | Deletes HYDRATE-*, full hydrate, seed=42. ~55 min. |
| Same command twice | `python hydrate.py` then `python hydrate.py` | Run 2 refuses unless `--append` or `--reset`. Exit 1. |
| Reproducibility | `python hydrate.py --reset --confirm --seed 42` | Org snaps to canonical seed=42 state. |
| Mid-run crash | `python hydrate.py` crashes → `python hydrate.py resume` | Reads checkpoint.json, continues from interrupted wave. |

### Reset semantics

`--reset --confirm` does, in order:
1. Refuse to run unless ≥1 HYDRATE-* record exists (so it's never used in a brand-new org)
2. Print planned deletion summary
3. Require user to type the org alias literally as extra friction
4. Delete in reverse-wave order (E → A then native G → F) using Bulk API 2.0 hard-delete jobs gated by `External_ID__c LIKE 'HYDRATE-%'`
5. For objects without External_ID__c, query parent External_ID__c → delete by Id
6. Verify deletion with final SOQL count assertion across all hydrate objects
7. Failed reset does NOT proceed to insert

### Safety rails

- **Production-org guard.** If `IsSandbox=false`, refuse to run unless `--allow-production` is passed
- **Audit trail.** Every run writes `output/run-{ts}/manifest.json` with seed, flags, row counts, timing, failures
- **No mutation of pre-existing accounts.** `WHERE External_ID__c LIKE 'HYDRATE-%'` clause appears in every read/delete query
- **Defense in depth.** `LeadSource = 'Hydration'` and `AccountSource = 'Hydration'` are also stamped, so dashboards can additionally filter by source

### What gets committed

| Path | Tracked? |
|---|---|
| `Customer_Hydration/hydrate.py`, `generators/`, `config/*.yaml`, `apex/`, `force-app/` | yes |
| `Customer_Hydration/AGENTS.md`, `artifacts.md`, `docs/` (including auto-generated briefs) | yes |
| `Customer_Hydration/CLAUDE.md` | gitignored at repo root (per JDO convention) |
| `Customer_Hydration/output/` | gitignored |
| `Customer_Hydration/.gitignore` | yes |

---

## §6 Deliverables, AGENTS.md, banker briefs, and Phase 2 handoff

### Deliverables checklist

**Code:** `hydrate.py`, `generators/*.py`, `config/{personas,product_catalog,rm_pool,holding_universe}.yaml`, `apex/post_load_wireup.apex`, `force-app/` for new `External_ID__c` field on legacy BusinessMilestone, `requirements.txt`.

**Tests:** `test_generators.py`, `test_internal_consistency.py`, `test_idempotency.py`, `test_reset.py`, frozen CSV fixtures.

**Documentation:** `README.md`, `AGENTS.md`, `CLAUDE.md` shim, `artifacts.md`, `docs/INDEX.md`, `docs/ARCHITECTURE.md`, `docs/PERSONA_PROFILES.md`, `docs/DATA_MODEL.md`, `docs/HOW_TO.md`, `docs/BANKER_BRIEFS.md`, `docs/briefs/{6 banker briefs}.md`, `docs/IDEMPOTENCY.md`, `docs/TROUBLESHOOTING.md`.

**Repo updates:** Top-level `README.md` "Projects" table row; `docs/INDEX.md` link; `docs/MONOREPO_OVERVIEW.md` package list; `CHANGELOG.md` entry under 2026-05.

### `AGENTS.md` structure

```markdown
# Customer_Hydration — AGENTS.md

Context for AI coding agents working on this package.

## What this is

Reusable CLI artifact (hydrate.py) that seeds the JDO demo org with realistic
Cumulus Bank customer data — Retail, Wealth, Small Business, Commercial —
distributed across role-aligned RMs, with full FSC party-model linking and
dual-lineage coverage (legacy FinServ__* + native FSC standard objects).

Read in order:
1. README.md
2. docs/PERSONA_PROFILES.md
3. docs/DATA_MODEL.md
4. docs/IDEMPOTENCY.md

## Conventions you MUST follow

### Idempotency keys
All generated records carry an External ID under the HYDRATE-* namespace
(see docs/IDEMPOTENCY.md). Never insert a record without one. Never modify
or delete records outside this namespace.

### Schema continuity (dual lineage)
The org has BOTH legacy FinServ__* and native FSC standard objects in use
across different solutions. Hydrate both for any concept covered by both.
Bridge them via LegacyId__c on the native record. See docs/DATA_MODEL.md.

### External-ID field per object
- Most: External_ID__c (capital ID, unique=True)
- Contact: External_Id__c (lowercase d) — case matters
- FinServ__FinancialHolding__c, FinServ__LifeEvent__c: only
  FinServ__SourceSystemId__c
- Native objects without external-id (FinancialAccountParty, PartyProfile,
  ContactPoint*): Id-binding via Phase 3 query-back

### WITH USER_MODE
Any Apex SOQL we ship MUST use WITH USER_MODE. The hydration runner is
admin-context.

### Phase 1 vs Phase 2 boundary
Phase 1 covers customers + related CRM data + CRM campaigns. Phase 2
(separate spec) covers Data Cloud DLO/DMO mapping, Identity Resolution,
Calculated Insights, segments, activations, and FinancialAccountTransaction
ingestion. If a request mentions Data Cloud segmentation, transaction
streams, or activations, that's Phase 2.

## Banker briefs

docs/briefs/*.md is generated by `hydrate.py briefs` from live org data,
not predicted from generator state. Regenerate after every hydration run.
Briefs exist so demo presenters can pull up "what's in Vince West's book"
without querying the org.

## Persona shape rules

Each persona has a fixed set of anchor attributes that drive every
downstream record. Don't add or change anchor attributes without updating
docs/PERSONA_PROFILES.md AND re-running tests — many internal-consistency
tests assert that derived records honor anchors.

## Things that bite

1. FinServ__FinancialAccountNumber__c (legacy) and FinancialAccountNumber
   (native) are both required + indexed. Keep them IDENTICAL across the
   lineage so demos can join via either.
2. Person Account __pc shadow fields — write to non-__pc only. Platform
   copies them.
3. FinServ__BusinessMilestone__c.External_ID__c is a NEW field this
   package adds via force-app/. Other orgs may not have it yet — hydrate.py
   checks via describe and surfaces a clear error if missing.
4. Bulk API 2.0 line endings: --line-ending LF is required.
5. FSC Group Builder API surface has shifted between FSC versions. Phase 5
   wireup tries documented call first, falls back to FscGroupRollupBatch.

## When extending personas

To add a 5th persona:
1. New module in generators/
2. New section in config/personas.yaml
3. New entry in External-ID prefix table in docs/IDEMPOTENCY.md
4. New banker brief template covering the new persona
5. Update docs/PERSONA_PROFILES.md
6. Add tests in tests/test_generators.py

## When the org schema drifts

Phase 0 pre-flight describe step is the canonical guard. If a field is
removed in a future FSC release, generator drops the column and warns
in manifest. If a field is renamed, the old name silently no-ops — surface
this as a TROUBLESHOOTING entry.
```

### Banker brief content

Each banker brief (`docs/briefs/{slug}.md`, ~1.5 pages, generated by `hydrate.py briefs` after a load) contains:

- Header: name, title, role, user Id
- Persona positioning: 1-sentence summary
- Demo angle: what this banker's "day in the life" showcases
- Portfolio table: total customers, persona mix, books of business, avg/total AUM, open opps, open cases, tasks-this-week
- 2–4 sentence persona description
- Bulleted "what demo dashboards should show for this banker"
- 5–10 representative customer vignettes (deterministically sampled by seed) with name, External ID, one-sentence story
- Generation footnote: timestamp + seed for reproducibility

A top-level `docs/BANKER_BRIEFS.md` indexes them with a summary table.

### Phase 1 success criteria

The hydration is "done" when:
1. `python hydrate.py --target-org jdo-fw51xz` runs cleanly end-to-end with zero failures
2. The org contains 10,000 customers spread across the 5 internal RMs per the role-matched distribution
3. Each banker brief MD regenerates from live org data with plausible vignettes
4. `python hydrate.py --reset --confirm` followed by `python hydrate.py --seed 42` produces byte-identical CSV output
5. `python hydrate.py --retail 50 --append` adds exactly 50 retail customers and modifies nothing else
6. `python hydrate.py --rm "Vince West" --wealth 10 --append` adds 10 wealth customers all owned by Vince
7. Web_Engagements_RT_Timeline shows realistic activity for any HYDRATE-* customer (calendar-aware shape)
8. DC_PersonProfileWidget and DC_BusinessProfileWidget show realistic rollups for HYDRATE-* customers
9. All generator unit tests pass + all internal-consistency tests pass
10. AGENTS.md is reviewed and a fresh AI agent can re-invoke the artifact correctly using only that file as context

### Phase 2 explicit non-goals

| Phase 2 deliverable | Why deferred |
|---|---|
| `FinancialAccountTransaction` ingestion | Loaded through Data Cloud DLO, not CRM rows |
| Data Cloud DLO definitions for hydrated CRM objects | Requires data flowing in CRM first; chicken-and-egg with Phase 1 |
| DMO mappings + Identity Resolution rulesets | Same |
| Calculated Insights ("Total AUM", "Lifetime Spend", "Engagement Score") | Built on DMO data |
| Segments ("Retail customers with mortgage approaching ARM reset") | Lives in DC, depends on Calculated Insights |
| Activation targets (Marketing Cloud, Ads, Agentforce skills) | Downstream of segments |
| Spend-categorization shaping logic | Pairs with DLO ingestion |
| Time-series engagement events flowing through `RT_Web_Engagementsv2` Data Graph | Out of scope of customer-shape generation |

These will be addressed by a separate `docs/superpowers/specs/YYYY-MM-DD-customer-hydration-phase-2-data-cloud-design.md` spec.

---

## Open questions

None — all design decisions resolved during brainstorming on 2026-05-19.

## References

- Cumulus product catalog: `Cumulus_Products/docs/PRODUCT_SPECS.md`
- FSC Audit Utilities (sibling pattern for audit-driven Apex): `FSC_Audit_Utilities/`
- Financial Trades Generation (sibling pattern for top-level data-generation package): `Financial_Trades_Generation/`
- Existing org schema reference: `jdo-fw51xz` describe output captured during brainstorming
- JDO monorepo conventions: `README.md`, `docs/MONOREPO_OVERVIEW.md`, `feedback_jdo_claude_md_gitignored.md`
