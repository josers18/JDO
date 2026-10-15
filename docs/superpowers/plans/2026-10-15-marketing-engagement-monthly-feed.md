# Marketing Engagement Monthly Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep `"Fins".marketing_engagement` fresh. An hourly Heroku worker creates new email campaigns in JDO CRM each month, writes the CRM Id back, and inserts the engagement events as they come due. Nothing is ever deleted.

**Architecture:**
- The funnel and audience logic moves out of `backfill.py` into a pure `engine.py`.
- Postgres access goes in `db.py`, and CRM reads in `crm.py`. These are shared by the insert-only `backfill.py` and the new hourly `feed.py`.
- `feed.py` runs four logged steps: rollover → CRM create → generate → daily reconcile.
- It runs on a new Heroku app attached to the existing database add-on, authenticating to JDO with JWT.

**Tech Stack:** Python 3.13 (Heroku) / 3.14 (local), psycopg 3, requests, PyJWT[crypto], pytest, Heroku (Python buildpack, Scheduler), Salesforce REST v64.0, sf CLI (local auth and Connected App deploy).

**Spec:** `docs/superpowers/specs/2026-10-15-marketing-engagement-monthly-feed-design.md`. It builds on `docs/superpowers/specs/2026-10-14-marketing-engagement-design.md` (funnel rules, catalog).

**Deviations from the spec (decided while planning):**
- `catalog.py` campaigns are seeded by `migrate.py`, not by plain SQL, because their Ids and dates have to be read from CRM. `sql/002` seeds only the templates.
- The spec's code layout gains two more files: `crm.py` (CRM reads) and `db.py` (Postgres).
- No `Procfile`. There's no long-running process; Scheduler runs `python feed.py` directly.
- The Welcome template has `target = 'All'`, so it covers both person and business accounts.
- Reconcile changes CRM `Status` only on generated campaigns (`template_key` set). Existing CRM campaigns are never modified, apart from `NumberSent` on Segment campaigns, which the earlier work already owned.
- Only `Linked` campaigns generate events, so `Drifted` and `Missing in CRM` campaigns pause until a person fixes them.

## Global Constraints

- Insert-only on `"Fins".marketing_engagement`: no `TRUNCATE`, `DELETE` or `UPDATE` anywhere, in production code or one-off commands. The only `DROP` allowed is on the throwaway test schema `fins_feed_test`.
- `"Fins".marketing_campaign` rows may be updated (`campaign_id`, `crm_state`, `crm_checked_at` only). They're never deleted.
- Secrets are never printed, logged or committed: PG password, `SF_PRIVATE_KEY`, access tokens. `heroku config:set` echoes values, so always redirect its stdout to `/dev/null`. The private key lives in `~/.jdo-marketing-feed/` (mode 600) and in Heroku config vars only.
- Org alias `jdo-gj9q5q`; integration user `admin@finsdc3.demo` (profile `System Administrator`). REST API version `v64.0`.
- `audience_source` values: `Campaign Member` and `Segment`. The campaign `Description` for new campaigns: `Segment-based email campaign; engagement tracked in Fins.marketing_engagement.` (`catalog.NEW_CAMPAIGN_DESCRIPTION`).
- Funnel constants stay exactly as in the current `backfill.py`: bounce 0.025, hard-bounce share 0.20, simulated responders 0.20, non-responder opens 0.25, repeat opens 0.30, repeat clicks 0.15, unsubscribes 0.004, cap at end + 14 days.
- Monthly volume: 1 Personal + 1 Business rotation template + every `All` template (Welcome).
- Database add-on: `postgresql-trapezoidal-29488` (owner app `data-cloud`). New Heroku app: `jdo-marketing-feed`, stack `heroku-24`, region `us`.
- Work happens in the worktree `/Users/jsifontes/Documents/Git/JDO-marketing-feed` on branch `feat/marketing-feed`. Shell state doesn't persist between commands, so every Python or pytest command runs from `/Users/jsifontes/Documents/Git/JDO-marketing-feed/Marketing_Engagement` with `ME_ENV_FILE=/Users/jsifontes/Documents/Git/JDO/.env` prefixed. The worktree has no `.env` of its own; never copy it in.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **Re-running `backfill.py` after the feed has added rows** must leave every existing row untouched and add nothing for already-stored events. Test: `test_backfill_rerun_is_insert_only` (Task 3).
2. **Accounts created after a campaign's start date** must never join that campaign's audience; otherwise a send is backdated. Test: `test_audience_excludes_accounts_created_on_or_after_start` (Task 1).
3. **CRM create succeeds but the Id write-back fails.** The next run must link the existing Campaign by Name rather than create a duplicate. Test: `test_crm_create_links_existing_by_name` (Task 5).
4. **Scheduler misses hours or days.** One catch-up run must insert exactly the events an uninterrupted schedule would have produced. Test: `test_catch_up_equals_continuous` (Task 5).
5. **Month and year boundaries.** The run at Dec 31 23:59 UTC versus Jan 1 00:00 UTC must pick the right month, and the rotation must not repeat across the year boundary. Test: `test_rotation_crosses_year_without_repeat` (Task 5).

---

### Task 0: Worktree

- [ ] **Step 1: Create the worktree off main**

```bash
cd /Users/jsifontes/Documents/Git/JDO
git fetch origin main
git worktree add -b feat/marketing-feed /Users/jsifontes/Documents/Git/JDO-marketing-feed origin/main
cd /Users/jsifontes/Documents/Git/JDO-marketing-feed && git read-tree HEAD && git status --short | head
```

Expected: an empty status. `git read-tree HEAD` fixes the known 0-byte-index worktree issue. `Marketing_Engagement/` exists, containing `backfill.py`, `catalog.py`, `seed_campaigns.py` and `sql/001_marketing_engagement.sql`.

---

### Task 1: `engine.py`, a pure audience and funnel module

**Files:**
- Create: `Marketing_Engagement/engine.py`
- Create: `Marketing_Engagement/tests/conftest.py`, `Marketing_Engagement/tests/golden.py`, `Marketing_Engagement/tests/golden_events.txt`, `Marketing_Engagement/tests/test_engine.py`

**Interfaces:**
- Produces:
  - `engine.COLUMNS: tuple[str, ...]` (15 column names, table order)
  - `engine.unit(*parts) -> float`
  - `engine.md5(*parts) -> str`
  - `engine.is_active(c: dict, now: datetime) -> bool`
  - `engine.in_audience(c: dict, acct_id: str, a: dict, crm_reached: set) -> bool`
  - `engine.build_sends(campaigns: list[dict], accounts: dict, business_contact: dict, members: dict) -> list[dict]`
  - `engine.events_for(s: dict, as_of: datetime) -> list[tuple]`
  - `engine.build_rows(sends, as_of, loaded_at, skip_send_ids=frozenset()) -> list[tuple]`
- **Campaign dict** (the shape of a `marketing_campaign` row): `campaign_key, campaign_id, campaign_name, audience_source, target, audience_rule, product_name, product_category, start_date: date, end_date: date|None, template_key, crm_state`
- **Account dict:** `{acct_id: {"person": bool, "person_contact": str|None, "created": date}}`
- **Member dict:** `{campaign_id: [{"id", "contact_id", "account_id", "responded": bool, "created": date}, …]}`, oldest first.

- [ ] **Step 1: Write the golden generator against the current `backfill.py`**

`Marketing_Engagement/tests/conftest.py`:
```python
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
```

`Marketing_Engagement/tests/golden.py`:
```python
"""Golden hash of the event funnel, captured from the pre-refactor backfill.py.

    python tests/golden.py    # writes tests/golden_events.txt (run once, before the refactor)
"""
import hashlib
import os
import sys
from datetime import date, datetime, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

AS_OF = datetime(2026, 10, 15)
LOADED = datetime(2026, 10, 15, 12)


def synthetic_sends(n=3000):
    sends = []
    for i in range(n):
        start = date(2026, 1, 5) + timedelta(days=i % 280)
        member = i % 3 == 0
        sends.append({
            "send_id": hashlib.md5(f"golden|{i}".encode()).hexdigest(),
            "campaign_id": f"701GOLDEN{i % 7:09d}", "campaign_name": f"Golden {i % 7}",
            "audience_source": "Campaign Member" if member else "Segment",
            "campaign_member_id": f"00vGOLD{i:011d}" if member else None,
            "account_id": f"001GOLD{i:011d}", "contact_id": None,
            "personal_business": "Personal" if i % 2 else "Business",
            "product_name": "P", "product_category": "C",
            "start": start, "end": None if i % 11 == 0 else start + timedelta(days=10),
            "responded": (i % 4 == 0) if member else None,
        })
    return sends


def rows_hash(build_rows):
    return hashlib.md5(repr(build_rows(synthetic_sends(), AS_OF, LOADED)).encode()).hexdigest()


if __name__ == "__main__":
    import backfill
    with open(os.path.join(HERE, "golden_events.txt"), "w") as f:
        f.write(rows_hash(backfill.build_rows) + "\n")
    print("golden written")
```

- [ ] **Step 2: Capture the golden hash from the unmodified `backfill.py`**

Run: `cd /Users/jsifontes/Documents/Git/JDO-marketing-feed/Marketing_Engagement && python3 tests/golden.py && cat tests/golden_events.txt`
Expected: `golden written`, followed by a 32-character hex hash.

- [ ] **Step 3: Write the failing engine tests**

`Marketing_Engagement/tests/test_engine.py`:
```python
import os
from datetime import date, datetime

import pytest

import engine
from tests.golden import rows_hash

HERE = os.path.dirname(os.path.abspath(__file__))


def camp(**kw):
    c = {"campaign_key": "k", "campaign_id": "701000000000000AAA", "campaign_name": "Test Campaign",
         "audience_source": "Segment", "target": "Personal", "audience_rule": "all",
         "product_name": "P", "product_category": "C", "start_date": date(2026, 11, 5),
         "end_date": date(2026, 11, 15), "template_key": "t", "crm_state": "Linked"}
    c.update(kw)
    return c


def acct(person=True, created=date(2026, 1, 1)):
    return {"person": person, "person_contact": "003P" if person else None, "created": created}


def test_funnel_matches_pre_refactor_golden():
    with open(os.path.join(HERE, "golden_events.txt")) as f:
        assert rows_hash(engine.build_rows) == f.read().strip()


def test_audience_excludes_accounts_created_on_or_after_start():
    c = camp()
    assert engine.in_audience(c, "001A", acct(created=date(2026, 11, 4)), set())
    assert not engine.in_audience(c, "001B", acct(created=date(2026, 11, 5)), set())
    assert not engine.in_audience(c, "001C", acct(created=date(2026, 11, 20)), set())


def test_audience_target_filter():
    assert not engine.in_audience(camp(target="Personal"), "001A", acct(person=False), set())
    assert engine.in_audience(camp(target="Business"), "001A", acct(person=False), set())
    assert engine.in_audience(camp(target="All"), "001A", acct(person=False), set())


def test_share_rule_is_deterministic_by_name_and_account():
    c = camp(audience_rule="share:0.40")
    picks = [engine.in_audience(c, f"001{i:015d}", acct(), set()) for i in range(2000)]
    assert picks == [engine.unit("Test Campaign", f"001{i:015d}") < 0.40 for i in range(2000)]
    assert 0.35 < sum(picks) / 2000 < 0.45


def test_new_accounts_rule_takes_previous_calendar_month():
    c = camp(audience_rule="new_accounts", target="All", start_date=date(2026, 11, 3))
    assert engine.in_audience(c, "001A", acct(created=date(2026, 10, 1)), set())
    assert engine.in_audience(c, "001B", acct(created=date(2026, 10, 31)), set())
    assert not engine.in_audience(c, "001C", acct(created=date(2026, 9, 30)), set())
    assert not engine.in_audience(c, "001D", acct(created=date(2026, 11, 1)), set())


def test_new_accounts_rule_january_uses_december():
    c = camp(audience_rule="new_accounts", target="All", start_date=date(2027, 1, 3))
    assert engine.in_audience(c, "001A", acct(created=date(2026, 12, 15)), set())


def test_uncovered_rule_includes_all_uncovered():
    c = camp(audience_rule="uncovered+0.00")
    assert engine.in_audience(c, "001A", acct(), set())
    assert not engine.in_audience(c, "001A", acct(), {"001A"})


def test_unknown_rule_raises():
    with pytest.raises(ValueError):
        engine.in_audience(camp(audience_rule="bogus"), "001A", acct(), set())


def test_member_created_after_cutoff_sends_from_member_date():
    c = camp(audience_source="Campaign Member", audience_rule="members", start_date=date(2026, 9, 16), end_date=None)
    accounts = {"001A": acct(), "001B": acct()}
    members = {c["campaign_id"]: [
        {"id": "00vA", "contact_id": "003A", "account_id": "001A", "responded": False, "created": date(2026, 9, 20)},
        {"id": "00vB", "contact_id": "003B", "account_id": "001B", "responded": False, "created": date(2026, 10, 20)},
    ]}
    sends = {s["account_id"]: s for s in engine.build_sends([c], accounts, {}, members)}
    assert sends["001A"]["start"] == date(2026, 9, 16)
    assert sends["001B"]["start"] == date(2026, 10, 20)


def test_oldest_member_per_account_wins():
    c = camp(audience_source="Campaign Member", audience_rule="members")
    members = {c["campaign_id"]: [
        {"id": "00vOLD", "contact_id": "003A", "account_id": "001A", "responded": False, "created": date(2026, 1, 1)},
        {"id": "00vNEW", "contact_id": "003A", "account_id": "001A", "responded": True, "created": date(2026, 1, 2)},
    ]}
    sends = engine.build_sends([c], {"001A": acct()}, {}, members)
    assert [s["campaign_member_id"] for s in sends] == ["00vOLD"]


def test_skip_send_ids_drops_whole_send():
    c = camp(start_date=date(2026, 3, 1), end_date=date(2026, 3, 5))
    sends = engine.build_sends([c], {"001A": acct(created=date(2026, 1, 1))}, {}, {})
    as_of = datetime(2026, 10, 1)
    assert engine.build_rows(sends, as_of, as_of)
    assert engine.build_rows(sends, as_of, as_of, skip_send_ids={sends[0]["send_id"]}) == []


def test_rows_never_after_as_of():
    c = camp(start_date=date(2026, 11, 1), end_date=date(2026, 11, 30))
    accounts = {f"001{i:015d}": acct() for i in range(300)}
    as_of = datetime(2026, 11, 3, 12)
    rows = engine.build_rows(engine.build_sends([c], accounts, {}, {}), as_of, as_of)
    assert rows and max(r[12] for r in rows) <= as_of


def test_is_active():
    c = camp(start_date=date(2026, 11, 5), end_date=date(2026, 11, 15))
    assert not engine.is_active(c, datetime(2026, 11, 4, 23))
    assert engine.is_active(c, datetime(2026, 11, 5))
    assert engine.is_active(c, datetime(2026, 11, 29, 23, 59))
    assert not engine.is_active(c, datetime(2026, 11, 30, 0, 0, 1))
    assert engine.is_active(camp(end_date=None, start_date=date(2026, 1, 1)), datetime(2030, 1, 1))
```

