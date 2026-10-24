"""One-off: emit INSERT SQL for the fee-spell fees (gen_core.spell_fees) of every checking
account in FINANCIAL_TRANSACTION_ACCOUNTS, dated in [start, now]. Insert-only; nothing is
rewritten. Business spikes from the pre-2026-10-24 rule already cover the 30 days to
2026-10-24, so pass --personal-only for that window.

Usage:
  python3 fee_spell_backfill.py accounts.json stressed.json START "YYYY-MM-DDTHH:MM:SS" [--personal-only] > ins.sql
  (accounts.json = `snow sql --format json` of FINANCIAL_TRANSACTION_ACCOUNTS WHERE ACTIVE;
   stressed.json = ACCOUNT_ID of the latest CLARITAS_DEMOGRAPHICS month with stress High;
   NOW = America/New_York wall clock, as the procedure uses)
"""
import json, sys
from datetime import date, datetime
sys.path.insert(0, '.')
from gen_core import COLUMNS, classify, deposit_type, spell_fees

accts, stressed_f, start, now = sys.argv[1:5]
personal_only = '--personal-only' in sys.argv
stressed = frozenset(r['ACCOUNT_ID'] for r in json.load(open(stressed_f)))
now, start = datetime.fromisoformat(now), date.fromisoformat(start)
rows = []
for r in json.load(open(accts)):
    if classify(r.get('FINANCIAL_ACCOUNT_TYPE') or '', r.get('ACCOUNT_NAME') or '') != 'deposit': continue
    if deposit_type(r.get('ACCOUNT_NAME') or '') != 'chk' or not r.get('SFACCOUNTID'): continue
    if personal_only and r.get('ACCOUNTTYPE') != 'Personal': continue
    rows.extend(spell_fees(r, start, now.date(), now, stressed))
q = lambda v: 'NULL' if v is None else "'" + str(v).replace("'", "''") + "'"
for i in range(0, len(rows), 1000):
    vals = ',\n'.join('(' + ','.join(q(v) for v in t) + ')' for t in rows[i:i + 1000])
    print(f"INSERT INTO DATA_JEDAIS.FINS__PUBLIC.FINANCIAL_TRANSACTIONS ({','.join(COLUMNS)}) VALUES\n{vals};")
print(f'-- {len(rows)} rows', file=sys.stderr)
