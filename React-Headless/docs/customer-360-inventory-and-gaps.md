# Customer 360 — Live Inventory, Data-Cloud Gaps, and Redesign Plan

**Purpose:** Before redesigning the embedded Customer app, establish (1) exactly what the live Salesforce record page surfaces **today** (the parity floor), (2) what the org's Data Cloud inventory makes available that is **not yet surfaced** (the opportunity gaps), and (3) an information architecture that unions the two. Design follows from this, not from guesswork.

**Scope:** Retail person account first — **Julie E Morris** (`001am00000qvjsAAAQ`). Business (Omega) and Wealth are variants layered later, noted at the end.

**Org:** `jdo-0pz8au` (storm-16a17dc388fbe6). Data inventory: `output/data-stream-inventory/` (319 streams, generated 2026-07-02).

> **Note on live capture:** The DOM inventory in §1 was captured live earlier this session via authenticated Playwright. The org's temporary JWT key (`/tmp/pbeval-jwt/`) has since been cleared, so a re-capture needs the org re-authorized (`sf org login ...`). §1 is complete from the prior capture; re-verify before build if the page has changed.

---

## §1 — What's LIVE on the record page today (parity floor)

Captured from the `c-customer-profile-widget` + embedded components on Julie's account. **Everything here MUST be preserved** in the redesign.

### 1a. Identity & status header
- Name, type (Person Account), location (San Francisco, CA), segment (**Mass Affluent**)
- Connectivity/status chips: **Mobile ·On, Online ·On, KYC ·Current, 2FA ·On, Paperless ·Off, Alerts ·Off, Wire ·Off**
- Risk profile (**Aggressive**), Customer since (**Jul 2024**), Last interaction (**Jun 2026**), Last used channel (**Call Center**)

### 1b. Financial spine (headline money)
- **Deposits $77,372** (+12% YoY) · **Investments $72,061** (+4.2%) · **Lending $771,640** (−0.8%)
- Loan limit **$1,028,000** · Opportunities **$2,288,469** · Cases **43**
- Industry (Manufacturing), Employees (300), Annual revenue ($1,200,000) — business-side fields present on this person's linked entity
- Contact: phone, email (jmorris@example.com), website (morrisroasters.com)

### 1c. Profile-widget tabs (the intelligence surface)
`Overview · AI Signals · Portfolio · Services · Location · Structure · Insight · Agentforce summary · Contact`

- **AI Signals (Einstein):** Engagement Sentiment **Positive** · **Next Best Product: CDs** · **Held-Away Amount** detected · ML Propensity & Sentiment scores
- **Agentforce summary:** generated relationship narrative

### 1d. Unified cross-org profile (Data Cloud identity resolution) — KILLER FEATURE
Same Julie stitched across source orgs:
| Source Org | Account ID |
|---|---|
| Retail | 001am00000qvjsAAAQ |
| Wealth | 001al00001ATjgJAAT |
| Small Business | 001al00000EkcjqAAB |
| Mobile Banking | 7b1ab88d516c4eee |
| Online Banking | 3908d464913587cc |
| Trading Platform | (id) |

### 1e. Embedded CRM Analytics (Retail Wealth dashboard)
- **AUM** (+15% vs last month), **Product Mix**, **AUM Trend**, **Inflow/Outflow**, **NPS (CSAT)**, **AUM Allocation**, **Percent Cash of Total**
- **Einstein Insights:** ML Propensity + Sentiment; **Next Best Product: CDs**; Engagement Sentiment Positive; **Held-Away Amount**

### 1f. Account tabs (record page)
`Details · ⏳ Journey · Sales + Service · 🔄 Referrals · 📄 Tearsheet`

### 1g. Related lists / actions
- **Leads and Referrals** (10+; Name / Lead Status / Lead Source — inbound call, website, referral, marketing event)
- **Files** (Invoice, Fraudulent-charges PDF)
- Actions: Create Referral, Open Relationship Center, Schedule Appointment
- **Journey (life events):** Born, Graduation, Purchased Home, Moved to SF, Audi Q7, Appointed CEO — Morris Roasters
- **Goals:** Retirement, Estate Planning, Jack's College, Vacation Home, Rachel's Wedding, Charitable Giving

---

## §2 — Data Cloud inventory: what's AVAILABLE but NOT yet surfaced (gaps)

From `data_stream_inventory.csv`. Data-access rule: **SalesforceDotCom origin → GraphQL (Core/FSC); Snowflake/Databricks/AIPlatform → Apex REST bridge → Data Cloud.**