- [ ] **Step 4: Run them and confirm they fail**

Run: `cd /Users/jsifontes/Documents/Git/JDO-marketing-feed/Marketing_Engagement && python3 -m pytest tests/test_engine.py -q`
Expected: collection error `ModuleNotFoundError: No module named 'engine'`.

- [ ] **Step 5: Write `engine.py`**

`events_for` and `send_time` are copied verbatim from `backfill.py`. The constants are unchanged.

```python
"""Audience selection and the email event funnel (spec 2026-10-14 §2–§3).

Pure functions, no I/O. Shared by backfill.py and feed.py so there is one
funnel implementation. Same inputs always produce the same rows.
"""

import hashlib
import random
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from catalog import MEMBER_SOURCE, SEGMENT_SOURCE

CENTRAL = ZoneInfo("America/Chicago")

BOUNCE_RATE = 0.025
HARD_BOUNCE_SHARE = 0.20
SIM_RESPONDER_RATE = 0.20
NON_RESPONDER_OPEN_RATE = 0.25
REPEAT_OPEN_RATE = 0.30
REPEAT_CLICK_RATE = 0.15
UNSUB_RATE = 0.004
CAP_AFTER_END = timedelta(days=14)

# CampaignMembers created after the original backfill send from their own
# CreatedDate, so late additions to a running campaign aren't backdated.
MEMBER_TIMING_CUTOFF = date(2026, 10, 15)

COLUMNS = ("engagement_id", "send_id", "campaign_id", "campaign_name", "audience_source",
           "campaign_member_id", "account_id", "contact_id", "personal_business", "product_name",
           "product_category", "engagement_type", "engagement_at", "bounce_type", "last_modified_at")
SEND_COLUMNS = COLUMNS[1:11]


def unit(*parts):
    """Deterministic uniform [0, 1) from the given parts."""
    h = hashlib.md5("|".join(parts).encode()).hexdigest()
    return int(h[:15], 16) / 16**15


def md5(*parts):
    return hashlib.md5("|".join(parts).encode()).hexdigest()


def is_active(c, now):
    """True while a campaign can still produce events (start reached, cap not passed)."""
    if c["start_date"] > now.date():
        return False
    return c["end_date"] is None or now <= datetime.combine(c["end_date"], time(23, 59, 59)) + CAP_AFTER_END


# ── Audiences ───────────────────────────────────────────────────────────────

def in_audience(c, acct_id, a, crm_reached):
    """Segment-audience membership. Only accounts created before the start date qualify."""
    start = c["start_date"]
    if c["target"] in ("Personal", "Business") and a["person"] != (c["target"] == "Personal"):
        return False
    if a["created"] >= start:
        return False
    rule = c["audience_rule"]
    if rule == "all":
        return True
    if rule == "new_accounts":
        month_start = start.replace(day=1)
        prev_month_start = (month_start - timedelta(days=1)).replace(day=1)
        return prev_month_start <= a["created"] < month_start
    if rule.startswith("uncovered+"):
        return acct_id not in crm_reached or unit(c["campaign_name"], acct_id) < float(rule.split("+")[1])
    if rule.startswith("share:"):
        return unit(c["campaign_name"], acct_id) < float(rule.split(":")[1])
    raise ValueError(f"Unknown audience_rule {rule!r} on {c['campaign_name']!r}")


def build_sends(campaigns, accounts, business_contact, members):
    """One send per (campaign, account). CRM-member campaigns first, so 'uncovered+' sees them."""
    sends = []

    def contact_for(acct_id):
        a = accounts[acct_id]
        return a["person_contact"] if a["person"] else business_contact.get(acct_id)

    def add(c, acct_id, member=None):
        start = c["start_date"]
        if member and member["created"] > MEMBER_TIMING_CUTOFF:
            start = max(start, member["created"])
        sends.append({
            "send_id": md5(c["campaign_id"], acct_id),
            "campaign_id": c["campaign_id"], "campaign_name": c["campaign_name"],
            "audience_source": c["audience_source"],
            "campaign_member_id": member["id"] if member else None,
            "account_id": acct_id,
            "contact_id": (member["contact_id"] if member else None) or contact_for(acct_id),
            "personal_business": "Personal" if accounts[acct_id]["person"] else "Business",
            "product_name": c["product_name"], "product_category": c["product_category"],
            "start": start, "end": c["end_date"],
            "responded": member["responded"] if member else None,
        })

    crm_reached = set()
    for c in campaigns:
        if c["audience_source"] != MEMBER_SOURCE:
            continue
        seen = set()
        for m in members.get(c["campaign_id"], []):  # oldest first, so the oldest member per account wins
            if m["account_id"] in seen or m["account_id"] not in accounts:
                continue
            seen.add(m["account_id"])
            add(c, m["account_id"], m)
        crm_reached |= seen

    for c in campaigns:
        if c["audience_source"] != SEGMENT_SOURCE:
            continue
        for acct_id, a in accounts.items():
            if in_audience(c, acct_id, a, crm_reached):
                add(c, acct_id)
    return sends


# ── Event funnel ────────────────────────────────────────────────────────────

def send_time(rng, start):
    """Within the first 48h of StartDate, 07:00–19:00 Central, returned as naive UTC."""
    day = start + timedelta(days=rng.randrange(2))
    local = datetime.combine(day, time(7), CENTRAL) + timedelta(seconds=rng.randrange(12 * 3600))
    return local.astimezone(timezone.utc).replace(tzinfo=None)


def events_for(s, as_of):
    rng = random.Random(int(s["send_id"], 16))
    cap = as_of if s["end"] is None else min(
        datetime.combine(s["end"], time(23, 59, 59)) + CAP_AFTER_END, as_of)
    out = []

    def ev(kind, at, bounce=None):
        if at <= cap:
            seq = sum(1 for e in out if e[0] == kind)
            out.append((kind, at, bounce, seq))

    sent = send_time(rng, s["start"])
    if sent > cap:
        return []
    ev("Sent", sent)
    landed = sent + timedelta(seconds=rng.uniform(0, 300))

    crm = s["audience_source"] == MEMBER_SOURCE
    bounce_roll, responder_roll = rng.random(), rng.random()
    if not (crm and s["responded"]) and bounce_roll < BOUNCE_RATE:
        ev("Bounced", landed, "Hard" if rng.random() < HARD_BOUNCE_SHARE else "Soft")
        return out
    ev("Delivered", landed)

    responder = s["responded"] if crm else responder_roll < SIM_RESPONDER_RATE
    if not responder and rng.random() >= NON_RESPONDER_OPEN_RATE:
        return out

    # First open 5 min – 72 h after delivery, skewed early (mean ~8 h).
    first_open = landed + timedelta(seconds=min(300 + rng.expovariate(1 / (8 * 3600)), 72 * 3600))
    ev("Opened", first_open)
    second_open = None
    if rng.random() < REPEAT_OPEN_RATE:
        second_open = first_open + timedelta(seconds=rng.uniform(600, 7 * 86400))
        ev("Opened", second_open)

    if responder:
        first_click = first_open + timedelta(seconds=rng.uniform(10, 600))
        ev("Clicked", first_click)
        if rng.random() < REPEAT_CLICK_RATE:
            after = second_open if second_open else first_click
            ev("Clicked", after + timedelta(seconds=rng.uniform(10, 600)))

    if rng.random() < UNSUB_RATE:
        ev("Unsubscribed", first_open + timedelta(seconds=rng.uniform(60, 86400)))
    return out


def build_rows(sends, as_of, loaded_at, skip_send_ids=frozenset()):
    """Event rows (COLUMNS order) up to as_of. Sends in skip_send_ids get no rows."""
    rows = []
    for s in sends:
        if s["send_id"] in skip_send_ids:
            continue
        for kind, at, bounce, seq in events_for(s, as_of):
            rows.append((md5(s["send_id"], kind, str(seq)), *(s[c] for c in SEND_COLUMNS), kind, at, bounce, loaded_at))
    return rows
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `cd /Users/jsifontes/Documents/Git/JDO-marketing-feed/Marketing_Engagement && python3 -m pytest tests/test_engine.py -q`
Expected: `13 passed`. If the golden test fails, the funnel copy drifted; diff `events_for` against `backfill.py` and fix `engine.py`, never the golden file.

- [ ] **Step 7: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO-marketing-feed
git add Marketing_Engagement/engine.py Marketing_Engagement/tests
git commit -m "feat(marketing-engagement): extract pure engine for audiences and funnel

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Campaign tables, `db.py` and `migrate.py`

**Files:**
- Create: `Marketing_Engagement/sql/002_campaign_tables.sql`, `Marketing_Engagement/db.py`, `Marketing_Engagement/migrate.py`, `Marketing_Engagement/tests/test_db.py`
- Modify: `Marketing_Engagement/tests/conftest.py` (add the `pg` fixture)

**Interfaces:**
- Consumes: `engine.COLUMNS`
- Produces:
  - `db.SCHEMA` (module attribute, default `"Fins"`, overridable)
  - `db.t(name) -> str`
  - `db.connect() -> psycopg.Connection` (autocommit)
  - `db.insert_events(conn, rows, dry_run=False) -> int`
  - `db.campaigns(conn, state=None) -> list[dict]`
  - `db.insert_campaign(conn, c: dict) -> bool`
  - `db.set_campaign(conn, key, **fields)`
  - `db.templates(conn) -> list[dict]`
  - `db.sent_counts(conn) -> dict[str, int]`
  - `db.bounced_send_ids(conn, campaign_ids) -> set[str]`
  - `db.covered_accounts(conn) -> set[str]`
  - `db.log_run(conn, step, status, campaigns=0, rows_inserted=0, detail=None)`
  - `db.last_success(conn, step) -> datetime|None`
  - `db.table_counts(conn) -> dict[str, int]`
  - `migrate.apply_sql(conn)`
  - `migrate.catalog_rows(crm_campaigns: dict) -> list[dict]`
  - `migrate.slug(name) -> str`

- [ ] **Step 1: Write the `pg` fixture and failing DB tests**

Append to `Marketing_Engagement/tests/conftest.py`:
```python
import pytest

