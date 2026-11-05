#!/usr/bin/env python3
"""Generate the product holdings the cross-sell grid needs but the org lacks.

Real gaps found 2026-11-05 (see docs/superpowers/plans/2026-11-05-cross-sell-whitespace-real.md):
  1. Cumulus consumer credit cards: ~0 org-wide, so the Card column was 100%
     white space. Issued to clients whose profile says they carry a card
     (PERSONAL_PRODUCT_RECOMMENDATION_SUBSET.HAS_CREDIT_CARD = 1) and who do
     NOT carry one at another institution (no Plaid held-away credit card).
  2. Cumulus corporate cards: none in the commercial books. Issued to ~22% of
     business clients that already bank with Cumulus and have no held-away
     commercial card.
  3. Jose Sifontes's business clients: seeded with the same shape as Allen
     Carter's book — ~33% carry a ladder copied from a deterministic Allen
     client, balances jittered ±25%. NOTE: 5,071 of Jose's 5,094 accounts are
     IndustriesHousehold (he is the integration owner, not a commercial
     banker). Households are skipped; the FA PrimaryOwner lookup filter
     rejects them anyway. books2.csv must carry RecordType.DeveloperName.

About 3% of generated accounts open inside the last 60 days; those openings
back the grid's "won in 30d" outcome history (see generate_outcomes in the
same run).

Deterministic: every choice hashes (account id, salt), so a re-run produces
identical rows. Inputs are CSV exports listed in README.md (same directory).

Outputs (in OUT_DIR):
  fa_insert.csv        FinServ__FinancialAccount__c rows for `sf data import bulk`
  opp_seed.json        Opportunity outcome rows keyed by the FA's external key
"""
import csv
import datetime as dt
import hashlib
import json
import os
import re
import sys

IN = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
OUT = sys.argv[2] if len(sys.argv) > 2 else '/tmp/crosssell_out'
os.makedirs(OUT, exist_ok=True)

TODAY = dt.date(2026, 11, 5)
FA_OWNER = '005am000003PbCLAA0'  # integration owner used by every generated FA in the org
RT = {
    'CreditCard': '012am000001mraIAAQ',
    'BankingAccount': '012am000001mraCAAQ',
}
PERSON_BOOKS = {'Sarah Smith', 'Justin Chen', 'Adam Watson', 'Vince West', 'Kim Johnson'}
BUSINESS_BOOKS = {'Allen Carter', 'Jose Sifontes'}


def u(*parts) -> float:
    """Deterministic uniform [0,1) from the parts."""
    h = hashlib.sha256('|'.join(str(p) for p in parts).encode()).hexdigest()
    return int(h[:12], 16) / 16 ** 12


def last4(*parts) -> str:
    return f"{int(u(*parts, 'acct') * 9000) + 1000}"


def open_date(key) -> dt.date:
    if u(key, 'recent') < 0.03:
        return TODAY - dt.timedelta(days=1 + int(u(key, 'rd') * 59))
    start = dt.date(2016, 1, 1)
    span = (dt.date(2026, 8, 31) - start).days
    return start + dt.timedelta(days=int(u(key, 'od') * span))


def read(name):
    with open(os.path.join(IN, name), newline='') as f:
        return list(csv.DictReader(f))


accounts = {r['Id']: r for r in read('books2.csv')}
owner_name = {k: r['Owner.Name'] for k, r in accounts.items()}
has_card = {r['FinServ__PrimaryOwner__c'] for r in read('exist_cards.csv')}
ha_ccard = {r['ACCOUNT_ID'] for r in read('ha_ccard.csv')}
allen_fa = read('allen_fa.csv')

fa_rows, opp_seed = [], []


def add_fa(acct_id, name, rt, fa_type, bal, rate=None, limit=None, loan=None, end=None, opened=None, kind=''):
    key = f'{acct_id}|{name}'
    opened = opened or open_date(key)
    four = last4(key)
    fa_rows.append({
        'Name': f'{name} - {four}',
        'RecordTypeId': RT[rt],
        'FinServ__FinancialAccountType__c': fa_type,
        'FinServ__Status__c': 'Open',
        'FinServ__Ownership__c': 'Individual',
        'FinServ__OpenDate__c': opened.isoformat(),
        'FinServ__Balance__c': f'{bal:.2f}',
        'FinServ__TotalCreditLimit__c': '' if limit is None else f'{limit:.0f}',
        'FinServ__InterestRate__c': '' if rate is None else f'{rate:.2f}',
        'FinServ__LoanAmount__c': '' if loan is None else f'{loan:.0f}',
        'FinServ__LoanEndDate__c': end or '',
        'FinServ__FinancialAccountNumber__c': f'****{four}',
        'FinServ__PrimaryOwner__c': acct_id,
        'OwnerId': FA_OWNER,
    })
    if (TODAY - opened).days <= 60:
        opp_seed.append({
            'account': acct_id, 'banker': accounts[acct_id]['OwnerId'], 'product': name,
            'amount': round(limit or loan or bal), 'opened': opened.isoformat(), 'fa_name': f'{name} - {four}',
        })


