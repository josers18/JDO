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
