# Persona profiles

This document expands on §2 of the [Phase 1 spec](superpowers/specs/2026-05-19-customer-hydration-design.md).
It documents each of the four personas the generator emits — Retail,
Wealth, Small Business, Commercial — with their anchor attributes, child
record shapes, and volume distributions across the org's role-aligned
banker pool.

The "anchor attributes" idea is load-bearing: every downstream record
(FAs, goals, cards, holdings, opportunities) is *derived* from the
anchors so the data is internally consistent. A wealth client with $2M
brokerage cannot also have a 540 FICO and a payday-loan-grade card —
anchor-driven derivation prevents those contradictions.

## Volume distribution

Default volumes (per `--retail`, `--wealth`, `--smb`, `--commercial` flags):

| Persona | Default count | Anchor attributes |
|---|---:|---|
| Retail | 7,000 | age, life_stage, household_income, credit_tier, state, marital_status |
| Wealth | 1,200 | age, life_stage, investable_assets, household_income, complexity_tier |
| Small Business | 1,500 | industry, annual_revenue, employee_count, years_in_business, owner_age |
| Commercial | 300 | industry, annual_revenue, employee_count, treasury_complexity, parent_relationship |
| **Total** | **10,000** | |

## RM distribution

Customers are owned by role-aligned RMs with ~5% slack so no banker's
book is perfectly clean.

| Banker | Title | Retail | Wealth | SMB | Commercial | Total |
|---|---|---:|---:|---:|---:|---:|
| Vince West | Relationship Manager (Wealth) | 0 | 700 | 0 | 0 | 700 |
| Kim Johnson | Wealth Advisor | ~50 | 350 | 0 | 0 | ~400 |
| Adam Watson | Financial Advisor Associate | ~50 | 150 | 0 | 0 | ~200 |
| Justin Chen | Relationship Banker | 3,400 | 0 | ~50 | 0 | ~3,450 |
| Standard User | Relationship Banker | 3,400 | 0 | ~50 | 0 | ~3,450 |
| Allen Carter | Commercial RM | 0 | 0 | 1,400 | 300 | 1,700 |

The 21,000-customer figure quoted in `BANKER_BRIEFS.md` reflects the
actual live-org population in `jdo-fw51xz` after multiple `--append`
runs; the table above is the *single-run* default mix.

The Acme Partners users (Sarah Phillips, Paul Partner) are excluded.
Pre-existing 178 non-HYDRATE accounts are never touched.

## Retail

Source: `customer_hydration/generators/retail.py`.

### Anchor draws

```python
age            = triangular(22, 80, mode=42)        # heavy 30-50
life_stage     = young_pro | family_building | established | retiree
income         = lognormal mu=11.0 sigma=0.5
                 clamped to [$35K, $180K]
                 +15% if age >= 45
state          = weighted choice over 15 states (CA/TX/FL heaviest)
marital_status = age-tiered weights (young_pro=70% Single, retiree=50% Married)
```

### Child record shape

| Object | Probability per customer | Logical shape |
|---|---:|---|
| FA — Checking | 1.0 | Cumulus Everyday Checking; balance $500-$8K |
| FA — Savings | 0.6 | Cumulus Statement Savings; balance $500-$25K |
| FA — Mortgage | 0.45 (family_building 0.7) | 30yr Fixed; balance from state median home × LTV |
| FA — HELOC | 0.18 (only if Mortgage) | Line $25K-$200K, drawn 0-60% |
| FA — Auto Loan | 0.5 | $8K-$55K |
| FA — Personal Loan | 0.12 | $3K-$25K |
| FA — CD ladder | 0.15 (retiree 0.45) | per PRODUCT_SPECS rates |
| Card | 1.4 avg | Tier matched to credit_tier (Secured if FICO < 640) |
| Goal | 1.0 avg | Drawn by life_stage |
| LifeEvent | 0.8 avg | Calendar-aware |
| Case | 1.5 avg | Disputed transaction / lost card / Zelle / fee waiver |
| Task | 2.5 avg | RM follow-ups |
| Event | 0.4 avg | Branch consultations |
| Opportunity | 0.25 | HELOC / refi / auto |
| Household member | 0.65 | Spouse + children, linked via ACR |
| Campaign membership | 1-3 | Active campaigns |

