# Marketing Engagement

Email engagement events for JDO accounts in Heroku Postgres `"Fins".marketing_engagement`. One row per event: Sent, Delivered, Bounced, Opened, Clicked or Unsubscribed. Data Cloud reads it zero-copy as `Marketing_Engagements__dlm`.

Specs:
- `docs/superpowers/specs/2026-10-14-marketing-engagement-design.md` (table and funnel)
- `docs/superpowers/specs/2026-10-15-marketing-engagement-monthly-feed-design.md` (feed)

## The table is insert-only

Nothing truncates, deletes or updates `marketing_engagement`. `engagement_id` is deterministic, so every writer uses `INSERT … ON CONFLICT DO NOTHING`, and re-running anything is always safe.

## Files

| File | Role |
|---|---|
| `engine.py` | Audience rules and the event funnel (pure) |
| `crm.py` | CRM reads (Accounts, Contacts, CampaignMembers) |
| `db.py` | Postgres access (`DATABASE_URL`, or `.env` `Heroku_PG_*` / `ME_ENV_FILE`) |
| `sf.py` | Salesforce REST: JWT on Heroku, the sf CLI session locally |
| `feed.py` | Hourly worker: rollover → CRM create → generate → reconcile |
| `backfill.py` | Insert any missing rows for all Linked campaigns |
| `migrate.py` | Apply `sql/*.sql` and seed `marketing_campaign` from `catalog.py` |

## Heroku

- **App:** `data-cloud`, which also owns the database `postgresql-trapezoidal-29488` (`DATABASE_URL`). Salesforce internal users can't create personal apps, and a team app would expose the JWT key to team admins.
- **Schedule:** Heroku Scheduler (`scheduler-sinuous-98351`) runs `python feed.py` every hour at :10. Generated campaigns start in November 2026 (`feed.FIRST_MONTH`).
- **Config vars:** `DATABASE_URL`, `SF_LOGIN_URL`, `SF_CLIENT_ID`, `SF_USERNAME`, `SF_PRIVATE_KEY`. The JWT key pair is in `~/.jdo-marketing-feed/`, and the Connected App is `JDO Marketing Feed` in JDO.
- **Deploy:**


```bash
git push https://git.heroku.com/data-cloud.git "$(git subtree split --prefix Marketing_Engagement HEAD):refs/heads/main"
```

## Operating it

```bash
heroku run -a data-cloud -- python feed.py --dry-run      # preview
heroku logs -a data-cloud --source app --num 100           # recent runs
```

- **Is it alive?** Check `select * from "Fins".marketing_feed_run order by run_id desc limit 20`.
- **Campaign states:** `Drifted` means the campaign was renamed or re-dated in CRM, and `Missing in CRM` means it was deleted. Either way the campaign stops generating. Fix CRM back to the stored values, then set `crm_state = 'Linked'`.
- **Templates:** add a row to `"Fins".marketing_campaign_template`. Set `active = false` to retire one; never delete.
- **Tests:** run `ME_ENV_FILE=../.env python3 -m pytest tests -q`. It uses the scratch schema `fins_feed_test`.
