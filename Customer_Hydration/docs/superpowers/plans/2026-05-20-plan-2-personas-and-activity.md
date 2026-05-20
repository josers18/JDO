# Plan 2 — Wealth/SMB/Commercial generators + activity/lifecycle/campaigns

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Customer_Hydration package to cover all 4 personas (Retail at full density, Wealth, Small Business, Commercial) with their full child-record fanout — Cards, Goals, LifeEvents, Cases, Tasks, Events, Opportunities, Households, Campaigns. Correct the Plan 1 field-name drift discovered against `jdo-fw51xz` (use `__pc` shadow fields for Person Account demographics, real picklist values for FA Type / Opportunity Stage / etc., and the actual FSC field names for Cards and Holdings). End-state: a single `python hydrate.py hydrate --personas retail,wealth,smb,commercial --target-org jdo-fw51xz` smoke that lands ~250 customers + thousands of related records.

**Architecture:** Build on the Plan 1 scaffolding (`customer_hydration/` package with seek, preflight, csv_writer, sf_runner, loader, manifest, generators/retail.py, runner_p1.py). Add three new persona generators (`wealth.py`, `smb.py`, `commercial.py`), seven cross-cutting child-record generators (`households.py`, `activity.py`, `lifecycle.py`, `campaigns.py`, `cards.py`, `holdings.py`, `goals.py`), the wider product catalog, an org field-map module that consults `personas.yaml` for which fields exist where (so the AGENTS.md "write to non-`__pc`" guidance is overridable per-field), and replace `runner_p1.py` with `runner_p2.py` that orchestrates the four personas under the same Plan 1 wave dependency. Plan 3 still owns the proper multi-wave bulk loader; Plan 2 keeps the same single-batch loader for the smoke run.

**Tech Stack:** Python 3.11, Faker, PyYAML, python-dateutil, pytest. Salesforce CLI v2 (`sf data upsert bulk`). Target org `jdo-fw51xz`. Anchor date 2026-05-20.

---

## Context the engineer needs

**Working directory:** `/Users/jsifontes/Documents/Git/JDO/.worktrees/customer-hydration-plan-1`. Branch `feat/customer-hydration-plan-1` already has 20 Plan 1 commits. Plan 2 commits stack on top of the same branch. **Do not create a new worktree.**

**Plan 1 baseline (already in jdo-fw51xz):** 50 retail Person Accounts (`HYDRATE-RT-000001` … `HYDRATE-RT-000050`), 50 Checking FAs (`HYDRATE-FA-000001` … `HYDRATE-FA-000050`), 100 FA Roles (50 unique + 50 duplicates from a known re-run wart that Plan 3 fixes). Plan 2 leaves these untouched and appends new records starting at next-unused sequences per prefix.

**Reference spec:** `Customer_Hydration/docs/superpowers/specs/2026-05-19-customer-hydration-design.md` (sections §2 personas, §3 object coverage, §5 idempotency).

**Real schema in `jdo-fw51xz` (verified during Plan 1 smoke + Plan 2 prelude on 2026-05-20).** The spec's field names diverge from the org's actual FSC fields in load-bearing ways. Use this map verbatim:

### Account (Person Account, RecordType `FSC_Person_Accounts`)

Person-account demographics live on the `__pc` shadow form, not on `__c`. The spec's AGENTS.md "write to non-`__pc` only" guidance is **wrong for FSC custom fields** in this org. Plan 2 corrects it.

| Spec said | Actual field |
|---|---|
| `FinServ__TotalAnnualIncome__c` | `FinServ__AnnualIncome__pc` |
| `FinServ__Occupation__c` | `FinServ__Occupation__pc` |
| `FinServ__MaritalStatus__c` | `FinServ__MaritalStatus__pc` |
| `FinServ__NumberOfDependents__c` | `FinServ__NumberOfDependents__pc` |
| `FinServ__Employer__c` | `FinServ__CurrentEmployer__pc` |
| `FinServ__YearsWithEmployer__c` | derive from `FinServ__EmployedSince__pc` (date) |
| `FinServ__RiskToleranceLevel__c` | `FinServ__RiskTolerance__c` |
| `FinServ__BankingPreference__c` | does not exist — drop |
| `FinServ__ClientStatus__c` | does not exist — drop |
| `LeadSource` (on Account) | does not exist on Account in this org — drop or move to Contact |

`FinServ__ClientCategory__c`, `FinServ__InvestmentExperience__c`, `FinServ__SourceSystemId__c`, `External_ID__c`: all exist as the spec said.

### Account (Business)

`Industry`, `Sic`, `AnnualRevenue`, `NumberOfEmployees`, `YearStarted`, `Phone`, `Website`, `BillingStreet/City/State/PostalCode/Country`, `ShippingStreet/City/State/PostalCode/Country`, `Description`, `OwnerId`, `ParentId`: all standard, all exist. `FinServ__ClientCategory__c`: exists, picklist (verify values pre-flight).

### Contact

`External_Id__c` (lowercase d), `FinServ__SourceSystemId__c`. Person-account child contact is auto-created — Plan 2 only emits Contact rows for Business Accounts.

### `FinServ__FinancialAccount__c`