### Plan 1+2 actually-emitted shape

The current generator (`generate_retail` in `retail.py`) is a focused
subset of the full spec — Plan 1 + 2 land Account, Checking FA + Role,
and 0.6-probability Savings FA + Role. Subsequent loans/cards/goals are
emitted by the cross-cutting modules (`cards.py`, `goals.py`,
`activity.py`) referencing the retail Account's External_ID__c. The
remaining FA varieties (Mortgage, HELOC, Auto, CD) are tracked for a
follow-on plan; the spec still defines them so dashboards can reference
the future shape.

### Calendar-aware activity

For Cases / Tasks / Events on retail customers (`activity.py`):

- **Tasks**: ~30% have `ActivityDate` in the next 14 days, ~10% are
  overdue, ~60% are historical (Status=Completed).
- **Cases**: status-weighted to mirror real ratios — ~50% Closed,
  10% Working, 15% Waiting on Customer, 10% Reply Received, 10% New,
  5% Escalated. `Priority`: 5% Critical, 20% High, 50% Medium, 25% Low.
- **Opportunities**: `CloseDate` evenly spread across Q-1 / Q0 / Q+1 /
  Q+2. `StageName` from a 5-value subset (Prospecting, Qualification,
  Proposal Issued, Closed Won, Closed Lost) with `Probability` derived.

## Wealth

Source: `customer_hydration/generators/wealth.py`.

### Anchor draws

```python
age                = triangular(45, 80, mode=62)
life_stage         = accumulator | pre_retiree | retiree | legacy
investable_assets  = lognormal mu=14.4 sigma=1.0
                     clamped to [$250K, $25M]
income             = lognormal mu=12.7 sigma=0.5
                     clamped to [$200K, $2.5M]
complexity_tier    = simple (40%) | mid (40%) | complex (20%)
state              = wealth-skewed weights
                     (CA/NY heaviest; CT/MA strong)
marital            = ~80% Married (book skews married)
```

### Child record shape

| Object | Probability | Shape |
|---|---:|---|
| FA — Premier Checking | 1.0 | Balance = 2-6 months income |
| FA — Brokerage | 1.0 | 0.4-0.7 × investable_assets, +8-15 holdings |
| FA — Roth IRA | 0.55 | Cap by life_stage (accumulator $350K, legacy $2M); +4-8 holdings |
| FA — Traditional / Rollover IRA | 0.85 (spec; future plan) | Often largest single |
| FA — Managed Advisory | 0.75 (spec) | Fee-based wrap |
| FA — 529 | 0.35 (spec) | Beneficiary = household child |
| FA — Trust (Rev/Irrev/Charitable) | 0.4 (spec; legacy=0.85) | Trust = own Account, wealth client = Trustee |
| FA — HELOC | 0.4 (spec) | For liquidity |
| Card | 1.8 avg (spec) | Premium tier |
| Holdings | 8-15 (Brokerage), 4-8 (IRA) | From `holding_universe.yaml`; market_value rolls up to FA balance |
| Goal | 2 avg | Estate / college / income / charitable |
| LifeEvent | 1.2 avg | Sale of business / inheritance / spouse retirement |
| Case | 0.8 avg | Trust admin / wire / tax docs |
| Task | 4.0 avg | Annual review / rebalance / estate plan |
| Event | 1.5 avg | Quarterly portfolio review |
| Opportunity | 0.6 | Trust / insurance / held-away |
| Household member | 0.9 | Spouse + adult children |
| Campaign membership | 1-2 | Curated only |

### Holding-balance reconciliation

