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
# Generated campaigns start here; earlier months were covered by the original backfill.
FIRST_MONTH = date(2026, 11, 1)
# Keep generating this long past a campaign's cap, so an outage spanning the cap loses nothing.
GRACE = timedelta(days=7)


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
    """Event rows due by `now` for active Linked campaigns (+ `extra`); rules in engine.new_rows."""
    camps = [c for c in [*db.campaigns(conn, state="Linked"), *extra] if engine.is_active(c, now, GRACE)]
    if not camps:
        return []
    accounts, business_contact = crm.load_accounts(sfc.query)
    members = crm.load_members(sfc.query, [c["campaign_id"] for c in camps if c["audience_source"] == MEMBER_SOURCE])
    sends = engine.build_sends(camps, accounts, business_contact, members)
    stored = db.stored_sends(conn, [c["campaign_id"] for c in camps])
    return engine.new_rows(camps, sends, stored, now, now)


def step_rollover(conn, now, dry_run):
    month = now.date().replace(day=1)
    if month < FIRST_MONTH:
        return []
    have = [c for c in db.campaigns(conn) if c["template_key"] and c["campaign_key"].endswith(f"-{month:%Y-%m}")]
    # One Personal + one Business per month, even if the template pool changes mid-month.
    taken = {c["campaign_key"] for c in have} | {c["target"] for c in have if c["target"] in ("Personal", "Business")}
    new = [c for c in plan_rollover(db.templates(conn), month)
           if c["campaign_key"] not in taken and c["target"] not in taken]
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
        if c["audience_source"] == SEGMENT_SOURCE and (r["NumberSent"] is None or counts.get(c["campaign_id"], 0) != int(r["NumberSent"])):
            updates["NumberSent"] = counts.get(c["campaign_id"], 0)
        if updates:
            notes.append(f"{c['campaign_key']}: {updates}")
        if not dry_run:
            if updates:
                sfc.update("Campaign", c["campaign_id"], updates)
            db.set_campaign(conn, c["campaign_key"])
    return linked, notes


def run(conn, sf_factory, now, dry_run=False):
    """One feed pass. Returns True when every step succeeded (or another run holds the lock)."""
    if not db.try_lock(conn):
        print("another feed run is in progress; skipping")
        return True
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
    real_now = datetime.now(timezone.utc).replace(tzinfo=None)
    now = (a.now or real_now).replace(microsecond=0)
    if now > real_now and not a.dry_run:
        sys.exit("--now is in the future; rows would be future-dated. Use --dry-run to preview.")
    with db.connect() as conn:
        sys.exit(0 if run(conn, SfClient.from_env, now, a.dry_run) else 1)
