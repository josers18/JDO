# Marketing Engagement

Email engagement events for JDO accounts in Heroku Postgres `"Fins".marketing_engagement`. One row per event: Sent, Delivered, Bounced, Opened, Clicked or Unsubscribed. Data Cloud reads it zero-copy as `Marketing_Engagements__dlm`.

The same worker also sends weekly identified product-page browsing to the Cumulus RTOM demo site for the React-Headless R6 card (see [Weekly identified browsing](#weekly-identified-browsing)). Those events go to Data Cloud through the Web SDK beacon, not to Postgres.

Specs:
- `docs/superpowers/specs/2026-10-14-marketing-engagement-design.md` (table and funnel)
- `docs/superpowers/specs/2026-10-15-marketing-engagement-monthly-feed-design.md` (feed)

## The table is insert-only

Nothing truncates, deletes or updates `marketing_engagement`. `engagement_id` is deterministic, so every writer uses `INSERT … ON CONFLICT DO NOTHING`, and re-running anything is always safe.

Inserted rows can't be removed, so the writers also guard against rows that would be wrong forever (`engine.new_rows`):

- **Finished campaigns don't grow.** Once a campaign is past its cap (end date + 14 days) and has rows, a later run only fills in missing events for sends it already has. CRM changes, such as a renamed member campaign or an account that newly matches, never add backdated sends. A campaign with no rows yet still gets its first load.
- **Bounced and Delivered never mix.** A send with a Bounced row gets nothing more, and a send with a Delivered row never gets a Bounced one (for example after a member's `HasResponded` changes).
- **No future dates.** `feed.py --now` and `backfill.py --as-of` refuse a future time unless `--dry-run` is set.

## Files

| File | Role |
|---|---|
| `engine.py` | Audience rules and the event funnel (pure) |
| `crm.py` | CRM reads (Accounts, Contacts, CampaignMembers) |
| `db.py` | Postgres access (`DATABASE_URL`, or `.env` `Heroku_PG_*` / `ME_ENV_FILE`) |
| `sf.py` | Salesforce REST: JWT on Heroku, the sf CLI session locally |
| `feed.py` | Hourly worker: rollover → CRM create → generate → reconcile → web_browsing (weekly) |
| `web_browsing.py` | Weekly identified browsing on the Cumulus RTOM demo site for the React-Headless R6 card |
| `backfill.py` | Insert any missing rows for all Linked campaigns |
| `migrate.py` | Apply `sql/*.sql` and seed `marketing_campaign` from `catalog.py` |

## Heroku

- **App:** `data-cloud`, which also owns the database `postgresql-trapezoidal-29488` (`DATABASE_URL`). Salesforce internal users can't create personal apps, and a team app would expose the JWT key to team admins.
- **Schedule:** Heroku Scheduler (`scheduler-sinuous-98351`) runs `python feed.py` every hour at :10. Its last step, `web_browsing`, runs weekly (see below). Generated campaigns start in October 2026 (`feed.FIRST_MONTH`; moved up from November on 2026-10-24 to fill the October gap).
- **Missed runs:** the next run catches up. Campaigns keep generating for 7 days past their cap (`feed.GRACE`), so an outage shorter than that loses nothing. A Postgres advisory lock makes an overlapping run (a Scheduler double-fire or a manual run) skip, so it can't create duplicate CRM Campaigns.
- **Config vars:** `DATABASE_URL`, `SF_LOGIN_URL`, `SF_CLIENT_ID`, `SF_USERNAME`, `SF_PRIVATE_KEY`. The JWT key pair is in `~/.jdo-marketing-feed/`, and the Connected App is `JDO Marketing Feed` in JDO.
- **Deploy:**


```bash
git push https://git.heroku.com/data-cloud.git "$(git subtree split --prefix Marketing_Engagement HEAD):refs/heads/main"
```

Heroku's `main` history no longer descends from the subtree split (the trees match; the commits don't), so that push is rejected as non-fast-forward. Don't force it. Commit the split's tree on top of Heroku's head instead (v17, 2026-11-10):

```bash
git fetch https://git.heroku.com/data-cloud.git main:refs/remotes/heroku-dc/main
split=$(git subtree split --prefix Marketing_Engagement HEAD)
git diff --stat heroku-dc/main "$split"          # only your changes should show
c=$(git commit-tree "${split}^{tree}" -p heroku-dc/main -m "<message> (monorepo <sha>)")
git push https://git.heroku.com/data-cloud.git "${c}:refs/heads/main"
```

## Weekly identified browsing

Since 2026-08-19 almost every device on the Cumulus RTOM demo site is anonymous, so the Retail cockpit's R6 browsing card had nothing current for Sarah Smith's or Justin Chen's books. `web_browsing.py` sends the same two Data Cloud Web SDK calls the site's sitemap makes (`/web/v2/authentication`, then one `Viewed Product Detail` beacon per page load) for six household devices that identity resolution already links to their clients: Amy Morris, George Hernandez, Micheal Cuevas, Craig Scott (Sarah's book only), Christina Guerra and Tina Ochoa.

- **Plan:** each ISO week, each household loads its featured product 3–4 times (enough for R6's `SURGE_VIEWS = 3` follow-up) and a second product 1–2 times. The featured product rotates by week. Loads are 4s apart, because R6 collapses repeats within 2s.
- **Schedule:** a `web_browsing` step at the end of the hourly feed. It runs once 7 days have passed since its last `ok` row, at or after 15:00 UTC. The first live send was 2026-11-10 04:53Z (28 page loads), so the next is due at the 2026-11-17 15:10Z feed run.
- **Manual:** `python web_browsing.py --dry-run` prints this week's plan; without `--dry-run` it sends and logs a `web_browsing` row. That row resets the weekly clock.
- **Tests** stub `web_browsing.send` in the `pg` fixture, so feed tests never send beacons.

## Operating it

```bash
heroku run -a data-cloud -- python feed.py --dry-run      # preview
heroku logs -a data-cloud --source app --num 100           # recent runs
```

- **Is it alive?** Check `select * from "Fins".marketing_feed_run order by run_id desc limit 20`.
- **Campaign states:** `Drifted` means the campaign was renamed or re-dated in CRM, and `Missing in CRM` means it was deleted. Either way the campaign stops generating. Fix CRM back to the stored values, then set `crm_state = 'Linked'`.
- **Templates:** add a row to `"Fins".marketing_campaign_template`. Set `active = false` to retire one; never delete. Changes take effect at the next month's rollover: a month that already has its Personal and Business campaigns doesn't get another.
- **Tests:** run `ME_ENV_FILE=../.env python3 -m pytest tests -q`. It uses the scratch schema `fins_feed_test`.
