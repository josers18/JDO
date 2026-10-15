# Marketing Engagement (Heroku PG → Data Cloud) — Design

**Date:** 2026-10-14
**Status:** Draft, pending review (rev 2: full customer-base coverage)
**Org:** JDO (`jdo-gj9q5q`, admin@finsdc3.demo)
**Database:** Heroku Postgres (creds in repo-root `.env`, `Heroku_PG_*`)

## Goal

Give **every JDO customer** (all 36,239 accounts) realistic email marketing engagement history: sends, deliveries, bounces, opens, clicks and unsubscribes, tied to real JDO Campaign records. The data flows into Data Cloud and the dashboards and C360 pages built on it.

- **Existing campaigns that have CampaignMembers:** their real CRM audience is used.
- **Customers no existing campaign reaches:** new Campaign records are created in JDO. Their audience and results are simulated **only in the Postgres table**; no CampaignMembers are created.

## Current state

- `"Fins".marketing_campaigns` holds 28 rows for 2 accounts, with one row per send that records only the final action (`Open` / `Click` / `Unsubscribe` / `Un-Opened`). None of its 17 campaign names exist in JDO.
- The Data Cloud stream `Marketing_Campaigns` (Heroku_Postgres connector, `INCREMENTAL`) reads the table into `Marketing_Campaigns__dll`, primary key `SendID__c`, category Engagement. That feeds the DMO `Marketing_Campaigns__dlm`.
- ReactCommercial's C360 page (`src/personas/customer/full360DataReal.ts`) queries `Marketing_Campaigns__dlm` by `AccountID__c` for `Campaign_Name__c`, `Category__c`, `Product_Name__c`, `Email_Action__c` and `Send_Date__c`.
- JDO's email campaigns with real account audiences in CampaignMember (status `Sent` or `Responded`):

| Campaign | Window | Account members |
|---|---|---|
| Premier Checking Onboarding | 2026-07-30 → 08-04 | 10,815 person |
| Mobile Banking Adoption | 2026-04-20 → 06-19 | 10,805 person |
| HELOC Refi Outreach Q2 | 2026-07-31 → 08-06 | 10,788 person |
| Auto Loan Rate Drop Promo | 2026-01-20 → 03-21 | 10,756 person |
| Multi-Persona Spring Newsletter | 2026-01-20 → 03-21 | 7,924 person |
| Invitation to Annual Customer Conference | 2026-07-29 → 08-28 | 20 person, 65 business |
| High Income Customer Outreach | 2026-09-16 → (open) | 47 person, 3 business |
| Tier 1 High-Income Insurance Campaign 2026 | 2026-09-22 → 12-31 | 5 person |
| Referral Program Launch | 2026-08-10 → 09-09 | 1 business |
| Treasury Modernization Brief | 2026-08-03 → 08-03 | none |

- **Coverage gap:**

| | Accounts | Reached by no email campaign |
|---|---|---|
| Person | 25,431 | 2,447 |
| Business | 10,808 | ~10,770 |

- Only 94 business accounts have a Contact with an email address. Business sends therefore can't depend on Contacts.
- The Heroku connector can already stream views (`Deposits_Latest` reads `"Fins".v_latest_deposits`).

## Why the grain changes

A single send produces several events: sent, delivered, one or more opens, maybe a click, maybe an unsubscribe. Keeping one row per send with `SendID` as the key throws that history away. The new table therefore stores **one row per event**. `send_id` becomes a grouping key, and the new `engagement_id` is the primary key.

## Scope

**In scope**
- Email campaigns only (`Campaign.Type = 'Email'`) and email events only.
- Creating the new email campaigns (§3) as Campaign records in JDO.
- The new events table, the backfill script, and a compatibility view.
- A new Data Cloud stream on the events table, mapped to the standard Email Engagement DMO.

**Out of scope**
- CampaignMember records for new campaigns. Their audience exists only in Postgres.
- Event, webinar and conference campaigns (Invited / Registered / Attended). These could become a later event family.
- Changing the audiences of existing campaigns that already have members.
- Ongoing or live event generation. This is a one-time, re-runnable backfill.
- Changes to ReactCommercial. The compatibility view keeps its query working as-is.

## Design

### 1. Table `"Fins".marketing_engagement`