TEST_SCHEMA = "fins_feed_test"


@pytest.fixture
def pg(monkeypatch):
    """Fresh scratch schema with all sql/*.sql applied. Dropped afterwards (test schema only)."""
    import db
    import migrate
    try:
        conn = db.connect()
    except Exception as e:  # no creds available
        pytest.skip(f"Postgres unavailable: {e}")
    monkeypatch.setattr(db, "SCHEMA", TEST_SCHEMA)
    conn.execute(f'DROP SCHEMA IF EXISTS "{TEST_SCHEMA}" CASCADE')
    migrate.apply_sql(conn)
    yield conn
    conn.execute(f'DROP SCHEMA IF EXISTS "{TEST_SCHEMA}" CASCADE')
    conn.close()
```

`Marketing_Engagement/tests/test_db.py`:
```python
from datetime import date, datetime

import db
import migrate


def row(eid, send="s1", kind="Sent", at=datetime(2026, 11, 5, 14), cid="701000000000000AAA"):
    return (eid, send, cid, "C", "Segment", None, "001A", None, "Personal", "P", "C", kind, at, None,
            datetime(2026, 11, 5, 15))


def test_insert_events_is_insert_only(pg):
    assert db.insert_events(pg, [row("e1"), row("e2")]) == 2
    assert db.insert_events(pg, [row("e1", at=datetime(2030, 1, 1)), row("e3")]) == 1
    stored = dict(pg.execute(f"SELECT engagement_id, engagement_at FROM {db.t('marketing_engagement')}").fetchall())
    assert stored == {"e1": datetime(2026, 11, 5, 14), "e2": datetime(2026, 11, 5, 14), "e3": datetime(2026, 11, 5, 14)}


def test_insert_events_dry_run_counts_without_writing(pg):
    db.insert_events(pg, [row("e1")])
    assert db.insert_events(pg, [row("e1"), row("e2")], dry_run=True) == 1
    assert db.table_counts(pg)["marketing_engagement"] == 1


def test_campaign_insert_is_idempotent_and_state_settable(pg):
    c = {"campaign_key": "x-2026-11", "campaign_name": "X — November 2026", "audience_source": "Segment",
         "target": "Personal", "audience_rule": "share:0.30", "product_name": "P", "product_category": "C",
         "start_date": date(2026, 11, 5), "end_date": date(2026, 11, 15), "template_key": "x",
         "crm_state": "Pending CRM"}
    assert db.insert_campaign(pg, c) is True
    assert db.insert_campaign(pg, c) is False
    db.set_campaign(pg, "x-2026-11", campaign_id="701000000000001AAA", crm_state="Linked")
    [got] = db.campaigns(pg, state="Linked")
    assert got["campaign_id"] == "701000000000001AAA" and got["start_date"] == date(2026, 11, 5)


def test_linked_requires_campaign_id(pg):
    import psycopg
    c = {"campaign_key": "y", "campaign_name": "Y", "audience_source": "Segment", "target": "Personal",
         "audience_rule": "all", "start_date": date(2026, 11, 1), "crm_state": "Linked"}
    try:
        db.insert_campaign(pg, c)
        raise AssertionError("expected CHECK violation")
    except psycopg.errors.CheckViolation:
        pass


def test_templates_seeded(pg):
    tpls = db.templates(pg)
    assert len([t for t in tpls if t["target"] == "Personal"]) == 6
    assert len([t for t in tpls if t["target"] == "Business"]) == 6
    assert [t["template_key"] for t in tpls if t["target"] == "All"] == ["welcome"]
    assert all("{month}" in t["name_pattern"] for t in tpls)


def test_bounced_and_sent_counts(pg):
    db.insert_events(pg, [row("e1", send="s1"), row("e2", send="s1", kind="Bounced"), row("e3", send="s2")])
    assert db.bounced_send_ids(pg, ["701000000000000AAA"]) == {"s1"}
    assert db.sent_counts(pg) == {"701000000000000AAA": 2}
    assert db.covered_accounts(pg) == {"001A"}


def test_run_log(pg):
    assert db.last_success(pg, "reconcile") is None
    db.log_run(pg, "reconcile", "error", detail="boom")
    assert db.last_success(pg, "reconcile") is None
    db.log_run(pg, "reconcile", "ok", campaigns=3)
    assert db.last_success(pg, "reconcile") is not None


def test_catalog_rows_cover_all_15():
    from catalog import CRM_CAMPAIGNS, SIMULATED_CAMPAIGNS
    fake = {n: {"Id": f"701{i:015d}", "StartDate": "2026-01-01", "EndDate": None}
            for i, n in enumerate([*CRM_CAMPAIGNS, *SIMULATED_CAMPAIGNS])}
    rows = migrate.catalog_rows(fake)
    assert len(rows) == 15 and len({r["campaign_key"] for r in rows}) == 15
    by_name = {r["campaign_name"]: r for r in rows}
    assert by_name["Treasury Modernization Brief"]["audience_rule"] == "share:0.40"
    assert by_name["Retirement Readiness Series"]["audience_rule"] == "uncovered+0.20"
    assert by_name["Premier Checking Onboarding"]["audience_source"] == "Campaign Member"
    assert all(r["crm_state"] == "Linked" and len(r["campaign_key"]) <= 40 for r in rows)
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `cd /Users/jsifontes/Documents/Git/JDO-marketing-feed/Marketing_Engagement && ME_ENV_FILE=/Users/jsifontes/Documents/Git/JDO/.env python3 -m pytest tests/test_db.py -q`
Expected: errors with `ModuleNotFoundError: No module named 'db'`.

- [ ] **Step 3: Write `sql/002_campaign_tables.sql`**

```sql
-- Campaign source of truth, template library and run log (spec 2026-10-15 §1).
CREATE TABLE IF NOT EXISTS "Fins".marketing_campaign (
    campaign_key      varchar(40)  PRIMARY KEY,
    campaign_id       varchar(18)  UNIQUE,
    campaign_name     varchar(80)  NOT NULL,
    audience_source   varchar(20)  NOT NULL CHECK (audience_source IN ('Campaign Member', 'Segment')),
    target            varchar(10)  CHECK (target IN ('Personal', 'Business', 'All')),
    audience_rule     varchar(30)  NOT NULL,
    product_name      varchar(50),
    product_category  varchar(50),
    start_date        date         NOT NULL,
    end_date          date,
    template_key      varchar(30),
    crm_state         varchar(20)  NOT NULL DEFAULT 'Pending CRM'
                          CHECK (crm_state IN ('Pending CRM', 'Linked', 'Missing in CRM', 'Drifted')),
    crm_checked_at    timestamp,
    created_at        timestamp    NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
    CHECK (crm_state = 'Pending CRM' OR campaign_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS "Fins".marketing_campaign_template (
    template_key      varchar(30)  PRIMARY KEY,
    name_pattern      varchar(80)  NOT NULL,   -- {month} → "November 2026"
    target            varchar(10)  NOT NULL CHECK (target IN ('Personal', 'Business', 'All')),
    audience_rule     varchar(30)  NOT NULL,
    product_name      varchar(50)  NOT NULL,
    product_category  varchar(50)  NOT NULL,
    start_day         smallint     NOT NULL CHECK (start_day BETWEEN 1 AND 28),
    duration_days     smallint     NOT NULL CHECK (duration_days > 0),
    active            boolean      NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS "Fins".marketing_feed_run (
    run_id            bigserial    PRIMARY KEY,
    run_at            timestamp    NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
    step              varchar(20)  NOT NULL,
    status            varchar(10)  NOT NULL CHECK (status IN ('ok', 'error')),
    campaigns         integer      NOT NULL DEFAULT 0,
    rows_inserted     integer      NOT NULL DEFAULT 0,
    detail            text
);

INSERT INTO "Fins".marketing_campaign_template
    (template_key, name_pattern, target, audience_rule, product_name, product_category, start_day, duration_days)
VALUES
    ('auto-loan-refi',       'Auto Loan Refinance — {month}',            'Personal', 'share:0.30', 'Auto Loan',               'Loans',               8, 14),
    ('cd-rate-special',      'CD Rate Special — {month}',                'Personal', 'share:0.35', 'Certificate of Deposit',  'Deposits',            5, 10),
    ('heloc-offer',          'Home Equity Line Offer — {month}',         'Personal', 'share:0.30', 'HELOC',                   'Loans',              12, 14),
    ('retirement-readiness', 'Retirement Readiness — {month}',           'Personal', 'share:0.30', 'Retirement Account',      'Investments',        15, 14),
    ('rewards-card',         'Rewards Credit Card Offer — {month}',      'Personal', 'share:0.35', 'Credit Card',             'Loans',               6, 14),
    ('savings-goal',         'Savings Goal Challenge — {month}',         'Personal', 'share:0.40', 'Savings Account',         'Deposits',           10, 10),
    ('biz-credit-card',      'Business Credit Card — {month}',           'Business', 'share:0.40', 'Business Credit Card',    'Loans',               7, 14),
    ('biz-line-of-credit',   'Business Line of Credit — {month}',        'Business', 'share:0.40', 'Business Line of Credit', 'Loans',               9, 14),
    ('cre-lending',          'Commercial Real Estate Lending — {month}', 'Business', 'share:0.30', 'Commercial Real Estate',  'Loans',              14, 14),
    ('merchant-services',    'Merchant Services Spotlight — {month}',    'Business', 'share:0.40', 'Merchant Services',       'Treasury Management', 11, 10),
    ('payroll-services',     'Payroll Services — {month}',               'Business', 'share:0.35', 'Payroll Services',        'Treasury Management',  4, 10),
    ('treasury-insights',    'Treasury Insights — {month}',              'Business', 'share:0.40', 'Treasury Management',     'Treasury Management', 16, 10),
    ('welcome',              'Welcome to Fins — {month}',                'All',      'new_accounts', 'Onboarding',            'Brand',               3,  7)
ON CONFLICT (template_key) DO NOTHING;
```

- [ ] **Step 4: Write `db.py`**

