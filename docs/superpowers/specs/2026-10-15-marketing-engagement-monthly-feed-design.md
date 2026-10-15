# Marketing Engagement Monthly Feed — Design

**Date:** 2026-10-15
**Status:** Draft, pending review
**Builds on:** `2026-10-14-marketing-engagement-design.md` (table, funnel rules, campaign catalog)
**Org:** JDO (`jdo-gj9q5q`, admin@finsdc3.demo)
**Database:** Heroku Postgres, `"Fins"` schema

## Goal

`"Fins".marketing_engagement` should stay current without anyone running scripts by hand:

- **New campaigns every month.** Each is created as a real Campaign record in JDO, and its Id goes on every row.
- **Engagement arrives as time passes.** Sends land on the start date, and opens, clicks and unsubscribes trickle in over the following days. Nothing is future-dated.
- **CRM and Postgres stay reconciled.**
- **Nothing is truncated, deleted or updated** in `marketing_engagement`. Rows are only ever inserted.

Data Cloud needs no changes. The `marketing_engagement_Heroku_Postgres` stream is zero-copy, so `Marketing_Engagements__dlm` sees new rows as soon as they're inserted.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Runner | Small Python worker on a Heroku app, run by Heroku Scheduler | Fully in the cloud. No laptop, no repo secrets. |
| Scheduling | Heroku Scheduler, hourly | One runtime, no `pg_cron`. The funnel logic stays in one Python implementation. |
| CRM access | JWT bearer flow as admin@finsdc3.demo | No interactive login. Works unattended. |
| Campaign source of truth | New `"Fins".marketing_campaign` table | One place to reconcile against CRM. It's seeded from `catalog.py`. |
| Volume | 2 campaigns/month (1 Personal, 1 Business), plus a monthly Welcome email for new accounts | About 13k sends and 40k events a month, and new accounts get covered. |
| Write rule | `INSERT … ON CONFLICT DO NOTHING` only | Meets the no-truncate/no-delete requirement. The deterministic `engagement_id` makes repeat runs no-ops. |

## Design

### 1. New tables

**`"Fins".marketing_campaign`**: one row per in-scope campaign, existing and generated.

| Column | Type | Notes |
|---|---|---|
| `campaign_key` | `varchar(40)` **PK** | Stable key. For existing campaigns it's the catalog name's slug; for generated ones it's `<template_key>-<yyyy-mm>`. |
| `campaign_id` | `varchar(18)` unique | JDO Campaign Id (`701…`). Null until the CRM sync creates the record. |
| `campaign_name` | `varchar(80)` not null | For example "CD Rate Special — November 2026" |
| `audience_source` | `varchar(20)` not null | `Campaign Member` or `Segment` (same values as `marketing_engagement`) |
| `target` | `varchar(10)` not null | `Personal` / `Business` |
| `audience_rule` | `varchar(30)` not null | `all`, `share:0.40`, `uncovered+0.20`, `new_accounts` |
| `product_name`, `product_category` | `varchar(50)` | |
| `start_date`, `end_date` | `date` | `end_date` is null only for open-ended CRM campaigns |
| `template_key` | `varchar(30)` | Null for existing campaigns |
| `crm_state` | `varchar(20)` not null | `Pending CRM`, `Linked`, `Missing in CRM`, `Drifted` |
| `crm_checked_at` | `timestamp` | Last reconcile time |
| `created_at` | `timestamp` not null | |

Seeding: the 15 catalog campaigns, all `Linked`, with their existing Ids. Rows in this table may be updated, unlike `marketing_engagement`.

**`"Fins".marketing_campaign_template`**: the rotating library, seeded with about 12 templates.

| Column | Notes |
|---|---|
| `template_key` **PK** | For example `cd-rate-special` |
| `name_pattern` | For example `CD Rate Special — {Month YYYY}` |
| `target`, `audience_rule`, `product_name`, `product_category` | |
| `start_day`, `duration_days` | When the campaign starts within the month, and how long it runs |
| `active` | Templates can be retired without being deleted |

