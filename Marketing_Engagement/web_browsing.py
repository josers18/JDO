"""Weekly identified browsing on the Cumulus RTOM demo site (React-Headless R6 card).

Since 2026-08-19 almost every RTOM site device is anonymous, so the Retail cockpit's
R6 "digital-engagement surges" card had nothing current for Sarah Smith's, Justin
Chen's or Jose Sifontes's books. This sends real Data Cloud Web SDK beacons (the same
two calls the site's sitemap makes) for 33 household devices that identity
resolution links to their clients. Each week, each household loads its featured product page
3-4 times (enough for R6's SURGE_VIEWS = 3 follow-up) and a second product 1-2 times.
Which product leads rotates by ISO week; load counts are a hash of (device, week).

Called by feed.py once 7 days have passed since its last ok run (after 15:00 UTC),
logged to "Fins".marketing_feed_run as step `web_browsing`. Standalone:

    python web_browsing.py --dry-run     # print this week's plan
    python web_browsing.py               # send it now (logged like the feed step)
    python web_browsing.py --register 8359a3f40ee67656   # one-time identity for a device
    python web_browsing.py --only f8dd1498e4a79e77       # this week's plan for new households; not logged

A device only counts in R6 once identity resolution links it to a book account. For
clients with no linked device yet, `register()` sends the two profile events the
site's sitemap sends when a client signs in: an `identity` event (isAnonymous 0,
first/last name) and a `contactPointEmail` event with the client's CRM email. The
Account Ruleset's "Exact Email Normalized" rule then links the device to the client
on its next run. Register once, check the link, then add the device to HOUSEHOLDS.
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
    "estate-planning": ("wealth", "01tam00000Bo1k9AAB", "Cumulus Estate Planning", "0ZGam000000oHsLGAU", "Trusts & Estate"),
    "heloc": ("retail", "01tam00000Bo1SPAAZ", "Cumulus HELOC", "0ZGam000000oHsFGAU", "Home Equity"),
    "5-1-arm-mortgage": ("retail", "01tam00000Bo1XFAAZ", "Cumulus 5/1 ARM Mortgage", "0ZGam000000oHsEGAU", "Mortgages"),
    "auto-loan": ("retail", "01tam00000Bo1PBAAZ", "Cumulus Auto Loan", "0ZGam000000oHsHGAU", "Auto Loans"),
    "premier-checking": ("retail", "01tam00000Bo1AfAAJ", "Cumulus Premier Checking", "0ZGam000000oHsCGAU", "Checking Accounts"),
    "529-education-savings": ("wealth", "01tam00000Bo1iXAAR", "Cumulus 529 Plan", "0ZGam000000oHsJGAU", "Retirement & Education"),
    "high-yield-savings": ("retail", "01tam00000Bo1DtAAJ", "Cumulus High-Yield Savings", "0ZGam000000oHsBGAU", "Savings Accounts"),
    "brokerage-accounts": ("wealth", "01tam00000Bnvy6AAB", "Cumulus Brokerage Account", "0ZGam000000oHsKGAU", "Investment Accounts"),
    "managed-advisory": ("wealth", "01tam00000Bnv5GAAR", "Cumulus Managed Advisory", "0ZGam000000oHsKGAU", "Investment Accounts"),
    "401k-403b-rollover": ("wealth", "01tam00000Bo1gvAAB", "Cumulus 401k", "0ZGam000000oHsJGAU", "Retirement & Education"),
    "traditional-ira": ("wealth", "01tam00000BnvusAAB", "Cumulus Traditional IRA", "0ZGam000000oHsIGAU", "IRAs"),
    "personal-line-of-credit": ("retail", "01tam00000Bo1QnAAJ", "Cumulus Personal Line of Credit", "0ZGam000000oHsGGAU", "Personal Loans"),
    "36mo-cd": ("retail", "01tam00000Bo1KLAAZ", "Cumulus 36Mo CD", "0ZGam000000oHsDGAU", "Certificates of Deposit"),
    "statement-savings": ("retail", "01tam00000Bo1CHAAZ", "Cumulus Statement Savings", "0ZGam000000oHsBGAU", "Savings Accounts"),
    "heloan": ("retail", "01tam00000Bo1U1AAJ", "Cumulus HELOAN", "0ZGam000000oHsFGAU", "Home Equity"),
    "6mo-cd": ("retail", "01tam00000Bo1H7AAJ", "Cumulus 6Mo CD", "0ZGam000000oHsDGAU", "Certificates of Deposit"),
    "60mo-cd": ("retail", "01tam00000Bo1LxAAJ", "Cumulus 60Mo CD", "0ZGam000000oHsDGAU", "Certificates of Deposit"),
    "revocable-irrevocable-trusts": ("wealth", "01tam00000Bo1llAAB", "Cumulus Revocable Trust", "0ZGam000000oHsLGAU", "Trusts & Estate"),
}
SECTION = {"retail": "Personal Banking", "commercial": "Commercial Banking", "wealth": "Wealth Advisory"}

# Device ids (identity-resolution SourceRecordIds) → client household and the products it browses.
# The first six resolve into Sarah Smith's book; all but Craig Scott also into Justin Chen's.
# Julie E Morris (001am00000qvjsAAAQ) was the only household in Jose Sifontes's book with
# linked devices (checked 2026-11-10); b681f050d2e9e091 last browsed estate planning on 10-28.
# The six after her are Jose's clients whose devices were linked by `--register`
# (REGISTRATIONS), then two batches of five each from Sarah's and Justin's books (2026-11-10).
HOUSEHOLDS = [
    ("03ebdbb54d499cac", "Amy Morris", ["30-year-fixed-mortgage", "money-market"]),
    ("13128e3edaa2672d", "George Hernandez", ["travel-points", "cash-rewards"]),
    ("63d498f1d9b0d480", "Micheal Cuevas", ["12mo-cd", "money-market"]),
    ("72454c60051cfab9", "Craig Scott", ["roth-ira"]),
    ("502fa9ef5d3b048d", "Christina Guerra", ["personal-loan"]),
    ("afffa10a90eb9fe6", "Tina Ochoa", ["secured", "everyday-checking"]),
    ("b681f050d2e9e091", "Julie E Morris", ["estate-planning", "secured"]),
    ("8359a3f40ee67656", "David H Chen", ["heloc", "5-1-arm-mortgage"]),
    ("df091f18586f9a6d", "Marcus Rodriguez", ["auto-loan", "premier-checking"]),
    ("0dd6163b6357634a", "Anika Patel", ["529-education-savings", "high-yield-savings"]),
    ("838ecc9cf23b6032", "Julia Nakamura", ["brokerage-accounts", "managed-advisory"]),
    ("bb0c5fa9e683a2bc", "Ethan Brooks", ["401k-403b-rollover", "traditional-ira"]),
    ("c88daee7210e5e92", "Priya Venkatesh", ["personal-line-of-credit", "36mo-cd"]),
    ("f8dd1498e4a79e77", "Katie Anderson", ["high-yield-savings", "statement-savings"]),
    ("88ad8fc57e8d0df9", "Brian Valdez", ["heloan", "heloc"]),
    ("434fdee17e23dab7", "Brendan Woods", ["auto-loan", "personal-loan"]),
    ("9a378f8f19c43470", "Jade Carr", ["6mo-cd", "60mo-cd"]),
    ("fd9b1298406162eb", "Evelyn Estrada", ["traditional-ira", "roth-ira"]),
    ("075047d641a08023", "Laura Moyer", ["premier-checking", "cash-rewards"]),
    ("e2c27c05cdef2ca6", "Mary Ramirez", ["5-1-arm-mortgage", "30-year-fixed-mortgage"]),
    ("7f66769b9afe7832", "Lori Oconnell", ["brokerage-accounts", "529-education-savings"]),
    ("8fdd54f194b79f7d", "Kenneth Ward", ["personal-line-of-credit", "travel-points"]),
    ("febc049dab78dcfd", "Kevin Oliver", ["revocable-irrevocable-trusts", "estate-planning"]),
    ("f8ff1b229036b0a2", "Gregory Estes", ["money-market", "12mo-cd"]),
    ("11c8d7df077601a3", "Cindy Johnson", ["everyday-checking", "secured"]),
    ("70836345f1d14199", "Mark Freeman", ["managed-advisory", "brokerage-accounts"]),
    ("0a5796edcecb5532", "Holly Bender", ["36mo-cd", "high-yield-savings"]),
    ("65c86c1ea903c67f", "Barry Jones", ["401k-403b-rollover", "roth-ira"]),
    ("e3d04a86d21be093", "Katherine Garrett", ["heloc", "30-year-fixed-mortgage"]),
    ("4061e5080f59196e", "Bethany Keller", ["cash-rewards", "travel-points"]),
    ("98018b3c6962933f", "John Bruce", ["auto-loan", "personal-loan"]),
    ("9395f591daea13de", "Nancy Diaz", ["statement-savings", "money-market"]),
    ("49c6fcf3f14b2fc2", "Julia Bautista", ["traditional-ira", "estate-planning"]),
]

# One-time sign-ins for person accounts in Jose Sifontes's, Sarah Smith's and Justin Chen's
# books (CRM email shared only with the client's own person contact; no device has it). Device = sha256("cumulus-web|<account id>")[:16].
REGISTRATIONS = [
    ("8359a3f40ee67656", "001am000026ZtgIAAS", "mdmp25419@cumulus.example.com", "David", "Chen"),
    ("df091f18586f9a6d", "001am000026ZtgJAAS", "mdmp25420@cumulus.example.com", "Marcus", "Rodriguez"),
    ("0dd6163b6357634a", "001am000026ZtgKAAS", "mdmp25421@cumulus.example.com", "Anika", "Patel"),
    ("838ecc9cf23b6032", "001am000026ZtgLAAS", "mdmp25422@cumulus.example.com", "Julia", "Nakamura"),
    ("bb0c5fa9e683a2bc", "001am000026ZtgMAAS", "mdmp25423@cumulus.example.com", "Ethan", "Brooks"),
    ("c88daee7210e5e92", "001am000026ZtgNAAS", "mdmp25424@cumulus.example.com", "Priya", "Venkatesh"),
    # Sarah Smith's book (2026-11-10)
    ("f8dd1498e4a79e77", "001am00002A303AAAR", "karroyo@example.com", "Katie", "Anderson"),
    ("88ad8fc57e8d0df9", "001am00002A303BAAR", "brownjessica@example.org", "Brian", "Valdez"),
    ("434fdee17e23dab7", "001am00002A303CAAR", "brianromero@example.org", "Brendan", "Woods"),
    ("9a378f8f19c43470", "001am00002A303DAAR", "contrerasangela@example.net", "Jade", "Carr"),
    ("fd9b1298406162eb", "001am00002A303EAAR", "kimberly69@example.net", "Evelyn", "Estrada"),
    # Justin Chen's book (2026-11-10)
    ("075047d641a08023", "001am00002A303GAAR", "donnacampbell@example.net", "Laura", "Moyer"),
    ("e2c27c05cdef2ca6", "001am00002A303HAAR", "rsims@example.com", "Mary", "Ramirez"),
    ("7f66769b9afe7832", "001am00002A303JAAR", "lanesarah@example.net", "Lori", "Oconnell"),
    ("8fdd54f194b79f7d", "001am00002A303LAAR", "alexis82@example.com", "Kenneth", "Ward"),
    ("febc049dab78dcfd", "001am00002A303MAAR", "mezajared@example.org", "Kevin", "Oliver"),
    ("f8ff1b229036b0a2", "001am00002A303FAAR", "benjamin96@example.com", "Gregory", "Estes"),
    ("11c8d7df077601a3", "001am00002A303IAAR", "qvargas@example.org", "Cindy", "Johnson"),
    ("70836345f1d14199", "001am00002A303KAAR", "lauren54@example.net", "Mark", "Freeman"),
    ("0a5796edcecb5532", "001am00002A303NAAR", "mkim@example.org", "Holly", "Bender"),
    ("65c86c1ea903c67f", "001am00002A303QAAR", "wendy16@example.org", "Barry", "Jones"),
    ("e3d04a86d21be093", "001am00002A303OAAR", "harrisandrea@example.com", "Katherine", "Garrett"),
    ("4061e5080f59196e", "001am00002A303PAAR", "seanwashington@example.com", "Bethany", "Keller"),
    ("98018b3c6962933f", "001am00002A303RAAR", "yvonnecastaneda@example.org", "John", "Bruce"),
    ("9395f591daea13de", "001am00002A303SAAR", "maria47@example.com", "Nancy", "Diaz"),
    ("49c6fcf3f14b2fc2", "001am00002A303TAAR", "umatthews@example.org", "Julia", "Bautista"),
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


def _stamp(at):
    return at.strftime("%Y-%m-%dT%H:%M:%S.") + f"{at.microsecond // 1000:03d}Z"


def _profile_event(device, event_type, at, **fields):
    return {
        "eventType": event_type, "category": "Profile", "eventId": str(uuid.uuid4()), "dateTime": _stamp(at),
        "sessionId": device, "deviceId": device, "sourceUrl": f"{SITE}/dashboard", "sourceUrlReferrer": "",
        "sourceChannel": "Web", "sourcePageType": "Dashboard", **fields,
    }


def register(regs, http=None, clock=None):
    """Send one sign-in's profile events per (device, account, email, first, last). Returns devices sent."""
    http = http or requests.Session()
    clock = clock or (lambda: datetime.now(timezone.utc))
    headers = {"Origin": SITE, "Referer": f"{SITE}/", "User-Agent": UA}
    for device, _account, email, first, last in regs:
        r = http.post(f"{BEACON}/web/v2/authentication", headers=headers,
                      data={"auth": _b64({"appSourceId": APP_SOURCE_ID, "deviceId": device})}, timeout=30)
        r.raise_for_status()
        events = [_profile_event(device, "identity", clock(), isAnonymous="0", firstName=first, lastName=last),
                  _profile_event(device, "contactPointEmail", clock(), email=email)]
        r = http.post(f"{BEACON}/web/events/{APP_SOURCE_ID}", headers=headers,
                      data={"event": _b64({"events": events})}, timeout=30)
        r.raise_for_status()
    return len(regs)


