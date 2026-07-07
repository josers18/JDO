# Foundational Data Cloud Streams

When new CRM data lands in the JDO org via programmatic load (Phase 1 hydration, MDAPI deploys, bulk import, etc.), the **30 streams below** should be triggered for a one-shot Full Refresh in Data Cloud so segments, calculated insights, and downstream activations see the new rows.

These are the SalesforceDotCom_Home connector streams that back JDO + FSC. They map 1:1 to the CRM objects Phase 1 hydration writes into.

## Why "Full Refresh" specifically

All 30 are configured `refreshMode: UPSERT` (delta sync). When records arrive via Bulk API / SOAP / REST DML, UPSERT mode doesn't always pick them up cleanly — especially for objects like AccountContactRelation that are often loaded in batches separate from their parent records. **Full Refresh re-reads the entire source object**, guaranteeing DC sees everything.

## Why the UI, not the CLI

The public REST endpoint `POST /services/data/v62.0/ssot/data-streams/{name}/actions/run` rejects manual triggers on UPSERT-configured streams with HTTP 412 demanding `FULL_REFRESH` (the API enum value is `TOTAL_REPLACE`). PATCHing `refreshMode` returns 200 but silently no-ops on SalesforceDotCom-source streams.

The Lightning UI's "Refresh Now" → **Full Refresh** dialog calls an internal Aura RPC (`DataStreamDeployment.processDataStream`) that bypasses the policy. It runs a one-shot full refresh **without changing the stream's stored config** — exactly what we need.

The `customer-hydration` `refresh-streams` CLI subcommand correctly classifies these as `PolicySkipped` (rather than failures), and points operators to the UI flow.

## How to refresh them

Two options:

1. **Driven** — Use the `dc-stream-full-refresh-via-ui` Claude skill (`~/.claude/skills/dc-stream-full-refresh-via-ui/SKILL.md`) to drive playwright through the dialog for every stream in the table below. Roughly 6–7 seconds per stream, ~3–4 minutes for all 30.

2. **Manual** — In the Data Cloud app's Data Streams home (`/lightning/o/DataStream/list?filterName=All_DataStreams`), click each stream → "Refresh Now" → select **Full Refresh** → submit.

After all 30 are submitted, verify via:

```bash
python hydrate.py dc-status --target-org jdo-uqj0jr
```

…and look for last-run timestamps moving forward and row counts climbing.

## The 30 streams

Lightning record URL for each: `https://<org-domain>/lightning/r/DataStream/{recordId}/view`

### Tier 1 — Core CRM hydration (12)

These directly back hydrated records that Phase 2 segments will read.

| # | Stream | Record ID | Backs |
|---|---|---|---|
| 1 | `Account_Home` | `1dsam0000009GC1AAM` | Person + business Accounts (~21K hydrated rows) |
| 2 | `Contact_Home` | `1dsam0000009GFFAA2` | Contacts |
| 3 | `Lead_Home` | `1dsam0000009GK5AAM` | Leads |
| 4 | `Opportunity` | `1dsam000000A5G9AAK` | Opportunities |
| 5 | `Case` | `1dsam000000A5EXAA0` | Cases |
| 6 | `Task_Home` | `1dsam000000ISQrAAO` | Tasks |
| 7 | `Event_Home` | `1dsam000000JRpJAAW` | Events |
| 8 | `AccountAccountRelationship` | `1dsam000000J1rdAAC` | FSC Account-to-Account links |
| 9 | `AccountContactRelation_Home` ⚠️ | `1dsam000000J1urAAC` | AccountContactRelation party-model |
| 10 | `Campaign_Home` | `1dsam000000KLd6AAG` | Campaigns |
| 11 | `CampaignMember_Home` | `1dsam000000KLd0AAG` | CampaignMembers |
| 12 | `Referral_c_Home` | `1dsam000000JuuXAAS` | FinServ Referrals |

### Tier 2 — FSC financial product / party (9)

| # | Stream | Record ID | Backs |
|---|---|---|---|
| 13 | `Financial_Goal` | `1dsam000000A3W5AAK` | FSC FinancialGoal (native) |
| 14 | `Financial_Goal_Party` | `1dsam000000A3XhAAK` | FinancialGoalParty links |
| 15 | `Financial_Account_Role` | `1dsam000000A3UTAA0` | FinancialAccountRole |
| 16 | `Financial_Holding` | `1dsam000000A3flAAC` | FinancialHolding |
| 17 | `FinServ_FinancialAccount_c_Home` | `1dsam000000A3SrAAK` | `FinServ__FinancialAccount__c` (legacy package) |
| 18 | `FinServ_AssetsAndLiabilities_c_Home` | `1dsam000000A3avAAC` | FinServ assets/liabilities |
| 19 | `Card` | `1dsam000000A3cXAAS` | `FinServ__Card__c` |
| 20 | `Securities` | `1dsam000000A3hNAAS` | Securities holdings |
| 21 | `Alert` | `1dsam000000A3ZJAA0` | FinServ alerts |

