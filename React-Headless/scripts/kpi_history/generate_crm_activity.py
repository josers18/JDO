#!/usr/bin/env python3
"""
Write ~9 weeks of real, backdated CRM activity for the three cockpit bankers so
CockpitKpiSnapshot.backfill(8) has genuine movement to reconstruct.

The org's CRM book was bulk-loaded on 2026-05-21..26 and has not moved since,
so an honest reconstruction of the last 8 weeks is flat. This script adds the
week-by-week activity a live book would have had, on the bankers' own accounts:

  · new opportunities, cloned from the banker's open opps (same account, name,
    type and lead source, amount jittered ±35%), inserted OPEN at an early stage
    with a backdated CreatedDate
  · wins and losses: legacy open opps closed (Closed Won / Closed Lost) with a
    CloseDate inside the window, so their stage history shows open → closed
  · new cases on the banker's accounts (cloned subject/origin/type), each
    closing 1–14 days later with a backdated ClosedDate (still open if that's
    after the cutoff)
  · new leads owned by the banker

Backdating uses the "Set Audit Fields upon Record Creation" permission (the
admin has it). Every record created is tagged in Description with TAG; the
legacy opps it closes keep their Description and are listed in
out/opportunity_close.csv. The bulk job ids go to out/manifest.json, so the run
can be audited or rolled back.

Deterministic: same seed + same org state → same plan.

  python3 generate_crm_activity.py --plan            # write CSVs, print counts
  python3 generate_crm_activity.py --apply --sample 2   # 2 rows per file, smoke test
  python3 generate_crm_activity.py --apply           # the full run
"""
import argparse
import csv
import datetime as dt
import json
import os
import random
import subprocess
import sys

ORG = 'jdo-oe0sdd'
TAG = 'KPI history backfill 2026-11-06'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')

START = dt.date(2026, 9, 4)   # a week before the first snapshot date (Sep 11)
CUTOFF = dt.date(2026, 11, 5)  # last day with activity (yesterday)
SEED = 20261106

# Weekly rates per banker (each week scaled by a U(0.6, 1.4) multiplier).
BANKERS = {
    'Sarah': dict(id='005am000006ffBpAAI', opps=30, won=20, lost=8, cases=40, leads=3),
    'Kim':   dict(id='005am000003PbFAAA0', opps=6,  won=4,  lost=2, cases=6,  leads=1),
    'Allen': dict(id='005am000003PbFDAA0', opps=15, won=10, lost=4, cases=15, leads=2),
}
NEW_STAGES = [('Prospecting', 0.5), ('Qualification', 0.35), ('Proposal Issued', 0.15)]

FIRST = ['Ava', 'Liam', 'Maya', 'Noah', 'Priya', 'Ethan', 'Sofia', 'Lucas', 'Chloe', 'Mateo', 'Grace',
         'Omar', 'Hannah', 'Diego', 'Zoe', 'Ryan', 'Leah', 'Kai', 'Nora', 'Isaac']
LAST = ['Patel', 'Nguyen', 'Garcia', 'Kim', 'Okafor', 'Rossi', 'Schmidt', 'Haddad', 'Silva', 'Chen',
        'Murphy', 'Kowalski', 'Ibrahim', 'Tanaka', 'Lopez', 'Bennett', 'Reyes', 'Novak', 'Sato', 'Walsh']
COMPANY = ['Harbor Dental Group', 'Northwind Logistics', 'Bluefin Cafe', 'Summit Roofing', 'Cedar Pediatrics',
           'Brightline Studio', 'Ironwood Builders', 'Lakeside Vet Clinic', 'Granite Peak Advisors',
           'Copperleaf Bakery', 'Riverbend Fitness', 'Oakmont Property Mgmt', 'Sparrow Labs', 'Tidewater Marine']
LEAD_SOURCES = ['Web', 'Partner Referral', 'Employee Referral', 'Existing Customer', 'Event']


