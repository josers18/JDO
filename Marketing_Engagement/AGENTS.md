# AGENTS.md — Marketing_Engagement

Heroku worker that keeps two demo signals fresh for JDO.

- **Email engagement.** It writes events (Sent, Delivered, Bounced, Opened, Clicked, Unsubscribed) to Heroku Postgres `"Fins".marketing_engagement`. Data Cloud reads that table zero-copy as `Marketing_Engagements__dlm`, which feeds the React-Headless S6 campaign-touch signals. Monthly campaigns are created in CRM and linked by Id.
- **Identified web browsing.** Weekly, it sends Data Cloud Web SDK product-page beacons to the Cumulus RTOM demo site for the React-Headless R6 card.

[README.md](README.md) is the operator guide. The specs are `docs/superpowers/specs/2026-10-14-marketing-engagement-design.md` (table and funnel) and `…/2026-10-15-marketing-engagement-monthly-feed-design.md` (feed).

## Boundaries
- Owns: `"Fins".marketing_engagement`, `marketing_campaign`, `marketing_campaign_template`, `marketing_feed_run` (`sql/*.sql`, applied by `migrate.py`); the generated CRM `Campaign` records; the weekly RTOM beacons sent by `web_browsing.py`.
- Does NOT own:
  - the Heroku app `data-cloud` and its database `postgresql-trapezoidal-29488` (it only runs inside them);
  - the `Marketing_Engagements__dlm` stream/DMO;
  - the RTOM site, its sitemap, or the identity-resolution links that make the 33 browsing devices "recognized" (`--register` only sends the profile events that let the ruleset link them);
  - the R6 query that reads them (`React-Headless/.../_shared/src/data/webEngagement.ts`).
- Does not touch the old `marketing_campaigns` table or the `Marketing Campaigns` stream. They still feed Tableau Next.

## Files
- `engine.py`: audience rules and the email event funnel. Pure functions, deterministic, shared by `feed.py` and `backfill.py`.
- `crm.py` / `sf.py`: CRM reads and Salesforce REST. `sf.py` uses JWT on Heroku and the sf CLI session locally.
- `db.py`: Postgres (`DATABASE_URL`, or `.env` `Heroku_PG_*` / `ME_ENV_FILE`), the advisory lock, `log_run`, `last_success`.
- `feed.py`: the hourly worker.
- `web_browsing.py`: the weekly browsing plan and sender, plus the one-time `--register` identity events (`REGISTRATIONS`).
- `backfill.py`, `migrate.py`, `catalog.py`.

## Conventions
- **`marketing_engagement` is insert-only.** `engagement_id` is deterministic, and every writer uses `INSERT … ON CONFLICT DO NOTHING`. Never truncate, delete or update it. `engine.new_rows` guards against rows that would be wrong forever: finished campaigns don't grow, Bounced and Delivered never mix, and nothing is future-dated.
- **Feed steps**, each logged to `marketing_feed_run` (`step` is `varchar(20)`; status `ok`/`error`):
  - `auth → rollover → crm_create → generate`;
  - `reconcile`, once a day from 06:00 UTC;
  - `web_browsing`, from 15:00 UTC once 7 days have passed since its last `ok` row.
  - A failed step logs `error` and the run continues. Only a failed `auth` stops it.
- **Gating reads the log.** `db.last_success(conn, step)` is the schedule. A manual `python web_browsing.py` writes an `ok` row and resets the weekly clock; `--only <device ...>` sends for just those households and writes nothing.
- **`web_browsing` plan** (`week_plan(now)`):
  - Deterministic per ISO week. Each household's featured product rotates by week and gets 3–4 loads (≥ R6 `SURGE_VIEWS` = 3); the others get 1–2 each.
  - Loads are `GAP_SECONDS = 4` apart, because R6 collapses device + URL repeats within 2s.
  - Product ids and categories come from the site's `/static/js/sitemap.js`.

## Tests
- `ME_ENV_FILE=../.env python3 -m pytest tests -q`. It uses the scratch schema `fins_feed_test`, which the `pg` fixture creates and drops; there are 55 tests as of 2026-11-10.
- The `pg` fixture stubs `web_browsing.send`. Any feed run at 15:00 UTC or later reaches the browsing step, and tests must never send real beacons.
- `tests/test_web_browsing.py` covers plan determinism and the surge minimum, weekly rotation, one auth per device plus one beacon per load (with a fake HTTP client), `register`'s identity + email events per device, the registration device derivation, and the 15:00 UTC / 7-day gate.

## Gotchas
- **Heroku deploy is not a plain subtree push.** Heroku's `main` history diverged from `git subtree split` (the trees match, the commits don't), so the push is rejected non-fast-forward. Don't force it. Commit the split's tree on top of Heroku's head with `git commit-tree`, then push. The recipe is in README "Heroku". In zsh, brace the variable (`"${c}:refs/heads/main"`): `$c:r` is a history modifier.
- **Add cadences as gated steps in `feed.py`, not new Scheduler jobs.** The `heroku` CLI can't manage Scheduler jobs (only its particleboard API can: `Accept: application/vnd.api+json`, attrs `every`/`at`). One hourly job plus `last_success` gates keeps a single lock and log.
- **`--now` / `--as-of` refuse future times** unless `--dry-run` is set. Inserted rows can't be removed.
- **The browsing devices must stay identity-linked.** If a device stops resolving to a book's account (`UnifiedLinkssotAccountAcc__dlm`), its beacons still land but R6 ignores them as anonymous. Re-check the device list in `HOUSEHOLDS` if a household drops off the card. To link a new client's device, use `--register` (README "Linking a new device"): its email must be the client's own and shared with no other client, or email matching merges the wrong accounts. The ruleset runs automatically but can lag; trigger run-now once the `ssot__ContactPointEmail__dlm` and `ssot__Account__dlm` rows land, and add the device to `HOUSEHOLDS` only after `UnifiedLinkssotAccountAcc__dlm` shows the link. A link appears only after a ruleset run that comes after the email row lands. A device unlinked for days usually just needs a run-now.
- **Overlapping runs skip.** A Postgres advisory lock (`db.try_lock`) makes a second concurrent run exit with success, so a Scheduler double-fire can't create duplicate CRM Campaigns.