```python
"""Postgres access for the marketing feed. marketing_engagement is insert-only."""

import os

import psycopg
from psycopg.rows import dict_row

from engine import COLUMNS

SCHEMA = os.environ.get("FEED_SCHEMA", "Fins")

CAMPAIGN_COLUMNS = ("campaign_key", "campaign_id", "campaign_name", "audience_source", "target",
                    "audience_rule", "product_name", "product_category", "start_date", "end_date",
                    "template_key", "crm_state")
SETTABLE = {"campaign_id", "crm_state"}
TABLES = ("marketing_engagement", "marketing_campaign", "marketing_campaign_template", "marketing_feed_run")


def t(name):
    return f'"{SCHEMA}".{name}'


def connect():
    """DATABASE_URL on Heroku; otherwise Heroku_PG_* from .env (ME_ENV_FILE or repo root)."""
    url = os.environ.get("DATABASE_URL")
    if url:
        return psycopg.connect(url, sslmode="require", autocommit=True)
    env = os.environ.get("ME_ENV_FILE") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env")
    cfg = {k.strip(): v.strip().strip("'\"") for k, v in
           (l.split("=", 1) for l in open(env) if "=" in l and not l.lstrip().startswith("#"))}
    return psycopg.connect(
        host=cfg["Heroku_PG_Host"], port=cfg["Heroku_PG_Port"], dbname=cfg["Heroku_PG_Database"],
        user=cfg["Heroku_PG_User"], password=cfg["Heroku_PG_Password"], sslmode="require", autocommit=True)


def insert_events(conn, rows, dry_run=False):
    """Insert rows whose engagement_id is new; existing rows are never touched. Returns the new-row count."""
    cols = ", ".join(COLUMNS)
    with conn.transaction(force_rollback=dry_run):
        conn.execute(f"CREATE TEMP TABLE stage (LIKE {t('marketing_engagement')}) ON COMMIT DROP")
        with conn.cursor().copy(f"COPY stage ({cols}) FROM STDIN") as cp:
            for r in rows:
                cp.write_row(r)
        if dry_run:
            return conn.execute(
                f"SELECT count(DISTINCT engagement_id) FROM stage s WHERE NOT EXISTS "
                f"(SELECT 1 FROM {t('marketing_engagement')} e WHERE e.engagement_id = s.engagement_id)").fetchone()[0]
        return conn.execute(
            f"INSERT INTO {t('marketing_engagement')} ({cols}) SELECT {cols} FROM stage "
            "ON CONFLICT (engagement_id) DO NOTHING").rowcount


def campaigns(conn, state=None):
    q = f"SELECT {', '.join(CAMPAIGN_COLUMNS)} FROM {t('marketing_campaign')}"
    q += " WHERE crm_state = %s" if state else ""
    return conn.cursor(row_factory=dict_row).execute(q + " ORDER BY start_date, campaign_key",
                                                     (state,) if state else ()).fetchall()


def insert_campaign(conn, c):
    cols = [k for k in CAMPAIGN_COLUMNS if k in c]
    q = (f"INSERT INTO {t('marketing_campaign')} ({', '.join(cols)}) VALUES ({', '.join(['%s'] * len(cols))}) "
         "ON CONFLICT (campaign_key) DO NOTHING")
    return conn.execute(q, [c[k] for k in cols]).rowcount == 1


def set_campaign(conn, key, **fields):
    """Update campaign_id / crm_state and stamp crm_checked_at."""
    if not set(fields) <= SETTABLE:
        raise ValueError(f"Not settable: {set(fields) - SETTABLE}")
    sets = [f"{k} = %s" for k in fields] + ["crm_checked_at = (now() AT TIME ZONE 'utc')"]
    conn.execute(f"UPDATE {t('marketing_campaign')} SET {', '.join(sets)} WHERE campaign_key = %s",
                 [*fields.values(), key])


def templates(conn):
    return conn.cursor(row_factory=dict_row).execute(
        f"SELECT * FROM {t('marketing_campaign_template')} WHERE active ORDER BY template_key").fetchall()


def sent_counts(conn):
    return dict(conn.execute(
        f"SELECT campaign_id, count(*) FROM {t('marketing_engagement')} "
        "WHERE audience_source = 'Segment' AND engagement_type = 'Sent' GROUP BY campaign_id").fetchall())


def bounced_send_ids(conn, campaign_ids):
    return {r[0] for r in conn.execute(
        f"SELECT send_id FROM {t('marketing_engagement')} WHERE engagement_type = 'Bounced' "
        "AND campaign_id = ANY(%s)", (list(campaign_ids),)).fetchall()}


def covered_accounts(conn):
    return {r[0] for r in conn.execute(
        f"SELECT DISTINCT account_id FROM {t('marketing_engagement')} WHERE engagement_type = 'Sent'").fetchall()}


def log_run(conn, step, status, campaigns=0, rows_inserted=0, detail=None, run_at=None):
    """run_at defaults to the DB clock; feed.run passes its own `now` so --now runs log consistently."""
    conn.execute(f"INSERT INTO {t('marketing_feed_run')} (run_at, step, status, campaigns, rows_inserted, detail) "
                 "VALUES (coalesce(%s, now() AT TIME ZONE 'utc'), %s, %s, %s, %s, %s)",
                 (run_at, step, status, campaigns, rows_inserted, detail))


def last_success(conn, step):
    return conn.execute(f"SELECT max(run_at) FROM {t('marketing_feed_run')} WHERE step = %s AND status = 'ok'",
                        (step,)).fetchone()[0]


def table_counts(conn):
    return {name: conn.execute(f"SELECT count(*) FROM {t(name)}").fetchone()[0] for name in TABLES}
```

- [ ] **Step 5: Write `migrate.py`**

```python
"""Apply sql/*.sql and seed marketing_campaign with the catalog.py campaigns.

Re-runnable: DDL is IF NOT EXISTS and seeds are ON CONFLICT DO NOTHING.

    python3 migrate.py
"""

import glob
import os
import re
from datetime import date

import crm
import db
from catalog import CRM_CAMPAIGNS, MEMBER_SOURCE, SEGMENT_SOURCE, SIMULATED_CAMPAIGNS

HERE = os.path.dirname(os.path.abspath(__file__))


def apply_sql(conn):
    conn.execute(f'CREATE SCHEMA IF NOT EXISTS "{db.SCHEMA}"')
    for path in sorted(glob.glob(os.path.join(HERE, "sql", "*.sql"))):
        with open(path) as f:
            conn.execute(f.read().replace('"Fins".', f'"{db.SCHEMA}".'))


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40]


def _row(name, rec, source, target, rule, product, category):
    return {
        "campaign_key": slug(name), "campaign_id": rec["Id"], "campaign_name": name,
        "audience_source": source, "target": target, "audience_rule": rule,
        "product_name": product, "product_category": category,
        "start_date": date.fromisoformat(rec["StartDate"]),
        "end_date": date.fromisoformat(rec["EndDate"]) if rec["EndDate"] else None,
        "template_key": None, "crm_state": "Linked",
    }


def catalog_rows(crm_campaigns):
    """marketing_campaign rows for catalog.py; crm_campaigns maps Name → {Id, StartDate, EndDate}."""
    missing = [n for n in [*CRM_CAMPAIGNS, *SIMULATED_CAMPAIGNS] if n not in crm_campaigns]
    if missing:
        raise SystemExit(f"Catalog campaigns not found in CRM: {missing}")
    rows = [_row(n, crm_campaigns[n], MEMBER_SOURCE, None, "members", *product)
            for n, product in CRM_CAMPAIGNS.items()]
    for n, spec in SIMULATED_CAMPAIGNS.items():
        rule = spec["audience"] if isinstance(spec["audience"], str) else f"share:{spec['audience']:.2f}"
        rows.append(_row(n, crm_campaigns[n], SEGMENT_SOURCE, spec["target"], rule, *spec["product"]))
    return rows


if __name__ == "__main__":
    names = [*CRM_CAMPAIGNS, *SIMULATED_CAMPAIGNS]
    recs = crm.cli_query("SELECT Id, Name, StartDate, EndDate FROM Campaign "
                         f"WHERE Name IN ({', '.join(crm.quote(n) for n in names)})")
    with db.connect() as conn:
        apply_sql(conn)
        seeded = sum(db.insert_campaign(conn, r) for r in catalog_rows({r["Name"]: r for r in recs}))
        print(f"schema {db.SCHEMA}: sql applied; {seeded} catalog campaigns seeded; counts {db.table_counts(conn)}")
```

`migrate.py` imports `crm`, which Task 3 creates. Until then, create a minimal `Marketing_Engagement/crm.py` with only the `quote` and `cli_query` functions from Task 3, Step 3, so the DB tests can import `migrate`. Task 3 completes the file.

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `cd /Users/jsifontes/Documents/Git/JDO-marketing-feed/Marketing_Engagement && ME_ENV_FILE=/Users/jsifontes/Documents/Git/JDO/.env python3 -m pytest tests -q`
Expected: `21 passed` (13 engine + 8 db). None should be skipped; a skip means the env file wasn't found.

- [ ] **Step 7: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO-marketing-feed
git add Marketing_Engagement/sql/002_campaign_tables.sql Marketing_Engagement/db.py Marketing_Engagement/migrate.py Marketing_Engagement/crm.py Marketing_Engagement/tests
git commit -m "feat(marketing-engagement): campaign tables, insert-only db layer, migrate

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `crm.py`, insert-only `backfill.py`, and the live migration

