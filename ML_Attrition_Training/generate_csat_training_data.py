"""Synthetic CSAT training set bootstrapped from the live scoring rows.

Replaces the rows of Heroku Postgres `"Fins".csat_prediction_training`, the table behind
the Data Cloud stream CSAT_Prediction_Training (TOTAL_REPLACE) that the "Predicted
CSAT_Score Latest" Model Builder model trains on. The original 5,000 rows didn't resemble
the accounts the model scores (CSAT_Prediction_Input__dlm): 71% had zero complaints
where 60% of live accounts have four, products spread 1-9 where live sits at 1-3,
transaction volume averaged 77 against 14 live, and the segment was spelled
"Wealth Management" where scoring sends "WealthManagement". So every live score
extrapolated, and Complaint_Count dominated every explanation.

Features are bootstrapped from the live rows with jitter, so training matches scoring.
CSAT_Score (20-100) is a noisy linear score: down with complaints, escalations and
service contacts; up with digital engagement, tenure, products, cross-sell, credit score
and the WealthManagement / Corporate segments.

Input: CSV export of DATA_JEDAIS.FINS__PUBLIC.CSAT_ATTRITION_INPUTS (the CSAT scoring
table, despite the name), e.g.
    snow sql -c SFDC_DC_TECH_ARCH_jwt --format csv \
      -q "SELECT * FROM DATA_JEDAIS.FINS__PUBLIC.CSAT_ATTRITION_INPUTS" > csat_score.csv

    python3 generate_csat_training_data.py csat_score.csv [--write]

--write backs the table up to csat_prediction_training_bak_<date> (once), then replaces
its rows in one transaction. Without it, prints the profile and holdout R^2 only.
"""
import argparse
import csv
import math
import random
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'Marketing_Engagement'))

SEED = 20261025
ROWS = 5_000
TARGET_MEAN = 72.0
NOISE_SD = 6.0
TABLE = '"Fins".csat_prediction_training'

# Heroku column -> scoring column. Order matches the table; Customer_ID is the stream's
# primary key (the model doesn't use it) and CSAT_Score is the label.
COLUMNS = {
    'Customer_ID': None,
    'Segment': 'SEGMENT',
    'Age': 'AGE',
    'Annual_Income': 'ANNUAL_INCOME',
    'Account_Balance': 'ACCOUNT_BALANCE',
    'Tenure_Years': 'TENURE_YEARS',
    'Num_Products': 'NUM_PRODUCTS',
    'Digital_Engagement': 'DIGITAL_ENGAGEMENT',
    'Complaint_Count': 'COMPLAINT_COUNT',
    'Customer_Service_Contact': 'CUSTOMER_SERVICE_CONTACT',
    'Cross_Sell_Score': 'CROSS_SELL_SCORE',
    'Escalated_Cases': 'ESCALATED_CASES',
    'Transaction_Volume': 'TRANSACTION_VOLUME',
    'Credit_Score': 'CREDIT_SCORE',
    'CSAT_Score': None,
}
# (min, max, step) for integer jitter; ranges are the live scoring ranges.
INT_JITTER = {
    'AGE': (21, 79, 2), 'TENURE_YEARS': (1, 29, 1), 'CROSS_SELL_SCORE': (15, 92, 3),
    'TRANSACTION_VOLUME': (1, 36, 2), 'ANNUAL_INCOME': (40000, 14800000, None),
}
SEGMENT = {'WealthManagement': 4.0, 'Corporate': 2.0, 'Commercial': 0.0, 'Banking': -1.0}


def jitter(rng, row):
    out = {c: row[c] for c in COLUMNS.values() if c}
    for col in ('NUM_PRODUCTS', 'COMPLAINT_COUNT', 'CUSTOMER_SERVICE_CONTACT', 'ESCALATED_CASES'):
        out[col] = int(row[col])
    for col, (lo, hi, step) in INT_JITTER.items():
        v = int(row[col])
        v = round(v * rng.uniform(0.9, 1.1)) if step is None else v + rng.choice((-1, 0, 0, 1)) * step
        out[col] = min(hi, max(lo, v))
    out['ACCOUNT_BALANCE'] = round(float(row['ACCOUNT_BALANCE']) * rng.uniform(0.85, 1.15), 2)
    out['DIGITAL_ENGAGEMENT'] = round(min(99.0, max(40.0, float(row['DIGITAL_ENGAGEMENT']) + rng.uniform(-3, 3))), 2)
    out['CREDIT_SCORE'] = round(min(850.0, max(600.0, float(row['CREDIT_SCORE']) + rng.uniform(-15, 15))), 2)
    return out


