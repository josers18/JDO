"""fa.csv (Bulk export of the §7 SOQL + rate/loan/limit fields) + pc.csv (Account Id, PersonContactId)
 -> master.csv (FINANCIAL_TRANSACTION_ACCOUNTS rows, one per open FinServ account)."""
import csv, sys
sys.path.insert(0, '.')
from gen_core import classify, deposit_type, rng, f
COLS = ['SFACCOUNTID', 'ACCOUNTID', 'CONTACTID', 'ACCOUNTTYPE', 'DIRECT_DEPOSIT_AMOUNT', 'BONUS_AMOUNT', 'ACTIVE',
        'ACCOUNT_NAME', 'FINANCIAL_ACCOUNT_TYPE', 'RECORD_TYPE', 'PRODUCT_KIND', 'BALANCE', 'INTEREST_RATE',
        'OPEN_DATE', 'LOAN_END_DATE', 'CREDIT_LIMIT', 'SOURCE_OBJECT', 'LOADED_AT']
open('master_cols.txt', 'w').write(','.join(COLS))
contacts = {r['Id']: r['PersonContactId'] for r in csv.DictReader(open('pc.csv'))}
w = csv.writer(open('master.csv', 'w', newline=''))
n = 0
for r in csv.DictReader(open('fa.csv')):
    kind = classify(r['FinServ__FinancialAccountType__c'], r['Name'])
    owner = r['FinServ__PrimaryOwner__c']
    if r['FinServ__Status__c'] != 'Open' or not kind or not owner: continue
    person = r['FinServ__PrimaryOwner__r.IsPersonAccount'] == 'true'
    bal = max(0.0, f(r['FinServ__Balance__c']))
    S = rng(r['Id'], 'master')
    dd = bonus = ''
    if kind == 'deposit' and deposit_type(r['Name']) == 'chk' and person:
        dd = round(min(12000, max(1200, bal * S.uniform(0.12, 0.3))), 2)
        bonus = round(S.uniform(3000, 25000), 2) if S.random() < 0.10 else 0
    w.writerow([owner, r['Id'], contacts.get(owner, '') if person else '', 'Personal' if person else 'Business', dd, bonus, 'TRUE',
                r['Name'], r['FinServ__FinancialAccountType__c'], r['RecordType.DeveloperName'], kind,
                r['FinServ__Balance__c'], r['FinServ__InterestRate__c'], r['FinServ__OpenDate__c'], r['FinServ__LoanEndDate__c'],
                r['FinServ__TotalCreditLimit__c'], 'FinServ__FinancialAccount__c', '2026-10-22 00:00:00'])
    n += 1
print(n, 'accounts')