def _view_event(device, slug, at):
    line, pid, pname, cid, cname = PRODUCTS[slug]
    return {
        "eventType": "userEngagement", "segment": line, "productSlug": slug, "siteSection": SECTION[line],
        "pageTitle": "", "productId": pid, "productName": pname, "categoryId": cid, "categoryName": cname,
        "eventId": str(uuid.uuid4()), "dateTime": _stamp(at),
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
    p.add_argument("--register", nargs="*", metavar="DEVICE",
                   help="send one-time sign-in identity for these REGISTRATIONS devices (none = all)")
    p.add_argument("--only", nargs="+", metavar="DEVICE",
                   help="send this week's plan for these HOUSEHOLDS devices only; not logged, so the weekly clock keeps")
    a = p.parse_args()
    if a.register is not None:
        regs = [r for r in REGISTRATIONS if not a.register or r[0] in a.register]
        if not regs or (a.register and len(regs) != len(a.register)):
            sys.exit(f"unknown device in {a.register}")
        print(f"registered {register(regs)} devices: " + ", ".join(f"{f} {l} ({d})" for d, _a, _e, f, l in regs))
        sys.exit(0)
    now = datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0)
    plan = week_plan(now)
    if a.only:
        plan = [x for x in plan if x[0] in a.only]
        if len(plan) != len(set(a.only)):
            sys.exit(f"unknown device in {a.only}")
    print(describe(plan))
    if a.dry_run:
        sys.exit(0)
    if a.only:
        print(f"sent {send(plan)} page loads for {len(plan)} households (not logged)")
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