Starter library:
- **Personal:** CD Rate Special, Rewards Credit Card, Home Equity Line, Auto Loan Refinance, Savings Goal Challenge, Retirement Readiness.
- **Business:** Business Line of Credit, Merchant Services, Treasury Management, Business Credit Card, Payroll Services, Commercial Real Estate.

Each has an audience share of 0.30–0.40.

**`"Fins".marketing_feed_run`**: an insert-only run log with run_at, step, campaigns created, rows inserted, status and error. It's for troubleshooting and for an "is the feed alive" check.

### 2. Worker steps (`feed.py`, every hour)

Each step can be re-run safely and is independent of the others. A failure in one step is logged to `marketing_feed_run`, and the worker still runs the remaining steps that don't depend on it.

1. **Monthly rollover.** If the current month has no generated campaigns, add rows for that month's `Pending CRM` campaigns:
   - Two templates: one Personal and one Business. They're chosen by rotating through the active templates in key order, so no template repeats until all have been used.
   - One `Welcome to Fins — {Month YYYY}` campaign (`audience_rule = new_accounts`) for accounts created in the previous month.
   - `campaign_key` is fixed per template and month, so running the step twice creates nothing new.
2. **CRM create.** For each `Pending CRM` campaign:
   - Look it up in JDO by Name first. If it exists (for example because a previous write-back failed), link that Id.
   - Otherwise create it: `Type = Email`, `IsActive = true`, the dates, Status `Planned`, and the existing segment-campaign Description.
   - Write the Id back and set `crm_state = Linked`.
   - Nothing is generated for a campaign until it has an Id.
3. **Generate events.** For every `Linked` campaign that's still active (`now <= end_date + 14 days`, or no end date):
   - Build the audience as `backfill.py` does, but count only accounts whose `CreatedDate` is before `start_date`. This keeps a campaign's audience stable over time.
   - `new_accounts` takes the accounts created in the previous calendar month.
   - CRM-member campaigns read their CampaignMembers, as `backfill.py` does today.
   - Generate each send's funnel with the existing rules and the per-`send_id` seed. Keep events with `engagement_at <= now`. Insert with `ON CONFLICT (engagement_id) DO NOTHING`.
   - Events already stored regenerate to the same `engagement_id`, so they're skipped. Only newly due events land.
4. **Reconcile and status** (first run after 06:00 UTC each day):
   - Compare each `Linked` campaign with CRM.
     - Record deleted: mark it `Missing in CRM`, and stop generating events for it.
     - Name or dates changed: mark it `Drifted` and log the difference. Postgres stays as it is; a person decides.
   - Move CRM Status by date: Planned, then In Progress on `start_date`, then Completed after `end_date`.
   - Set `NumberSent` on Segment campaigns to their current `Sent` count.

### 3. Reuse and changes to existing code

- Move `events_for`, `build_sends`, `unit` and `md5` out of `backfill.py` into **`engine.py`**. Both `backfill.py` and `feed.py` import from it, so there's still one funnel implementation.
- **`backfill.py` becomes insert-only.** It no longer `TRUNCATE`s, and it loads with `INSERT … ON CONFLICT DO NOTHING`. Its campaign definitions come from `marketing_campaign`. Re-running it is now always safe.
- `catalog.py` is used only to seed `marketing_campaign` once (`sql/002`). After that, the table is the source of truth.
- `seed_campaigns.py` is superseded by the worker's CRM-create step and is removed.

### 4. Edge cases

- **CRM member flips to Responded after a bounce.** If a send already has a `Bounced` row, it gets no new events. That way a send never has both Bounced and Delivered.
- **Member added to an active CRM campaign after it started.** Its send time starts from the member's `CreatedDate` rather than the campaign `StartDate`, so it isn't backdated. This applies only to members created after 2026-10-15, so existing rows keep their timings.
- **Accounts deleted in CRM.** Their rows stay (no deletes). They simply don't appear in new audiences.
- **Clock and cap.** `now` is the worker's UTC run time, and events after it wait for a later run. A missed hour costs nothing; the next run catches up.

