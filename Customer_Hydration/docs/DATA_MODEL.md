# Data model

This document expands on §3 of the [Phase 1 spec](superpowers/specs/2026-05-19-customer-hydration-design.md).
For every Salesforce object the generator touches, it lists:

- Object API name and the wave that loads it
- Idempotency field (where applicable)
- Field coverage with fieldmap renames called out
- Picklist values used, with fieldmap translations called out

The authoritative source for renames + picklist remappings is
[`customer_hydration/fieldmap.py`](../customer_hydration/fieldmap.py).
This document narrates that file; if there's a disagreement, the code
wins.

## Object coverage matrix

| sObject | Wave | Idempotency field | Lineage | Notes |
|---|---|---|---|---|
| `Account` | A | `External_ID__c` | shared | All RTs (Person + Business + Household + Trust) in one CSV |
| `Contact` | B | `External_Id__c` (lowercase d) | legacy | Existing oddity, not ours to fix |
| `AccountContactRelation` | C | `External_ID__c` | legacy | Resolved ContactId via `IdResolver` |
| `FinServ__FinancialAccount__c` | D | `External_ID__c` | legacy | Densest object |
| `FinServ__Card__c` | D | `External_ID__c` | legacy | |
| `FinServ__FinancialGoal__c` | D | `External_ID__c` | legacy | |
| `FinServ__LifeEvent__c` | D | `FinServ__SourceSystemId__c` | legacy | No `External_ID__c` on this object |
| `FinServ__BusinessMilestone__c` | D | `External_ID__c` (NEW) | legacy | New field deployed via `force-app/` |
| `Campaign` | D | `External_ID__c` | legacy | ~10 active campaigns |
| `Opportunity` | D | `External_ID__c` | legacy | |
| `FinServ__FinancialAccountRole__c` | E | `External_ID__c` | legacy | "FA Role" — `HYDRATE-FAR-{seq}` |
| `FinServ__FinancialHolding__c` | E | `FinServ__SourceSystemId__c` | legacy | No `External_ID__c` |
| `Case` | E | `External_ID__c` | legacy | |
| `Task` | E | `External_ID__c` | legacy | |
| `Event` | E | `External_ID__c` | legacy | |
| `CampaignMember` | E | `External_ID__c` | legacy | ContactId resolved post-A |
| `FinancialAccount` | F | `External_ID__c` (also `LegacyId__c` bridge) | native | Mirror of legacy FA |
| `FinancialGoal` | F | `External_ID__c` (also `LegacyId__c` bridge) | native | Mirror of legacy goal |
| `BusinessMilestone` | F | `External_ID__c` (also `OriginalLegacyGoalId__c` bridge) | native | Mirror of legacy milestone |
| `PartyRelationshipGroup` | F | natural-key | native | No External-ID; reset is deferred |
| `PartyProfile` | F | natural-key | native | No External-ID; reset is deferred |
| `ContactPointAddress` | F | natural-key | native | No External-ID; reset is deferred |
| `ContactPointEmail` | F | natural-key | native | No External-ID; reset is deferred |
| `ContactPointPhone` | F | natural-key | native | No External-ID; reset is deferred |
| `FinancialAccountParty` | G | natural-key | native | FA Id resolved post-F |