### 2a. Third-party enrichment (Snowflake) — mostly NEW to the UI
| Stream / DMO | Records | Persona relevance | On page today? |
|---|---|---|---|
| `CumulusPlaidHeldAway` | 165,680 | **Retail/Wealth** — held-away asset capture | Partial (amount only) → **expand** |
| `CumulusMgpFinancialPlans` | 957,141 | **Wealth** — MoneyGuidePro plans | ❌ **gap** |
| `CumulusMSCIESG` | 34,170 | **Wealth** — ESG scores on holdings | ❌ **gap** |
| `CumulusMoodysMarketContext` | 1,412,293 | Wealth/Commercial — market context | ❌ **gap** |
| `CumulusClaritasDemographics` | 76,272 | **Retail** — household demographics/segmentation | ❌ **gap** |
| `CumulusCoreLogicProperty` | 50,848 | **Retail** — property/home value (lending) | ❌ **gap** |
| `CumulusEsriGeoFootprint` | 39,981 | Retail — geo/branch footprint | ❌ **gap** |
| `CumulusGongCallSentiment` | 1,067,585 | All — call sentiment on interactions | ❌ **gap** |
| `CumulusWorldCheckAml` | 1,325,326 | All — AML/watchlist screening | ❌ **gap** |
| `CumulusDnBBusinessCredit` | 34,170 | **Commercial** — credit/PAYDEX | ❌ (business) |
| `CumulusZoomInfoFirmographics` | 34,170 | **Commercial** — firmographics | ❌ (business) |
| `CumulusBoardExExecIntel` | 957,141 | **Commercial** — exec intel | ❌ (business) |
| `CumulusSynthRelationshipGraph` | 61,769 | All — relationship/household graph | Partial (network tab) → **enrich** |
| `SEC_Filings` | 11 | Commercial — filings | ❌ (business) |

### 2b. Predictions / ML (Snowflake + Databricks + AIPlatform)
| Stream / DMO | Records | What | On page? |
|---|---|---|---|
| `Bank_Churner` (Databricks) | 11,256 | **Churn** prediction | ✅ shown (Risk tab) — keep |
| `Attrition_Inputs_Snowflake` | 741 | Churn drivers (SHAP) | Partial → **expand drivers** |
| `PERSONAL_PRODUCT_RECOMMENDATION` | 8,240 | **Next-best-product** (retail) | ✅ (CDs) — keep |
| `BUSINESS_PRODUCT_RECOMMENDATION` | 3,500 | NBP (business) | ❌ (business) |
| `Loan_Delinquencies` | 750 | Delinquency risk | ❌ **gap** |
| `CSAT_Snowflake` / CSAT_NPS | 28,899 | **CSAT/NPS** | ✅ (analytics) — keep |
| `AiAgentSession/Interaction/Message` (AIPlatform) | ~20k | **Agentforce interaction history** | ❌ **gap** — surface agent activity |

### 2c. Transactions & trades (high volume)
| Stream / DMO | Records | What | On page? |
|---|---|---|---|
| `Financial_Trades_Snow` | 2,883,726 | **Trades** (Wealth) | ❌ **gap** (Wealth) |
| `Financial_Transactions_Snow_XL` | 100,000,000 | **Transactions** (all) | ❌ **gap** — transaction feed/analytics |
| `Web_Engagements_Snow` → `ssot__WebsiteEngagement__dlm` | 145 | **Web/behavioral** real-time | ✅ (added Engagement tab) — keep |
| `claims_Databricks` | 1,000,000 | Insurance claims | ❌ (insurance persona) |

### 2d. Core/FSC objects available via GraphQL — parity + a few gaps
Present as streams (38 distinct customer objects). Already on page or trivially addable:
- **On page:** Account, Contact, Opportunity, Case, Lead, Referral, FinancialGoal, PersonLifeEvent, FinancialAccount, Files
- **Available, NOT clearly surfaced (gaps):** `FinServ__Alert__c` (RecordAlert), `FinServ__Card__c` (PaymentCard), `FinServ__Securities__c`/`FinancialHolding__c` (holdings detail), `FinServ__AssetsAndLiabilities__c`, `InteractionSummary`, `Meeting_Note__c`, `VoiceCall`, `EmailMessage`, `Campaign/CampaignMember`, `AccountContactRelation`, Knowledge articles

---