**Files:**
- Create/complete: `Marketing_Engagement/crm.py`
- Modify (rewrite): `Marketing_Engagement/backfill.py`
- Delete: `Marketing_Engagement/seed_campaigns.py` (superseded by the feed's CRM-create and reconcile steps)
- Test: `Marketing_Engagement/tests/test_backfill.py`

**Interfaces:**
- Consumes: `engine.*`, `db.*`, `migrate.apply_sql`
- Produces:
  - `crm.quote(s) -> str`
  - `crm.cli_query(soql) -> list[dict]`
  - `crm.load_accounts(query) -> (accounts, business_contact)`
  - `crm.load_members(query, campaign_ids) -> dict`
  - `crm.uncatalogued_member_campaigns(query, known_names) -> list[str]`
  - `backfill.plan(conn, query, as_of, loaded_at) -> (rows, accounts)`

- [ ] **Step 1: Write the failing backfill test**

`Marketing_Engagement/tests/test_backfill.py`:
```python
from datetime import date, datetime

import backfill
import db


class FakeQuery:
    """SOQL-shaped responses for crm.load_* (Account / Contact / CampaignMember)."""

    def __init__(self, accounts, members=()):
        self.accounts, self.members = accounts, list(members)

    def __call__(self, soql):
        if "FROM Account" in soql:
            return self.accounts
        if "FROM Contact" in soql:
            return []
        if "FROM CampaignMember" in soql:
            return [m for m in self.members if m["CampaignId"] in soql]
        raise AssertionError(soql)


def account(i, person=True, created="2026-01-01"):
    return {"Id": f"001{i:015d}", "IsPersonAccount": person, "PersonContactId": f"003{i:015d}" if person else None,
            "CreatedDate": f"{created}T00:00:00.000+0000"}


def seed(pg):
    db.insert_campaign(pg, {
        "campaign_key": "seg", "campaign_id": "701000000000000SEG", "campaign_name": "Seg Campaign",
        "audience_source": "Segment", "target": "Personal", "audience_rule": "share:0.50",
        "product_name": "P", "product_category": "C", "start_date": date(2026, 3, 1),
        "end_date": date(2026, 3, 10), "crm_state": "Linked"})


def test_backfill_rerun_is_insert_only(pg):
    seed(pg)
    q = FakeQuery([account(i) for i in range(200)])
    as_of = datetime(2026, 10, 15)
    rows, _ = backfill.plan(pg, q, as_of, as_of)
    assert db.insert_events(pg, rows) == len(rows) > 0
    before = sorted(pg.execute(f"SELECT * FROM {db.t('marketing_engagement')}").fetchall())

    rows2, _ = backfill.plan(pg, q, as_of, datetime(2026, 10, 16))  # different load time
    assert db.insert_events(pg, rows2) == 0
    assert sorted(pg.execute(f"SELECT * FROM {db.t('marketing_engagement')}").fetchall()) == before


def test_backfill_skips_bounced_sends(pg):
    seed(pg)
    q = FakeQuery([account(i) for i in range(400)])
    as_of = datetime(2026, 10, 15)
    rows, _ = backfill.plan(pg, q, as_of, as_of)
    db.insert_events(pg, rows)
    bounced = {r[1] for r in rows if r[11] == "Bounced"}
    assert bounced
    rows2, _ = backfill.plan(pg, q, as_of, as_of)
    assert not {r[1] for r in rows2} & bounced
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd /Users/jsifontes/Documents/Git/JDO-marketing-feed/Marketing_Engagement && ME_ENV_FILE=/Users/jsifontes/Documents/Git/JDO/.env python3 -m pytest tests/test_backfill.py -q`
Expected: FAIL with `AttributeError: module 'backfill' has no attribute 'plan'`.

- [ ] **Step 3: Write `crm.py` in full**

```python
"""CRM reads shared by backfill.py (sf CLI) and feed.py (REST).

Each loader takes `query`: a callable mapping SOQL to the full record list.
"""

import json
import re
import subprocess
import sys
from datetime import date

from catalog import ORG

SF_ROW_CAP = 50000  # sf data query --json stops here; treat hitting it as truncation


def quote(s):
    return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'"


def cli_query(soql):
    out = subprocess.run(["sf", "data", "query", "-o", ORG, "--json", "-q", soql], capture_output=True, text=True)
    data = json.loads(out.stdout or "{}")
    if data.get("status") != 0:
        sys.exit(f"SOQL failed: {data.get('message', out.stderr.strip())}\n  {soql}")
    recs = data["result"]["records"]
    if len(recs) >= SF_ROW_CAP:
        sys.exit(f"SOQL hit the {SF_ROW_CAP}-row cap (results truncated):\n  {soql}")
    return recs


def _day(ts):
    return date.fromisoformat(ts[:10])


def load_accounts(query):
    accounts = {
        r["Id"]: {"person": r["IsPersonAccount"], "person_contact": r["PersonContactId"], "created": _day(r["CreatedDate"])}
        for r in query("SELECT Id, IsPersonAccount, PersonContactId, CreatedDate FROM Account")
    }
    business_contact = {}
    for r in query("SELECT Id, AccountId FROM Contact WHERE Account.IsPersonAccount = false "
                   "AND Email != null ORDER BY CreatedDate, Id"):
        business_contact.setdefault(r["AccountId"], r["Id"])
    return accounts, business_contact


def load_members(query, campaign_ids):
    out = {}
    for cid in campaign_ids:
        if not re.fullmatch(r"[A-Za-z0-9]{15,18}", cid):
            raise ValueError(f"Bad campaign Id {cid!r}")
        out[cid] = [
            {"id": r["Id"], "contact_id": r["ContactId"], "account_id": r["Contact"]["AccountId"],
             "responded": r["HasResponded"], "created": _day(r["CreatedDate"])}
            for r in query("SELECT Id, ContactId, Contact.AccountId, HasResponded, CreatedDate FROM CampaignMember "
                           f"WHERE CampaignId = '{cid}' AND Contact.AccountId != null ORDER BY CreatedDate, Id")
        ]
    return out


def uncatalogued_member_campaigns(query, known_names):
    names = {r["n"] for r in query("SELECT Campaign.Name n FROM CampaignMember WHERE Campaign.Type = 'Email' "
                                   "AND Contact.AccountId != null GROUP BY Campaign.Name")}
    return sorted(names - set(known_names))
```

`FakeQuery` returns members with keys `Id, ContactId, Contact, HasResponded, CreatedDate, CampaignId`. The tests above pass no members, so that shape is only exercised in Task 5.

- [ ] **Step 4: Rewrite `backfill.py` as insert-only**

```python
"""Insert any missing "Fins".marketing_engagement rows for every Linked campaign.

Insert-only: existing rows are never changed or removed, so it is always safe
to re-run. Audiences and funnel come from engine.py; campaigns from
"Fins".marketing_campaign.

    python3 backfill.py --dry-run --as-of 2026-10-15
    python3 backfill.py --as-of 2026-10-15
"""

import argparse
import collections
import sys
from datetime import date, datetime, time, timezone

import crm
import db
import engine
from catalog import MEMBER_SOURCE


def plan(conn, query, as_of, loaded_at):
    """Rows due by as_of for all Linked campaigns (bounced sends skipped), plus the account map."""
    campaigns = db.campaigns(conn, state="Linked")
    accounts, business_contact = crm.load_accounts(query)
    members = crm.load_members(query, [c["campaign_id"] for c in campaigns if c["audience_source"] == MEMBER_SOURCE])
    sends = engine.build_sends(campaigns, accounts, business_contact, members)
    skip = db.bounced_send_ids(conn, [c["campaign_id"] for c in campaigns])
    return engine.build_rows(sends, as_of, loaded_at, skip), accounts


def report(rows, accounts, already_covered):
    by_campaign = collections.Counter()
    sources = {}
    sends_by_type = collections.defaultdict(lambda: collections.defaultdict(set))
    for r in rows:
        name, src, send_id, kind = r[3], r[4], r[1], r[11]
        sources[name] = src
        by_campaign[name] += 1
        sends_by_type[name][kind].add(send_id)

    hdr = f"{'Campaign':44} {'Source':15} {'Sent':>7} {'Deliv':>7} {'Bounce':>6} {'Opened':>7} {'Clicked':>7} {'Unsub':>5} {'Events':>8}"
    print(hdr); print("─" * len(hdr))
    for name in sorted(by_campaign, key=lambda n: (sources[n], n)):
        n = {k: len(sends_by_type[name][k]) for k in ("Sent", "Delivered", "Bounced", "Opened", "Clicked", "Unsubscribed")}
        print(f"{name[:44]:44} {sources[name]:15} {n['Sent']:>7,} {n['Delivered']:>7,} {n['Bounced']:>6,} "
              f"{n['Opened']:>7,} {n['Clicked']:>7,} {n['Unsubscribed']:>5,} {by_campaign[name]:>8,}")
    covered = already_covered | {r[6] for r in rows if r[11] == "Sent"}
    print(f"\nCoverage: {len(covered & set(accounts)):,} / {len(accounts):,} CRM accounts have ≥1 Sent "
          "(table + this run)")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--as-of", type=date.fromisoformat, default=datetime.now(timezone.utc).date(),
                   help="Events after this date (UTC midnight) are not inserted; default today")
    a = p.parse_args()
    as_of = datetime.combine(a.as_of, time())

    with db.connect() as conn:
        known = [c["campaign_name"] for c in db.campaigns(conn)]
        extra = crm.uncatalogued_member_campaigns(crm.cli_query, known)
        if extra:
            sys.exit(f"Email campaigns with account members missing from marketing_campaign: {extra}")
        rows, accounts = plan(conn, crm.cli_query, as_of, datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0))
        report(rows, accounts, db.covered_accounts(conn))
        n = db.insert_events(conn, rows, dry_run=a.dry_run)
    print(f"\n{'Would insert' if a.dry_run else 'Inserted'} {n:,} new rows; existing rows untouched.")
```

- [ ] **Step 5: Remove `seed_campaigns.py` and run all tests**

```bash
cd /Users/jsifontes/Documents/Git/JDO-marketing-feed && git rm -q Marketing_Engagement/seed_campaigns.py
cd Marketing_Engagement && ME_ENV_FILE=/Users/jsifontes/Documents/Git/JDO/.env python3 -m pytest tests -q
```
Expected: `23 passed`.

- [ ] **Step 6: Record the live table fingerprint before migrating**

```bash
cd /Users/jsifontes/Documents/Git/JDO-marketing-feed/Marketing_Engagement && ME_ENV_FILE=/Users/jsifontes/Documents/Git/JDO/.env python3 -c "
import db
with db.connect() as c:
    print(c.execute('''select count(*), md5(string_agg(engagement_id||send_id||engagement_type||engagement_at::text||coalesce(bounce_type,''), ',' order by engagement_id)) from \"Fins\".marketing_engagement''').fetchone())" | tee /tmp/me_fingerprint_before.txt
```
Expected: `(251613, '<md5>')`, with the count matching the last known load. Keep the file.

- [ ] **Step 7: Run the live migration**

Run: `cd /Users/jsifontes/Documents/Git/JDO-marketing-feed/Marketing_Engagement && ME_ENV_FILE=/Users/jsifontes/Documents/Git/JDO/.env python3 migrate.py`
Expected: `schema Fins: sql applied; 15 catalog campaigns seeded; counts {'marketing_engagement': 251613, 'marketing_campaign': 15, 'marketing_campaign_template': 13, 'marketing_feed_run': 0}`

- [ ] **Step 8: Prove `backfill.py` is insert-only against live data**

Run: `cd /Users/jsifontes/Documents/Git/JDO-marketing-feed/Marketing_Engagement && ME_ENV_FILE=/Users/jsifontes/Documents/Git/JDO/.env python3 backfill.py --dry-run --as-of 2026-10-15 | tail -4`
Expected: `Would insert 0 new rows; existing rows untouched.`

If the count is above 0, CRM gained CampaignMembers after 2026-10-15. Check that the extra rows belong only to members with `CreatedDate > 2026-10-15` before going on. Then re-run the Step 6 command and diff it against `/tmp/me_fingerprint_before.txt`; there should be no difference.

- [ ] **Step 9: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO-marketing-feed
git add -A Marketing_Engagement
git commit -m "feat(marketing-engagement): insert-only backfill on marketing_campaign; crm loaders

seed_campaigns.py is superseded by the feed's CRM create + reconcile steps.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `sf.py`, the Salesforce REST client

**Files:**
- Create: `Marketing_Engagement/sf.py`, `Marketing_Engagement/tests/test_sf.py`

**Interfaces:**
- Produces:
  - `sf.SfError`
  - `sf.SfClient(instance_url, token, session=None)` with `.query(soql) -> list[dict]`, `.create(sobject, fields) -> str` and `.update(sobject, rec_id, fields) -> None`
  - `sf.SfClient.from_env() -> SfClient`
  - `sf.jwt_assertion(client_id, username, audience, key, now=None) -> str`
  - `sf.jwt_login(token_url, audience, client_id, username, key) -> (instance_url, token)`
  - `sf.cli_session(org) -> (instance_url, token)`
- Env vars: `SF_CLIENT_ID`, `SF_USERNAME`, `SF_PRIVATE_KEY`, `SF_LOGIN_URL` (token endpoint host), and `SF_AUDIENCE` (default `https://login.salesforce.com`).

- [ ] **Step 1: Write the failing tests**

`Marketing_Engagement/tests/test_sf.py`:
```python
import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

import sf


class Resp:
    def __init__(self, status, body):
        self.status_code, self._body, self.text = status, body, str(body)
        self.request = type("R", (), {"method": "GET"})()
        self.url = "https://x/services/data/v64.0/query?q=..."

    def json(self):
        return self._body


class Session:
    def __init__(self, responses):
        self.responses, self.calls, self.headers = list(responses), [], {}

    def _next(self, method, url, **kw):
        self.calls.append((method, url, kw))
        return self.responses.pop(0)

    def get(self, url, **kw): return self._next("GET", url, **kw)
    def post(self, url, **kw): return self._next("POST", url, **kw)
    def patch(self, url, **kw): return self._next("PATCH", url, **kw)


def test_query_follows_next_records_url():
    s = Session([Resp(200, {"done": False, "records": [{"Id": "1"}], "nextRecordsUrl": "/services/data/v64.0/query/01g-2000"}),
                 Resp(200, {"done": True, "records": [{"Id": "2"}]})])
    c = sf.SfClient("https://org.my.salesforce.com/", "tok", session=s)
    assert [r["Id"] for r in c.query("SELECT Id FROM Account")] == ["1", "2"]
    assert s.calls[1][1] == "https://org.my.salesforce.com/services/data/v64.0/query/01g-2000"
    assert s.headers["Authorization"] == "Bearer tok"


def test_create_and_update():
    s = Session([Resp(201, {"id": "701NEW"}), Resp(204, None)])
    c = sf.SfClient("https://org", "tok", session=s)
    assert c.create("Campaign", {"Name": "X"}) == "701NEW"
    c.update("Campaign", "701NEW", {"Status": "Completed"})
    assert s.calls[1][0] == "PATCH" and s.calls[1][1].endswith("/sobjects/Campaign/701NEW")


def test_http_error_raises_without_token():
    s = Session([Resp(400, [{"message": "bad field"}])])
    c = sf.SfClient("https://org", "secret-token", session=s)
    with pytest.raises(sf.SfError) as e:
        c.query("SELECT Bad FROM Account")
    assert "400" in str(e.value) and "secret-token" not in str(e.value)


def test_jwt_assertion_claims():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                            serialization.NoEncryption()).decode()
    token = sf.jwt_assertion("CID", "admin@finsdc3.demo", "https://login.salesforce.com", pem, now=1_000_000)
    claims = jwt.decode(token, key.public_key(), algorithms=["RS256"], audience="https://login.salesforce.com",
                        options={"verify_exp": False})
    assert claims == {"iss": "CID", "sub": "admin@finsdc3.demo", "aud": "https://login.salesforce.com", "exp": 1_000_180}
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `cd /Users/jsifontes/Documents/Git/JDO-marketing-feed/Marketing_Engagement && python3 -m pytest tests/test_sf.py -q`
Expected: `ModuleNotFoundError: No module named 'sf'`.

- [ ] **Step 3: Write `sf.py`**

```python
"""Minimal Salesforce REST client.

Auth: JWT bearer (SF_CLIENT_ID / SF_USERNAME / SF_PRIVATE_KEY / SF_LOGIN_URL) on
Heroku; the local sf CLI session when SF_CLIENT_ID is unset. Tokens are never
printed or put in error messages.
"""

import json
import os
import subprocess
import time

import jwt
import requests

from catalog import ORG

API = "v64.0"
DEFAULT_AUDIENCE = "https://login.salesforce.com"


class SfError(RuntimeError):
    pass


class SfClient:
    def __init__(self, instance_url, token, session=None):
        self.root = instance_url.rstrip("/")
        self.base = f"{self.root}/services/data/{API}"
        self.http = session or requests.Session()
        self.http.headers["Authorization"] = f"Bearer {token}"

    @classmethod
    def from_env(cls):
        if os.environ.get("SF_CLIENT_ID"):
            return cls(*jwt_login(os.environ["SF_LOGIN_URL"], os.environ.get("SF_AUDIENCE", DEFAULT_AUDIENCE),
                                  os.environ["SF_CLIENT_ID"], os.environ["SF_USERNAME"], os.environ["SF_PRIVATE_KEY"]))
        return cls(*cli_session(ORG))

    def _ok(self, r):
        if r.status_code >= 400:
            raise SfError(f"{r.request.method} {r.url.split('?')[0]} → {r.status_code}: {r.text[:500]}")
        return r

    def query(self, soql):
        page = self._ok(self.http.get(f"{self.base}/query", params={"q": soql}, timeout=60)).json()
        records = page["records"]
        while not page["done"]:
            page = self._ok(self.http.get(self.root + page["nextRecordsUrl"], timeout=60)).json()
            records += page["records"]
        return records

    def create(self, sobject, fields):
        return self._ok(self.http.post(f"{self.base}/sobjects/{sobject}", json=fields, timeout=60)).json()["id"]

    def update(self, sobject, rec_id, fields):
        self._ok(self.http.patch(f"{self.base}/sobjects/{sobject}/{rec_id}", json=fields, timeout=60))


def jwt_assertion(client_id, username, audience, key, now=None):
    now = int(now if now is not None else time.time())
    return jwt.encode({"iss": client_id, "sub": username, "aud": audience, "exp": now + 180}, key, algorithm="RS256")


def jwt_login(token_url, audience, client_id, username, key):
    r = requests.post(f"{token_url.rstrip('/')}/services/oauth2/token", timeout=30, data={
        "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
        "assertion": jwt_assertion(client_id, username, audience, key)})
    if r.status_code != 200:
        try:
            reason = r.json().get("error_description") or r.json().get("error")
        except ValueError:
            reason = r.text[:200]
        raise SfError(f"JWT login failed ({r.status_code}): {reason}")
    body = r.json()
    return body["instance_url"], body["access_token"]


def cli_session(org):
    def sf(*args):
        out = subprocess.run(["sf", *args, "-o", org, "--json"], capture_output=True, text=True)
        data = json.loads(out.stdout or "{}")
        if data.get("status") != 0:
            raise SfError(f"sf {' '.join(args)} failed: {data.get('message', 'no output')}")
        return data["result"]
    return sf("org", "display")["instanceUrl"], sf("org", "auth", "show-access-token", "--no-prompt")["accessToken"]
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd /Users/jsifontes/Documents/Git/JDO-marketing-feed/Marketing_Engagement && python3 -m pytest tests/test_sf.py -q`
Expected: `4 passed`.

- [ ] **Step 5: Smoke-test the CLI session fallback against JDO**

Run: `cd /Users/jsifontes/Documents/Git/JDO-marketing-feed/Marketing_Engagement && python3 -c "import sf; c=sf.SfClient.from_env(); print(len(c.query('SELECT Id FROM Campaign')), 'campaigns')"`
Expected: `47 campaigns` (or the current total). No token is printed.

- [ ] **Step 6: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO-marketing-feed
git add Marketing_Engagement/sf.py Marketing_Engagement/tests/test_sf.py
git commit -m "feat(marketing-engagement): REST client with JWT and sf CLI auth

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `feed.py`, the hourly worker

**Files:**
- Create: `Marketing_Engagement/feed.py`, `Marketing_Engagement/tests/test_feed.py`

**Interfaces:**
- Consumes: `engine.*`, `db.*`, `crm.load_accounts/load_members/quote`, `sf.SfClient.from_env`, `catalog.NEW_CAMPAIGN_DESCRIPTION`
- Produces:
  - `feed.plan_rollover(templates, month: date) -> list[dict]`
  - `feed.desired_status(c, today) -> str`
  - `feed.due_rows(conn, sfc, now, extra=()) -> list[tuple]`
  - `feed.run(conn, sf_factory, now, dry_run=False) -> bool`
  - CLI: `python feed.py [--dry-run] [--now ISO]`

- [ ] **Step 1: Write the failing tests**

`Marketing_Engagement/tests/test_feed.py`:
```python
from datetime import date, datetime

import pytest

import db
import feed


class FakeSf:
    """In-memory CRM: Accounts, Contacts (none) and Campaigns."""

    def __init__(self, n_person=60, n_business=30, created="2026-01-01"):
        self.accounts = (
            [{"Id": f"001P{i:014d}", "IsPersonAccount": True, "PersonContactId": f"003P{i:014d}",
              "CreatedDate": f"{created}T00:00:00.000+0000"} for i in range(n_person)]
            + [{"Id": f"001B{i:014d}", "IsPersonAccount": False, "PersonContactId": None,
                "CreatedDate": f"{created}T00:00:00.000+0000"} for i in range(n_business)])
        self.campaigns, self.creates, self.fail_create = {}, 0, False

    def query(self, soql):
        if "FROM Account" in soql:
            return self.accounts
        if "FROM Contact" in soql or "FROM CampaignMember" in soql:
            return []
        if soql.startswith("SELECT Id FROM Campaign WHERE Name = "):
            name = soql.split("Name = '", 1)[1][:-1].replace("\\'", "'")
            return [{"Id": i} for i, c in self.campaigns.items() if c["Name"] == name]
        if soql.startswith("SELECT Id, Name, StartDate, EndDate, Status, NumberSent FROM Campaign"):
            return [dict(c, Id=i) for i, c in self.campaigns.items() if f"'{i}'" in soql]
        raise AssertionError(soql)

    def create(self, sobject, fields):
        if self.fail_create:
            raise RuntimeError("CRM down")
        self.creates += 1
        cid = f"701FAKE{len(self.campaigns):011d}"
        self.campaigns[cid] = dict(fields, NumberSent=None)
        return cid

    def update(self, sobject, cid, fields):
        self.campaigns[cid].update(fields)


def engagement_ids(pg):
    return {r[0] for r in pg.execute(f"SELECT engagement_id FROM {db.t('marketing_engagement')}").fetchall()}


def test_rotation_crosses_year_without_repeat(pg):
    tpls = db.templates(pg)
    months = [date(2026, m, 1) for m in range(7, 13)] + [date(2027, m, 1) for m in range(1, 7)]
    personal = [next(c for c in feed.plan_rollover(tpls, m) if c["target"] == "Personal")["template_key"] for m in months]
    assert len(set(personal[:6])) == 6 and len(set(personal[6:])) == 6
    assert all(a != b for a, b in zip(personal, personal[1:]))
    dec = feed.plan_rollover(tpls, date(2026, 12, 1))
    assert len(dec) == 3 and {c["target"] for c in dec} == {"Personal", "Business", "All"}
    assert all(c["campaign_key"].endswith("-2026-12") and "December 2026" in c["campaign_name"] for c in dec)


def test_month_boundary_uses_utc_month(pg):
    fake = FakeSf()
    feed.run(pg, lambda: fake, datetime(2026, 12, 31, 23, 59))
    feed.run(pg, lambda: fake, datetime(2027, 1, 1, 0, 0))
    keys = sorted(c["campaign_key"] for c in db.campaigns(pg) if c["template_key"])
    assert sum(k.endswith("-2026-12") for k in keys) == 3 and sum(k.endswith("-2027-01") for k in keys) == 3


def test_first_run_creates_and_links_then_generates_due_rows_only(pg):
    fake = FakeSf()
    assert feed.run(pg, lambda: fake, datetime(2026, 11, 1, 7)) is True
    linked = [c for c in db.campaigns(pg, state="Linked") if c["template_key"]]
    assert len(linked) == 3 and fake.creates == 3
    assert all(fake.campaigns[c["campaign_id"]]["Status"] == "Planned" for c in linked)
    assert db.table_counts(pg)["marketing_engagement"] == 0  # all start days are after Nov 1

    now = datetime(2026, 11, 20, 12)
    assert feed.run(pg, lambda: fake, now) is True
    max_at = pg.execute(f"SELECT max(engagement_at), count(*) FROM {db.t('marketing_engagement')}").fetchone()
    assert max_at[1] > 0 and max_at[0] <= now
    assert fake.creates == 3  # no new campaigns mid-month


def test_rerun_same_hour_inserts_nothing_and_never_removes(pg):
    fake = FakeSf()
    now = datetime(2026, 11, 20, 12)
    feed.run(pg, lambda: fake, datetime(2026, 11, 1, 7))
    feed.run(pg, lambda: fake, now)
    before = engagement_ids(pg)
    feed.run(pg, lambda: fake, now)
    assert engagement_ids(pg) == before
    feed.run(pg, lambda: fake, datetime(2026, 11, 25))
    assert engagement_ids(pg) >= before


def test_catch_up_equals_continuous(pg):
    fake = FakeSf()
    feed.run(pg, lambda: fake, datetime(2026, 11, 1, 7))
    for day in (10, 25):
        feed.run(pg, lambda: fake, datetime(2026, 11, day, 9))
    expected = {r[0] for r in feed.due_rows(pg, fake, datetime(2026, 11, 25, 9))}
    assert engagement_ids(pg) == expected


def test_crm_create_links_existing_by_name(pg):
    fake = FakeSf()
    planned = feed.plan_rollover(db.templates(pg), date(2026, 11, 1))
    fake.campaigns["701EXISTING0000000"] = {"Name": planned[0]["campaign_name"], "Status": "Planned", "NumberSent": None}
    feed.run(pg, lambda: fake, datetime(2026, 11, 1, 7))
    by_name = {c["campaign_name"]: c for c in db.campaigns(pg)}
    assert by_name[planned[0]["campaign_name"]]["campaign_id"] == "701EXISTING0000000"
    assert fake.creates == 2


def test_crm_failure_keeps_pending_and_logs_error(pg):
    fake = FakeSf()
    fake.fail_create = True
    assert feed.run(pg, lambda: fake, datetime(2026, 11, 1, 7)) is False
    assert len(db.campaigns(pg, state="Pending CRM")) == 3
    errors = pg.execute(f"SELECT step FROM {db.t('marketing_feed_run')} WHERE status = 'error'").fetchall()
    assert errors == [("crm_create",)]
    fake.fail_create = False
    assert feed.run(pg, lambda: fake, datetime(2026, 11, 1, 8)) is True
    assert len(db.campaigns(pg, state="Pending CRM")) == 0


def test_auth_failure_logged(pg):
    def boom():
        raise RuntimeError("JWT login failed (400): invalid_grant")
    assert feed.run(pg, boom, datetime(2026, 11, 1, 7)) is False
    assert pg.execute(f"SELECT step, status FROM {db.t('marketing_feed_run')}").fetchall() == [("auth", "error")]


def test_reconcile_status_numbersent_drift_and_missing(pg):
    fake = FakeSf()
    feed.run(pg, lambda: fake, datetime(2026, 11, 1, 7))
    feed.run(pg, lambda: fake, datetime(2026, 11, 20, 7))
    camps = {c["template_key"]: c for c in db.campaigns(pg) if c["template_key"]}
    for c in camps.values():
        crm_c = fake.campaigns[c["campaign_id"]]
        assert crm_c["Status"] == feed.desired_status(c, date(2026, 11, 20))
        sent = db.sent_counts(pg).get(c["campaign_id"], 0)
        assert crm_c["NumberSent"] == sent

    welcome, *others = camps.values()
    fake.campaigns[others[0]["campaign_id"]]["Name"] = "Renamed in CRM"
    del fake.campaigns[others[1]["campaign_id"]]
    feed.run(pg, lambda: fake, datetime(2026, 11, 21, 7))
    states = {c["campaign_key"]: c["crm_state"] for c in db.campaigns(pg)}
    assert states[others[0]["campaign_key"]] == "Drifted"
    assert states[others[1]["campaign_key"]] == "Missing in CRM"


def test_reconcile_runs_once_per_day_after_0600(pg):
    fake = FakeSf()
    feed.run(pg, lambda: fake, datetime(2026, 11, 1, 5))
    feed.run(pg, lambda: fake, datetime(2026, 11, 1, 7))
    feed.run(pg, lambda: fake, datetime(2026, 11, 1, 8))
    n = pg.execute(f"SELECT count(*) FROM {db.t('marketing_feed_run')} WHERE step = 'reconcile'").fetchone()[0]
    assert n == 1


def test_dry_run_writes_nothing(pg):
    fake = FakeSf()
    before = db.table_counts(pg)
    assert feed.run(pg, lambda: fake, datetime(2026, 11, 20, 7), dry_run=True) is True
    assert db.table_counts(pg) == before and fake.creates == 0


def test_desired_status():
    c = {"start_date": date(2026, 11, 5), "end_date": date(2026, 11, 15)}
    assert feed.desired_status(c, date(2026, 11, 4)) == "Planned"
    assert feed.desired_status(c, date(2026, 11, 5)) == "In Progress"
    assert feed.desired_status(c, date(2026, 11, 15)) == "In Progress"
    assert feed.desired_status(c, date(2026, 11, 16)) == "Completed"
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `cd /Users/jsifontes/Documents/Git/JDO-marketing-feed/Marketing_Engagement && ME_ENV_FILE=/Users/jsifontes/Documents/Git/JDO/.env python3 -m pytest tests/test_feed.py -q`
Expected: `ModuleNotFoundError: No module named 'feed'`.

- [ ] **Step 3: Write `feed.py`**

```python
"""Hourly marketing feed worker (spec 2026-10-15).

Steps, each logged to "Fins".marketing_feed_run:
  auth → rollover → crm_create → generate → reconcile (once a day after 06:00 UTC)
Insert-only on marketing_engagement; safe to re-run any time.

    python feed.py
    python feed.py --dry-run --now 2026-11-01T07:00
"""

import argparse
import sys
import traceback
from datetime import date, datetime, timedelta, timezone

import crm
import db
import engine
from catalog import MEMBER_SOURCE, NEW_CAMPAIGN_DESCRIPTION, SEGMENT_SOURCE

RECONCILE_HOUR_UTC = 6


def plan_rollover(templates, month):
    """Campaign rows for `month` (a 1st): one Personal + one Business pick by rotation, plus every 'All' template."""
    k = month.year * 12 + month.month - 1
    picks = []
    for target in ("Personal", "Business"):
        pool = [t for t in templates if t["target"] == target]
        if pool:
            picks.append(pool[k % len(pool)])
    picks += [t for t in templates if t["target"] == "All"]
    out = []
    for tpl in picks:
        start = month.replace(day=tpl["start_day"])
        out.append({
            "campaign_key": f"{tpl['template_key']}-{month:%Y-%m}", "campaign_id": None,
            "campaign_name": tpl["name_pattern"].format(month=month.strftime("%B %Y")),
            "audience_source": SEGMENT_SOURCE, "target": tpl["target"], "audience_rule": tpl["audience_rule"],
            "product_name": tpl["product_name"], "product_category": tpl["product_category"],
            "start_date": start, "end_date": start + timedelta(days=tpl["duration_days"] - 1),
            "template_key": tpl["template_key"], "crm_state": "Pending CRM",
        })
    return out


def desired_status(c, today):
    if today < c["start_date"]:
        return "Planned"
    if c["end_date"] is None or today <= c["end_date"]:
        return "In Progress"
    return "Completed"


def due_rows(conn, sfc, now, extra=()):
    """Event rows due by `now` for active Linked campaigns (+ `extra`), bounced sends skipped."""
    camps = [c for c in [*db.campaigns(conn, state="Linked"), *extra] if engine.is_active(c, now)]
    if not camps:
        return []
    accounts, business_contact = crm.load_accounts(sfc.query)
    members = crm.load_members(sfc.query, [c["campaign_id"] for c in camps if c["audience_source"] == MEMBER_SOURCE])
    sends = engine.build_sends(camps, accounts, business_contact, members)
    skip = db.bounced_send_ids(conn, [c["campaign_id"] for c in camps])
    return engine.build_rows(sends, now, now, skip)


def step_rollover(conn, now, dry_run):
    existing = {c["campaign_key"] for c in db.campaigns(conn)}
    new = [c for c in plan_rollover(db.templates(conn), now.date().replace(day=1)) if c["campaign_key"] not in existing]
    if not dry_run:
        for c in new:
            db.insert_campaign(conn, c)
    return new


def step_crm_create(conn, sfc, dry_run):
    pending = db.campaigns(conn, state="Pending CRM")
    for c in pending:
        if dry_run:
            continue
        found = sfc.query(f"SELECT Id FROM Campaign WHERE Name = {crm.quote(c['campaign_name'])}")
        cid = found[0]["Id"] if found else sfc.create("Campaign", {
            "Name": c["campaign_name"], "Type": "Email", "Status": "Planned", "IsActive": True,
            "StartDate": c["start_date"].isoformat(), "EndDate": c["end_date"].isoformat(),
            "Description": NEW_CAMPAIGN_DESCRIPTION})
        db.set_campaign(conn, c["campaign_key"], campaign_id=cid, crm_state="Linked")
    return pending


def step_reconcile(conn, sfc, now, dry_run):
    linked = db.campaigns(conn, state="Linked")
    ids = [c["campaign_id"] for c in linked]
    crm_rows = {}
    for i in range(0, len(ids), 200):
        in_list = ", ".join(f"'{x}'" for x in ids[i:i + 200])
        for r in sfc.query(f"SELECT Id, Name, StartDate, EndDate, Status, NumberSent FROM Campaign WHERE Id IN ({in_list})"):
            crm_rows[r["Id"]] = r
    counts = db.sent_counts(conn)
    notes = []
    for c in linked:
        r = crm_rows.get(c["campaign_id"])
        if r is None:
            notes.append(f"{c['campaign_key']}: missing in CRM")
            if not dry_run:
                db.set_campaign(conn, c["campaign_key"], crm_state="Missing in CRM")
            continue
        want = {"Name": c["campaign_name"], "StartDate": c["start_date"].isoformat(),
                "EndDate": c["end_date"].isoformat() if c["end_date"] else None}
        diffs = {k: (v, r[k]) for k, v in want.items() if r[k] != v}
        if diffs:
            notes.append(f"{c['campaign_key']}: drifted {diffs}")
            if not dry_run:
                db.set_campaign(conn, c["campaign_key"], crm_state="Drifted")
            continue
        updates = {}
        if c["template_key"] and r["Status"] != desired_status(c, now.date()):
            updates["Status"] = desired_status(c, now.date())
        if c["audience_source"] == SEGMENT_SOURCE and counts.get(c["campaign_id"], 0) != int(r["NumberSent"] or 0):
            updates["NumberSent"] = counts.get(c["campaign_id"], 0)
        if updates:
            notes.append(f"{c['campaign_key']}: {updates}")
        if not dry_run:
            if updates:
                sfc.update("Campaign", c["campaign_id"], updates)
            db.set_campaign(conn, c["campaign_key"])
    return linked, notes


def run(conn, sf_factory, now, dry_run=False):
    """One feed pass. Returns True when every step succeeded."""
    ok = True
    ctx = {}

    def step(name, fn):
        nonlocal ok
        try:
            campaigns, rows, detail = fn()
        except Exception as e:
            ok = False
            traceback.print_exc()
            if not dry_run:
                db.log_run(conn, name, "error", detail=f"{type(e).__name__}: {e}"[:2000], run_at=now)
            return False
        print(f"{name:10} campaigns={campaigns} rows={rows}" + (f"  {detail}" if detail else ""))
        if not dry_run:
            db.log_run(conn, name, "ok", campaigns, rows, detail, run_at=now)
        return True

    def auth():
        ctx["sf"] = sf_factory()
        return 0, 0, None

    def rollover():
        ctx["new"] = step_rollover(conn, now, dry_run)
        return len(ctx["new"]), 0, "; ".join(c["campaign_name"] for c in ctx["new"]) or None

    def crm_create():
        pending = step_crm_create(conn, ctx["sf"], dry_run)
        return len(pending), 0, "; ".join(c["campaign_name"] for c in pending) or None

    def generate():
        extra = ()
        if dry_run:  # preview pending/new campaigns with placeholder Ids
            pending = {c["campaign_key"]: c for c in [*db.campaigns(conn, state="Pending CRM"), *ctx.get("new", [])]}
            extra = [dict(c, campaign_id=f"DRY{i:015d}") for i, c in enumerate(pending.values())]
        rows = due_rows(conn, ctx["sf"], now, extra)
        return len({r[2] for r in rows}), db.insert_events(conn, rows, dry_run), None

    def reconcile():
        linked, notes = step_reconcile(conn, ctx["sf"], now, dry_run)
        return len(linked), 0, "; ".join(notes)[:2000] or None

    if not step("auth", auth):
        return False
    step("rollover", rollover)
    step("crm_create", crm_create)
    step("generate", generate)
    last = db.last_success(conn, "reconcile")
    if now.hour >= RECONCILE_HOUR_UTC and (last is None or last.date() < now.date()):
        step("reconcile", reconcile)
    return ok


if __name__ == "__main__":
    from sf import SfClient

    p = argparse.ArgumentParser()
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--now", type=datetime.fromisoformat, help="Naive UTC run time (default: now)")
    a = p.parse_args()
    now = (a.now or datetime.now(timezone.utc).replace(tzinfo=None)).replace(microsecond=0)
    with db.connect() as conn:
        sys.exit(0 if run(conn, SfClient.from_env, now, a.dry_run) else 1)
```

- [ ] **Step 4: Run the feed tests and confirm they pass, then run the full suite**

Run: `cd /Users/jsifontes/Documents/Git/JDO-marketing-feed/Marketing_Engagement && ME_ENV_FILE=/Users/jsifontes/Documents/Git/JDO/.env python3 -m pytest tests -q`
Expected: `39 passed` (13 engine + 8 db + 2 backfill + 4 sf + 12 feed).

- [ ] **Step 5: Dry-run against live data with the local sf CLI session**

Run: `cd /Users/jsifontes/Documents/Git/JDO-marketing-feed/Marketing_Engagement && ME_ENV_FILE=/Users/jsifontes/Documents/Git/JDO/.env python3 feed.py --dry-run --now 2026-11-01T07:00`
Expected:
- `rollover   campaigns=3` (the November 2026 names; rollover only plans the month of `--now`).
- Then `crm_create campaigns=0` (dry run creates nothing).
- Then `generate   campaigns=N rows=M`, where `N` covers High Income and Tier 1 and `M` is the rows newly due since Oct 15.
- Then a `reconcile` line.
- Afterwards, `db.table_counts` must still match the Task 3 numbers: run the Task 3 Step 6 fingerprint and diff it.

- [ ] **Step 6: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO-marketing-feed
git add Marketing_Engagement/feed.py Marketing_Engagement/tests/test_feed.py
git commit -m "feat(marketing-engagement): hourly feed worker (rollover, CRM create, generate, reconcile)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: JWT Connected App in JDO

**Files:** none in the repo. The metadata is deployed from `/tmp/jdo-feed-ca`, and the key and cert live in `~/.jdo-marketing-feed/`.

- [ ] **Step 1: Generate the key pair** (it stays outside the repo)

```bash
mkdir -p ~/.jdo-marketing-feed && chmod 700 ~/.jdo-marketing-feed
openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -subj "/CN=jdo-marketing-feed" \
  -keyout ~/.jdo-marketing-feed/server.key -out ~/.jdo-marketing-feed/server.crt 2>/dev/null
chmod 600 ~/.jdo-marketing-feed/server.key && ls -l ~/.jdo-marketing-feed
```
Expected: `server.key` (`-rw-------`) and `server.crt`.

- [ ] **Step 2: Write and deploy the Connected App metadata**

```bash
rm -rf /tmp/jdo-feed-ca && mkdir -p /tmp/jdo-feed-ca/force-app/main/default/connectedApps && cd /tmp/jdo-feed-ca
cat > sfdx-project.json <<'EOF'
{"packageDirectories":[{"path":"force-app","default":true}],"sourceApiVersion":"64.0"}
EOF
CERT=$(cat ~/.jdo-marketing-feed/server.crt)
cat > force-app/main/default/connectedApps/JDO_Marketing_Feed.connectedApp-meta.xml <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<ConnectedApp xmlns="http://soap.sforce.com/2006/04/metadata">
    <contactEmail>jsifontes@salesforce.com</contactEmail>
    <description>Heroku jdo-marketing-feed worker: creates email Campaigns and reads Accounts (JWT bearer).</description>
    <label>JDO Marketing Feed</label>
    <oauthConfig>
        <callbackUrl>http://localhost:1717/OauthRedirect</callbackUrl>
        <certificate>${CERT}</certificate>
        <isAdminApproved>true</isAdminApproved>
        <scopes>Api</scopes>
        <scopes>RefreshToken</scopes>
    </oauthConfig>
    <oauthPolicy>
        <ipRelaxation>BYPASS</ipRelaxation>
        <refreshTokenPolicy>infinite</refreshTokenPolicy>
    </oauthPolicy>
    <profileName>System Administrator</profileName>
</ConnectedApp>
EOF
sf project deploy start -d force-app -o jdo-gj9q5q --wait 10 2>&1 | tail -5
```
Expected: `Status: Succeeded`.

**If the deploy is rejected because new Connected App creation is disabled in this org**, stop and switch to an External Client App. Ask the user to create it in Setup → External Client App Manager → New, with these settings:
- Name `JDO Marketing Feed`, Distribution State Local.
- OAuth enabled, callback `http://localhost:1717/OauthRedirect`, scopes `api` + `refresh_token`.
- Enable JWT Bearer Flow, and upload `~/.jdo-marketing-feed/server.crt`.
- Policies: Admin approved users are pre-authorized, profile System Administrator, IP relaxation Relax.

They then paste the Consumer Key. Steps 4 onward are unchanged.

- [ ] **Step 3: Read back the consumer key**

```bash
cd /tmp/jdo-feed-ca && sf project retrieve start -m ConnectedApp:JDO_Marketing_Feed -o jdo-gj9q5q --wait 5 >/dev/null 2>&1
grep -o '<consumerKey>[^<]*' force-app/main/default/connectedApps/JDO_Marketing_Feed.connectedApp-meta.xml | cut -d'>' -f2 > ~/.jdo-marketing-feed/consumer_key
chmod 600 ~/.jdo-marketing-feed/consumer_key && wc -c < ~/.jdo-marketing-feed/consumer_key
```
Expected: a byte count of about 85. The consumer key isn't a secret by itself, but keep it out of the repo anyway.

- [ ] **Step 4: Verify the JWT login** (Connected App changes can take 2–10 minutes to propagate; retry every 2 minutes)

```bash
cd /Users/jsifontes/Documents/Git/JDO-marketing-feed/Marketing_Engagement && \
SF_LOGIN_URL=https://login.salesforce.com SF_CLIENT_ID="$(cat ~/.jdo-marketing-feed/consumer_key)" \
SF_USERNAME=admin@finsdc3.demo SF_PRIVATE_KEY="$(cat ~/.jdo-marketing-feed/server.key)" \
python3 -c "import sf; c=sf.SfClient.from_env(); print(c.root, len(c.query('SELECT Id FROM Campaign')), 'campaigns')"
```
Expected: `https://storm-16a17dc388fbe6.demo.my.salesforce.com 47 campaigns`.
- `invalid_grant: user hasn't approved this consumer`: pre-authorization hasn't propagated yet, so wait.
- `invalid_client_id`: propagation again, so wait.
- `invalid_grant: authentication failure` after 10 minutes: retry with `SF_LOGIN_URL=https://storm-16a17dc388fbe6.demo.my.salesforce.com`, because the org may block logins through login.salesforce.com.

---

### Task 7: Heroku app, deploy and schedule

**Files:**
- Create: `Marketing_Engagement/requirements.txt`, `Marketing_Engagement/.python-version`, `Marketing_Engagement/.slugignore`

- [ ] **Step 1: Add the Heroku build files**

`Marketing_Engagement/requirements.txt`:
```
psycopg[binary]==3.3.6
requests>=2.32,<3
PyJWT[crypto]==2.12.1
tzdata
```
`Marketing_Engagement/.python-version`:
```
3.13
```
`Marketing_Engagement/.slugignore`:
```
tests/
__pycache__/
```

Commit:
```bash
cd /Users/jsifontes/Documents/Git/JDO-marketing-feed
git add Marketing_Engagement/requirements.txt Marketing_Engagement/.python-version Marketing_Engagement/.slugignore
git commit -m "chore(marketing-engagement): Heroku build files for jdo-marketing-feed

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 2: Create the app and attach the existing database**

```bash
heroku create jdo-marketing-feed --stack heroku-24 --region us --no-remote
heroku addons:attach postgresql-trapezoidal-29488 -a jdo-marketing-feed --as DATABASE
heroku config -a jdo-marketing-feed --shell | cut -d= -f1
```
Expected: the app is created and `DATABASE_URL` is listed (name only). If the name is taken, use `jdo-mkt-feed` and use that name in every later step.

- [ ] **Step 3: Set the Salesforce config vars without echoing them**

```bash
heroku config:set -a jdo-marketing-feed \
  SF_LOGIN_URL=https://login.salesforce.com \
  SF_USERNAME=admin@finsdc3.demo \
  SF_CLIENT_ID="$(cat ~/.jdo-marketing-feed/consumer_key)" \
  SF_PRIVATE_KEY="$(cat ~/.jdo-marketing-feed/server.key)" >/dev/null 2>&1 && heroku config -a jdo-marketing-feed --shell | cut -d= -f1
```
Expected names: `DATABASE_URL SF_CLIENT_ID SF_LOGIN_URL SF_PRIVATE_KEY SF_USERNAME`. If Task 6 Step 4 needed the My Domain URL, set `SF_LOGIN_URL` to that value instead.

- [ ] **Step 4: Deploy the subfolder**

```bash
cd /Users/jsifontes/Documents/Git/JDO-marketing-feed
SPLIT=$(git subtree split --prefix Marketing_Engagement HEAD)
git push https://git.heroku.com/jdo-marketing-feed.git "${SPLIT}:refs/heads/main" 2>&1 | tail -6
```
Expected: `Verifying deploy... done.` In zsh, keep the `${SPLIT}` braces (a bare `$SPLIT:r…` is parsed as a modifier).

- [ ] **Step 5: Run a dry run on a one-off dyno**

Run: `heroku run -a jdo-marketing-feed --exit-code -- python feed.py --dry-run`
Expected:
- `auth` succeeds (JWT on Heroku), with no traceback.
- `rollover campaigns=3`, listing the October 2026 names; it's the first run, and the current month is October.
- A `generate` line follows.

- [ ] **Step 6: Confirm with the user, then run the first live pass**

This is the first CRM write: it creates the October 2026 Campaign records. Ask the user before running it.

Run: `heroku run -a jdo-marketing-feed --exit-code -- python feed.py`
Expected:
- Exit code 0.
- 3 `crm_create` names.
- `generate` inserts rows for October campaigns whose start day has passed. The welcome campaign covers accounts created in September.

Then verify:
```bash
cd /Users/jsifontes/Documents/Git/JDO-marketing-feed/Marketing_Engagement && ME_ENV_FILE=/Users/jsifontes/Documents/Git/JDO/.env python3 -c "
import db
with db.connect() as c:
    for r in db.campaigns(c):
        if r['template_key']: print(r['campaign_key'], r['campaign_id'], r['crm_state'])
    print(db.table_counts(c))
    print(c.execute('select step,status,campaigns,rows_inserted from \"Fins\".marketing_feed_run order by run_id').fetchall())"
sf data query -o jdo-gj9q5q -q "SELECT Id, Name, Status, NumberSent FROM Campaign WHERE Description LIKE 'Segment-based%' ORDER BY CreatedDate DESC LIMIT 5" 2>/dev/null | head -12
```
Expected:
- 3 `Linked` rows with `701…` Ids that match CRM.
- `marketing_engagement` count at or above 251,613, never lower.
- The run-log rows are all `ok`.

If the SOQL `LIKE` on Description fails (it's a long text field), query by those Ids instead.

- [ ] **Step 7: Add the hourly Scheduler job**

```bash
heroku addons:create scheduler:standard -a jdo-marketing-feed
```
The job itself can only be added in the dashboard. Ask the user to run `heroku addons:open scheduler -a jdo-marketing-feed` and add a job with:
- Command: `python feed.py`
- Frequency: Every hour at :05
- Dyno size: smallest available

Once they confirm, check the next hour that the job is running:
```bash
heroku logs -a jdo-marketing-feed --source app --num 50 | grep -E "scheduler|rollover|generate|reconcile" | tail -10
```

- [ ] **Step 8: Check that Data Cloud sees the new rows**

```bash
cat > /tmp/dcq.json <<'EOF'
{"sql":"SELECT campaign_name__c, COUNT(*) n FROM Marketing_Engagements__dlm WHERE campaign_name__c LIKE '%October 2026' GROUP BY campaign_name__c"}
EOF
sf api request rest "/services/data/v64.0/ssot/query-sql" -o jdo-gj9q5q --method POST --body @/tmp/dcq.json 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print(d if isinstance(d,list) else d.get('data'))"
```
Expected: the October campaigns, with counts equal to their Postgres row counts.

---

### Task 8: README, PR

**Files:**
- Create: `Marketing_Engagement/README.md`

- [ ] **Step 1: Write the README**

````markdown
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

- **App:** `jdo-marketing-feed`. The database is `postgresql-trapezoidal-29488`, attached from `data-cloud`.
- **Schedule:** Heroku Scheduler runs `python feed.py` every hour at :05.
- **Config vars:** `DATABASE_URL`, `SF_LOGIN_URL`, `SF_CLIENT_ID`, `SF_USERNAME`, `SF_PRIVATE_KEY`. The JWT key pair is in `~/.jdo-marketing-feed/`, and the Connected App is `JDO Marketing Feed` in JDO.
- **Deploy:**

```bash
git push https://git.heroku.com/jdo-marketing-feed.git "$(git subtree split --prefix Marketing_Engagement HEAD):refs/heads/main"
```

## Operating it

```bash
heroku run -a jdo-marketing-feed -- python feed.py --dry-run      # preview
heroku logs -a jdo-marketing-feed --source app --num 100           # recent runs
```

- **Is it alive?** Check `select * from "Fins".marketing_feed_run order by run_id desc limit 20`.
- **Campaign states:** `Drifted` means the campaign was renamed or re-dated in CRM, and `Missing in CRM` means it was deleted. Either way the campaign stops generating. Fix CRM back to the stored values, then set `crm_state = 'Linked'`.
- **Templates:** add a row to `"Fins".marketing_campaign_template`. Set `active = false` to retire one; never delete.
- **Tests:** run `ME_ENV_FILE=../.env python3 -m pytest tests -q`. It uses the scratch schema `fins_feed_test`.
````

- [ ] **Step 2: Commit, push and open the PR**

```bash
cd /Users/jsifontes/Documents/Git/JDO-marketing-feed
git add Marketing_Engagement/README.md
git commit -m "docs(marketing-engagement): README for the feed

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git push -u origin feat/marketing-feed
gh pr create --repo josers18/JDO --base main --head feat/marketing-feed \
  --title "Marketing engagement monthly feed (Heroku worker, CRM-linked, insert-only)" --body-file - <<'EOF'
## Summary
- Hourly Heroku worker `jdo-marketing-feed`. Each month it creates 3 email Campaigns in JDO (Personal and Business rotation plus Welcome), writes the CRM Id back, and inserts engagement events as they come due.
- `"Fins".marketing_engagement` is now insert-only everywhere: `backfill.py` no longer truncates.
- New tables: `marketing_campaign` (source of truth, reconciled daily against CRM), `marketing_campaign_template` and `marketing_feed_run`.

Spec: `docs/superpowers/specs/2026-10-15-marketing-engagement-monthly-feed-design.md`
Plan: `docs/superpowers/plans/2026-10-15-marketing-engagement-monthly-feed.md`

## Verification
- 39 pytest tests against the scratch schema, including the funnel golden test from before the refactor.
- Live: `backfill.py --dry-run --as-of 2026-10-15` would insert 0 rows, and the table fingerprint is unchanged.
- The first Heroku run created the October 2026 campaigns and linked their Ids; rows are visible in `Marketing_Engagements__dlm`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

- [ ] **Step 3: Remove the worktree after merge** (only once the user has merged)

```bash
cd /Users/jsifontes/Documents/Git/JDO && git worktree remove /Users/jsifontes/Documents/Git/JDO-marketing-feed
```