### 5. Heroku setup

- **App:** `jdo-marketing-feed`, Python buildpack. The code is deployed from the `Marketing_Engagement/` folder with `git subtree push --prefix Marketing_Engagement heroku main`.
  - Files: `Procfile`/`requirements.txt` (`psycopg[binary]`, `requests`, `PyJWT[crypto]`), plus `.python-version`.
- **Database:** attach the existing Heroku Postgres to the app (`DATABASE_URL`). If it lives on another account, use `Heroku_PG_*` config vars instead. The worker reads `DATABASE_URL` first, then `.env` for local runs.
- **Salesforce auth:** an External Client App in JDO with JWT bearer enabled, pre-authorized for admin@finsdc3.demo's profile, with a self-signed cert.
  - Config vars: `SF_LOGIN_URL`, `SF_CLIENT_ID`, `SF_USERNAME`, `SF_PRIVATE_KEY`.
  - The private key lives only in config vars. It's never committed or logged.
- **Scheduler:** one hourly job, `python feed.py`.
- **Prerequisite from the user:** log in to the Heroku CLI (`heroku login`). Creating the app and attaching the database need it.

### 6. Code layout

```
Marketing_Engagement/
  engine.py                       audiences + event funnel (moved from backfill.py)
  feed.py                         hourly worker: rollover → CRM create → generate → reconcile
  sf.py                           JWT auth + minimal REST (query, create, update)
  backfill.py                     insert-only; reads marketing_campaign
  catalog.py                      seed data for sql/002 only
  sql/001_marketing_engagement.sql
  sql/002_campaign_tables.sql     marketing_campaign, _template, _feed_run + seeds
  Procfile, requirements.txt, .python-version
```

## Verification

- **Insert-only proof:** run `backfill.py --as-of 2026-10-15` against the live table. 0 rows inserted, and the row count and content md5 are unchanged (`921f5820495e94dc1fc610c461167d79`, computed over the content columns).
- **Dry run:** `feed.py --dry-run --now 2026-11-01T07:00` prints the planned rollover (3 campaigns), the audience sizes and the events due, and writes nothing.
- **First live run:**
  - 3 Campaigns appear in JDO with Status Planned, and their Ids are in `marketing_campaign` as `Linked`.
  - Rows show up with those Ids once `start_date` arrives.
  - Running it again the same hour inserts 0 rows.
- **Funnel parity:** over a full generated campaign, bounce, open and click rates match the backfill's rates within ±1 point.
- **Reconcile:** renaming a test campaign in CRM marks it `Drifted`. Deleting a scratch campaign marks it `Missing in CRM` and stops its rows.
- **Data Cloud:** new rows are visible in `Marketing_Engagements__dlm` within minutes, and the C360 page shows the new campaign on an account in its audience.
- **Liveness:** `marketing_feed_run` has a success row in each of the last 24 hours.

## Out of scope

- CampaignMembers for generated campaigns. As before, their audience lives in Postgres.
- Event and webinar campaigns, and non-email channels.
- Changing or removing existing rows. The old `marketing_campaigns` table and stream are retired separately once the Tableau Next dashboards move over.
- Alerting. `marketing_feed_run` is the hook for it if you want it later.

## Risks

- **JWT setup.** It's the one fiddly manual step. If the cert or pre-authorization is wrong, the CRM steps fail and nothing new is generated, while existing campaigns keep generating events.
- **Rotation is predictable** with a 12-template library: each template returns about every 6 months. The names carry the month, so they don't collide.
- **Hourly CRM reads.** The Account query (about 36k rows, about 18 REST pages) runs only during generation for campaigns whose audience needs it, and it's cached per run. That's well within JDO's API limits.