# --- 1. consumer cards ------------------------------------------------------
for c in read('card_cands.csv'):
    aid = c['ACCOUNTID']
    if aid not in accounts or owner_name[aid] not in PERSON_BOOKS or aid in has_card or c['HA_CARD'] == '1':
        continue
    inc = float(c['INC'] or 0)
    fico = int(float(c['FICO'] or 650))
    if fico < 640:
        name, limit = 'Cumulus Secured Card', 500 + round(u(aid, 'lim') * 3) * 500
    else:
        name = 'Cumulus Travel Points Card' if inc >= 150000 else 'Cumulus Cash Rewards Card'
        limit = max(1000, min(50000, round(inc * (0.12 + 0.16 * u(aid, 'lim')) / 500) * 500))
    apr = max(17.99, min(28.99, 28.99 - (fico - 600) * 0.05))  # percent, like the org's existing cards
    bal = limit * (0.03 + 0.37 * u(aid, 'util'))
    add_fa(aid, name, 'CreditCard', 'Credit Cards', bal, rate=apr, limit=limit)

# --- 3. Jose's commercial ladder (before corporate cards so they can stack) --
allen_by_client = {}
for r in allen_fa:
    nm = re.sub(r'\s*-\s*\d+$', '', r['Name'])
    if not nm.startswith('Cumulus ') or r['RecordTypeId'] != RT['BankingAccount']:
        continue  # template only the standard generated product ladder
    allen_by_client.setdefault(r['FinServ__PrimaryOwner__c'], []).append((nm, r))
templates = sorted(allen_by_client)

ladder_holders = {r['FinServ__PrimaryOwner__c'] for r in allen_fa}
for aid, a in sorted(accounts.items()):
    if owner_name[aid] != 'Jose Sifontes' or a['IsPersonAccount'] == 'true':
        continue
    if a.get('RecordType.DeveloperName', 'IndustriesHousehold') == 'IndustriesHousehold':
        continue  # households are not businesses
    if u(aid, 'ladder') >= 0.33:
        continue
    tmpl = templates[int(u(aid, 'tmpl') * len(templates))]
    for nm, r in allen_by_client[tmpl]:
        j = 0.75 + 0.5 * u(aid, nm, 'jit')
        bal = float(r['FinServ__Balance__c'] or 0) * j
        loan = float(r['FinServ__LoanAmount__c']) * j if r['FinServ__LoanAmount__c'] else None
        lim = float(r['FinServ__TotalCreditLimit__c']) * j if r['FinServ__TotalCreditLimit__c'] else None
        rate = float(r['FinServ__InterestRate__c']) if r['FinServ__InterestRate__c'] else None
        opened = open_date(f'{aid}|{nm}')
        end = None
        if r['FinServ__LoanEndDate__c'] and r['FinServ__OpenDate__c']:
            term = (dt.date.fromisoformat(r['FinServ__LoanEndDate__c']) - dt.date.fromisoformat(r['FinServ__OpenDate__c'])).days
            end = (opened + dt.timedelta(days=term)).isoformat()
        add_fa(aid, nm, 'BankingAccount', r['FinServ__FinancialAccountType__c'], bal,
               rate=rate, limit=lim, loan=loan, end=end, opened=opened)
    ladder_holders.add(aid)

# --- 2. corporate cards -----------------------------------------------------
checking_bal = {}
for r in fa_rows:
    if 'Checking' in r['Name']:
        checking_bal[r['FinServ__PrimaryOwner__c']] = float(r['FinServ__Balance__c'])
for r in allen_fa:
    if 'Checking' in r['Name']:
        checking_bal[r['FinServ__PrimaryOwner__c']] = float(r['FinServ__Balance__c'] or 0)
for aid in sorted(ladder_holders):
    if aid not in accounts or owner_name[aid] not in BUSINESS_BOOKS or aid in has_card or aid in ha_ccard:
        continue
    if u(aid, 'ccard') >= 0.22:
        continue
    limit = max(10000, min(500000, round(checking_bal.get(aid, 100000) * 0.1 / 5000) * 5000))
    bal = limit * (0.05 + 0.35 * u(aid, 'cutil'))
    # Org convention (23 existing corporate cards): CreditCard record type, Treasury Management type.
    add_fa(aid, 'Cumulus Corporate Card', 'CreditCard', 'Treasury Management', bal, rate=19.99, limit=limit)

with open(os.path.join(OUT, 'fa_insert.csv'), 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=list(fa_rows[0]))
    w.writeheader()
    w.writerows(fa_rows)
with open(os.path.join(OUT, 'opp_seed.json'), 'w') as f:
    json.dump(opp_seed, f, indent=1)

by = {}
for r in fa_rows:
    k = re.sub(r'\s*-\s*\d+$', '', r['Name'])
    by[k] = by.get(k, 0) + 1
print(len(fa_rows), 'FAs;', len(opp_seed), 'recent openings')
for k, v in sorted(by.items(), key=lambda x: -x[1]):
    print(f'  {v:6d}  {k}')
