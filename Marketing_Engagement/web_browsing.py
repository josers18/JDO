"""Weekly identified browsing on the Cumulus RTOM demo site (React-Headless R6 card).

Since 2026-08-19 almost every RTOM site device is anonymous, so the Retail cockpit's
R6 "digital-engagement surges" card had nothing current for Sarah Smith's or Justin
Chen's books. This sends real Data Cloud Web SDK beacons (the same two calls the
site's sitemap makes) for six household devices that identity resolution already
links to their clients. Each week, each household loads its featured product page
3-4 times (enough for R6's SURGE_VIEWS = 3 follow-up) and a second product 1-2 times.
Which product leads rotates by ISO week; load counts are a hash of (device, week).

Called by feed.py once 7 days have passed since its last ok run (after 15:00 UTC),
logged to "Fins".marketing_feed_run as step `web_browsing`. Standalone:

    python web_browsing.py --dry-run     # print this week's plan
    python web_browsing.py               # send it now (logged like the feed step)
"""

import argparse
import base64
import hashlib
import json
import sys
import time
import uuid
from datetime import datetime, timezone

import requests

SITE = "https://cumulus-rtom-demo-b30dfbe65e2e.herokuapp.com"
BEACON = "https://m8zg89bsg-ztkzrtmyzw0ntbge.c360a.salesforce.com"
APP_SOURCE_ID = "adcb469a-d281-4d8a-8fb3-a3edd707563c"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36")

# slug → (line, productId, productName, categoryId, categoryName), from the site's /static/js/sitemap.js.
PRODUCTS = {
    "30-year-fixed-mortgage": ("retail", "01tam00000Bo1VdAAJ", "Cumulus 30 Year Fixed Mortgage", "0ZGam000000oHsEGAU", "Mortgages"),
    "money-market": ("retail", "01tam00000Bo1FVAAZ", "Cumulus Money Market", "0ZGam000000oHsBGAU", "Savings Accounts"),
    "travel-points": ("retail", "01tam00000Bo1aTAAR", "Cumulus Travel Points Card", "0ZGam000000oHs8GAE", "Credit Cards"),
    "cash-rewards": ("retail", "01tam00000Bo1YrAAJ", "Cumulus Cash Rewards Card", "0ZGam000000oHs8GAE", "Credit Cards"),
    "12mo-cd": ("retail", "01tam00000Bo1IjAAJ", "Cumulus 12Mo CD", "0ZGam000000oHsDGAU", "Certificates of Deposit"),
    "roth-ira": ("wealth", "01tam00000Bo1fJAAR", "Cumulus Roth IRA", "0ZGam000000oHsIGAU", "IRAs"),
    "personal-loan": ("retail", "01tam00000Bo1NZAAZ", "Cumulus Personal Loan", "0ZGam000000oHsGGAU", "Personal Loans"),
    "secured": ("retail", "01tam00000Bo1dhAAB", "Cumulus Secured Card", "0ZGam000000oHs8GAE", "Credit Cards"),
    "everyday-checking": ("retail", "01tam00000Bo193AAB", "Cumulus Everyday Checking", "0ZGam000000oHsCGAU", "Checking Accounts"),
}
SECTION = {"retail": "Personal Banking", "commercial": "Commercial Banking", "wealth": "Wealth Advisory"}

# Device ids (identity-resolution SourceRecordIds) → client household and the products it browses.
# All six resolve into Sarah Smith's book; all but Craig Scott also into Justin Chen's.
HOUSEHOLDS = [
    ("03ebdbb54d499cac", "Amy Morris", ["30-year-fixed-mortgage", "money-market"]),
    ("13128e3edaa2672d", "George Hernandez", ["travel-points", "cash-rewards"]),
    ("63d498f1d9b0d480", "Micheal Cuevas", ["12mo-cd", "money-market"]),
    ("72454c60051cfab9", "Craig Scott", ["roth-ira"]),
    ("502fa9ef5d3b048d", "Christina Guerra", ["personal-loan"]),
    ("afffa10a90eb9fe6", "Tina Ochoa", ["secured", "everyday-checking"]),
]

# R6 collapses repeats of a device + URL within 2s; keep loads well apart.
GAP_SECONDS = 4


def _roll(*parts):
    return int(hashlib.sha256("|".join(map(str, parts)).encode()).hexdigest(), 16)


def week_plan(now):
    """[(device, client, [slug per page load])] for `now`'s ISO week; deterministic."""
    year, week, _ = now.isocalendar()
    plan = []
    for device, client, slugs in HOUSEHOLDS:
        lead = week % len(slugs)
        ordered = slugs[lead:] + slugs[:lead]
        loads = [ordered[0]] * (3 + _roll(device, year, week, "lead") % 2)
        for slug in ordered[1:]:
            loads += [slug] * (1 + _roll(device, year, week, slug) % 2)
        plan.append((device, client, loads))
    return plan


def _b64(obj):
    return base64.b64encode(json.dumps(obj, separators=(",", ":")).encode()).decode()


def _view_event(device, slug, at):
    line, pid, pname, cid, cname = PRODUCTS[slug]
    return {
        "eventType": "userEngagement", "segment": line, "productSlug": slug, "siteSection": SECTION[line],
        "pageTitle": "", "productId": pid, "productName": pname, "categoryId": cid, "categoryName": cname,
        "eventId": str(uuid.uuid4()), "dateTime": at.strftime("%Y-%m-%dT%H:%M:%S.") + f"{at.microsecond // 1000:03d}Z",
        "sessionId": device, "deviceId": device, "interactionName": "Viewed Product Detail", "pageView": 1,
        "sourceUrl": f"{SITE}/products/{line}/{slug}", "sourceUrlReferrer": "", "sourceChannel": "Web",
        "sourcePageType": "Product Detail", "category": "Engagement",
    }


def send(plan, http=None, sleep=time.sleep, clock=None):
    """Send one beacon per page load. Returns the page-load count."""
    http = http or requests.Session()
    clock = clock or (lambda: datetime.now(timezone.utc))
    headers = {"Origin": SITE, "Referer": f"{SITE}/", "User-Agent": UA}
    sent = 0
    for device, _client, loads in plan:
        r = http.post(f"{BEACON}/web/v2/authentication", headers=headers,
                      data={"auth": _b64({"appSourceId": APP_SOURCE_ID, "deviceId": device})}, timeout=30)
        r.raise_for_status()
        for slug in loads:
            ev = _view_event(device, slug, clock())
            r = http.post(f"{BEACON}/web/events/{APP_SOURCE_ID}", headers=headers,
                          data={"event": _b64({"events": [ev]})}, timeout=30)
            r.raise_for_status()
            sent += 1
            sleep(GAP_SECONDS)
    return sent


def describe(plan):
    return "; ".join(f"{client}: " + ", ".join(f"{s}×{loads.count(s)}" for s in dict.fromkeys(loads))
                     for _d, client, loads in plan)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--dry-run", action="store_true")
    a = p.parse_args()
    now = datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0)
    plan = week_plan(now)
    print(describe(plan))
    if a.dry_run:
        sys.exit(0)
    import db

    with db.connect() as conn:
        try:
            n = send(plan)
        except Exception as e:
            db.log_run(conn, "web_browsing", "error", detail=f"{type(e).__name__}: {e}"[:2000], run_at=now)
            raise
        db.log_run(conn, "web_browsing", "ok", len(plan), n, describe(plan)[:2000], run_at=now)
        print(f"sent {n} page loads for {len(plan)} households")