### Tier 3 — Engagement / lifecycle (9)

Used by lifecycle and campaign-aligned segments.

| # | Stream | Record ID | Backs |
|---|---|---|---|
| 22 | `PersonLifeEvent_Home` | `1dsam000000OvpxAAC` | Life events (used by `WealthRecentLifeEvent__seg`) |
| 23 | `PersonLifeEventFeed_Home` | `1dsam000000OvpyAAC` | Life-event feed |
| 24 | `EmailMessage_Home` | `1dsam000000JRm5AAG` | Email engagement |
| 25 | `EmailMessageRelation_Home` | `1dsam000000JRm6AAG` | Email recipient links |
| 26 | `Meeting_Note_c_Home` | `1dsam000000KgBBAA0` | Meeting notes |
| 27 | `OpportunityContactRole_Home` | `1dsam000000JRkTAAW` | Opportunity-Contact roles |
| 28 | `InteractionSummary_Home` | `1dsam000000KdhxAAC` | Einstein interaction summaries |
| 29 | `Note_Home` | `1dsam000000Kd6rAAC` | Account/Opp/Case notes |
| 30 | `EventRelation_Home` ⚠️ | `1dsam000000JRpKAAW` | Event invitees |

## ⚠️ Streams currently in ERROR status

Two streams were in `status: ERROR` during Phase 2:

- `AccountContactRelation_Home` (`1dsam000000J1urAAC`)
- `EventRelation_Home` (`1dsam000000JRpKAAW`)

The UI dialog accepts the click, but the underlying run fails until the upstream config issue is resolved (typically a DLO mapping mismatch or schema drift). Fix those in DC Setup separately; they are not something the refresh flow can rescue.

## Streams deliberately NOT in this list

The org has 119 SalesforceDotCom_Home streams total. The 89 not listed here are deliberately excluded:

- **DC infrastructure metadata** — `Mkt*`, `Data*Lake*`, `MarketSegment_Home`, `MktDataConnection_Home`, etc. These describe DC itself, not customer data.
- **Agentforce / GenAI / Knowledge** — `AiAgentTagDefAssoc_Home`, `BotDefinition_Home`, `GenAi*`, `Personalization*`, `Knowledge_*`, etc. Not part of customer hydration.
- **Admin / system** — `User_Home`, `UserRole_Home`, `Group_Home`, `PermissionSet_Home`, `Territory2_*`, `TenantUsageType*`. No hydrated rows.
- **Process / media** — `ContentDocument*`, `VideoCall*`, `FlowRecord*`. Tangential.
- **A/B testing infrastructure** — `AbnExperiment_Home`, `AbnExperimentCohort_Home`. No hydrated rows.

If a future hydration phase introduces records into any of those, add the corresponding streams to the appropriate tier above and update this doc.

## Schema verifications (2026-05-26 / 2026-05-27, jdo-uqj0jr)

While running Phase 3a–3c the live org diverged from a couple of names this doc originally implied. Capturing the deltas inline so the next operator doesn't repeat the discoveries.

### Legacy FSC roles: no DC stream

There is **no `FinServ_FinancialAccountRole_c_Home` stream** in jdo-uqj0jr. The `Financial_Account_Role` stream listed at row 15 above ingests only the **native** `FinancialAccountRole` object — it doesn't carry `FinServ__FinancialAccountRole__c` (the legacy custom-package role records the runner emits). For Phase 3d cross-DMO joins we therefore filter on the loan's `ssot__Description__c` (token-bearing) rather than via the role link.

### LifeEvent: native lineage is the DC-visible one

The `PersonLifeEvent_Home` stream at row 22 ingests the **native** `PersonLifeEvent` object — there is **no `FinServ_LifeEvent_c_Home`** stream pulling the legacy `FinServ__LifeEvent__c` rows. Implications:

- Anything writing only to `FinServ__LifeEvent__c` (legacy lineage) is invisible to DC.
- The augment + the new `mirror-life-events` CLI both write **native** `PersonLifeEvent` (with `External_ID__c` `HYDRATE-NLE-NNNNNN`).
- Field gotchas verified live: `EventType` and `PrimaryPersonId` are `updateable=False` (insert-only, so re-runs must skip seqs already in the org); `EventDate` is `xsd:dateTime` not `xsd:date` so the bare `YYYY-MM-DD` form is rejected — anchor to `T00:00:00.000Z`.

### CampaignMember field gotchas

`CampaignMember.HasResponded` is calculated from `Status` (`createable=False`) and `(CampaignId, ContactId)` is unique. Augment runs strip `HasResponded` from the row before Bulk and skip generation entirely on re-runs whose seq pointer is already past 1.

### `FinServ__LifeEvent__c.Name` is auto-number

Generated rows must drop `Name` before Bulk; the field is read-only on this org's package version.

## Cumulus Snowflake federations (per-dataset, post-Phase-3)

In addition to the 30 SalesforceDotCom streams above, the Cumulus rollout introduces **per-dataset Snowflake-federated DLOs/DMOs**. These do NOT need full-refresh treatment — `dataAccessMode: DIRECT_ACCESS` means DC reads through to Snowflake on every query, so any change in the source table is visible immediately.

