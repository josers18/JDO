#!/usr/bin/env python3
"""Issue a FinServ__Card__c plastic for every generated card FinancialAccount.

Input: CSV export of the card FAs (see README runbook):
  Id, Name, FinServ__PrimaryOwner__c, FinServ__PrimaryOwner__r.Name,
  FinServ__OpenDate__c, FinServ__TotalCreditLimit__c
Output: cards.csv for `sf data import bulk -s FinServ__Card__c`.

Shape follows the org's existing plastics: product picklist by FA product,
network + 6-digit BIN, 3-year validity reissued since the open date, ~85%
contactless, daily spend limit capped by the credit limit. Corporate cards
are issued to the business (Card_Type 'Corporate'). Card_Number__c stays
empty, as on every existing plastic. Deterministic per FA Id.
"""
import csv
import datetime as dt
import hashlib
import sys

SRC = sys.argv[1] if len(sys.argv) > 1 else '/tmp/crosssell_out/card_fas.csv'
OUT = sys.argv[2] if len(sys.argv) > 2 else '/tmp/crosssell_out/cards.csv'
TODAY = dt.date(2026, 11, 5)
TERM = dt.timedelta(days=3 * 365)


def u(*p) -> float:
    return int(hashlib.sha256('|'.join(map(str, p)).encode()).hexdigest()[:12], 16) / 16 ** 12


# FA product -> (card label, Card_Product__c, Card_Type__c, [(network, BIN)])
PRODUCTS = {
    'Cumulus Cash Rewards Card': ('Cash Rewards', 'Cash Rewards Credit', 'Credit', [('Visa', 414720), ('Mastercard', 542418)]),
    'Cumulus Travel Points Card': ('Travel Points', 'Travel Points Credit', 'Credit', [('Visa', 426684), ('American Express', 371449)]),
    'Cumulus Secured Card': ('Secured', 'Secured Credit', 'Credit', [('Mastercard', 517805)]),
    'Cumulus Corporate Card': ('Corporate', 'Business Rewards Credit', 'Corporate', [('Visa', 485932), ('Mastercard', 556766)]),
}

rows = []
for fa in csv.DictReader(open(SRC, newline='')):
    base = fa['Name'].rsplit(' - ', 1)[0]
    if base not in PRODUCTS:
        continue
    label, product, ctype, nets = PRODUCTS[base]
    fid = fa['Id']
    net, bin_ = nets[int(u(fid, 'net') * len(nets))]
    issued = dt.date.fromisoformat(fa['FinServ__OpenDate__c'][:10])
    while issued + TERM <= TODAY:  # reissued every 3 years
        issued += TERM
    limit = float(fa['FinServ__TotalCreditLimit__c'] or 0)
    daily = min(limit or 5000, 25000 if ctype == 'Corporate' else 10000)
    rows.append({
        'Name': f'Cumulus {label} {net}',
        'FinServ__FinancialAccount__c': fid,
        'FinServ__AccountHolder__c': fa['FinServ__PrimaryOwner__c'],
        'FinServ__Active__c': 'true',
        'FinServ__BinNumber__c': bin_,
        'FinServ__OwnershipType__c': 'Primary',
        'FinServ__ValidUntil__c': (issued + TERM).isoformat(),
        'Card_Format__c': 'Physical + Virtual' if u(fid, 'fmt') < 0.6 else 'Physical',
        'External_ID__c': f'XSELL_CARD.{fid}',
        'Card_Product__c': product,
        'Card_Status__c': 'Active',
        'Card_Type__c': ctype,
        'Contactless_Enabled__c': 'true' if u(fid, 'nfc') < 0.85 else 'false',
        'Daily_Spend_Limit__c': f'{max(500, round(daily / 500) * 500):.0f}',
        'Issued_Date__c': issued.isoformat(),
        'Name_On_Card__c': fa['FinServ__PrimaryOwner__r.Name'][:26].upper(),
        'Payment_Network__c': net,
    })

with open(OUT, 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0]), lineterminator='\r\n')
    w.writeheader()
    w.writerows(rows)
print(len(rows), 'plastics ->', OUT)
