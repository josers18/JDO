"""Synthetic ServiceNow cases on real jdo-oe0sdd accounts.

Inserts cases into Heroku Postgres `"Fins".service_now`, the table behind the
Data Cloud "Service Now" stream (INCREMENTAL on createddate → ssot__Case__dlm,
DataSourceId 'Service_Now'). The original 4,009 rows are keyed by synthetic
`account_id_<n>` ids that match no Account, so the home page's S7 "open service
drag" reads ~0 on every book. These rows are keyed by home-org `001am…` ids
owned by the seven demo bankers.

Input: a CSV of Id,OwnerId,Owner.Name,IsPersonAccount, e.g.
    sf data export bulk -o jdo-oe0sdd --result-format csv --output-file accts.csv \
      --query "SELECT Id, OwnerId, Owner.Name, IsPersonAccount FROM Account
               WHERE Owner.Name IN ('Justin Chen', ...)"

Rows carry Case IDs `SN-HOME-<n>` (the rollback marker). The run refuses if any
already exist; --replace deletes them first (rows already ingested stay in DC
until a Full Refresh).

    python3 generate_service_now_cases.py accts.csv [--dry-run] [--replace]
"""
import argparse
import csv
import random
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'Marketing_Engagement'))
import db  # noqa: E402

SEED = 20261024
END = datetime(2026, 10, 24, 18, 0)
START = datetime(2025, 3, 1)
PREFIX = 'SN-HOME-'

# Cases per book: roughly 2.5–9% of a book's accounts across 20 months.
CASES_PER_BANKER = {
    'Justin Chen': 900, 'Sarah Smith': 880, 'Allen Carter': 520, 'Jose Sifontes': 480,
    'Adam Watson': 160, 'Vince West': 160, 'Kim Johnson': 160,
}

RETAIL = [
    ('Account Lock/Unlock Request', 'Request to Lock or Unlock Account', 'Customer requesting to lock or unlock their online banking account.'),
    ('Change of Contact Information', 'Update Contact Information', 'Customer requesting to update email, phone number, or mailing address.'),
    ('Lost Card Report', 'Report of Lost Card', 'Customer reporting a lost or stolen debit/credit card.'),
    ('Mobile Banking Enrollment', 'Enrollment in Mobile Banking', 'Customer signing up for mobile banking services.'),
    ('New Debit Card Request', 'Request for New Debit Card', 'Customer requesting a new debit card due to loss or damage.'),
    ('Online Banking Enrollment', 'Enrollment in Online Banking', 'Customer registering for online banking services.'),
    ('Password Reset Request', 'Password Reset for Online Banking', 'Customer requesting a password reset for online or mobile banking.'),
    ('Travel Memo Setup', 'Setting Up Travel Notification', 'Customer notifying the bank of upcoming travel plans.'),
]
BUSINESS = [
    ('ACH Return Investigation', 'Investigate Returned ACH Batch', 'Client reporting returned ACH items on a payroll or vendor batch.'),
    ('Wire Transfer Inquiry', 'Trace Outgoing Wire', 'Client requesting a trace on an outgoing wire the beneficiary has not received.'),
    ('Positive Pay Exception', 'Review Positive Pay Exception', 'Presented check does not match the issued-items file; client decision needed.'),
    ('Treasury Portal Access', 'Reset Treasury Portal Entitlements', 'Administrator locked out of the treasury management portal.'),
    ('Merchant Services Dispute', 'Merchant Chargeback Dispute', 'Client disputing a chargeback on their card processing account.'),
    ('Account Lock/Unlock Request', 'Request to Lock or Unlock Account', 'Client requesting to lock or unlock their online banking account.'),
    ('Change of Contact Information', 'Update Contact Information', 'Client requesting to update authorized contacts or mailing address.'),
]
PRIORITIES = (['low'] * 40) + (['medium'] * 43) + (['high'] * 8) + (['critical'] * 9)


