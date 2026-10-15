# Marketing Engagement (Heroku PG → Data Cloud) — Design

**Date:** 2026-10-14
**Status:** Draft, pending review
**Org:** JDO (`jdo-gj9q5q`, admin@finsdc3.demo)
**Database:** Heroku Postgres (creds in repo-root `.env`, `Heroku_PG_*`)

## Goal

Give JDO customers realistic email marketing engagement history (sends, deliveries, bounces, opens, clicks, unsubscribes) tied to **real JDO Campaign records and CampaignMembers**, so it flows into Data Cloud and the dashboards and C360 pages built on it.

## Current state

- `"Fins".marketing_campaigns` holds 28 rows for 2 accounts, with one row per send that records only the final action (`Open` / `Click` / `Unsubscribe` / `Un-Opened`). None of its 17 campaign names exist in JDO.
- The Data Cloud stream `Marketing_Campaigns` (Heroku_Postgres connector, `INCREMENTAL`) reads the table into `Marketing_Campaigns__dll`, primary key `SendID__c`, category Engagement. That feeds the DMO `Marketing_Campaigns__dlm`.
- ReactCommercial's C360 page (`src/personas/customer/full360DataReal.ts`) queries `Marketing_Campaigns__dlm` by `AccountID__c` for `Campaign_Name__c`, `Category__c`, `Product_Name__c`, `Email_Action__c` and `Send_Date__c`.
- JDO's email campaigns already have real account audiences in CampaignMember (status `Sent` or `Responded`):

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
| Treasury Modernization Brief | 2026-08-03 → 08-03 | **none** |

- The Heroku connector can already stream views (`Deposits_Latest` reads `"Fins".v_latest_deposits`).
- Only 94 business accounts have a Contact with an email address, so business email audiences can't be large.

## Why the grain changes

A single send produces several events: sent, delivered, one or more opens, maybe a click, maybe an unsubscribe. Keeping one row per send with `SendID` as the key throws that history away. The new table therefore stores **one row per event**. `send_id` becomes a grouping key, and the new `engagement_id` is the primary key.

## Scope

**In scope**
- Email campaigns only (`Campaign.Type = 'Email'`) and email events only.
- The new events table, the backfill script, and a compatibility view.
- Giving business accounts a real email audience by adding CampaignMembers to the existing, empty **Treasury Modernization Brief** campaign.
- A new Data Cloud stream on the events table, mapped to the standard Email Engagement DMO.

**Out of scope**
- Event, webinar and conference campaigns (Invited / Registered / Attended). These could become a later event family.
- New Investments-focused campaigns. The Wealth campaigns are webinar/conference type, so Investments coverage stays limited to High Income Customer Outreach.
- Ongoing or live event generation. This is a one-time, re-runnable backfill.
- Changes to ReactCommercial. The compatibility view keeps its query working as-is.

## Design

### 1. Table `"Fins".marketing_engagement`

| Column | Type | Notes |
|---|---|---|
| `engagement_id` | `varchar(64)` **PK** | Deterministic: `md5(send_id ‖ engagement_type ‖ seq)` |
| `send_id` | `varchar(64)` not null | Deterministic: `md5(campaign_id ‖ campaign_member_id)` |
| `campaign_id` | `varchar(18)` not null | JDO Campaign Id (`701…`) |
| `campaign_member_id` | `varchar(18)` not null | JDO CampaignMember Id (`00v…`) |
| `campaign_name` | `varchar(80)` not null | `Campaign.Name` |
| `account_id` | `varchar(18)` not null | `001…` |
| `contact_id` | `varchar(18)` not null | `CampaignMember.ContactId` (the PersonContactId for person accounts) |
| `personal_business` | `varchar(10)` not null | `Personal` / `Business` |
| `product_name` | `varchar(50)` | From the campaign → product mapping (§3) |
| `product_category` | `varchar(50)` | From the campaign → product mapping (§3) |
| `engagement_type` | `varchar(20)` not null | `Sent`, `Delivered`, `Bounced`, `Opened`, `Clicked`, `Unsubscribed` |
| `engagement_at` | `timestamp` not null | Event time; the Data Cloud event-time field |
| `bounce_type` | `varchar(10)` | `Hard` / `Soft` on `Bounced` rows only |
| `last_modified_at` | `timestamp` not null | Load time; the Data Cloud incremental/modified field |

Indexes: `(account_id, engagement_at)` for per-customer reads, and `(send_id)` for the view.
Check constraint: `engagement_type` must be one of the six values.

All columns are lower-case, so SQL doesn't need quoting (unlike the existing Fins tables).

### 2. Event generation rules

For each CampaignMember of an in-scope email campaign that has an account and a contact:

- **Sent:** once per member. The time is random within the first 48h of `StartDate`, between 07:00 and 19:00 US Central.
- **Delivered or Bounced:** 2.5% of sends bounce (80% Soft, 20% Hard), 0–5 min after Sent. A bounced send has no further events. Members with `Responded` status never bounce.
- **Opened:**
  - `Responded` members always open.
  - `Sent`-status members open at 25%.
  - The first open falls 5 min to 72h after delivery, skewed early.
  - 30% of openers get one more open, up to 7 days later.