## §3 — Redesign: information architecture (union of §1 + §2)

The current tab pattern (Overview/Journey/Money/Engagement/Planning/Risk/Network) is the right *skeleton* but the visual pattern is weak. Redesign keeps the tab model, **guarantees §1 parity**, and folds in §2 gaps. Proposed IA:

**Persistent (all tabs):** identity rail (§1a) + financial spine (§1b) + unified-profile bar (§1d) + AI relationship brief/Agentforce summary (§1c).

**Tabs:**
1. **Overview** — AI brief, highlight strip, relationship map (§2a graph), timeline, product-mix + AUM trend (§1e). *Parity: Overview.*
2. **Journey & Goals** — life-events filmstrip + goal rings (§1g). *Parity: ⏳ Journey.*
3. **Money** — financial spine detail, product mix + AUM allocation + inflow/outflow (§1e), **holdings** (§2d Securities/Holding), **transactions feed** (§2c NEW), **held-away** (§2a Plaid, expanded), payment cards (§2d NEW). *Parity: Portfolio + analytics.*
4. **Engagement** — interactions, activity timeline, **web/behavioral** (§2c), **call sentiment (Gong)** (§2a NEW), **Agentforce interaction history** (§2b NEW), CSAT/NPS trend (§1e). *Parity: Sales+Service.*
5. **Planning** — opportunities, financial goals, referrals (§1g), leads (§1g), NBA. *Parity: Referrals.*
6. **Risk & Signals** — churn + drivers (§2b), **delinquency** (§2b NEW), **AML/WorldCheck** (§2a NEW), attrition, next-best-product, **record alerts** (§2d NEW). *Parity: AI Signals.*
7. **Household & Property** *(NEW tab, retail-specific)* — relationship graph (§2a), **Claritas demographics** (§2a NEW), **CoreLogic property/home value** (§2a NEW), **Esri geo footprint** (§2a NEW). *Parity: Structure + Location.*
8. **Tearsheet** *(NEW)* — one-page printable summary. *Parity: 📄 Tearsheet.*

**NEW vs today (net-adds):** transactions feed, held-away detail, payment cards, call sentiment, Agentforce history, delinquency, AML screening, record alerts, demographics, property value, geo footprint, richer churn drivers, one-page tearsheet.

---

## §3b — SETTLED content contract (user-confirmed 2026-07-06)

The full set below is authoritative. It does NOT have to follow this grouping — the design job is to find a **seamless per-tab / per-page-layout** way to present all of it. This supersedes §3's tab guesses where they differ.

**Profile-widget tabs → distribute as bits of info throughout the design (keep same content):**
Overview · AI Signals · Portfolio · Services · Location · Structure · Insight

**Main content (tabs / sections):**
- **Details** — editable component (view + edit fields)
- **Journey** — same content (life events + goals)
- **Tearsheet** — generate via a **prompt-builder prompt** (Agentforce)
- **Financial Accounts**
- **Financial Transactions**
- **Financial Trades**
- **Interactions & Engagements**
- **Cases**
- **CSAT & NPS**
- **Opportunities**
- **Campaigns**
- **Meeting Notes**
- **Call Summaries**
- **KYC Summaries**

**Right sidebar (AI/ML components — Agentforce-generated + prediction models):**
- Attrition ML component
- CSAT ML component
- Product Recommendation ML component
- Agentforce Account Summary
- Agentforce Transaction Summary
- Agentforce Trade Summary
- Agentforce Interaction Summary
- Interaction Timeline
- Agentforce CSAT Summary
- Agentforce Opportunity Summary
- Agentforce Case Summary
- Agentforce Campaign Summary

**Plus** the §2 NEW data-inventory items (held-away, demographics, property, geo, call sentiment, AML, delinquency, relationship graph, etc.) layered in as gaps.

**Design principle:** the configuration above is a checklist, not a layout. Find the elegant/seamless arrangement — per tab or per page layout — that presents ALL of it without feeling like boxes-in-boxes.

## §3c — LIVE SCHEMA VERIFICATION (2026-07-06, org jdo-1lrnov == storm-16a17dc388fbe6)

Probed the real org (GraphQL `uiapi` + Data Cloud `ssot/queryv2`). Findings that **change the design** — mock assumptions that were wrong are corrected here:

**Core/FSC GraphQL — VERIFIED working:**
- `uiapi.query.Opportunity(where:{IsClosed:{eq:false}})` → 19,011 open; fields `Name/StageName/Amount/CloseDate` all valid with `@optional{value}`. `Case` → 5,351 open. Home Core query confirmed live, no errors.
- Julie E Morris = `001am00000qvjsAAAQ` confirmed present.