| # | DC Stream | DLO | DMO | Snowflake source | Notes |
|---|---|---|---|---|---|
| 1 | `CumulusClaritasDemographics` | `CumulusClaritasDemographics__dll` | `CumulusClaritasDemographics__dlm` | `DATA_JEDAIS.FINS__PUBLIC.CLARITAS_DEMOGRAPHICS` | Plan 1. Monthly bucket. ~25,424 rows. PK = `(ssot__AccountId__c, profileMonth__c)`. ACCOUNT_ID FK → `ssot__Account__dlm.ssot__Id__c`. |
| 2 | `CumulusMSCIESG` | `CumulusMSCIESG__dll` | `CumulusMSCIESG__dlm` | `DATA_JEDAIS.FINS__PUBLIC.MSCI_ESG_SCORES` | Plan 2. Monthly bucket. 11,389 rows (BUSINESS accounts only — overcount vs CRM ~5K is expected per spec §3 v1.2). PK = `(ssot__AccountId__c, profileMonth__c)`. ACCOUNT_ID FK → `ssot__Account__dlm.ssot__Id__c`. DLO→DMO mapping deferred to UI (REST 500 — same as Plan 1). |
| 3 | `CumulusDnBBusinessCredit` | `CumulusDnBBusinessCredit__dll` | `CumulusDnBBusinessCredit__dlm` | `DATA_JEDAIS.FINS__PUBLIC.DNB_BUSINESS_CREDIT` | Plan 3. Monthly bucket. 11,389 rows (BUSINESS audience — overcount vs CRM ~5K is expected per spec §3 v1.2). PK = `(ssot__AccountId__c, profileMonth__c)`. ACCOUNT_ID FK → `ssot__Account__dlm.ssot__Id__c`. DLO→DMO mapping deferred to UI (REST 500 — same as Plans 1 + 2). |
| 4 | `CumulusEsriGeoFootprint` | `CumulusEsriGeoFootprint__dll` | `CumulusEsriGeoFootprint__dlm` | `DATA_JEDAIS.FINS__PUBLIC.ESRI_GEO_FOOTPRINT` | Plan 4. **Branch-scoped, NOT account-scoped** — first non-account-scoped Cumulus dataset. Monthly bucket. 13,327 rows (one per distinct `BRANCH_ZIP`). Logical PK = `(branchZip__c, profileMonth__c)` but DC enforces a single PK so storage PK = `profileMonth__c` + `KQ_profileMonth__c` key qualifier; `branchZip__c` is a regular column. **No FK to `ssot__Account__dlm`** — downstream queries soft-join `branchZip__c = ssot__Account__dlm.postalCode__c`. DLO→DMO mapping deferred to UI (REST 500 — same as Plans 1–3). |
| 5 | `CumulusCoreLogicProperty` | `CumulusCoreLogicProperty__dll` | `CumulusCoreLogicProperty__dlm` | `DATA_JEDAIS.FINS__PUBLIC.CORELOGIC_PROPERTY` | Plan 5. Account-scoped (PERSON+ZIP anchors). **First QUARTERLY-cadence Cumulus dataset** (cron `0 8 1 1,4,7,10 * UTC` — Jan/Apr/Jul/Oct 1st @ 08:00 UTC) vs Plans 1–3 monthly. 25,424 rows (one per distinct PERSON account per quarter). PK = `(ssot__AccountId__c, profileQuarter__c)` logical → DC single-PK storage on `profileQuarter__c` + `KQ_profileQuarter__c`. ACCOUNT_ID FK → `ssot__Account__dlm.ssot__Id__c`. 9 NULLable property fields when `isOwner=false` (renters); 5 fields always populated (`isOwner`, `lienCount`, `floodZoneCode`, `wildfireRiskScore`, `generatedAt`). DLO→DMO mapping deferred to UI (REST 500 — same as Plans 1–4). **First Boolean-typed DC field** (`isOwner__c`). |
| 6 | `CumulusPlaidHeldAway` | `CumulusPlaidHeldAway__dll` | `CumulusPlaidHeldAway__dlm` | `DATA_JEDAIS.FINS__PUBLIC.PLAID_HELD_AWAY` | Plan 6. Account-scoped (Retail + Wealth Management anchors, 25,381). Monthly cadence. **First 1:N Cumulus dataset** — 1–5 rows per anchor per month (~55,274 rows on first run; band `[25,381, 126,905]`). Logical composite PK `(ACCOUNT_ID, HELD_AWAY_ACCOUNT_ID, PROFILE_MONTH)` → DC single-PK storage on `heldAwayAccountId__c` + `KQ_heldAwayAccountId__c`; `profileMonth__c` and `ssot__AccountId__c` are regular columns. ACCOUNT_ID FK → `ssot__Account__dlm.ssot__Id__c`. 4 NULLable fields conditional on `IS_ACTIVE` / `ACCOUNT_TYPE`. **Second Boolean DC field** (`isActive__c`, after Plan 5's `isOwner__c`). DLO→DMO mapping deferred to UI (REST 500 — same as Plans 1–5). |
| 7 | `CumulusWorldCheckAml` | `CumulusWorldCheckAml__dll` | `CumulusWorldCheckAml__dlm` | `DATA_JEDAIS.FINS__PUBLIC.WORLD_CHECK_AML` | Plan 7. **All-accounts audience** (no CLIENT_CATEGORY/ACCOUNT_TYPE_FLAG predicate — every PERSON+BUSINESS gets screened) — first all-accounts Cumulus dataset. **Daily cadence** (cron `0 6 * * * UTC`) — first daily Cumulus dataset; live storage stays bounded at ~36,813 rows because re-runs MERGE-replace (no daily history retained beyond `CHANGE_SINCE_LAST_RUN`). 36,813 rows (one per distinct anchor per screening day). PK = `(ssot__AccountId__c, profileDate__c)` logical → DC single-PK storage on `profileDate__c` + `KQ_profileDate__c`. ACCOUNT_ID FK → `ssot__Account__dlm.ssot__Id__c`. **3 Boolean DC fields** (`sanctionsHit__c`, `pepHit__c`, `adverseMediaHit__c` — first dataset with multiple BOOLEANs). 2 NULLable text fields (`adverseMediaCategories__c` when no media hit; `caseReference__c` for non-High/Severe ratings). **Anchor-independent bias logic** — synthesized `RISK_JURISDICTION_CODE` (year-stable salt; doesn't read dirty `anchor.COUNTRY_CODE`). DLO→DMO mapping deferred to UI (REST 500 — same as Plans 1–6). |

Setup recipe: `Snowflake_Claritas_Demographics/docs/dc-setup-recipe.md`. Stream + DLO + DMO are API-scriptable; the DLO→DMO column mapping currently requires the Data Model Setup UI (public REST returns `UNKNOWN_EXCEPTION` for fully-custom DMO targets — the mapping endpoint only succeeds when targeting standard `ssot__*` DMOs).

The connector underlying all Cumulus Snowflake streams is **`Jedi_Snowflake`** (id `9cgam0000003EknAAE`, account `eob55465.us-east-1.snowflakecomputing.com`, warehouse `MAIN_WH_XS`). Plans 2–13 will append rows to the table above following the same recipe.

## See also

- Phase 5.5 fire-and-forget contract: `customer_hydration/phase5/data_cloud.py`
- `dc-status` segment view: surfaces stream + segment health post-refresh
- Phase 2 segments: 20 segments published in `jdo-uqj0jr` against `Account_demo__dlm`, all filter on `External_ID_c__c contains "HYDRATE-"` to scope to Phase 1 records only
- Phase 3 augment: `customer_hydration/augment_phase3.py` + `customer_hydration/mirror_life_events.py`
- Cumulus Plan 1 DC setup recipe: `Snowflake_Claritas_Demographics/docs/dc-setup-recipe.md`
