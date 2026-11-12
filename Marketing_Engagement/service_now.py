"""Daily ServiceNow cases on the demo bankers' books, plus their status changes.

`"Fins".service_now_cases` feeds the zero-copy Data Cloud stream on that table
(ssot__Case__dlm, DataSourceId 'Service_Now'), which React-Headless reads for S7 open service drag
and the S8 freshness meter. The one-time backfill
(`ServiceNow_Cases/generate_service_now_cases.py`, 3,260 `SN-HOME-*` rows) ends at
2026-10-24 18:00; this step carries on from there.

Each feed run:
  * inserts the `SN-D-<yyyymmdd>-<banker>-<n>` cases due by `now` that aren't
    stored yet. Per-day counts and contents are seeded by day and banker, so a
    catch-up after an outage writes the same rows a continuous feed would.
  * moves open cases forward (open → in_progress → closed) on a fixed plan
    seeded by Case ID. Statuses never move back. Backfill cases still open at
    2026-10-24 follow the same plan counted from then, so they close over the
    following weeks rather than all at once.
  * stamps `updated_at` on every row it inserts or changes. The stream reads the
    table live (zero copy), so status changes show up in Data Cloud at once.
"""

import random
from datetime import datetime, timedelta

import db

SEED = 20261111
# Where the backfill stopped; its open cases start their plan here.
FEED_START = datetime(2026, 10, 24, 18, 0)
PREFIX = "SN-D-"

# Mean new cases per banker per day: the backfill's quota over its 602 days, times
# 1.67 for its skew toward recent dates (created_at uses rng.random() ** 0.6).
BACKFILL_QUOTA = {
    "Justin Chen": 900, "Sarah Smith": 880, "Allen Carter": 520, "Jose Sifontes": 480,
    "Adam Watson": 160, "Vince West": 160, "Kim Johnson": 160,
}
DAILY_RATE = {b: q / 602 * 1.67 for b, q in BACKFILL_QUOTA.items()}
BANKERS = list(BACKFILL_QUOTA)

# Same catalogs as the backfill.
RETAIL = [
    ("Account Lock/Unlock Request", "Request to Lock or Unlock Account", "Customer requesting to lock or unlock their online banking account."),
    ("Change of Contact Information", "Update Contact Information", "Customer requesting to update email, phone number, or mailing address."),
    ("Lost Card Report", "Report of Lost Card", "Customer reporting a lost or stolen debit/credit card."),
    ("Mobile Banking Enrollment", "Enrollment in Mobile Banking", "Customer signing up for mobile banking services."),
    ("New Debit Card Request", "Request for New Debit Card", "Customer requesting a new debit card due to loss or damage."),
    ("Online Banking Enrollment", "Enrollment in Online Banking", "Customer registering for online banking services."),
    ("Password Reset Request", "Password Reset for Online Banking", "Customer requesting a password reset for online or mobile banking."),
    ("Travel Memo Setup", "Setting Up Travel Notification", "Customer notifying the bank of upcoming travel plans."),
]
BUSINESS = [
    ("ACH Return Investigation", "Investigate Returned ACH Batch", "Client reporting returned ACH items on a payroll or vendor batch."),
    ("Wire Transfer Inquiry", "Trace Outgoing Wire", "Client requesting a trace on an outgoing wire the beneficiary has not received."),
    ("Positive Pay Exception", "Review Positive Pay Exception", "Presented check does not match the issued-items file; client decision needed."),
    ("Treasury Portal Access", "Reset Treasury Portal Entitlements", "Administrator locked out of the treasury management portal."),
    ("Merchant Services Dispute", "Merchant Chargeback Dispute", "Client disputing a chargeback on their card processing account."),
    ("Account Lock/Unlock Request", "Request to Lock or Unlock Account", "Client requesting to lock or unlock their online banking account."),
    ("Change of Contact Information", "Update Contact Information", "Client requesting to update authorized contacts or mailing address."),
]
PRIORITIES = (["low"] * 40) + (["medium"] * 43) + (["high"] * 8) + (["critical"] * 9)

# Share of cases closed by N days after the plan starts; 1% never close. Roughly the
# backfill's status mix by age (10% closed under 14 days, 55% by 60, 88% by 180).
CLOSE_CDF = [(0, 0.0), (14, 0.2), (45, 0.75), (150, 0.93), (540, 0.99)]
RANK = {"open": 0, "in_progress": 1, "closed": 2}


def load_books(query):
    """Banker name → that banker's accounts as (Id, is_person), sorted by Id."""
    names = ", ".join(f"'{b}'" for b in BANKERS)
    books = {b: [] for b in BANKERS}
    for r in query(f"SELECT Id, IsPersonAccount, Owner.Name FROM Account WHERE Owner.Name IN ({names})"):
        owner = (r.get("Owner") or {}).get("Name")
        if owner in books and r["Id"].startswith("001am"):
            books[owner].append((r["Id"], bool(r["IsPersonAccount"])))
    return {b: sorted(a) for b, a in books.items()}


def _poisson(rng, lam):
    n, p, limit = 0, rng.random(), pow(2.718281828459045, -lam)
    while p > limit:
        n += 1
        p *= rng.random()
    return n