**Data Cloud DMOs — real names + account-join keys (probed):**
| DMO (real name) | Account join key | Notes |
|---|---|---|
| `CSAT_Snowflake__dlm` | `accountid__c` ✅ | `csat_score__c`, `nps_score__c`, `csat_description__c`, `nps_description__c` — real values per account. Drives "who to call". |
| `CumulusPlaidHeldAway__dlm` | `ssot__AccountId__c` ✅ | `balanceUsd__c`, `institutionName__c`, `accountType__c`, `investmentRiskTier__c`, `monthlyNetFlowUsd__c`, `isActive__c` |
| `CumulusClaritasDemographics__dlm` | `ssot__AccountId__c` ✅ | `prizmSegmentName__c`, `lifeStage__c`, `estimatedNetWorthBand__c`, `wealthPropensityScore__c`, `investmentPropensityScore__c`, `financialStressIndicator__c` |
| `CumulusMSCIESG__dlm` | `ssot__AccountId__c` ✅ | 18 cols |
| `CumulusMgpFinancialPlans__dlm` | `ssot__AccountId__c` ✅ | 17 cols |
| `CumulusCoreLogicProperty__dlm` | `ssot__AccountId__c` ✅ | 17 cols |
| `CumulusGongCallSentiment__dlm` | `ssot__AccountId__c` ✅ | 18 cols |
| `CumulusWorldCheckAml__dlm` | `ssot__AccountId__c` ✅ | 17 cols (AML) |
| `Financial_Trades__dlm` | `AccountID__c` / `KQ_AccountID__c` ✅ | 28 cols |
| `CumulusSynthRelationshipGraph__dlm` | (none — 10 cols, own key) | join via relationship id, not account |
| `Bank_Churner__dlm` | ❌ **email/Id only** | Raw Kaggle churn feature set (`Attrition_Flag__c` label: 8,500 existing / 1,627 attrited). Keyed on `EmailAddress__c`+`Id__c`; does NOT join to Account → cannot drive an account-level churn score directly. Use for aggregate/segment churn, not per-client. |
| `PERSONAL_PRODUCT_RECOMMENDATION__dlm` | ❌ **404 — does not exist** | Only `PERSONAL_PRODUCT_RECOMMENDATION_INPU__dlm` exists (input FEATURES keyed on `accountid__c`: income, credit_score, deposit, dti, risk_tolerance…) — NO recommendation OUTPUT column. "Next best product" must be derived, not read. |

**Design implications (locked):**
1. "Who to call" ranks on **low CSAT** (`CSAT_Snowflake__dlm`, account-joinable + real) — NOT Bank_Churner (unjoinable). Corrected in `homeDataReal.ts`.
2. Next-best-product has no ready output DMO → derive from `_INPU` features or an Einstein/Agentforce call; don't fabricate a `recommended_product__c`.
3. All Cumulus enrichment (Plaid/Claritas/MSCI/MGP/CoreLogic/Gong/WorldCheck) joins on `ssot__AccountId__c` → clean per-client 360 tiles.
4. `DcBridgeRest` DEPLOYED to org (2 classes, 5/5 tests pass). GraphQL Home query VERIFIED. Real path proven end-to-end.

## §4 — Persona variants (later)
- **Omega / Commercial:** swap Risk/Money for **DnB credit + PAYDEX**, **ZoomInfo firmographics**, **BoardEx execs**, **SEC filings**, **BUSINESS_PRODUCT_RECOMMENDATION**, **covenant/delinquency**; relationship graph = corporate hierarchy.
- **Wealth:** lead with **AUM + held-away capture**, **MGP financial plans**, **MSCI ESG** on holdings, **Financial_Trades** history, **Moody's market context**, retirement readiness.

---

## §5 — Design-pattern rebuild (the "terrible pattern" fix)
Content model above is settled; the visual system is the open work. Direction to resolve with user before building §3:
- Replace the flat glass-card grid with a stronger hierarchy: hero relationship statement → dense-but-scannable tabbed canvas → sticky rails.
- Reduce card-on-card nesting; use section dividers + whitespace rhythm (horizon's restraint) over boxes-in-boxes.
- Consistent chart styling, one accent, typographic scale. Light mode.
- This doc is the content contract; the visual pass is separate and next.