def score(r):
    """CSAT before the intercept and noise."""
    return (SEGMENT[r['SEGMENT']]
            - 5.5 * r['COMPLAINT_COUNT']
            - 7.0 * r['ESCALATED_CASES']
            - 2.0 * r['CUSTOMER_SERVICE_CONTACT']
            + 0.20 * (r['DIGITAL_ENGAGEMENT'] - 70)
            + 0.35 * r['TENURE_YEARS']
            + 1.8 * (r['NUM_PRODUCTS'] - 1)
            + 0.08 * (r['CROSS_SELL_SCORE'] - 33)
            + 0.02 * (r['CREDIT_SCORE'] - 700)
            + 0.15 * (r['TRANSACTION_VOLUME'] - 14)
            + 1.2 * math.log10(1 + r['ACCOUNT_BALANCE']))


def build(live, rng):
    rows = [jitter(rng, rng.choice(live)) for _ in range(ROWS)]
    scores = [score(r) for r in rows]
    b0 = TARGET_MEAN - sum(scores) / len(scores)
    for i, (r, s) in enumerate(zip(rows, scores), start=1):
        r['CSAT_Score'] = int(round(min(100, max(20, s + b0 + rng.gauss(0, NOISE_SD)))))
        r['Customer_ID'] = i
    return rows


def holdout_r2(rows):
    """R^2 of a gradient-boosted regressor on the 13 model features, 70/30 split."""
    from sklearn.ensemble import HistGradientBoostingRegressor
    from sklearn.metrics import r2_score
    feats = [c for c in COLUMNS.values() if c]
    segs = sorted(SEGMENT)
    X = [[segs.index(r[c]) if c == 'SEGMENT' else float(r[c]) for c in feats] for r in rows]
    y = [r['CSAT_Score'] for r in rows]
    cut = int(len(rows) * 0.7)
    m = HistGradientBoostingRegressor(random_state=0).fit(X[:cut], y[:cut])
    return r2_score(y[cut:], m.predict(X[cut:]))


def profile(rows, live):
    ys = [r['CSAT_Score'] for r in rows]
    mean = sum(ys) / len(ys)
    sd = (sum((y - mean) ** 2 for y in ys) / len(ys)) ** 0.5
    print(f'{len(rows)} rows, CSAT mean {mean:.1f} sd {sd:.1f} min {min(ys)} max {max(ys)}')
    for lo, hi in ((20, 50), (50, 65), (65, 80), (80, 90), (90, 101)):
        print(f'  CSAT {lo:3}-{hi - 1:3}: {sum(lo <= y < hi for y in ys) / len(ys):6.1%}')
    print(f'  {"feature":26} {"train avg":>10} {"live avg":>10} {"train min-max":>20}')
    for c in (c for c in COLUMNS.values() if c and c != 'SEGMENT'):
        t = [float(r[c]) for r in rows]
        lv = [float(r[c]) for r in live]
        print(f'  {c:26} {sum(t) / len(t):10.2f} {sum(lv) / len(lv):10.2f} {min(t):>9.0f}-{max(t):<10.0f}')
    for col in ('COMPLAINT_COUNT', 'ESCALATED_CASES', 'NUM_PRODUCTS', 'SEGMENT'):
        parts = []
        for v in sorted({r[col] for r in rows}):
            sub = [r['CSAT_Score'] for r in rows if r[col] == v]
            parts.append(f'{v}: n={len(sub)} avg {sum(sub) / len(sub):.1f}')
        print(f'  {col:20} ' + ' | '.join(parts))
    print(f'holdout R^2 {holdout_r2(rows):.3f}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('scoring_csv')
    ap.add_argument('--write', action='store_true')
    args = ap.parse_args()

    with open(args.scoring_csv, newline='') as f:
        live = list(csv.DictReader(f))
    rows = build(live, random.Random(SEED))
    profile(rows, live)
    if not args.write:
        return

    import db
    conn = db.connect()
    backup = f'"Fins".csat_prediction_training_bak_{date.today():%Y%m%d}'
    cols = ', '.join(f'"{c}"' for c in COLUMNS)
    with conn.transaction():
        conn.execute(f'CREATE TABLE IF NOT EXISTS {backup} AS TABLE {TABLE}')
        conn.execute(f'DELETE FROM {TABLE}')
        with conn.cursor() as cur:
            cur.executemany(f'INSERT INTO {TABLE} ({cols}) VALUES ({", ".join(["%s"] * len(COLUMNS))})',
                            [tuple(r[src or col] for col, src in COLUMNS.items()) for r in rows])
    print(f'replaced {TABLE} with {len(rows)} rows (backup {backup})')


if __name__ == '__main__':
    main()
