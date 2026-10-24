"""fa.csv/pc.csv -> master.csv (build_master.py) -> tx.csv: 90-day history ending now.
Usage: python3 run_backfill.py "YYYY-MM-DD HH:MM:SS"
"""
import csv, sys, collections
from datetime import date, datetime
sys.path.insert(0, '.')
from gen_core import generate, COLUMNS
COLS = next(csv.reader(open('master_cols.txt')))  # written by build_master.py
rows = [dict(zip(COLS, r)) for r in csv.reader(open('master.csv'))]
now = datetime.strptime(sys.argv[1], '%Y-%m-%d %H:%M:%S')
w = csv.writer(open('tx.csv', 'w', newline=''))
c = collections.Counter(); n = 0
for t in generate(rows, date(2026, 7, 24), now.date(), now):
    w.writerow(['' if v is None else v for v in t]); n += 1; c[t[11]] += 1
print(n, 'rows', c)