- **Clicked:** `Responded` means clicked, matching CRM's notion of a response. A Click comes 10 s to 10 min after an Open, and 15% of clickers click a second time. `Sent`-status members never click.
- **Unsubscribed:** 0.4% of openers, 1 min to 24h after an open.
- **Time cap:** no event can be later than `min(EndDate + 14 days, backfill run time)`. Engagement keeps arriving after a campaign closes, and Treasury Modernization Brief opens and closes on the same day. For campaigns with no EndDate (High Income Customer Outreach), the cap is the run time. Any event past the cap is dropped.
- **Randomness:** the RNG is seeded per `send_id`, so reruns produce byte-identical rows.

Expected volume is about 51k sends and about 160k events.

### 3. Campaign → product mapping

The mapping lives in the script as a dict keyed by Campaign Id:

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
| Treasury Modernization Brief | Treasury Management | Treasury Management |

If an email campaign with account members is missing from the mapping, the script fails rather than guessing.

### 4. Treasury Modernization Brief audience (CRM write)

Add one CampaignMember (Status `Sent`) for the primary emailable Contact of each of the 94 business accounts that have one. "Primary" means the oldest Contact with a non-null Email. About 20% of these get Status `Responded`, chosen by the same seeded RNG.

This is the only write to Salesforce. It runs as a separate, idempotent step that skips contacts already on the campaign.

### 5. Compatibility view `"Fins".marketing_campaigns`

1. Rename the current table to `"Fins".marketing_campaigns_legacy`. Its 28 rows are kept but no longer exposed.
2. Create the view `"Fins".marketing_campaigns` with exactly the old column names and types, one row per `send_id`:
   - `AccountID`, `Personal_Business`, `CampaignID`, `Campaign_Name`, `Product_Name` and `product_category` map directly.
   - `SendID` = `send_id`, and `Send_Date` = the Sent time.
   - `Email_Action` = the furthest event reached, in the order `Unsubscribe` > `Click` > `Open` > `Bounced` > `Un-Opened`. The existing vocabulary is kept, and `Bounced` is the only new value.
   - `Snapshot_Date` = `max(last_modified_at)` for the send.
   - `Year` and `Month` are taken from `Send_Date`.

The existing stream, DLO, DMO and React query keep working with no changes. After the swap, the `Marketing_Campaigns` stream needs a **Full Refresh**, triggered through the Data Cloud UI with the `dc-stream-full-refresh-via-ui` skill. This drops the 28 legacy rows from the DLO and loads about 51k real ones.

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

  `campaign_id`, `product_name` and `product_category` go into custom fields `Campaign_Id__c`, `Product_Name__c` and `Product_Category__c` added to the DMO.
- **How the mapping gets done:** through the Data Stream UI with the `dc-field-mapping-via-data-stream` skill, because REST mapping is unreliable here.

### 7. Code layout

```
Marketing_Engagement/
  README.md               run steps and verification queries
  sql/001_marketing_engagement.sql   table, indexes, check constraint
  sql/002_compat_view.sql            rename legacy table and create view (one transaction)
  backfill.py             reads JDO via sf CLI, generates events, loads PG
  seed_treasury_members.py  §4 CRM write (idempotent)
```

- `backfill.py` reads Campaign and CampaignMember with `sf data query --bulk -o jdo-gj9q5q --json`.
- It loads Postgres with psycopg 3 `COPY` into a temp table, then runs `TRUNCATE` and `INSERT … SELECT` on `"Fins".marketing_engagement` in a single transaction. A failed run leaves the previous data in place.
- Credentials come from `.env` only; no secrets are written to disk or logs.
- `--dry-run` prints per-campaign send and event counts without writing anything.

### 8. Run order

1. Run `seed_treasury_members.py` (CRM write; confirm before running).
2. Run `sql/001`.
3. Run `backfill.py --dry-run`, review the counts, then run `backfill.py`.
4. Run `sql/002` (the view swap).
5. Full Refresh the `Marketing_Campaigns` stream.
6. Create the `Marketing_Engagement` stream and map it to Email Engagement.

## Verification

- **Postgres row counts:** every in-scope CampaignMember with an account and contact has exactly one `Sent` row. `Delivered` + `Bounced` = `Sent`.
- **Consistency with CRM:** every `Responded` member has at least one `Opened` and one `Clicked`. No `Sent`-status member has a `Clicked`.
- **Time bounds:** no `engagement_at` is before the campaign `StartDate` or after its cap (`EndDate + 14 days` or the run time). Within each send, events are ordered Sent → Delivered → Opened → Clicked.
- **Determinism:** running `backfill.py` twice produces identical `md5(string_agg(… order by engagement_id))`.
- **View:** `select count(*) from "Fins".marketing_campaigns` = the number of sends, and `SendID` is unique.
- **Data Cloud:** after the Full Refresh, `Marketing_Campaigns__dlm` row count = the number of sends. `ssot__EmailEngagement__dlm` filtered to the new stream's data source = the number of events.
- **Live check:** the ReactCommercial C360 page for an account in Premier Checking Onboarding shows its real campaign rows.

## Risks

- **Changing the source of an existing incremental stream from a table to a view.** This works for `v_latest_*`, but the primary key and column types have to match exactly. The view casts every column to the legacy type.
- **Mapping into a shared standard DMO.** Our events sit alongside the MC Next email events in Email Engagement, so dashboards that need only this source should filter on the data source.
- **Bulk query size:** about 58k CampaignMember rows, which is fine for `--bulk`.