| Column | Type | Notes |
|---|---|---|
| `engagement_id` | `varchar(64)` **PK** | Deterministic: `md5(send_id ‖ engagement_type ‖ seq)` |
| `send_id` | `varchar(64)` not null | Deterministic: `md5(campaign_id ‖ account_id)` |
| `campaign_id` | `varchar(18)` not null | JDO Campaign Id (`701…`) |
| `campaign_name` | `varchar(80)` not null | `Campaign.Name` |
| `audience_source` | `varchar(10)` not null | `CRM` (from CampaignMember) or `Simulated` (§3) |
| `campaign_member_id` | `varchar(18)` | `00v…`; filled only when `audience_source = 'CRM'` |
| `account_id` | `varchar(18)` not null | `001…` |
| `contact_id` | `varchar(18)` | Person accounts: PersonContactId. Business accounts: the oldest Contact with an Email, if any; otherwise null |
| `personal_business` | `varchar(10)` not null | `Personal` / `Business` |
| `product_name` | `varchar(50)` | From the campaign catalog (§3) |
| `product_category` | `varchar(50)` | From the campaign catalog (§3) |
| `engagement_type` | `varchar(20)` not null | `Sent`, `Delivered`, `Bounced`, `Opened`, `Clicked`, `Unsubscribed` |
| `engagement_at` | `timestamp` not null | Event time; the Data Cloud event-time field |
| `bounce_type` | `varchar(10)` | `Hard` / `Soft` on `Bounced` rows only |
| `last_modified_at` | `timestamp` not null | Load time; the Data Cloud incremental/modified field |

Indexes: `(account_id, engagement_at)` for per-customer reads, and `(send_id)` for the view.
Check constraints:
- `engagement_type` must be one of the six values.
- `audience_source` must be `CRM` or `Simulated`.

All columns are lower-case, so SQL doesn't need quoting (unlike the existing Fins tables).

Each account receives a campaign at most once, so `send_id` = `md5(campaign_id ‖ account_id)` is unique. If a CRM campaign has two members on the same account, which is possible for business accounts, the oldest member wins.

### 2. Event generation rules

These apply to every send, whether its audience comes from CRM or is simulated:

- **Sent:** once per send. The time is random within the first 48h of `StartDate`, between 07:00 and 19:00 US Central.
- **Delivered or Bounced:** 2.5% of sends bounce (80% Soft, 20% Hard), 0–5 min after Sent. A bounced send has no further events.
- **Responders:**
  - CRM sends: a member with `Responded` status is a responder and never bounces.
  - Simulated sends: a seeded 20% of delivered sends are responders. That's close to the existing CRM response rate (about 25%).
- **Opened:**
  - Responders always open.
  - Non-responders open at 25%.
  - The first open falls 5 min to 72h after delivery, skewed early.
  - 30% of openers get one more open, up to 7 days later.
- **Clicked:** responders always click, and non-responders never do. This matches CRM's notion of a response. A Click comes 10 s to 10 min after an Open, and 15% of clickers click a second time.
- **Unsubscribed:** 0.4% of openers, 1 min to 24h after an open.
- **Time cap:** no event can be later than `min(EndDate + 14 days, backfill run time)`. Engagement keeps arriving after a campaign closes. For campaigns with no EndDate, the cap is the run time. Any event past the cap is dropped.
- **Randomness:** the RNG is seeded per `send_id`, and audience selection uses its own fixed seed, so reruns produce byte-identical rows.

### 3. Campaign catalog and coverage

The script holds one catalog of every in-scope email campaign. Entries are keyed by **Campaign Name**, because new campaigns have no Id until they're created. Each entry has: product, category, `personal_business` target, audience source, and (for new campaigns) dates, status and audience rule.

**Existing campaigns with CRM audiences:**

| Campaign | `product_name` | `product_category` |
|---|---|---|
| Premier Checking Onboarding | Checking Account | Deposits |
| Mobile Banking Adoption | Mobile Banking | Digital Banking |
| HELOC Refi Outreach Q2 | HELOC | Loans |
| Auto Loan Rate Drop Promo | Auto Loan | Loans |
| Multi-Persona Spring Newsletter | Newsletter | Brand |
| Invitation to Annual Customer Conference | Annual Customer Conference | Events |
| Referral Program Launch | Referral Program | Brand |
| High Income Customer Outreach | Wealth Management | Investments |
| Tier 1 High-Income Insurance Campaign 2026 | Life Insurance | Insurance |

**Simulated campaigns:** the existing, empty Treasury Modernization Brief plus five new ones:

| Campaign | New? | Window (Status) | Target | Audience rule | `product_name` / `product_category` |
|---|---|---|---|---|---|
| Treasury Modernization Brief | existing | 2026-08-03 → 08-03 (In Progress, unchanged) | Business | Seeded 40% of business accounts | Treasury Management / Treasury Management |
| Business Banking Quarterly — Q2 2026 | **new** | 2026-05-05 → 05-12 (Completed) | Business | **All** business accounts (the coverage guarantee) | Newsletter / Brand |
| Business Line of Credit Offer 2026 | **new** | 2026-06-15 → 06-30 (Completed) | Business | Seeded 40% of business accounts | Business Line of Credit / Loans |
| Merchant Services Spotlight | **new** | 2026-09-08 → 09-19 (Completed) | Business | Seeded 40% of business accounts | Merchant Services / Treasury Management |
| Retirement Readiness Series | **new** | 2026-03-10 → 03-24 (Completed) | Person | **All** 2,447 uncovered person accounts, plus a seeded 20% of the others (the coverage guarantee) | Retirement Account / Investments |
| Rewards Credit Card Offer | **new** | 2026-09-01 → 09-15 (Completed) | Person | Seeded 30% of person accounts | Credit Card / Loans |

**The coverage guarantee:**
- Every business account gets the Q2 newsletter.
- Every person account that no CRM email campaign reaches gets Retirement Readiness Series.
- After the backfill, every one of the 36,239 accounts has at least one `Sent` row. Business accounts average about 2.2 campaigns and person accounts about 2.7. Covered person accounts average about 2.3 today.

If an email campaign with account members is missing from the catalog, the script fails rather than guessing.

**Expected volume:** roughly 90k sends and roughly 280k events. That breaks down as about 51k CRM sends, about 24k simulated business sends and about 15k simulated person sends.

### 4. Creating the new Campaign records (CRM write)

`seed_campaigns.py` creates each new campaign from §3 in JDO if none with that Name exists:
- `Type = 'Email'`, `IsActive = true`, with the Status, `StartDate` and `EndDate` from §3.
- `Description` = "Simulated audience; engagement in Heroku Fins.marketing_engagement."

Existing campaigns are never changed. It runs before the backfill. Running it again creates nothing new, because it matches on Name.

After the backfill, the script sets `NumberSent` on the six simulated campaigns to their simulated send count. That way, Campaign list views and reports show a believable "Num Sent" without any CampaignMembers. `NumberSent` is a writable standard field.

These are the only writes to Salesforce.

### 5. Compatibility view `"Fins".marketing_campaigns`

1. Rename the current table to `"Fins".marketing_campaigns_legacy`. Its 28 rows are kept but no longer exposed.
2. Create the view `"Fins".marketing_campaigns` with exactly the old column names and types, one row per `send_id`:
   - `AccountID`, `Personal_Business`, `CampaignID`, `Campaign_Name`, `Product_Name` and `product_category` map directly.
   - `SendID` = `send_id`, and `Send_Date` = the Sent time.
   - `Email_Action` = the furthest event reached, in the order `Unsubscribe` > `Click` > `Open` > `Bounced` > `Un-Opened`. The existing vocabulary is kept, and `Bounced` is the only new value.
   - `Snapshot_Date` = `max(last_modified_at)` for the send.
   - `Year` and `Month` are taken from `Send_Date`.

The existing stream, DLO, DMO and React query keep working with no changes. After the swap, the `Marketing_Campaigns` stream needs a **Full Refresh**, triggered through the Data Cloud UI with the `dc-stream-full-refresh-via-ui` skill. This drops the 28 legacy rows from the DLO and loads about 90k real ones.

### 6. Data Cloud: new events stream

- **Stream:** `Marketing_Engagement` on `"Fins".marketing_engagement` (Heroku_Postgres connector).
  - Category: Engagement.
  - Primary key: `engagement_id`. Event time: `engagement_at`. Record modified: `last_modified_at`.
  - Refresh mode: `UPSERT` / incremental.
- **DMO mapping:** the standard `ssot__EmailEngagement__dlm` DMO, which already receives Marketing Cloud Next messaging events.