"Wave" matches the dependency graph in
[ARCHITECTURE.md §Wave dependencies](ARCHITECTURE.md#wave-dependencies).

## Field-source legend

The per-object field tables below use this shorthand from the spec:

- **Anchor** — drawn from persona anchor attributes (age, life_stage, ...)
- **Faker** — name/address/email/phone/company/etc. via the `faker` library
- **Catalog** — from `Cumulus_Products` PRODUCT_SPECS catalog
- **Derived** — computed from anchor or parent values
- **Idempotency** — External-ID field (`HYDRATE-*`)
- **Reference** — lookup to another generated record
- **Constant** — fixed across all rows

## Account — Person (Retail + Wealth)

`RecordTypeId` (PersonAccount) plus the demographic + FSC custom fields.
The fieldmap routes most FSC custom fields through the `__pc` shadow:

| Logical name | Physical (org) name | Notes |
|---|---|---|
| `FinServ__TotalAnnualIncome__c` | `FinServ__AnnualIncome__pc` | |
| `FinServ__Occupation__c` | `FinServ__Occupation__pc` | |
| `FinServ__MaritalStatus__c` | `FinServ__MaritalStatus__pc` | |
| `FinServ__NumberOfDependents__c` | `FinServ__NumberOfDependents__pc` | |
| `FinServ__Employer__c` | `FinServ__CurrentEmployer__pc` | |
| `FinServ__YearsWithEmployer__c` | (dropped) | Not on Account in this org |
| `FinServ__RiskToleranceLevel__c` | `FinServ__RiskTolerance__c` | |
| `FinServ__BankingPreference__c` | (dropped) | Not on Account in this org |
| `FinServ__ClientStatus__c` | (dropped) | |
| `LeadSource` | (dropped) | Not on Account; Description carries equivalent |

Standard fields (`FirstName`, `LastName`, `Salutation`,
`PersonBirthdate`, `PersonEmail`, `PersonHomePhone`,
`PersonMobilePhone`, `PersonMailingStreet/City/State/PostalCode/Country`)
are written directly — the platform copies into the `__pc` shadows
automatically. `FinServ__ClientCategory__c` carries `Retail` or
`Wealth Management`. `FinServ__SourceSystemId__c` mirrors `External_ID__c`
for downstream tools that key off it.

## Account — Business (SMB + Commercial)

| Logical name | Physical (org) name | Notes |
|---|---|---|
| `FinServ__ClientCategory__c` | `FinServ__ClientCategory__c` | `Small Business` or `Commercial Banking` |
| `Industry`, `Sic` | identical | From persona industry weights |
| `AnnualRevenue` | identical | Lognormal draw |
| `NumberOfEmployees` | identical | Scaled to revenue |
| `YearStarted` | identical | String year (`anchor_date.year - years_in_business`) — silently dropped if format mismatch |

`AccountSource = 'Hydration'` so dashboards can additionally filter by
source. Commercial accounts may set `ParentId` (25%) for holding-co ->
operating-sub structure.

## Contact (business officers + signers)

Idempotency field is `External_Id__c` (lowercase d) — case matters. From
the spec:

> The Contact custom field uses lowercase `d` while every other object
> uses capital `ID`. Existing oddity, not ours to fix.

Common fields: `FirstName`, `LastName`, `Salutation`, `Email`, `Phone`,
`MobilePhone`, `Title`, `AccountId`, `MailingStreet/City/State/PostalCode`,
`ReportsToId` (~40% commercial), `Department`. `LeadSource = 'Hydration'`,
`FinServ__SourceSystemId__c` mirrors `External_Id__c`.

## `FinServ__FinancialAccount__c`

Densest object — the live `jdo-fw51xz` org currently holds tens of
thousands. Fieldmap renames:

| Logical name | Physical (org) name |
|---|---|
| `FinServ__OpenedDate__c` | `FinServ__OpenDate__c` |
| `FinServ__OwnershipType__c` | `FinServ__Ownership__c` |
| `FinServ__APR__c` | `FinServ__InterestRate__c` (collapsed onto Interest Rate) |
| `FinServ__MaturityDate__c` | `FinServ__LoanEndDate__c` |
| `FinServ__Branch__c` | `FinServ__BranchName__c` |
| `FinServ__ProductCode__c` | (dropped) |

### Picklist value translations

`FinServ__FinancialAccountType__c` has only 6 values in this org. The
fieldmap collapses logical types to those buckets:

| Logical type | Physical value |
|---|---|
| Checking, Savings, HYSA, Money Market, CD, Premier Checking, Business Checking | `Deposits` |
| Mortgage, HELOC, Auto Loan, Personal Loan, Term Loan, SBA Loan | `Loans` |
| Credit Card | `Credit Cards` |
| Brokerage, Managed Advisory, IRA, Roth IRA, 529, Trust Account | `Investments` |
| Lockbox, Sweep, ZBA, Positive Pay, Wire Transfer, ACH | `Treasury Management` |
| Merchant Services | `Merchant Services` |

`FinServ__Status__c` has `Open` rather than `Active`:

| Logical | Physical |
|---|---|
| `Active` | `Open` |

Other fields written: `Name` (e.g. `Cumulus Everyday Checking - 4421`),
`FinServ__FinancialAccountSource__c` (constant `Cumulus:<product-code>`),
`FinServ__Balance__c`, `FinServ__InterestRate__c`, `FinServ__APY__c`,
`FinServ__OwnershipType__c` (-> `FinServ__Ownership__c`),
`FinServ__PrimaryOwner__c` (External-ID reference to the Account),
`FinServ__FinancialAccountNumber__c` (masked, unique within run),
`External_ID__c`, `FinServ__SourceSystemId__c`.

## `FinServ__FinancialAccountRole__c` ("FA Role")

External-ID prefix: `HYDRATE-FAR-{n}`. Idempotency field `External_ID__c`
(unique=True in this org's FSC version, despite spec hedging).

Fieldmap renames:

| Logical name | Physical (org) name |
|---|---|
| `FinServ__Account__c` | `FinServ__RelatedAccount__c` |
| `FinServ__Contact__c` | `FinServ__RelatedContact__c` |

Other fields: `FinServ__FinancialAccount__c` (FA External-ID),
`FinServ__Role__c` (Primary Owner / Joint Owner / Beneficiary / Authorized
Signer / Trustee / Power of Attorney), `FinServ__Active__c` (95% true),
`FinServ__StartDate__c`, `FinServ__EndDate__c`.

The org has a custom validation rule:

> "This record cannot be edited. To update role information, you can
> deactivate this record and create a new one."

So FA Role is *upsert-only* — the External_ID__c upsert avoids
re-edits. See `Plan 2 wart 1` and the Plan 3 fix.

## `FinServ__Card__c`

External-ID prefix: `HYDRATE-CARD-{n}`. Heavy fieldmap rename surface
because this org renamed most of the Card fields:

| Logical name | Physical (org) name |
|---|---|
| `FinServ__CardType__c` | `Card_Type__c` |
| `FinServ__CardSubType__c` | `Card_Product__c` |
| `FinServ__CardStatus__c` | `Card_Status__c` |
| `FinServ__CardNumber__c` | `Card_Number__c` |
| `FinServ__ExpirationDate__c` | `FinServ__ValidUntil__c` |
| `FinServ__Account__c` | `FinServ__AccountHolder__c` |
| `FinServ__CreditLimit__c` | (dropped) |
| `FinServ__Balance__c` | (dropped) |

## `FinServ__FinancialHolding__c`

External-ID prefix: `HYDRATE-HOLD-{n}`. Idempotency field is
`FinServ__SourceSystemId__c` because this object has no `External_ID__c`.

Fieldmap renames:

| Logical name | Physical (org) name |
|---|---|
| `FinServ__SecuritySymbol__c` | `FinServ__Symbol__c` |
| `FinServ__SecurityName__c` | `FinServ__Securities__c` |
| `FinServ__Quantity__c` | `FinServ__Shares__c` |
| `FinServ__CurrentPrice__c` | `FinServ__Price__c` |
| `FinServ__CostBasis__c` | (dropped) |
| `FinServ__AcquiredDate__c` | (dropped) |

Other fields: `Name` (e.g. `AAPL - Apple Inc.`),
`FinServ__FinancialAccount__c` (FA External-ID),
`FinServ__PurchasePrice__c`, `FinServ__MarketValue__c`
(= `Quantity × CurrentPrice`).

## `FinServ__FinancialGoal__c`

External-ID prefix: `HYDRATE-GOAL-{n}`. Fieldmap renames:

| Logical name | Physical (org) name |
|---|---|
| `FinServ__GoalType__c` | `FinServ__Type__c` |
| `FinServ__TargetAmount__c` | `FinServ__TargetValue__c` |
| `FinServ__CurrentAmount__c` | `FinServ__ActualValue__c` |
| `FinServ__Priority__c` | (dropped) |

Other fields: `Name`, `FinServ__TargetDate__c`, `FinServ__Status__c`,
`FinServ__PrimaryOwner__c` (Account External-ID), `External_ID__c`.

## `FinServ__LifeEvent__c`

External-ID prefix: `HYDRATE-LE-{n}`. Idempotency field is
`FinServ__SourceSystemId__c`. Fieldmap renames:

| Logical name | Physical (org) name |
|---|---|
| `FinServ__Account__c` | `FinServ__Client__c` |
| `FinServ__Contact__c` | (dropped) |
| `FinServ__Status__c` | (dropped) |

Picklist `FinServ__EventType__c` has only ~6 values in this org —
`activity.py` and `lifecycle.py` use that subset directly.

## `FinServ__BusinessMilestone__c`

External-ID prefix: `HYDRATE-MS-{n}`. Idempotency field `External_ID__c`
— **this is a new custom field deployed by this package** via
`force-app/main/default/objects/FinServ__BusinessMilestone__c/fields/External_ID__c.field-meta.xml`.

Other orgs may not have it yet — `hydrate.py` checks via Phase-0
describe and surfaces a clear error if missing.

Fields: `Name`, `FinServ__MilestoneType__c`, `FinServ__MilestoneDate__c`,
`FinServ__Account__c` (Account External-ID), `Notes`/`Description`,
`External_ID__c`.

## `Opportunity`

External-ID prefix: `HYDRATE-OPP-{n}`. Picklist surface verified against
`jdo-fw51xz`:

- `StageName` subset (5 values used): Prospecting, Qualification,
  Proposal Issued, Closed Won, Closed Lost.
- `Type` subset (2): New Business, Renewal.
- `Probability` derived from StageName: Prospecting=10, Qualification=25,
  Proposal Issued=60, Closed Won=100, Closed Lost=0.

Fields: `Name` (`{AccountName} - {Product} - {Q}`), `AccountId`,
`OwnerId` (inherits Account.OwnerId), `StageName`, `Probability`,
`Amount`, `CloseDate` (Q-1 / Q0 / Q+1 / Q+2), `LeadSource`=Hydration,
`Description`, `External_ID__c`.

## `Case`

External-ID prefix: `HYDRATE-CASE-{n}`. Picklist surface in
`jdo-fw51xz`:

- `Type` (4 values): Product Support, Account Support, General,
  Technical Issue.
- `Status` (6 values): New, Working, Waiting on Customer,
  Reply Received, Escalated, Closed.
- `Priority` (4 values): Critical (5%), High (20%), Medium (50%),
  Low (25%).
- `Origin` (13 values): Chat, Community, Email, Facebook, Google,
  Instagram, LinkedIn, Mobile Device, Phone, Slack, SMS, Twitter,
  Website.

Other fields: `Subject` (persona-flavored), `Description`, `Reason`,
`AccountId`, `ContactId` (business cases), `OwnerId` (RM 50% / queue 50%),
`RecordTypeId`, `External_ID__c`.

## `Task`

External-ID prefix: `HYDRATE-TASK-{n}`. Calendar-aware dates:
~30% next 14 days, ~10% overdue, ~60% historical.

Fields: `Subject` (persona+activity-flavored), `Description`, `Status`
(calendar-aware: Completed for historical, Open for current), `Priority`,
`Type` (Call / Email / Meeting / Other), `ActivityDate`, `WhatId`
(Account / Opp / Case — resolved post-Wave-A via `RESOLVE:` markers),
`WhoId`, `OwnerId`, `External_ID__c`.

## `Event`

External-ID prefix: `HYDRATE-EVT-{n}`. Business-hours-shaped
`StartDateTime` and `EndDateTime`. Fields: `Subject`, `WhatId`, `WhoId`,
`OwnerId`, `Location`, `External_ID__c`.

## `AccountContactRelation`

External-ID prefix: `HYDRATE-ACR-{n}`. `Roles` is a semicolon-separated
multi-select: Beneficial Owner / Authorized Signer / Trustee / Spouse /
Dependent / Guarantor. `FinServ__ReciprocalRole__c` carries the
reciprocal label. `IsActive` (95% true), `StartDate`.

`ContactId` resolved post-Wave-A via
`IdResolver.contact_id_by_account_external_id` — `want="contact"` to
get the auto-Contact Id (`003*`) under a Person Account, NOT the Account
Id (`001*`). Confusing them is fatal: Salesforce returns
`FIELD_INTEGRITY_EXCEPTION`.

## `Campaign` + `CampaignMember`

External-ID prefixes: `HYDRATE-CMP-{n}` (~10 only) and
`HYDRATE-CMPMEM-{n}`. Campaign fields: `Name`, `Type`, `Status`,
`StartDate/EndDate`, `ExpectedResponse/NumberSent`, `External_ID__c`.

CampaignMember: `CampaignId`, `ContactId` / `LeadId` (resolved post-A),
`Status` (Sent / Responded / Registered / Attended), `HasResponded`,
`External_ID__c`.

## Native FSC mirrors (Wave F + G)

### `FinancialAccount` (native)

Source: `customer_hydration/native/financial_account.py`. External-ID
prefix `HYDRATE-NFA-{n}`. **Bridge field: `LegacyId__c`** carries the
legacy FA's Salesforce Id (resolved Phase 3).

Fields written:

| Native field | Source |
|---|---|
| `Name` | mirror of legacy `Name` |
| `FinancialAccountNumber` | mirror of legacy `FinServ__FinancialAccountNumber__c` |
| `Type` | passes through legacy's already-translated category (`Deposits`, `Loans`, ...) |
| `Status` | mirror of legacy `FinServ__Status__c` |
| `Balance` | mirror of legacy `FinServ__Balance__c` |
| `OpenedDate` | mirror of legacy `FinServ__OpenDate__c` (post-rename) |
| `InterestRate` | mirror of legacy `FinServ__InterestRate__c` |
| `OwnerId` | mirror of legacy `OwnerId` |
| `LegacyId__c` | bridge — legacy FA Salesforce Id |
| `External_ID__c` | `HYDRATE-NFA-{seq}` |

Note: `External_ID__c` is *synthesized* by the generator but
silently dropped at preflight if the org's `FinancialAccount` only
exposes `LegacyId__c` as an external-id field (which is the case in
`jdo-fw51xz`). The runner upserts via `LegacyId__c`, then a Wave-F
queryback resolves `LegacyId__c` -> native FA Id for Wave G's
`FinancialAccountParty.FinancialAccountId`.

### `FinancialAccountParty` (native)

External-ID prefix `HYDRATE-FAP-{n}` (best-effort; object has no
`External_ID__c`). Idempotency is by natural key — the runner queries
existing rows post-G and skips anything that matches. Bridges the
legacy FA Role's `FinServ__Role__c` text into the native picklist
`Role`.

Fields: `FinancialAccountId` (resolved native Id), `AccountId` or
`ContactId`, `Role`, `StartDate`, `EndDate`.

Note: `FinancialAccountId` in the CSV starts as `RESOLVE-NFA:HYDRATE-FA-{seq}`
and is resolved by a 3-hop chain: `HYDRATE-NFA-NNN` -> `HYDRATE-FA-NNN`
(via internal counter mapping) -> legacy FA Id (via legacy_id_map) ->
native FA Id (via native_id_map). See `loader/id_resolver.py`.

### `FinancialGoal` (native)

External-ID prefix `HYDRATE-NGOAL-{n}`. Bridge: `LegacyId__c`. Direct
mirror of legacy goal — same fields, same External_ID__c value, plus
`LegacyId__c` set to the legacy `FinServ__FinancialGoal__c` Id.

### `BusinessMilestone` (native)

External-ID prefix `HYDRATE-NMS-{n}`. Bridge:
**`OriginalLegacyGoalId__c`** (existing field, repurposed for legacy FA
Milestone bridging). Direct mirror of legacy milestone.

### `PartyRelationshipGroup` + `PartyProfile`

Native equivalent of FSC Household + ACR. Written after legacy household
+ ACR loaded.

`PartyRelationshipGroup` fields: `Name`, `AccountId` (household or
business), `RelationshipGroupType` (Household / Trust / Business /
Investment Club), `Description`.

`PartyProfile` fields: `Name`, `AccountId` or `ContactId`,
`HouseholdAccountId`, `RelatedPartyProfileId` (spouse-of, parent-of),
`ProfileType`, `Status`=Active.

Both use natural-key idempotency only — see [IDEMPOTENCY.md §Known gaps](IDEMPOTENCY.md#known-idempotency-gaps).

### `ContactPointAddress` / `ContactPointEmail` / `ContactPointPhone`

Source: `customer_hydration/native/contact_points.py`. One of each per
Person Account and per business Contact, mirroring the parent's direct
fields. Why: Data Cloud harmonization prefers `ContactPoint*` objects
over inline Account/Contact email/phone fields.

`ParentId` carries a `RESOLVE:` marker pointing at the legacy parent's
External-ID; the runner rewrites it to a real Salesforce Id at Wave-F
load time.

Fields: `ParentId`/`RelatedRecordId`, `EmailAddress` /
`TelephoneNumber` / `Address fields` (mirror of legacy direct field),
`BestTimeToContactStartTime/EndTime`, `IsPrimary` (true for first per
kind).

## Fields explicitly NOT populated

Per the spec:

- Legacy/audit fields (`UnifiedProfileId__c`, `UCIN_External_ID__c`,
  `pi__Pardot_Campaign_Id__c`)
- Person Account `__pc` shadow fields where a non-`__pc` equivalent
  exists (write to non-`__pc`, the platform copies)
- Anything `defaultedOnCreate=true` and not customer-meaningful
- Any field the Phase 0 describe step can't confirm exists

## Row-count estimate (full 10K customer load)

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

Estimated wall-clock: ~50 min. Estimated storage: ~1.7 GB. Phase 1
targets a sandbox or paid org — Developer Edition data limits will be
exceeded.

## Cross-references

- [ARCHITECTURE.md §Wave dependencies](ARCHITECTURE.md#wave-dependencies)
- [ARCHITECTURE.md §Fieldmap module](ARCHITECTURE.md#fieldmap-module)
- [IDEMPOTENCY.md](IDEMPOTENCY.md) — External-ID namespace, reset semantics
- [Phase 1 spec §3](superpowers/specs/2026-05-19-customer-hydration-design.md) — original design
- Source code: [`customer_hydration/fieldmap.py`](../customer_hydration/fieldmap.py)