def day_cases(day, books):
    """Every case created on UTC `day` (a date), whatever the time of day."""
    out = []
    for bi, banker in enumerate(BANKERS):
        book = books.get(banker) or []
        if not book:
            continue
        rng = random.Random(f"{SEED}:{day:%Y%m%d}:{banker}")
        for k in range(_poisson(rng, DAILY_RATE[banker])):
            acct, person = rng.choice(book)
            typ, subject, comment = rng.choice(RETAIL if person else BUSINESS)
            created = datetime(day.year, day.month, day.day) + timedelta(minutes=rng.randrange(24 * 60))
            priority = rng.choice(PRIORITIES)
            escalated = priority in ("high", "critical")
            out.append({
                "case_id": f"{PREFIX}{day:%Y%m%d}-{bi}-{k}",
                "ext_account_id": acct, "type": typ, "subject": subject, "comments": comment,
                "createddate": created, "priority": priority, "escalated": escalated,
                "escalation_date": created + timedelta(days=rng.randint(0, 5)) if escalated else None,
            })
    return out


def due_cases(now, books):
    """Cases created after FEED_START and by `now`."""
    out, day = [], FEED_START.date()
    while day <= now.date():
        out += [c for c in day_cases(day, books) if FEED_START < c["createddate"] <= now]
        day += timedelta(days=1)
    return out


def plan(case_id):
    """(days to in_progress, days to closed or None) from the plan's start."""
    rng = random.Random(f"{SEED}:life:{case_id}")
    u = rng.random()
    close = None
    for (d0, p0), (d1, p1) in zip(CLOSE_CDF, CLOSE_CDF[1:]):
        if u <= p1:
            close = d0 + (d1 - d0) * (u - p0) / (p1 - p0)
            break
    start = rng.uniform(0.15, 0.6) * close if close is not None else rng.uniform(3, 30)
    return start, close


def status_at(case_id, start, now):
    """(status, closed_at) at `now` for a case whose plan began at `start`."""
    to_progress, to_close = plan(case_id)
    age = (now - start).total_seconds() / 86400
    if to_close is not None and age >= to_close:
        return "closed", (start + timedelta(days=to_close)).replace(second=0, microsecond=0)
    return ("in_progress" if age >= to_progress else "open"), None


TABLE = "service_now_cases"


def _status(c, now):
    return status_at(c["case_id"], c["createddate"], now)


def step(conn, query, now, dry_run=False):
    """Insert due cases and advance open ones. Returns (inserted, advanced)."""
    tbl = db.t(TABLE)
    new = due_cases(now, load_books(query))
    stored = {r[0] for r in conn.execute(f'SELECT "Case ID" FROM {tbl} WHERE "Case ID" LIKE %s', (PREFIX + "%",))}
    new = [c for c in new if c["case_id"] not in stored]

    advance = []
    for case_id, created, status in conn.execute(
            f'SELECT "Case ID", createddate, status FROM {tbl} '
            f"WHERE status IN ('open', 'in_progress') AND (\"Case ID\" LIKE 'SN-HOME-%%' OR \"Case ID\" LIKE %s)",
            (PREFIX + "%",)).fetchall():
        start = created if case_id.startswith(PREFIX) else max(created, FEED_START)
        want, closed = status_at(case_id, start, now)
        if RANK[want] > RANK[status]:
            advance.append((want, closed, case_id))

    if dry_run:
        return len(new), len(advance)
    with conn.transaction():
        with conn.cursor() as cur:
            cur.executemany(
                f'INSERT INTO {tbl} (closeddate, comments, createddate, status, subject, type, ext_account_id, '
                '"Case ID", "Escalated", "Escalation Date", priority, updated_at) '
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                [(closed, c["comments"], c["createddate"], status, c["subject"], c["type"], c["ext_account_id"],
                  c["case_id"], c["escalated"], c["escalation_date"], c["priority"], now)
                 for c in new for status, closed in [_status(c, now)]])
            cur.executemany(
                f'UPDATE {tbl} SET status = %s, closeddate = coalesce(%s, closeddate), updated_at = %s '
                'WHERE "Case ID" = %s',
                [(s, cd, now, cid) for s, cd, cid in advance])
    return len(new), len(advance)


# The zero-copy stream `service_now_cases` maps this table into ssot__Case__dlm. Its lineage DataSource is the
# shared Heroku connection, so the table name (DataSourceObjectId) is what tells these rows apart.
DMO_COUNTS_SQL = ("SELECT ssot__CaseStatusId__c, COUNT(*) FROM ssot__Case__dlm "
                  f"WHERE ssot__DataSourceObjectId__c = '{TABLE}' GROUP BY ssot__CaseStatusId__c")


def dmo_counts(dc_sql):
    """Rows per status that Data Cloud sees through the stream."""
    return {str(s): int(n) for s, n in dc_sql(DMO_COUNTS_SQL)}


def table_counts(conn):
    return {s: n for s, n in conn.execute(f"SELECT status, count(*) FROM {db.t(TABLE)} GROUP BY status")}


def _fmt(counts):
    return ", ".join(f"{s} {counts[s]}" for s in sorted(counts))


def dmo_check(conn, dc_sql):
    """Compare the table's rows per status with what Data Cloud sees through the stream.

    Returns (rows, detail); raises on any difference, so a status change that never reached the DMO fails too."""
    want, seen = table_counts(conn), dmo_counts(dc_sql)
    rows = sum(want.values())
    if seen != want:
        gaps = ", ".join(f"{s} {seen.get(s, 0)} vs {want.get(s, 0)}" for s in sorted(want.keys() | seen.keys())
                         if seen.get(s, 0) != want.get(s, 0))
        raise RuntimeError(f"ssot__Case__dlm differs from {TABLE} (DMO vs table): {gaps}; "
                           f"totals {sum(seen.values())} vs {rows}")
    return rows, f"DMO matches {rows} ({_fmt(want)})"