def sf(*args, capture=True):
    env = dict(os.environ)
    env['PATH'] = '/Users/jsifontes/Library/Application Support/Zed/node/node-v24.11.0-darwin-arm64/bin:' + env['PATH']
    res = subprocess.run(['sf', *args, '-o', ORG, '--json'], capture_output=capture, text=True, env=env)
    try:
        return json.loads(res.stdout)
    except json.JSONDecodeError:
        sys.exit(f'sf {" ".join(args[:3])} failed:\n{res.stdout[-2000:]}\n{res.stderr[-2000:]}')


def query(soql):
    out = []
    path = os.path.join(OUT, '_export.csv')
    d = sf('data', 'export', 'bulk', '--query', soql, '--output-file', path, '--wait', '15')
    if d.get('status') != 0:
        sys.exit(f'export failed: {d.get("message")}')
    with open(path, newline='') as f:
        out = list(csv.DictReader(f))
    os.remove(path)
    return out


def weekdays(rng, week_start, n):
    """n timestamps spread over the 5 weekdays from week_start, business hours, ≤ CUTOFF."""
    days = [week_start + dt.timedelta(days=i) for i in range(7)]
    days = [d for d in days if d.weekday() < 5 and d <= CUTOFF]
    if not days:
        return []
    out = []
    for _ in range(n):
        d = rng.choice(days)
        out.append(dt.datetime(d.year, d.month, d.day, rng.randint(13, 22), rng.randint(0, 59), rng.randint(0, 59)))
    return sorted(out)


def iso(ts):
    return ts.strftime('%Y-%m-%dT%H:%M:%S.000Z')


def pick_stage(rng):
    r, acc = rng.random(), 0.0
    for s, p in NEW_STAGES:
        acc += p
        if r < acc:
            return s
    return NEW_STAGES[-1][0]


def plan():
    rng = random.Random(SEED)
    os.makedirs(OUT, exist_ok=True)
    ids = "','".join(b['id'] for b in BANKERS.values())
    print('exporting templates…')
    opps = query(f"SELECT Id, OwnerId, Name, AccountId, RecordTypeId, Type, LeadSource, Amount, StageName, CreatedDate "
                 f"FROM Opportunity WHERE IsClosed = false AND OwnerId IN ('{ids}') ORDER BY Id")
    cases = query(f"SELECT AccountId, Account.OwnerId, Subject, Origin, Type, Priority, RecordTypeId "
                  f"FROM Case WHERE Account.OwnerId IN ('{ids}') ORDER BY Id")
    legacy = [o for o in opps if o['CreatedDate'] < '2026-06-01']

    new_opps, closes, new_cases, new_leads = [], [], [], []
    for name, b in BANKERS.items():
        mine = [o for o in opps if o['OwnerId'] == b['id']]
        mine_legacy = [o for o in legacy if o['OwnerId'] == b['id']]
        rng.shuffle(mine_legacy)
        mine_cases = [c for c in cases if c['Account.OwnerId'] == b['id']]
        week = START
        while week <= CUTOFF:
            m = rng.uniform(0.6, 1.4)
            for ts in weekdays(rng, week, round(b['opps'] * m)):
                t = rng.choice(mine)
                amt = round(float(t['Amount'] or 0) * rng.uniform(0.65, 1.35), 2)
                new_opps.append(dict(
                    Name=t['Name'], AccountId=t['AccountId'], OwnerId=b['id'], RecordTypeId=t['RecordTypeId'],
                    Type=t['Type'], LeadSource=t['LeadSource'], Amount=amt, StageName=pick_stage(rng),
                    CloseDate=(ts.date() + dt.timedelta(days=rng.randint(30, 120))).isoformat(),
                    CreatedDate=iso(ts), Description=TAG))
            m = rng.uniform(0.6, 1.4)
            for stage, n in (('Closed Won', b['won']), ('Closed Lost', b['lost'])):
                for ts in weekdays(rng, week, round(n * m)):
                    if not mine_legacy:
                        break
                    o = mine_legacy.pop()
                    closes.append(dict(Id=o['Id'], StageName=stage, CloseDate=ts.date().isoformat()))
            m = rng.uniform(0.6, 1.4)
            for ts in weekdays(rng, week, round(b['cases'] * m)):
                t = rng.choice(mine_cases)
                closed = ts + dt.timedelta(days=rng.randint(1, 14), hours=rng.randint(0, 6))
                done = closed.date() <= CUTOFF
                new_cases.append(dict(
                    AccountId=t['AccountId'], OwnerId=b['id'], Subject=t['Subject'], Origin=t['Origin'], Type=t['Type'],
                    Priority=t['Priority'], RecordTypeId=t['RecordTypeId'],
                    Status='Closed' if done else rng.choice(['New', 'Working', 'Waiting on Customer']),
                    CreatedDate=iso(ts), ClosedDate=iso(closed) if done else '', Description=TAG))
            for ts in weekdays(rng, week, max(0, round(b['leads'] * rng.uniform(0.5, 1.5)))):
                new_leads.append(dict(
                    FirstName=rng.choice(FIRST), LastName=rng.choice(LAST), Company=rng.choice(COMPANY),
                    OwnerId=b['id'], Status=rng.choice(['New', 'Working', 'Contacted']),
                    LeadSource=rng.choice(LEAD_SOURCES), CreatedDate=iso(ts), Description=TAG))
            week += dt.timedelta(days=7)

    files = {}
    for fname, rows in (('opportunity_insert', new_opps), ('opportunity_close', closes),
                        ('case_insert', new_cases), ('lead_insert', new_leads)):
        path = os.path.join(OUT, f'{fname}.csv')
        with open(path, 'w', newline='') as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys()), lineterminator='\n')
            w.writeheader()
            w.writerows(rows)
        files[fname] = (path, len(rows))
    for name, b in BANKERS.items():
        c = lambda rows, k='OwnerId': sum(1 for r in rows if r.get(k) == b['id'])
        won = sum(1 for r in closes if r['StageName'] == 'Closed Won' and r['Id'] in {o['Id'] for o in legacy if o['OwnerId'] == b['id']})
        lost = sum(1 for r in closes if r['StageName'] == 'Closed Lost' and r['Id'] in {o['Id'] for o in legacy if o['OwnerId'] == b['id']})
        print(f'{name:6} new opps {c(new_opps):4}  won {won:4}  lost {lost:4}  cases {c(new_cases):4}  leads {c(new_leads):3}')
    return files