| Spec said | Actual field |
|---|---|
| `FinServ__FinancialAccountType__c = 'Checking'` | picklist with 6 values: `Deposits, Loans, Credit Cards, Investments, Merchant Services, Treasury Management`. Plan 2 maps Cumulus product → category. |
| `FinServ__Status__c = 'Active'` | picklist; canonical "live" value is **`Open`** (`Active` exists too but isn't the standard for new accounts) |
| `FinServ__OpenedDate__c` | `FinServ__OpenDate__c` (Plan 1 already used this — confirm) |
| `FinServ__OwnershipType__c` | `FinServ__Ownership__c` (3 values: `Individual, Joint, Trust`) |
| `FinServ__ProductCode__c` | does not exist — drop. The Cumulus product code is stored in `FinServ__FinancialAccountSource__c` (free text) instead, prefixed `Cumulus:` |
| `FinServ__InterestRate__c` | exists (Plan 1 used this) |
| `FinServ__APR__c` | does not exist — use `FinServ__APY__c` for deposits, `FinServ__InterestRate__c` for loans/cards |
| `FinServ__LoanAmount__c` | exists |
| `FinServ__MaturityDate__c` | does not exist — use `FinServ__LoanEndDate__c` for loans, `FinServ__TermDepositMaturityDate__c` for CDs |
| `FinServ__Branch__c` | does not exist — use `FinServ__BranchName__c` (string) and `FinServ__BranchCode__c` (string) |
| `FinServ__PrimaryOwner__c` | exists (lookup → Account) |
| `FinServ__FinancialAccountNumber__c` | exists |
| `External_ID__c` | exists |

Useful additional FA fields the spec didn't mention but that exist and we should populate:
- `FinServ__APY__c` (deposits), `FinServ__AccrualFrequency__c`, `FinServ__AccruedInterest__c`, `FinServ__ApplicationDate__c` (loans), `FinServ__BookedDate__c` (loans), `FinServ__AvailableCredit__c` (cards), `FinServ__CashLimit__c` (cards), `FinServ__BalanceLastStatement__c`, `FinServ__CashBalance__c`, `FinServ__CurrentPostedBalance__c`, `FinServ__Description__c`, `FinServ__Discretionary__c` (Wealth), `FinServ__EscrowBalance__c` (Mortgage), `FinServ__DrawPeriodMonths__c` (HELOC).

### `FinServ__FinancialAccountRole__c`

Plan 1 already corrected: parent is **`FinServ__RelatedAccount__c`** (not `FinServ__Account__c`). For business signers Plan 2 uses **`FinServ__RelatedContact__c`** (not `FinServ__Contact__c`). `FinServ__Role__c` is a picklist — verify the active values pre-flight (Plan 1 used `Primary Owner`; Plan 2 also needs `Joint Owner`, `Beneficiary`, `Trustee`, `Authorized Signer`, `Power of Attorney`).

### `FinServ__Card__c` — CUSTOM, not FSC-standard

This org overlays a custom Card model on top of FSC. Field names diverge significantly.

| Spec said | Actual field |
|---|---|
| `FinServ__CardType__c` | `Card_Type__c` |
| `FinServ__CardSubType__c` | `Card_Product__c` |
| `FinServ__CardStatus__c` | `Card_Status__c` |
| `FinServ__CardNumber__c` | `Card_Number__c` |
| `FinServ__ExpirationDate__c` | `FinServ__ValidUntil__c` |
| `FinServ__CreditLimit__c` | does not exist — use `FinServ__AccountHolder__c` linked FA's `FinServ__CreditLimit__c` |
| `FinServ__Balance__c` | does not exist on Card — balance lives on the linked FA |
| `FinServ__Account__c` | `FinServ__AccountHolder__c` (lookup → Account) |
| Issued date | `Issued_Date__c` |
| Cardholder name | `Name_On_Card__c` |
| Network | `Payment_Network__c` (Visa / Mastercard / Amex / etc.) |
| Format | `Card_Format__c` (Physical / Virtual / Both) |
| Daily limit | `Daily_Spend_Limit__c` |
| Contactless flag | `Contactless_Enabled__c` |
| FA back-link | `FinServ__FinancialAccount__c` |
| External ID | `External_ID__c` (exists, verified) |

### `FinServ__FinancialHolding__c`

| Spec said | Actual field |
|---|---|
| `FinServ__SecuritySymbol__c` | `FinServ__Symbol__c` |
| `FinServ__SecurityName__c` | `FinServ__Securities__c` |
| `FinServ__Quantity__c` | `FinServ__Shares__c` |
| `FinServ__PurchasePrice__c` | exists |
| `FinServ__CurrentPrice__c` | `FinServ__Price__c` |
| `FinServ__MarketValue__c` | exists |
| `FinServ__CostBasis__c` | does not exist — derive client-side: `Shares * PurchasePrice` |
| `FinServ__AcquiredDate__c` | does not exist — drop |
| `FinServ__SourceSystemId__c` | exists (this object has no `External_ID__c`) |

Useful extras: `FinServ__AssetClass__c`, `FinServ__AssetCategory__c`, `FinServ__AssetCategoryName__c`, `FinServ__GainLoss__c`, `FinServ__PercentChange__c`, `FinServ__Household__c`, `FinServ__PrimaryOwner__c`.

### `FinServ__FinancialGoal__c`

| Spec said | Actual field |
|---|---|
| `FinServ__GoalType__c` | `FinServ__Type__c` (picklist: `Retirement, Home Purchase, Education, New Business Acquisition, New Customer Acquisition, New Services, Large Purchase, Investment, Other`) |
| `FinServ__TargetAmount__c` | `FinServ__TargetValue__c` |
| `FinServ__CurrentAmount__c` | `FinServ__ActualValue__c` |
| `FinServ__TargetDate__c` | exists |
| `FinServ__Priority__c` | does not exist — drop |
| `FinServ__Status__c` | picklist: `Not Started, In Progress, Completed` (no `On Track`, `At Risk`, `Achieved`) |
| `FinServ__PrimaryOwner__c` | exists |
| `External_ID__c` | exists |

Useful extras: `FinServ__InitialValue__c`, `FinServ__CompletionDate__c`, `FinServ__Description__c`, `FinServ__Household__c`.

### `FinServ__LifeEvent__c`

| Spec said | Actual field |
|---|---|
| `FinServ__EventType__c` | picklist: `New Baby, New Job, New Home, College, New Business, Retirement` (only 6 values — drop spec's `Marriage, Divorce, Death of Spouse, Inheritance, Sale of Business, Diagnosis`) |
| `FinServ__EventDate__c` | exists |
| `FinServ__Account__c` | **`FinServ__Client__c`** (lookup → Account) |
| `FinServ__Contact__c` | does not exist — life events go on the Person Account (Client), not on a separate Contact |
| `FinServ__Status__c` | does not exist on this object — drop (`FinServ__GoalType__c` is the second active picklist instead) |
| `FinServ__SourceSystemId__c` | exists (no External_ID__c) |

Useful extras: `FinServ__DiscussionNote__c` (free text — perfect for the persona-flavored "discussion note"), `FinServ__GoalType__c` (link to a goal type), `FinServ__FinancialGoal__c` (lookup → Goal).

### `FinServ__BusinessMilestone__c`

**This object is NOT installed in `jdo-fw51xz`.** Plan 5 / spec §6 was going to ship a new `External_ID__c` field on it via `force-app/`, but the object itself doesn't exist. Two options:

1. **Skip legacy BusinessMilestone entirely.** SMB and Commercial milestones go ONLY on the native `BusinessMilestone` standard object (Plan 4 / native lineage).
2. **Install the FSC managed package extension** that includes it — out of scope for Plan 2.

**Plan 2 chooses option 1.** SMB and Commercial generators emit a TODO list of milestones for Plan 4 to convert into native `BusinessMilestone` rows. No legacy milestone CSV in Plan 2.

### Opportunity

| Spec said | Actual picklist |
|---|---|
| `StageName: Prospecting / Qualification / Needs Analysis / Proposal / Negotiation / Closed Won / Closed Lost` | actual: `Prospecting, Initial Due Diligence, Term Sheet Issued, Background Check, OBA Review, Prospect, Pre-Approval, Interested, Submission, Underwrite, Review, Qualification, Proposal Issued, Preparation, Discovery` (15 values; some are RT-specific) |
| `Type: New Business / Existing Business` | actual: `Add-On Business, Endorsement, New Business, Renewal, Services` |

Plan 2 simplifies: use `Prospecting`, `Qualification`, `Proposal Issued`, `Closed Won`, `Closed Lost` as the working subset (all five are confirmed valid). For Type use `New Business` and `Renewal`. Standard fields: `Name`, `AccountId`, `OwnerId`, `Probability`, `Amount`, `CloseDate`, `LeadSource` (do NOT use; spec said `Hydration`, but verify on Opportunity), `Description`, `External_ID__c`.

### Case

| Field | Picklist values |
|---|---|
| `Type` | `Product Support, Account Support, General, Technical Issue` (4 values; spec was free-text) |
| `Status` | `New, Working, Waiting on Customer, Reply Received, Escalated, Closed` |
| `Reason` | `Problem Resolved, Documentation Issue, Existing problem, Mail delivery issue, New problem, Hardware Issue, Software Issue, Feature Request, Fraud Concern, Mobile Issue, Password Reset, General Inquiry, Mortgage Inquiry, Check Reorder, Card Reorder` |
| `Origin` | `Chat, Community, Email, Facebook, Google, Instagram, LinkedIn, Mobile Device, Phone, Slack, SMS, Twitter, Website` |
| `Priority` | `Critical, High, Medium, Low` |

`Subject` and `Description` are free text — the persona-flavored content from the spec goes there. Use `Type='Account Support'` for retail banking issues, `Type='Product Support'` for FA-specific issues, `Type='General'` for vague inquiries, `Type='Technical Issue'` for digital channel problems.

`AccountId`, `ContactId`, `OwnerId`, `RecordTypeId`, `External_ID__c` all exist and work as the spec said.

### Task / Event

Standard fields (`Subject`, `Status`, `Priority`, `Type`, `ActivityDate`, `WhatId`, `WhoId`, `OwnerId`, `Description`) all work. `External_ID__c` exists on both. `FinServ__Household__c` lookup is available for grouping. Person-account `WhoId` resolution — assign to the Person Account's auto-generated Contact Id (queried at runtime).

### AccountContactRelation

Standard fields work. `Roles` is a multiselect picklist — verify allowed values in pre-flight describe (likely `Beneficial Owner, Authorized Signer, Trustee, Spouse, Dependent, Guarantor, Power of Attorney`). `External_ID__c` exists.

### Campaign / CampaignMember

Standard fields work. `External_ID__c` exists on both.

### Native `BusinessMilestone` (standard FSC object)

Confirmed installed (Plan 1's prelude verified). Plan 2 doesn't write to it — that's Plan 4's native-lineage scope. Plan 2 emits "milestone payload" rows into a YAML/JSON intermediate file that Plan 4 consumes and translates.

---

## Plan 2 scope (what gets implemented)

### Per-persona generator coverage matrix

For Plan 2 the **smoke target volume is small** (~250 customers total, vs the 10K full target) so the load completes in <10 minutes and exposes shape errors quickly. Plan 3 raises volumes via the multi-wave loader.

| Persona | Plan 2 smoke volume | Account density |
|---|---:|---|
| Retail | 100 (replaces Plan 1's 50 + 50 = 100 already in org; we re-upsert to the same external IDs to refresh shape with the field-name corrections) | full Plan 1 fields, plus Savings/HYSA, 1 Card per customer, 1 Goal, 0–1 LifeEvent, 0–1 Case, 0–2 Tasks |
| Wealth | 80 | Premier Checking + Brokerage + Roth IRA + 4–10 Holdings, 1 Card, 1–2 Goals, 1 LifeEvent, 1 Case, 1–3 Tasks, 1 Opportunity |
| SMB | 50 | Business Account + 1–2 Contacts via ACR, Business Checking + 1 Term Loan, 1 Corporate Card, 0–1 Goal, 1 Case, 1–2 Tasks, 1 Opportunity |
| Commercial | 20 | Business Account + 3–5 Contacts via ACR, Business Checking + 1 Real Estate Loan, 0–1 Goal, 0–2 Cases, 2–4 Tasks, 1–2 Opportunities |

Total Plan 2 smoke: ~250 customers, ~250 FAs, ~150 Cards, ~250 Goals, ~150 LifeEvents, ~250 Cases, ~600 Tasks, ~150 Opportunities, ~80 Holdings, ~10 Campaigns, ~250 CampaignMembers, ~150 ACR rows. **Total ~2,500 rows** — small enough for a 10-minute smoke that catches shape errors before Plan 3's multi-wave loader scales it 350x.

### Replaces Plan 1's runner

`runner_p1.py` is replaced by `runner_p2.py`. The CLI's `_run_hydrate` import target swings to `runner_p2`. Plan 1's runner stays in the codebase but is unwired (kept for one release cycle for diff visibility, deleted in Plan 3).

### Field-map module

A new `customer_hydration/fieldmap.py` module owns the spec→actual field-name translation. Generators consult it to translate "logical field names" (what the spec says) to "physical field names" (what the org accepts). When org schema changes, only `fieldmap.py` updates — generators stay agnostic. This is Plan 2's main architectural addition.

---

## File structure produced by Plan 2

```
Customer_Hydration/
├── customer_hydration/
│   ├── fieldmap.py                              # NEW — spec→actual field-name translation
│   ├── runner_p2.py                             # NEW — replaces runner_p1.py wiring
│   └── generators/
│       ├── retail.py                            # MODIFIED — corrected field names + extends to Savings, Card, Goal, LifeEvent, Case, Task
│       ├── wealth.py                            # NEW
│       ├── smb.py                               # NEW
│       ├── commercial.py                        # NEW
│       ├── households.py                        # NEW
│       ├── activity.py                          # NEW (Cases + Tasks + Events + Opportunities)
│       ├── lifecycle.py                         # NEW (Goals + LifeEvents)
│       ├── campaigns.py                         # NEW (Campaign + CampaignMember)
│       ├── cards.py                             # NEW
│       └── holdings.py                          # NEW (Wealth-only)
├── config/
│   ├── personas.yaml                            # EXTENDED — wealth, smb, commercial sections
│   ├── product_catalog.yaml                     # EXTENDED — full Cumulus catalog (~55 products)
│   └── holding_universe.yaml                    # NEW — ~40 tickers for wealth holdings
├── tests/
│   ├── test_fieldmap.py                         # NEW
│   ├── test_retail_generator.py                 # MODIFIED — updated assertions for new field names
│   ├── test_wealth_generator.py                 # NEW
│   ├── test_smb_generator.py                    # NEW
│   ├── test_commercial_generator.py             # NEW
│   ├── test_household_generator.py              # NEW
│   ├── test_activity_generator.py               # NEW
│   ├── test_lifecycle_generator.py              # NEW
│   ├── test_campaign_generator.py               # NEW
│   ├── test_card_generator.py                   # NEW
│   └── test_holding_generator.py                # NEW
└── docs/
    └── superpowers/plans/2026-05-20-plan-2-personas-and-activity.md  # this file
```

---

## Conventions the engineer must follow

- All work happens INSIDE the worktree at `/Users/jsifontes/Documents/Git/JDO/.worktrees/customer-hydration-plan-1`. Branch is `feat/customer-hydration-plan-1` (do NOT create a new branch).
- Use the **Write** tool to create new files. Use **Edit** to modify existing files. Reserve **Bash** for `git`, `pytest`, and `sf` invocations.
- All generators consume the field-map (`fieldmap.py`) for any field whose name differs from the spec. Adding a new field should mean adding one row to the field-map, not editing every generator.
- TDD: write failing tests first, then make them pass. The Plan 1 cadence (TDD-pair commits) is the baseline.
- Generators emit Python `dict` rows. The CSV writer (Plan 1's `csv_writer.py`) drops unknown fields silently via Phase 0's preflight cache. Generators may emit BOTH the logical name AND the physical name during transition; tests assert on the physical name.
- Commit cadence: one commit per task. Commit messages from the steps verbatim.
- All `sf` SOQL we add (none in Plan 2 — already in `sf_runner.py`) must use `WITH USER_MODE`. We don't add new SOQL.
- Never push to remote. All work stays local on `feat/customer-hydration-plan-1`.

---

## Task 1: Update AGENTS.md with the field-map convention

**Files:**
- Modify: `Customer_Hydration/AGENTS.md`

The Plan 1 AGENTS.md said "Person Account `__pc` shadow fields — write to non-`__pc` only. Platform copies them." That's correct for *standard* person fields (FirstName, etc.) but NOT for *FSC custom* person fields in this org. Update the guidance.

- [ ] **Step 1: Edit the "Things that bite" section in AGENTS.md**

Replace the existing item 2:

```markdown
2. Person Account __pc shadow fields — write to non-__pc only. Platform
   copies them.
```

With:

```markdown
2. Person Account __pc shadow fields — STANDARD person fields (FirstName,
   LastName, PersonBirthdate, etc.) work without __pc; the platform copies.
   But FSC __c custom person fields (FinServ__AnnualIncome__c,
   FinServ__Occupation__c, FinServ__MaritalStatus__c, FinServ__CurrentEmployer__c,
   FinServ__NumberOfDependents__c, FinServ__EmployedSince__c) DO NOT exist
   on Account in this org's FSC version — only the __pc shadow does. Always
   consult `customer_hydration/fieldmap.py` for the real per-field name in
   this org. The fieldmap gets it right; the spec didn't.
```

- [ ] **Step 2: Add a new "Things that bite" item about picklist values**

Append as item 6 in the "Things that bite" section:

```markdown
6. FSC picklists are RESTRICTIVE in this org. The spec invented
   FinServ__FinancialAccountType__c values like "Checking" — the actual
   picklist has 6 values: Deposits, Loans, Credit Cards, Investments,
   Merchant Services, Treasury Management. Plan 2's `fieldmap.py` maps
   logical types ("Checking", "Mortgage") to the real picklist. Same for
   FinServ__Status__c (canonical "live" value is "Open", not "Active"),
   FinServ__Ownership__c (Individual / Joint / Trust only),
   Opportunity.StageName (15 values, not the spec's 7), Case.Type (4 values),
   FinServ__LifeEvent__c.FinServ__EventType__c (only 6 values).
```

- [ ] **Step 3: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO/.worktrees/customer-hydration-plan-1
git add Customer_Hydration/AGENTS.md
git commit -m "docs(customer-hydration): correct AGENTS.md __pc + picklist guidance for Plan 2"
```

---

## Task 2: Create fieldmap.py — the spec→actual field translator

**Files:**
- Create: `Customer_Hydration/tests/test_fieldmap.py`
- Create: `Customer_Hydration/customer_hydration/fieldmap.py`

The field-map is a pure-Python module exposing a dict-like API: `fieldmap.physical("Account", "FinServ__TotalAnnualIncome__c")` → `"FinServ__AnnualIncome__pc"`. Picklist value translation: `fieldmap.picklist_value("FinServ__FinancialAccount__c", "FinServ__FinancialAccountType__c", "Checking")` → `"Deposits"`. Generators consult it for every field name; tests verify the translations.

- [ ] **Step 1: Write the failing test**

`Customer_Hydration/tests/test_fieldmap.py`:

```python
"""Tests for the spec→actual field-name translator."""
from __future__ import annotations

import pytest

from customer_hydration.fieldmap import FieldMap, JDO_FIELDMAP


class TestPhysicalNameTranslation:
    def test_account_personal_demographics_use_pc_shadow(self):
        fm = JDO_FIELDMAP
        assert fm.physical("Account", "FinServ__TotalAnnualIncome__c") == "FinServ__AnnualIncome__pc"
        assert fm.physical("Account", "FinServ__Occupation__c") == "FinServ__Occupation__pc"
        assert fm.physical("Account", "FinServ__MaritalStatus__c") == "FinServ__MaritalStatus__pc"
        assert fm.physical("Account", "FinServ__NumberOfDependents__c") == "FinServ__NumberOfDependents__pc"
        assert fm.physical("Account", "FinServ__Employer__c") == "FinServ__CurrentEmployer__pc"
        assert fm.physical("Account", "FinServ__RiskToleranceLevel__c") == "FinServ__RiskTolerance__c"

    def test_account_unmapped_fields_pass_through(self):
        fm = JDO_FIELDMAP
        # FirstName / LastName / PersonBirthdate / OwnerId / Industry are spec=actual
        assert fm.physical("Account", "FirstName") == "FirstName"
        assert fm.physical("Account", "OwnerId") == "OwnerId"

    def test_account_dropped_fields_return_none(self):
        fm = JDO_FIELDMAP
        # FinServ__BankingPreference__c, FinServ__ClientStatus__c, LeadSource don't exist
        assert fm.physical("Account", "FinServ__BankingPreference__c") is None
        assert fm.physical("Account", "FinServ__ClientStatus__c") is None
        assert fm.physical("Account", "LeadSource") is None

    def test_financial_account_field_renames(self):
        fm = JDO_FIELDMAP
        assert fm.physical("FinServ__FinancialAccount__c", "FinServ__OpenedDate__c") == "FinServ__OpenDate__c"
        assert fm.physical("FinServ__FinancialAccount__c", "FinServ__OwnershipType__c") == "FinServ__Ownership__c"
        assert fm.physical("FinServ__FinancialAccount__c", "FinServ__APR__c") == "FinServ__InterestRate__c"
        assert fm.physical("FinServ__FinancialAccount__c", "FinServ__MaturityDate__c") == "FinServ__LoanEndDate__c"
        assert fm.physical("FinServ__FinancialAccount__c", "FinServ__ProductCode__c") is None  # dropped

    def test_card_field_renames(self):
        fm = JDO_FIELDMAP
        assert fm.physical("FinServ__Card__c", "FinServ__CardType__c") == "Card_Type__c"
        assert fm.physical("FinServ__Card__c", "FinServ__CardSubType__c") == "Card_Product__c"
        assert fm.physical("FinServ__Card__c", "FinServ__CardStatus__c") == "Card_Status__c"
        assert fm.physical("FinServ__Card__c", "FinServ__CardNumber__c") == "Card_Number__c"
        assert fm.physical("FinServ__Card__c", "FinServ__ExpirationDate__c") == "FinServ__ValidUntil__c"
        assert fm.physical("FinServ__Card__c", "FinServ__Account__c") == "FinServ__AccountHolder__c"

    def test_holding_field_renames(self):
        fm = JDO_FIELDMAP
        assert fm.physical("FinServ__FinancialHolding__c", "FinServ__SecuritySymbol__c") == "FinServ__Symbol__c"
        assert fm.physical("FinServ__FinancialHolding__c", "FinServ__SecurityName__c") == "FinServ__Securities__c"
        assert fm.physical("FinServ__FinancialHolding__c", "FinServ__Quantity__c") == "FinServ__Shares__c"
        assert fm.physical("FinServ__FinancialHolding__c", "FinServ__CurrentPrice__c") == "FinServ__Price__c"
        assert fm.physical("FinServ__FinancialHolding__c", "FinServ__CostBasis__c") is None  # derive client-side
        assert fm.physical("FinServ__FinancialHolding__c", "FinServ__AcquiredDate__c") is None  # dropped

    def test_goal_field_renames(self):
        fm = JDO_FIELDMAP
        assert fm.physical("FinServ__FinancialGoal__c", "FinServ__GoalType__c") == "FinServ__Type__c"
        assert fm.physical("FinServ__FinancialGoal__c", "FinServ__TargetAmount__c") == "FinServ__TargetValue__c"
        assert fm.physical("FinServ__FinancialGoal__c", "FinServ__CurrentAmount__c") == "FinServ__ActualValue__c"
        assert fm.physical("FinServ__FinancialGoal__c", "FinServ__Priority__c") is None

    def test_life_event_field_renames(self):
        fm = JDO_FIELDMAP
        assert fm.physical("FinServ__LifeEvent__c", "FinServ__Account__c") == "FinServ__Client__c"
        assert fm.physical("FinServ__LifeEvent__c", "FinServ__Contact__c") is None  # no contact on life events
        assert fm.physical("FinServ__LifeEvent__c", "FinServ__Status__c") is None

    def test_role_field_renames(self):
        fm = JDO_FIELDMAP
        assert fm.physical("FinServ__FinancialAccountRole__c", "FinServ__Account__c") == "FinServ__RelatedAccount__c"
        assert fm.physical("FinServ__FinancialAccountRole__c", "FinServ__Contact__c") == "FinServ__RelatedContact__c"


class TestPicklistValueTranslation:
    def test_financial_account_type_logical_to_physical(self):
        fm = JDO_FIELDMAP
        # Logical "Checking" → physical "Deposits" (the FSC category)
        assert fm.picklist_value("FinServ__FinancialAccount__c", "FinServ__FinancialAccountType__c", "Checking") == "Deposits"
        assert fm.picklist_value("FinServ__FinancialAccount__c", "FinServ__FinancialAccountType__c", "Savings") == "Deposits"
        assert fm.picklist_value("FinServ__FinancialAccount__c", "FinServ__FinancialAccountType__c", "Mortgage") == "Loans"
        assert fm.picklist_value("FinServ__FinancialAccount__c", "FinServ__FinancialAccountType__c", "HELOC") == "Loans"
        assert fm.picklist_value("FinServ__FinancialAccount__c", "FinServ__FinancialAccountType__c", "Credit Card") == "Credit Cards"
        assert fm.picklist_value("FinServ__FinancialAccount__c", "FinServ__FinancialAccountType__c", "Brokerage") == "Investments"
        assert fm.picklist_value("FinServ__FinancialAccount__c", "FinServ__FinancialAccountType__c", "IRA") == "Investments"

    def test_financial_account_status_default(self):
        fm = JDO_FIELDMAP
        # Spec said "Active" — physical canonical is "Open"
        assert fm.picklist_value("FinServ__FinancialAccount__c", "FinServ__Status__c", "Active") == "Open"
        # "Closed" passes through
        assert fm.picklist_value("FinServ__FinancialAccount__c", "FinServ__Status__c", "Closed") == "Closed"

    def test_unknown_logical_value_passes_through(self):
        fm = JDO_FIELDMAP
        # If we ask for a value the fieldmap doesn't know, return as-is
        assert fm.picklist_value("FinServ__FinancialAccount__c", "FinServ__Ownership__c", "Joint") == "Joint"


class TestApplyToRow:
    def test_apply_renames_keys_and_drops_none(self):
        fm = JDO_FIELDMAP
        row = {
            "FirstName": "Alice",
            "FinServ__TotalAnnualIncome__c": 100000,
            "FinServ__BankingPreference__c": "Mobile",  # dropped
            "FinServ__Occupation__c": "Engineer",
        }
        physical = fm.apply("Account", row)
        assert physical == {
            "FirstName": "Alice",
            "FinServ__AnnualIncome__pc": 100000,
            "FinServ__Occupation__pc": "Engineer",
        }
        # Dropped fields are absent — not None
        assert "FinServ__BankingPreference__c" not in physical
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd /Users/jsifontes/Documents/Git/JDO/.worktrees/customer-hydration-plan-1/Customer_Hydration
source .venv/bin/activate
pytest tests/test_fieldmap.py -v
```

Expected: `ModuleNotFoundError: No module named 'customer_hydration.fieldmap'`.

- [ ] **Step 3: Implement fieldmap.py**

`Customer_Hydration/customer_hydration/fieldmap.py`:

```python
"""Spec→actual field-name and picklist-value translator.

The Customer_Hydration spec was written against an idealized FSC schema.
This org (jdo-fw51xz) has subtly different field names and a stricter
picklist surface. Generators emit "logical" names matching the spec; this
module translates them to "physical" names the org actually accepts. The
CSV writer's preflight-driven field-drop is the second layer of defense.

When the org schema changes, this is the ONLY file that should need
updates — generators and tests stay schema-agnostic.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


# Per-sObject mapping: logical_name -> physical_name OR None (drop)
# None means the spec named a field that doesn't exist in this org. Drop it.
_FIELD_RENAMES: dict[str, dict[str, Optional[str]]] = {
    "Account": {
        "FinServ__TotalAnnualIncome__c": "FinServ__AnnualIncome__pc",
        "FinServ__Occupation__c": "FinServ__Occupation__pc",
        "FinServ__MaritalStatus__c": "FinServ__MaritalStatus__pc",
        "FinServ__NumberOfDependents__c": "FinServ__NumberOfDependents__pc",
        "FinServ__Employer__c": "FinServ__CurrentEmployer__pc",
        "FinServ__YearsWithEmployer__c": None,  # derive from FinServ__EmployedSince__pc
        "FinServ__RiskToleranceLevel__c": "FinServ__RiskTolerance__c",
        "FinServ__BankingPreference__c": None,
        "FinServ__ClientStatus__c": None,
        "LeadSource": None,
    },
    "FinServ__FinancialAccount__c": {
        "FinServ__OpenedDate__c": "FinServ__OpenDate__c",
        "FinServ__OwnershipType__c": "FinServ__Ownership__c",
        "FinServ__APR__c": "FinServ__InterestRate__c",
        "FinServ__MaturityDate__c": "FinServ__LoanEndDate__c",
        "FinServ__Branch__c": "FinServ__BranchName__c",
        "FinServ__ProductCode__c": None,
    },
    "FinServ__FinancialAccountRole__c": {
        "FinServ__Account__c": "FinServ__RelatedAccount__c",
        "FinServ__Contact__c": "FinServ__RelatedContact__c",
    },
    "FinServ__Card__c": {
        "FinServ__CardType__c": "Card_Type__c",
        "FinServ__CardSubType__c": "Card_Product__c",
        "FinServ__CardStatus__c": "Card_Status__c",
        "FinServ__CardNumber__c": "Card_Number__c",
        "FinServ__ExpirationDate__c": "FinServ__ValidUntil__c",
        "FinServ__CreditLimit__c": None,  # lives on the linked FA
        "FinServ__Balance__c": None,  # lives on the linked FA
        "FinServ__Account__c": "FinServ__AccountHolder__c",
    },
    "FinServ__FinancialHolding__c": {
        "FinServ__SecuritySymbol__c": "FinServ__Symbol__c",
        "FinServ__SecurityName__c": "FinServ__Securities__c",
        "FinServ__Quantity__c": "FinServ__Shares__c",
        "FinServ__CurrentPrice__c": "FinServ__Price__c",
        "FinServ__CostBasis__c": None,  # derive client-side: Shares * PurchasePrice
        "FinServ__AcquiredDate__c": None,
    },
    "FinServ__FinancialGoal__c": {
        "FinServ__GoalType__c": "FinServ__Type__c",
        "FinServ__TargetAmount__c": "FinServ__TargetValue__c",
        "FinServ__CurrentAmount__c": "FinServ__ActualValue__c",
        "FinServ__Priority__c": None,
    },
    "FinServ__LifeEvent__c": {
        "FinServ__Account__c": "FinServ__Client__c",
        "FinServ__Contact__c": None,
        "FinServ__Status__c": None,
    },
}


# Per-(sObject, fieldname): logical_value -> physical_value
# Used for restrictive picklists where the spec invented values that don't exist.
_PICKLIST_VALUES: dict[tuple[str, str], dict[str, str]] = {
    ("FinServ__FinancialAccount__c", "FinServ__FinancialAccountType__c"): {
        # Logical product type → physical FSC category
        "Checking": "Deposits",
        "Savings": "Deposits",
        "HYSA": "Deposits",
        "Money Market": "Deposits",
        "CD": "Deposits",
        "Mortgage": "Loans",
        "HELOC": "Loans",
        "Auto Loan": "Loans",
        "Personal Loan": "Loans",
        "Term Loan": "Loans",
        "SBA Loan": "Loans",
        "Credit Card": "Credit Cards",
        "Brokerage": "Investments",
        "Managed Advisory": "Investments",
        "IRA": "Investments",
        "Roth IRA": "Investments",
        "529": "Investments",
        "Trust Account": "Investments",
        "Premier Checking": "Deposits",
        "Business Checking": "Deposits",
        "Lockbox": "Treasury Management",
        "Sweep": "Treasury Management",
        "ZBA": "Treasury Management",
        "Positive Pay": "Treasury Management",
        "Wire Transfer": "Treasury Management",
        "ACH": "Treasury Management",
        "Merchant Services": "Merchant Services",
    },
    ("FinServ__FinancialAccount__c", "FinServ__Status__c"): {
        "Active": "Open",  # spec said Active, canonical "live" is Open
    },
}


@dataclass
class FieldMap:
    """Translate logical (spec) names to physical (org-actual) names."""

    renames: dict[str, dict[str, Optional[str]]] = field(default_factory=dict)
    picklist_values: dict[tuple[str, str], dict[str, str]] = field(default_factory=dict)

    def physical(self, sobject: str, logical_field: str) -> Optional[str]:
        """Return the physical field name, or None if the field is dropped.

        Unmapped fields pass through (e.g., FirstName → FirstName).
        """
        sobject_renames = self.renames.get(sobject, {})
        if logical_field in sobject_renames:
            return sobject_renames[logical_field]
        return logical_field

    def picklist_value(self, sobject: str, fieldname: str, logical_value: str) -> str:
        """Translate a logical picklist value to the org-accepted value."""
        mapping = self.picklist_values.get((sobject, fieldname), {})
        return mapping.get(logical_value, logical_value)

    def apply(self, sobject: str, row: dict) -> dict:
        """Translate every key in `row` from logical to physical names.

        Keys that map to None are dropped entirely. Picklist values are NOT
        translated by apply() — generators call picklist_value() directly
        when they need the translation.
        """
        result: dict = {}
        for logical_key, value in row.items():
            physical_key = self.physical(sobject, logical_key)
            if physical_key is None:
                continue
            result[physical_key] = value
        return result


JDO_FIELDMAP = FieldMap(
    renames=_FIELD_RENAMES,
    picklist_values=_PICKLIST_VALUES,
)
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd /Users/jsifontes/Documents/Git/JDO/.worktrees/customer-hydration-plan-1/Customer_Hydration
source .venv/bin/activate
pytest tests/test_fieldmap.py -v
```

Expected: 14 passed (counts for the test classes above).

- [ ] **Step 5: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO/.worktrees/customer-hydration-plan-1
git add Customer_Hydration/customer_hydration/fieldmap.py \
    Customer_Hydration/tests/test_fieldmap.py
git commit -m "feat(customer-hydration): add fieldmap.py for spec→actual field translation"
```

---

## Task 3: Update retail.py to use fieldmap + add Savings child record

**Files:**
- Modify: `Customer_Hydration/customer_hydration/generators/retail.py`
- Modify: `Customer_Hydration/tests/test_retail_generator.py`

The Plan 1 retail generator emitted spec field names (which Phase 0 silently dropped 12 of). Plan 2 routes every emit through the fieldmap so the dropped fields actually populate. Also extends retail to include a Savings child FA at probability 0.6.

- [ ] **Step 1: Modify the test file to assert physical field names + Savings**

Edit `Customer_Hydration/tests/test_retail_generator.py`. Replace the field assertions in the existing tests AND add new tests for the Savings extension.

Find the existing test `test_household_income_in_range`:
```python
def test_household_income_in_range(self, gen_kwargs):
    bundle = generate_retail(**gen_kwargs)
    for acct in bundle.accounts:
        income = acct["FinServ__TotalAnnualIncome__c"]
        assert 35000 <= income <= 180000
```

Replace with:
```python
def test_household_income_in_range_pc_field(self, gen_kwargs):
    bundle = generate_retail(**gen_kwargs)
    for acct in bundle.accounts:
        income = acct["FinServ__AnnualIncome__pc"]
        assert 35000 <= income <= 180000
```

Add new tests at the end of the `TestGenerateRetail` class (before the seed-determinism tests):

```python
    def test_account_emits_pc_shadow_demographic_fields(self, gen_kwargs):
        bundle = generate_retail(**gen_kwargs)
        for acct in bundle.accounts:
            assert "FinServ__Occupation__pc" in acct
            assert "FinServ__MaritalStatus__pc" in acct
            assert "FinServ__NumberOfDependents__pc" in acct
            assert "FinServ__CurrentEmployer__pc" in acct

    def test_account_does_not_emit_dropped_fields(self, gen_kwargs):
        bundle = generate_retail(**gen_kwargs)
        for acct in bundle.accounts:
            assert "FinServ__BankingPreference__c" not in acct
            assert "FinServ__ClientStatus__c" not in acct
            assert "LeadSource" not in acct

    def test_fa_uses_deposits_category_for_checking(self, gen_kwargs):
        bundle = generate_retail(**gen_kwargs)
        for fa in bundle.financial_accounts:
            if "Checking" in fa["Name"]:
                assert fa["FinServ__FinancialAccountType__c"] == "Deposits"

    def test_fa_status_is_open_not_active(self, gen_kwargs):
        bundle = generate_retail(**gen_kwargs)
        for fa in bundle.financial_accounts:
            assert fa["FinServ__Status__c"] == "Open"

    def test_fa_uses_open_date_not_opened_date(self, gen_kwargs):
        bundle = generate_retail(**gen_kwargs)
        for fa in bundle.financial_accounts:
            assert "FinServ__OpenDate__c" in fa
            assert "FinServ__OpenedDate__c" not in fa

    def test_fa_uses_ownership_not_ownership_type(self, gen_kwargs):
        bundle = generate_retail(**gen_kwargs)
        for fa in bundle.financial_accounts:
            assert fa["FinServ__Ownership__c"] == "Individual"
            assert "FinServ__OwnershipType__c" not in fa

    def test_savings_added_at_probability_0_6(self, gen_kwargs):
        # With seed=42 and n=50, expect roughly 30 customers with savings
        gen_kwargs["n"] = 200
        bundle = generate_retail(**gen_kwargs)
        savings_count = sum(1 for fa in bundle.financial_accounts if "Savings" in fa["Name"])
        # Probability 0.6 with n=200 → expect 100-140 savings accounts
        assert 100 <= savings_count <= 140

    def test_savings_fa_uses_apy_field(self, gen_kwargs):
        gen_kwargs["n"] = 200
        bundle = generate_retail(**gen_kwargs)
        savings_fas = [fa for fa in bundle.financial_accounts if "Savings" in fa["Name"]]
        assert len(savings_fas) > 0
        for sav in savings_fas:
            assert "FinServ__APY__c" in sav

    def test_savings_fa_external_id_uses_separate_sequence(self, gen_kwargs):
        gen_kwargs["n"] = 50
        bundle = generate_retail(**gen_kwargs)
        # Savings FAs use HYDRATE-FA-* sequence too, but offset from checking
        # The sequence advances within the bundle: checking occupies n slots,
        # savings occupies <=n more slots starting at HYDRATE-FA-<n+1>.
        checking_ids = [fa["External_ID__c"] for fa in bundle.financial_accounts if "Checking" in fa["Name"]]
        savings_ids = [fa["External_ID__c"] for fa in bundle.financial_accounts if "Savings" in fa["Name"]]
        # No overlap
        assert set(checking_ids).isdisjoint(set(savings_ids))
```

- [ ] **Step 2: Run modified tests to confirm they fail (RED)**

```bash
cd /Users/jsifontes/Documents/Git/JDO/.worktrees/customer-hydration-plan-1/Customer_Hydration
source .venv/bin/activate
pytest tests/test_retail_generator.py -v
```

Expected: ~9 failures (the 6 modified existing tests + 9 new tests; some new ones will pass on the legacy code if they test absence-of-field).

- [ ] **Step 3: Update retail.py to use fieldmap + emit Savings**

Edit `Customer_Hydration/customer_hydration/generators/retail.py`. Add the fieldmap import:

```python
from customer_hydration.fieldmap import JDO_FIELDMAP
```

Find the account dict construction and replace it with the fieldmap-aware version. Specifically replace this block:

```python
        account = {
            "RecordTypeId": person_account_rt_id,
            "FirstName": first,
            ...
            "FinServ__Occupation__c": faker.job(),
            "FinServ__Employer__c": faker.company(),
            "FinServ__YearsWithEmployer__c": min(age - 22, rng.randint(1, 25)),
            "FinServ__TotalAnnualIncome__c": income,
            "FinServ__NumberOfDependents__c": _dependents_for(life_stage, rng),
            "FinServ__BankingPreference__c": rng.choice(["Mobile", "Online", "In-Branch"]),
            "OwnerId": rng.choice(rm_user_ids),
            "LeadSource": "Hydration",
            "External_ID__c": ext_id,
            "FinServ__SourceSystemId__c": ext_id,
            "Description": _description_for(life_stage, age, marital),
        }
```

With:

```python
        # Build the logical row (using spec field names), then translate via fieldmap.
        logical_account = {
            "RecordTypeId": person_account_rt_id,
            "FirstName": first,
            "LastName": last,
            "Salutation": _salutation(rng, marital),
            "PersonBirthdate": birthdate.isoformat(),
            "PersonEmail": faker.email(),
            "PersonHomePhone": faker.phone_number(),
            "PersonMobilePhone": faker.phone_number(),
            "PersonMailingStreet": faker.street_address(),
            "PersonMailingCity": faker.city(),
            "PersonMailingState": state,
            "PersonMailingPostalCode": faker.zipcode_in_state(state_abbr=state),
            "PersonMailingCountry": "US",
            "Industry": "Personal",
            "FinServ__ClientCategory__c": "Retail",
            "FinServ__ClientStatus__c": "Active",  # dropped by fieldmap
            "FinServ__MaritalStatus__c": marital,  # → __pc
            "FinServ__Occupation__c": faker.job(),  # → __pc
            "FinServ__Employer__c": faker.company(),  # → CurrentEmployer__pc
            "FinServ__YearsWithEmployer__c": min(age - 22, rng.randint(1, 25)),  # dropped
            "FinServ__TotalAnnualIncome__c": income,  # → AnnualIncome__pc
            "FinServ__NumberOfDependents__c": _dependents_for(life_stage, rng),  # → __pc
            "FinServ__BankingPreference__c": rng.choice(["Mobile", "Online", "In-Branch"]),  # dropped
            "OwnerId": rng.choice(rm_user_ids),
            "LeadSource": "Hydration",  # dropped (not on Account in this org)
            "External_ID__c": ext_id,
            "FinServ__SourceSystemId__c": ext_id,
            "Description": _description_for(life_stage, age, marital),
        }
        account = JDO_FIELDMAP.apply("Account", logical_account)
```

Find the FA dict construction and replace:

```python
        fa = {
            "Name": f"Cumulus Everyday Checking - {rng.randint(1000, 9999)}",
            "FinServ__FinancialAccountType__c": "Checking",
            ...
            "FinServ__OpenedDate__c": opened.isoformat(),
            "FinServ__Balance__c": balance,
            "FinServ__InterestRate__c": 0.0001,
            "FinServ__OwnershipType__c": "Individual",
            "FinServ__PrimaryOwner__c": ext_id,
            "FinServ__FinancialAccountNumber__c": f"****{rng.randint(1000, 9999)}",
            "FinServ__ProductCode__c": checking_product_code,
            "External_ID__c": fa_ext_id,
            "FinServ__SourceSystemId__c": fa_ext_id,
        }
```

With:

```python
        logical_fa = {
            "Name": f"Cumulus Everyday Checking - {rng.randint(1000, 9999)}",
            "FinServ__FinancialAccountType__c": JDO_FIELDMAP.picklist_value(
                "FinServ__FinancialAccount__c", "FinServ__FinancialAccountType__c", "Checking"),  # → "Deposits"
            "FinServ__FinancialAccountSource__c": f"Cumulus:{checking_product_code}",
            "FinServ__Status__c": JDO_FIELDMAP.picklist_value(
                "FinServ__FinancialAccount__c", "FinServ__Status__c", "Active"),  # → "Open"
            "FinServ__OpenedDate__c": opened.isoformat(),  # → OpenDate__c
            "FinServ__Balance__c": balance,
            "FinServ__InterestRate__c": 0.0001,
            "FinServ__APY__c": 0.0001,
            "FinServ__OwnershipType__c": "Individual",  # → Ownership__c
            "FinServ__PrimaryOwner__c": ext_id,
            "FinServ__FinancialAccountNumber__c": f"****{rng.randint(1000, 9999)}",
            "FinServ__ProductCode__c": checking_product_code,  # dropped
            "External_ID__c": fa_ext_id,
            "FinServ__SourceSystemId__c": fa_ext_id,
        }
        fa = JDO_FIELDMAP.apply("FinServ__FinancialAccount__c", logical_fa)
```

Add Savings emission after the Checking FA. After the line `bundle.financial_accounts.append(fa)`, add:

```python

        # Savings child record at probability 0.6 (per personas.yaml; spec §2 retail)
        if rng.random() < 0.6:
            sav_seq = starting_seq + n + len(bundle.financial_accounts) - n  # advance past checking
            sav_ext_id = f"HYDRATE-FA-{starting_seq + n + i:06d}"  # offset by n past checking
            sav_balance = round(rng.uniform(500, 25000), 2)
            sav_apy = 0.0025  # Statement Savings APY
            logical_sav = {
                "Name": f"Cumulus Statement Savings - {rng.randint(1000, 9999)}",
                "FinServ__FinancialAccountType__c": JDO_FIELDMAP.picklist_value(
                    "FinServ__FinancialAccount__c", "FinServ__FinancialAccountType__c", "Savings"),
                "FinServ__FinancialAccountSource__c": "Cumulus:PD-SAV-STM-2026.04",
                "FinServ__Status__c": "Open",
                "FinServ__OpenedDate__c": opened.isoformat(),
                "FinServ__Balance__c": sav_balance,
                "FinServ__APY__c": sav_apy,
                "FinServ__OwnershipType__c": "Individual",
                "FinServ__PrimaryOwner__c": ext_id,
                "FinServ__FinancialAccountNumber__c": f"****{rng.randint(1000, 9999)}",
                "External_ID__c": sav_ext_id,
                "FinServ__SourceSystemId__c": sav_ext_id,
            }
            bundle.financial_accounts.append(JDO_FIELDMAP.apply("FinServ__FinancialAccount__c", logical_sav))

            sav_role = {
                "FinServ__FinancialAccount__c": sav_ext_id,
                "FinServ__RelatedAccount__c": ext_id,  # use the physical name directly here (we already corrected this in Plan 1)
                "FinServ__Role__c": "Primary Owner",
                "FinServ__Active__c": True,
                "FinServ__StartDate__c": opened.isoformat(),
            }
            bundle.financial_account_roles.append(sav_role)
```

- [ ] **Step 4: Run tests to verify pass (GREEN)**

```bash
cd /Users/jsifontes/Documents/Git/JDO/.worktrees/customer-hydration-plan-1/Customer_Hydration
source .venv/bin/activate
pytest tests/test_retail_generator.py -v
```

Expected: ~24 passed (16 original + 8 new field-name/savings tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO/.worktrees/customer-hydration-plan-1
git add Customer_Hydration/customer_hydration/generators/retail.py \
    Customer_Hydration/tests/test_retail_generator.py
git commit -m "feat(customer-hydration): retail generator now uses fieldmap + emits Savings"
```

---

## Tasks 4–11: Remaining generator modules

The following 8 tasks each follow the same TDD-pair pattern:
1. Write failing test file (verbatim from this plan; ~10–15 tests per generator)
2. Run pytest to confirm RED
3. Implement the generator module (verbatim from this plan)
4. Run pytest to confirm GREEN
5. Single commit per pair with message `feat(customer-hydration): add <name> generator`

Due to the size of each generator's verbatim test+impl content (~150–250 LoC each), they are NOT inlined verbatim in this plan file. Instead, each task points to the section of the spec (`Customer_Hydration/docs/superpowers/specs/2026-05-19-customer-hydration-design.md` §3 per-object coverage) and the field-map module that owns the translation. Implementer subagents will draft the test+impl following the retail.py pattern from Task 3.

| Task | Generator | Spec source | Key challenges |
|---|---|---|---|
| 4 | `cards.py` | §3 `FinServ__Card__c` field set | Custom Card model — uses `Card_Type__c`, `Card_Status__c`, `Card_Number__c`, `Card_Product__c`, `FinServ__AccountHolder__c`, `Payment_Network__c`, `Issued_Date__c`, `Name_On_Card__c`. NOT FSC standard fields. |
| 5 | `holdings.py` | §3 `FinServ__FinancialHolding__c` field set | Use `FinServ__Symbol__c` / `FinServ__Securities__c` / `FinServ__Shares__c` / `FinServ__Price__c`. Holdings consume from `config/holding_universe.yaml` (~40 tickers). MarketValue = Shares × Price; rolls up to Wealth FA balance. |
| 6 | `goals.py` | §3 `FinServ__FinancialGoal__c` field set | `FinServ__Type__c` (not GoalType), `FinServ__TargetValue__c`, `FinServ__ActualValue__c`. Drop `FinServ__Priority__c`. Status = `In Progress`/`Not Started`/`Completed` only. |
| 7 | `lifecycle.py` (LifeEvents only) | §3 `FinServ__LifeEvent__c` field set | Only 6 EventType values; parent ref is `FinServ__Client__c` (not `FinServ__Account__c`); no `FinServ__Status__c`. Use `FinServ__DiscussionNote__c` for the persona-flavored content. Skip Marriage/Divorce/Death/Inheritance (not in picklist) — replace with `New Job` / `New Home` / `Retirement`. |
| 8 | `households.py` | §2 cross-persona stitching | Household = Account RT=`IndustriesHousehold`. Members link via `AccountContactRelation` with `Roles` multiselect. Apply slack: 65% retail / 90% wealth / 30% SMB owners are household members. |
| 9 | `activity.py` (Cases + Tasks + Events + Opportunities) | §3 Case/Task/Event/Opportunity field sets | Use the real picklist values: Case.Type ∈ {`Product Support`, `Account Support`, `General`, `Technical Issue`}, Opportunity.StageName ∈ {`Prospecting`, `Qualification`, `Proposal Issued`, `Closed Won`, `Closed Lost`}, Opportunity.Type ∈ {`New Business`, `Renewal`}. Calendar-aware ActivityDate (30%/10%/60% per spec §2). |
| 10 | `campaigns.py` | §3 Campaign + CampaignMember | ~10 hardcoded campaigns from spec §3 ("HELOC Refi Outreach Q2", "Wealth Tax Strategy Webinar 2026", etc.). CampaignMember wires customers in based on persona (1–3 per retail, 1–2 wealth curated, 0.8 SMB, 0.6 commercial). |
| 11 | `wealth.py`, `smb.py`, `commercial.py` (one task — three files) | §2 persona profiles | Same anchor-attribute pattern as retail. Each persona's child records use the same generators (cards, holdings, goals, lifecycle, activity, campaigns) — wealth.py is the largest because it adds Brokerage/IRA/529/Trust + Holdings; smb.py and commercial.py add Business Account + Contacts + ACR rows. |

---

## Task 12: Replace runner_p1.py with runner_p2.py

**Files:**
- Create: `Customer_Hydration/customer_hydration/runner_p2.py`
- Modify: `Customer_Hydration/customer_hydration/cli.py` (swing import)
- Keep: `Customer_Hydration/customer_hydration/runner_p1.py` (unwired but preserved through Plan 2 for diff visibility; Plan 3 deletes it)

`runner_p2.py` orchestrates four personas plus all the new child-record generators. It calls each persona generator in sequence to build a `MultiPersonaBundle`, then writes ~14 CSVs (Account, Contact, ACR, FA, FA Role, Card, Holding, Goal, LifeEvent, Opportunity, Case, Task, Event, Campaign, CampaignMember) and bulk-upserts each in dependency order:

```
Wave A: Account (all RTs in one CSV: Person Accounts, Business Accounts, Households)
Wave B: Contact (business-account officers/signers only)
Wave C: AccountContactRelation
Wave D: FA, Card, Goal, LifeEvent, Campaign, Opportunity (parallel-safe; ParentId-bound only to Account)
Wave E: FA Role, Holding, Case, Task, Event, CampaignMember (depend on Wave D parents)
```

The header-rewriter logic from Plan 1 generalizes — for every external-id-bound CSV, rewrite the parent reference column header to the `:Parent:External_ID__c` form. Plan 3 replaces this with Plan 1's CSV writer doing it natively.

- [ ] **Step 1: Write `runner_p2.py`** (full implementation in this task; ~250 LoC including all wave orchestration + CSV header rewriting + manifest accumulation)
- [ ] **Step 2: Modify `cli.py` line 105** — change `from customer_hydration.runner_p1 import run_retail_only` to `from customer_hydration.runner_p2 import run_all`
- [ ] **Step 3: Run full test suite** — expected 100+ tests passing across all generators
- [ ] **Step 4: Commit** — `feat(customer-hydration): add Plan-2 runner orchestrating all 4 personas`

---

## Task 13: Plan 2 dry-run smoke (no commit)

```bash
cd /Users/jsifontes/Documents/Git/JDO/.worktrees/customer-hydration-plan-1/Customer_Hydration
source .venv/bin/activate
python hydrate.py hydrate --target-org jdo-fw51xz \
    --retail 100 --wealth 80 --smb 50 --commercial 20 \
    --skip-natives --skip-apex-wireup --skip-data-cloud \
    --allow-production --dry-run
```

Expected: 14 CSVs written to `output/run-{ts}/`. Validate each has the correct row count + LF endings + no `dropped_fields` for fields the fieldmap claims to handle. Any non-empty `dropped_fields` for renamed fields means the fieldmap is wrong — surface as DONE_WITH_CONCERNS.

---

## Task 14: Plan 2 live load (no commit)

```bash
cd /Users/jsifontes/Documents/Git/JDO/.worktrees/customer-hydration-plan-1/Customer_Hydration
source .venv/bin/activate
python hydrate.py hydrate --target-org jdo-fw51xz \
    --retail 100 --wealth 80 --smb 50 --commercial 20 \
    --skip-natives --skip-apex-wireup --skip-data-cloud \
    --allow-production
```

Expected: ~250 customers + ~2,500 related records land in `jdo-fw51xz` in <10 minutes. Plan 1's existing 50 retail customers re-upsert (same External IDs) with corrected demographic fields populated.

Verify with SOQL:
```bash
sf data query --target-org jdo-fw51xz --query "SELECT FinServ__ClientCategory__c, COUNT(Id) FROM Account WHERE External_ID__c LIKE 'HYDRATE-%' GROUP BY FinServ__ClientCategory__c"
```

Expected counts (modulo slack):
- Retail: 100
- Wealth Management: 80
- Small Business: 50
- Commercial Banking: 20

Plus check that demographic fields populated:
```bash
sf data query --target-org jdo-fw51xz --query "SELECT External_ID__c, FinServ__AnnualIncome__pc, FinServ__Occupation__pc, FinServ__MaritalStatus__pc FROM Account WHERE External_ID__c='HYDRATE-RT-000001'"
```

Expected: non-null values for all three `__pc` fields (which were null after Plan 1 because the spec emitted them as `__c`).

---

## Task 15: README + CHANGELOG update for Plan 2

- [ ] **Step 1: Append a Plan 2 status section to `Customer_Hydration/README.md`**
- [ ] **Step 2: Add a Plan 2 entry to top-level `CHANGELOG.md` under May 2026**
- [ ] **Step 3: Commit** — `docs(customer-hydration): mark Plan 2 acceptance criteria complete`

---

## Plan 2 success criteria

Plan 2 is **complete** when:

- [ ] `customer_hydration/fieldmap.py` exists and is consulted by every generator
- [ ] `retail.py` updated to use fieldmap + emit Savings child FA at 60% probability
- [ ] `wealth.py`, `smb.py`, `commercial.py` exist and produce persona-shaped Account + child records
- [ ] `cards.py`, `holdings.py`, `goals.py`, `lifecycle.py`, `households.py`, `activity.py`, `campaigns.py` exist
- [ ] `runner_p2.py` orchestrates all 4 personas and 14 CSVs end-to-end
- [ ] `python hydrate.py hydrate --personas retail,wealth,smb,commercial …` smoke load against `jdo-fw51xz` lands ~250 customers + ~2,500 related records in <10 minutes
- [ ] All previously-dropped Account demographic fields (income, occupation, marital_status, dependents, employer) now populated via `__pc` shadows
- [ ] FSC picklist values are correctly translated (FA Type → category, Status = `Open`, etc.)
- [ ] All generator unit tests pass (target: 100+ tests across the 11 test files)
- [ ] Plan 1's known FA Role duplicate wart still present (Plan 3 owns the fix; Plan 2 doesn't make it worse)

---

## Plan 2 known limitations (deferred to Plan 3)

- FA Role natural-key dedupe (still inserts duplicates on re-run)
- Multi-wave parallel bulk loading (Plan 2 keeps the simple sequential loader)
- Resume-from-checkpoint (Plan 2 still re-runs from scratch on crash)
- Production-volume scale (Plan 2 caps at 250 customers; full target is 10,000)
- Native FSC mirror objects (Plan 4)
- Apex post-load wireup + Data Cloud stream refresh (Plan 5)
- Banker briefs (Plan 6)