def status_for(rng, age_days):
    """Recent cases are mostly open; old ones mostly closed, with a stale open tail."""
    if age_days <= 14:
        weights = (55, 35, 10)
    elif age_days <= 60:
        weights = (20, 25, 55)
    elif age_days <= 180:
        weights = (5, 7, 88)
    else:
        weights = (1.5, 0.5, 98)
    return rng.choices(('open', 'in_progress', 'closed'), weights)[0]


def created_at(rng):
    # Square-root skew toward recent dates; minute precision like the source rows.
    span = (END - START).total_seconds()
    t = START + timedelta(seconds=span * rng.random() ** 0.6)
    return t.replace(second=0, microsecond=0)


def build(accounts, rng):
    by_banker = defaultdict(list)
    for a in accounts:
        if a['Owner.Name'] in CASES_PER_BANKER:
            by_banker[a['Owner.Name']].append(a)
    rows, n = [], 0
    for banker, quota in CASES_PER_BANKER.items():
        book = by_banker[banker]
        # Draw accounts so ~70% of case-bearing accounts have one case, the rest 2–3.
        while quota > 0:
            acct = rng.choice(book)
            catalog = RETAIL if acct['IsPersonAccount'] == 'true' else BUSINESS
            for _ in range(min(quota, rng.choices((1, 2, 3), (70, 22, 8))[0])):
                n += 1
                quota -= 1
                typ, subject, comment = rng.choice(catalog)
                created = created_at(rng)
                status = status_for(rng, (END - created).days)
                priority = rng.choice(PRIORITIES)
                escalated = priority in ('high', 'critical')
                closed = created + timedelta(days=rng.randint(1, 20), hours=rng.randint(0, 8)) if status == 'closed' else None
                rows.append({
                    'case_id': f'{PREFIX}{n}',
                    'ext_account_id': acct['Id'],
                    'banker': banker,
                    'type': typ, 'subject': subject, 'comments': comment,
                    'createddate': created,
                    'closeddate': min(closed, END).strftime('%Y-%m-%d %H:%M') if closed else None,
                    'status': status,
                    'priority': priority,
                    'escalated': escalated,
                    'escalation_date': created + timedelta(days=rng.randint(0, 5)) if escalated else None,
                })
    return rows


def summarize(rows):
    for banker in CASES_PER_BANKER:
        mine = [r for r in rows if r['banker'] == banker]
        open_ = [r for r in mine if r['status'] != 'closed']
        aged = [r for r in open_ if (END - r['createddate']).days > 30]
        print(f'  {banker:14} {len(mine):4} cases on {len({r["ext_account_id"] for r in mine}):4} accounts, '
              f'{len(open_):3} open ({len(aged)} aged >30d)')
    print('  status', dict(Counter(r['status'] for r in rows)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('accounts_csv')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--replace', action='store_true')
    args = ap.parse_args()

    with open(args.accounts_csv, newline='') as f:
        accounts = [a for a in csv.DictReader(f) if a['Id'].startswith('001am')]
    rows = build(accounts, random.Random(SEED))
    print(f'{len(rows)} cases')
    summarize(rows)
    if args.dry_run:
        return

    conn = db.connect()
    existing = conn.execute('SELECT COUNT(*) FROM "Fins".service_now WHERE "Case ID" LIKE %s', (PREFIX + '%',)).fetchone()[0]
    if existing and not args.replace:
        sys.exit(f'{existing} {PREFIX}* rows already exist; pass --replace to regenerate')
    with conn.transaction():
        if existing:
            conn.execute('DELETE FROM "Fins".service_now WHERE "Case ID" LIKE %s', (PREFIX + '%',))
        with conn.cursor() as cur:
            cur.executemany(
                'INSERT INTO "Fins".service_now (closeddate, comments, createddate, status, subject, type, '
                'ext_account_id, "Case ID", "Escalated", "Escalation Date", priority) '
                'VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)',
                [(r['closeddate'], r['comments'], r['createddate'], r['status'], r['subject'], r['type'],
                  r['ext_account_id'], r['case_id'], r['escalated'], r['escalation_date'], r['priority'])
                 for r in rows])
    print(f'inserted {len(rows)} rows ({existing} replaced)')


if __name__ == '__main__':
    main()
