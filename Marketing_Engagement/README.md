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

Since 2026-08-19 almost every device on the Cumulus RTOM demo site is anonymous, so the Retail cockpit's R6 browsing card had nothing current for Sarah Smith's, Justin Chen's or Jose Sifontes's books. `web_browsing.py` sends the same two Data Cloud Web SDK calls the site's sitemap makes (`/web/v2/authentication`, then one `Viewed Product Detail` beacon per page load) for 23 household devices that identity resolution links to their clients:
- Sarah's and Justin's books: Amy Morris, George Hernandez, Micheal Cuevas, Craig Scott (Sarah's book only), Christina Guerra and Tina Ochoa.
- Sarah's book, registered 2026-11-10: Katie Anderson, Brian Valdez, Brendan Woods, Jade Carr and Evelyn Estrada.
- Justin's book, registered 2026-11-10: Laura Moyer, Mary Ramirez, Lori Oconnell, Kenneth Ward and Kevin Oliver.
- Jose's book: Julie E Morris (estate planning, secured card), plus six clients whose devices `--register` linked on 2026-11-10: David H Chen, Marcus Rodriguez, Anika Patel, Julia Nakamura, Ethan Brooks and Priya Venkatesh.

Before that, Julie was the only household in Jose's 5,094-account book with linked devices; the other four multi-linked accounts are CRM-to-CRM merges with no device.

### Linking a new device (`--register`)

R6 only counts a device that the Account identity-resolution ruleset (`1iram0000002imiAAA`) has linked to a CRM account. The ruleset's **Exact Email Normalized** rule matches `ssot__ContactPointEmail__dlm.ssot__EmailAddress__c`, so a device is linked the way the site links a real visitor who signs up:

1. Add `(device, account, email, first, last)` to `REGISTRATIONS`. The device is `sha256("cumulus-web|<account>")[:16]`, and the email must be the client's own CRM email and shared with no other client.
2. Run `python web_browsing.py --register <device ...>` (no ids = all). Per device it sends a Web SDK auth, then one beacon with an `identity` event (`isAnonymous "0"`, first/last name; becomes an `ssot__Account__dlm` row with Id = device) and a `contactPointEmail` event (`ssot__ContactPointEmail__dlm`, PartyId = device). It is not logged to `marketing_feed_run`.
3. Wait for both rows to land (2–15 minutes), then run the ruleset now: `POST /services/data/v67.0/ssot/identity-resolutions/1iram0000002imiAAA/actions/run-now` with `{"callingApp": "...", "callingAppInfo": "..."}`. The link shows in `UnifiedLinkssotAccountAcc__dlm` about 10 minutes later.
4. Once it is linked, add the device to `HOUSEHOLDS` and, to show it this week, run `python web_browsing.py --only <device ...>`.

Picking clients: query Data Cloud for the book's accounts whose `ssot__ContactPointEmail__dlm` email has exactly one `001…` party and no device party, and whose `UnifiedLinkssotAccountAcc__dlm` unified record holds only that account. On 2026-11-10 that left 1,568 accounts in Sarah's book, 1,692 in Justin's and none in Jose's (his six were registered).

A device whose only identity event was anonymous (`isAnonymous "1"`), with its email from a separate `contactPointEmail` event, still links. It just waits for the next ruleset run after its email row lands. Julie E Morris's `d7a4f982b7703f2a` (11-05) sat unlinked until the 2026-11-10 run-now calls.

- **Plan:** each ISO week, each household loads its featured product 3–4 times (enough for R6's `SURGE_VIEWS = 3` follow-up) and a second product 1–2 times. The featured product rotates by week. Loads are 4s apart, because R6 collapses repeats within 2s.
- **Schedule:** a `web_browsing` step at the end of the hourly feed. It runs once 7 days have passed since its last `ok` row, at or after 15:00 UTC. The first live send was 2026-11-10 04:53Z (28 page loads, six households). A manual send at 15:42Z the same day added Julie E Morris (34 page loads, seven households) and reset the clock. A manual send at 17:30Z added six more of Jose's households (66 page loads, thirteen households) and reset it again, so the next is due at the 2026-11-17 18:10Z feed run (the gate is `now - last ok >= 7 days`, so the 17:10Z run is 20 minutes too early).
- **Manual:** `python web_browsing.py --dry-run` prints this week's plan; without `--dry-run` it sends and logs a `web_browsing` row. That row resets the weekly clock. `--only DEVICE ...` sends this week's plan for just those households and logs nothing, so newly linked households can browse mid-week without moving the next weekly send.
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