Holdings sum to ~`fa_target_balance` via random-share allocation; the
generator distributes the FA's target Balance across `num_holdings`
distinct securities so the FA Balance and the sum of related Holdings'
`MarketValue` reconcile within rounding. See
`generators/holdings.py::HoldingRequest` and the runner's holding
post-processing.

## Small Business

Source: `customer_hydration/generators/smb.py`.

### Anchor draws

```python
industry         = weighted (Restaurant 18, Construction 15,
                   Professional Services 14, Retail Trade 13,
                   Healthcare 12, Wholesale 10, Real Estate 8)
annual_revenue   = lognormal mu=13.5 sigma=0.8
                   clamped to [$250K, $10M]
employee_count   = max(5, min(100, revenue / $200K/employee))
years_in_business = uniform(1, 25)
owner_age         = uniform(30, 65)  # used for cross-pollination
state            = weighted (CA/TX/FL heaviest)
```

### Child record shape

| Object | Probability | Shape |
|---|---:|---|
| Contact | 2-4 (spec; Plan 3+) | Owner + COO/CFO + signers, linked via ACR with reciprocal roles |
| FA — Business Checking | 1.0 | Fundamentals (<$1M rev) or Analyzed (>=$1M); balance = 2-4mo revenue |
| FA — Business Savings/Sweep | 0.3 (spec) | |
| FA — Business LOC | 0.55 (spec) | $50K-$1.5M, 60-90% utilized |
| FA — Business Term Loan | 0.6 (current; spec 0.35) | $50K-$500K equipment / expansion |
| FA — SBA Loan | 0.18 (spec) | 7(a) or 504, $150K-$2M |
| FA — Equipment Loan/Lease | 0.25 (spec) | High for Construction/Trucking |
| FA — Commercial Real Estate | 0.15 (spec) | Owner-occupied |
| Card — Corporate/Purchasing | 1.2 avg | Tied to authorized signers |
| BusinessMilestone | 1.5 avg | Founded / hires / revenue / acquisition |
| LifeEvent (on owner Person Account) | 0.4 | Cross-pollination with retail |
| Case | 1.0 avg | ACH return / lockbox / Positive Pay |
| Task | 3.0 avg | LOC renewal / quarterly review |
| Event | 1.0 avg | Onsite visits |
| Opportunity | 0.7 | LOC renewal / treasury / equipment |
| Linked owner Person Account | 1.0 | Linked via ACR with role=Beneficial Owner |
| Owner is also wealth client | 0.3 | Their AUM in their Person Account |
| Campaign membership | 0.8 | SBA Awareness / Treasury Brief |

## Commercial

Source: `customer_hydration/generators/commercial.py`.

### Anchor draws

```python
industry             = weighted (Manufacturing 22, Logistics 18,
                       Healthcare Systems 15, Real Estate Holdings 15,
                       Professional Services Mid-Market 12,
                       Wholesale Distribution 10, Hospitality 8)
annual_revenue       = lognormal larger than SMB
                       clamped to [$10M, $500M]
employee_count       = scaled to revenue
treasury_complexity  = simple | medium | complex
state                = TX/CA/FL heaviest
```

### Child record shape

| Object | Count | Shape |
|---|---:|---|
| Contact | 5-10 (spec; Plan 3+) | CFO/Controller/Treasurer/AP/Procurement + signers, rich ACR roles |
| FA — Business Analyzed Checking | 2-5 (spec) | Operating + payroll + concentration + ZBA |
| FA — Commercial Real Estate Loan | 0.6 | $5M-$80M (logical type "Mortgage" -> Loans) |
| FA — Syndicated Loan | 0.25 (spec) | $25M-$200M, with co-lender notation |
| FA — Asset-Based Lending | 0.35 (spec) | Borrowing base from industry+revenue |
| FA — SBA Loan | 0.05 (spec) | Smaller commercial only |
| FA — Treasury Services (Lockbox/Sweep/ZBA/Positive Pay) | 1.2 avg per service (spec) | Each is an FA-as-service |
| Card — Corporate Card program | 1.0 (spec) | 5-50 cardholders |
| BusinessMilestone | 2.5 avg | Founded / IPO / acquisition / facilities |
| Case | 1.5 avg | Wire / fraud / annual review |
| Task | 5.0 avg | Credit review / covenants / treasury optimization |
| Event | 2.0 avg | Quarterly business review |
| Opportunity | 1.2 | Treasury / LOC / equipment / swaps |
| Account.ParentId | 0.25 | Holding co -> operating subs |
| Campaign membership | 0.6 | Curated executive briefs |