def apply(files, sample):
    manifest = {'tag': TAG, 'ran_at': dt.datetime.now().isoformat(timespec='seconds'), 'jobs': {}}
    order = [('opportunity_insert', 'Opportunity', 'import'), ('opportunity_close', 'Opportunity', 'update'),
             ('case_insert', 'Case', 'import'), ('lead_insert', 'Lead', 'import')]
    for fname, sobject, op in order:
        path, _ = files[fname]
        if sample:
            with open(path) as f:
                lines = f.readlines()
            path = path.replace('.csv', f'.sample{sample}.csv')
            with open(path, 'w') as f:
                f.writelines(lines[:sample + 1])
        print(f'{op} {sobject} ← {os.path.basename(path)}')
        d = sf('data', op, 'bulk', '--sobject', sobject, '--file', path, '--wait', '30', '--line-ending', 'LF')
        r = d.get('result') or {}
        manifest['jobs'][fname] = {'jobId': r.get('jobId'), 'processed': r.get('processedRecords'),
                                   'success': r.get('successfulRecords'), 'failed': r.get('failedRecords'),
                                   'status': d.get('status'), 'message': d.get('message')}
        print('   ', manifest['jobs'][fname])
        if d.get('status') != 0 or (r.get('failedRecords') or 0) > 0:
            print('    stopping: failures — see the job results above')
            break
    with open(os.path.join(OUT, f'manifest{"-sample" if sample else ""}.json'), 'w') as f:
        json.dump(manifest, f, indent=2)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--plan', action='store_true')
    ap.add_argument('--apply', action='store_true')
    ap.add_argument('--sample', type=int, default=0)
    a = ap.parse_args()
    files = plan()
    if a.apply:
        apply(files, a.sample)