| DLO field | DMO field |
|---|---|
| `engagement_id` | `ssot__Id__c` |
| `send_id` | `ssot__BulkEmailMessageId__c` |
| `contact_id` | `ssot__IndividualId__c` |
| `account_id` | `ssot__AccountContactId__c` |
| `engagement_type` | `ssot__EngagementChannelActionId__c` |
| `engagement_at` | `ssot__EngagementDateTm__c` |
| `campaign_name` | `ssot__EmailName__c` |
| `bounce_type` | `ssot__EmailBounceType__c` |
| `last_modified_at` | `ssot__LastModifiedDate__c` |

  `campaign_id`, `product_name`, `product_category` and `audience_source` go into custom fields `Campaign_Id__c`, `Product_Name__c`, `Product_Category__c` and `Audience_Source__c` added to the DMO.
- **How the mapping gets done:** through the Data Stream UI with the `dc-field-mapping-via-data-stream` skill, because REST mapping is unreliable here.

### 7. Code layout

```
Marketing_Engagement/
  README.md                          run steps and verification queries
  catalog.py                         §3 campaign catalog (single source of truth)
  seed_campaigns.py                  §4 creates the new Campaigns (idempotent); --set-num-sent after backfill
  sql/001_marketing_engagement.sql   table, indexes, check constraints
  sql/002_compat_view.sql            rename legacy table and create view (one transaction)
  backfill.py                        reads JDO via sf CLI, builds audiences, generates events, loads PG
```

- `backfill.py` reads Account, Contact, Campaign and CampaignMember with `sf data query -o jdo-gj9q5q --json`. The installed `sf` no longer supports `--bulk` on `data query`, and the `--json` path returns every record. CampaignMember is about 51k rows.
- It loads Postgres with psycopg 3 `COPY` into a temp table, then runs `TRUNCATE` and `INSERT … SELECT` on `"Fins".marketing_engagement` in a single transaction. A failed run leaves the previous data in place.
- Credentials come from `.env` only; no secrets are written to disk or logs.
- `--dry-run` prints per-campaign send and event counts and the coverage check without writing anything.

### 8. Run order

1. Run `seed_campaigns.py` (CRM write; confirm before running).
2. Run `sql/001`.
3. Run `backfill.py --dry-run`, review the counts and coverage, then run `backfill.py`.
4. Run `seed_campaigns.py --set-num-sent`.
5. Run `sql/002` (the view swap).
6. Full Refresh the `Marketing_Campaigns` stream.
7. Create the `Marketing_Engagement` stream and map it to Email Engagement.

## Verification

- **Coverage:** `select count(distinct account_id) from "Fins".marketing_engagement where engagement_type = 'Sent'` = 36,239 (every JDO account).
- **CRM fidelity:**
  - Every CampaignMember with an account in an existing email campaign has a `Sent` row (one per account, oldest member).
  - Every `Responded` member has at least one `Opened` and one `Clicked`.
  - No non-responder has a `Clicked`.
- **Funnel:** `Delivered` + `Bounced` = `Sent` for each campaign.
- **Time bounds:** no `engagement_at` is before the campaign `StartDate` or after its cap. Within each send, events are ordered Sent → Delivered → Opened → Clicked.
- **CRM records:** the five new Campaigns exist with Type Email. `NumberSent` on each simulated campaign matches its `Sent` count in Postgres.
- **Determinism:** running `backfill.py` twice produces identical `md5(string_agg(… order by engagement_id))`.
- **View:** `select count(*) from "Fins".marketing_campaigns` = the number of sends, and `SendID` is unique.
- **Data Cloud:** after the Full Refresh, `Marketing_Campaigns__dlm` row count = the number of sends. `ssot__EmailEngagement__dlm` filtered to the new stream's data source = the number of events.
- **Live check:** the ReactCommercial C360 page shows real campaign rows for:
  - a business account with no contacts (Q2 newsletter and others), and
  - a person account in Premier Checking Onboarding.

## Risks

- **Changing the source of an existing incremental stream from a table to a view.** This works for `v_latest_*`, but the primary key and column types have to match exactly. The view casts every column to the legacy type.
- **Business sends without a contact.** Most business sends have `contact_id` null, so in Email Engagement they don't link to an Individual. Account-level dashboards key on `account_id` and are unaffected; individual-level segmentation only sees person and contact-backed business sends.
- **Mapping into a shared standard DMO.** Our events sit alongside the MC Next email events in Email Engagement, so dashboards that need only this source should filter on the data source.
- **Simulated campaigns have no CampaignMembers.** Their Campaign records show `NumberSent` but zero members, and CRM campaign-influence reports won't include them. That was chosen deliberately: the engagement record lives in Postgres and Data Cloud.