## Cross-persona stitching rules

- **Households.** ~65% of retail and 90% of wealth are members of a
  Household Account (RT=`IndustriesHousehold` or org-default Household
  RT). Members link via `AccountContactRelation` +
  `FinServ__ReciprocalRole__c` (`Spouse`, `Dependent`, `Sibling`,
  `Power of Attorney`).
- **Business owner ↔ personal account.** Every SMB/Commercial has an
  owner Contact. For SMBs (90%) and Commercial (50%) that owner is also
  a Person Account. Linked via `AccountContactRelation` with reciprocal
  role = `Beneficial Owner`.
- **Wealth ↔ Trust.** A Trust is its own Account (RT=Trust) with the
  wealth client linked as Trustee. The Trust's investment FA is owned by
  the Trust, not the individual.
- **Holdings → FA balance reconciliation.** For investment FAs,
  `FinServ__Balance__c` ≈ sum of related Holdings'
  `FinServ__MarketValue__c`. Generator produces holdings first, sums
  them, writes the FA balance.
- **FA Owner roles.** Every FA gets one or more
  `FinServ__FinancialAccountRole__c` rows (Primary Owner, Joint Owner,
  Beneficiary, Authorized Signer, Trustee, Power of Attorney).
- **OwnerId.** Customer Accounts owned by role-aligned RM ±5% slack
  within the same role family.
- **Calendar-aware activity.** All Cases/Tasks/Events: ~30% of Tasks
  have ActivityDate in the next 14 days, ~10% are overdue, ~60%
  historical. Opportunities spread across CloseDate Q-1 / Q0 / Q+1 /
  Q+2. LifeEvents/BusinessMilestones span 0-5 years back.

## Extending with a new persona

Per `AGENTS.md`'s "When extending personas" section, adding a 5th
persona requires:

1. **New module** in `customer_hydration/generators/` — model after
   `retail.py` or `wealth.py`. Use `JDO_FIELDMAP.apply(...)` for every
   logical row before adding to the bundle.
2. **New section** in `config/personas.yaml` declaring volume defaults
   and density toggles.
3. **New entry** in the External-ID prefix table in [IDEMPOTENCY.md](IDEMPOTENCY.md#external-id-namespace)
   — pick a 2-3 letter prefix that isn't already taken (`HYDRATE-NEW-{n}`).
4. **Banker brief template** updated to cover the new persona's
   portfolio rollups.
5. **Update this document** (`PERSONA_PROFILES.md`) — add an "Anchor
   draws" + "Child record shape" subsection with tables matching the
   ones above.
6. **Add tests** in `tests/test_<persona>_generator.py` mirroring
   `test_retail_generator.py` — at minimum, deterministic-seed,
   correct row count, every row carries the expected External-ID
   prefix, and an internal-consistency assertion (e.g. balance honors
   the anchor draw).

The runner orchestration (`runner_p5.py`) iterates over a fixed list of
persona generators; add the new persona to that list and to the CLI
flag (`--newpersona N` defaulting to whatever).

## Cross-references

- [DATA_MODEL.md](DATA_MODEL.md) — every field on every object the personas emit
- [IDEMPOTENCY.md](IDEMPOTENCY.md) — External-ID namespace + reset semantics
- [HOW_TO.md §--rm](HOW_TO.md#scenario-2--top-up-vince-wests-book) — restricting a generator run to a single RM
- [Phase 1 spec §2](superpowers/specs/2026-05-19-customer-hydration-design.md) — original design
