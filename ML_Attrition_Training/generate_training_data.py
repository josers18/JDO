"""Synthetic retail-attrition training set with a learnable churn label.

Replaces the rows of Heroku Postgres `"Fins"."Retail_Attrition_Training_Data"`, the
table behind the Data Cloud stream ML_Attrition_Training_Data (TOTAL_REPLACE) that
the "Predicted Churned_c" Model Builder model trains on. The original 10,000 rows
carried a label independent of every feature (churn ~0.43 in every bucket), so the
model scored AUC 0.555, and their feature mix didn't resemble the accounts it scores.

Features are bootstrapped from the live scoring rows (ATTRITION_INPUTS export) with
jitter, so training matches scoring. Churned_c is drawn from a logistic risk score:
up with detractor NPS, call volume, days since last interaction, single product,
promotional product, short tenure, low balance; down with direct deposit,
online/mobile banking, transactions, cross-sell, Preferred segment. The draw is
Bernoulli, so the label stays noisy (holdout AUC ~0.8, not 1.0).

Pct_Balance_Drop_6_Months_Avg_c is written but not used by the label: the Heroku
column name carries leading/trailing spaces and the stream never ingested it.

Input: CSV export of DATA_JEDAIS.FINS__PUBLIC.ATTRITION_INPUTS, e.g.
    snow sql -c SFDC_DC_TECH_ARCH_jwt --format csv \
      -q "SELECT * FROM DATA_JEDAIS.FINS__PUBLIC.ATTRITION_INPUTS" > score.csv

    python3 generate_training_data.py score.csv [--write]

--write backs the table up to Retail_Attrition_Training_Data_bak_<date> (once), then
replaces its rows in one transaction. Without it, prints the profile and AUC only.
"""
import argparse
import csv
import math
import random
import sys
import uuid
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'Marketing_Engagement'))

SEED = 20261024
ROWS = 10_000
TARGET_CHURN = 0.25
TABLE = '"Fins"."Retail_Attrition_Training_Data"'

# Heroku column -> ATTRITION_INPUTS column. Order matches the table.
COLUMNS = {
    'Customer_Segment_c': 'CUSTOMER_SEGMENT_C',
    'Cross_Sell_Score_c': 'CROSS_SELL_SCORE_C',
    'Online_Banking_c': 'ONLINE_BANKING_C',
    'Mobile_Banking_c': 'MOBILE_BANKING_C',
    'Direct_Deposit_c': 'DIRECT_DEPOSIT_C',
    'Avg_Number_of_Transactions_c': 'AVG_NUMBER_OF_TRANSACTIONS_C',
    'Tenure_In_Months_c': 'TENURE_IN_MONTHS_C',
    'Avg_Balance_6_Months_c': 'AVG_BALANCE_6_MONTHS_C',
    'NPS_Score_c': 'NPS_SCORE_C',
    'Single_Product_Customer_c': 'SINGLE_PRODUCT_CUSTOMER_C',
    'Promotional_Product_c': 'PROMOTIONAL_PRODUCT_C',
    ' Pct_Balance_Drop_6_Months_Avg_c ': 'PCT_BALANCE_DROP_6_MONTHS_AVG_C',
    'Days_Since_Last_Interaction_c': 'DAYS_SINCE_LAST_INTERACTION_C',
    'Churned_c': 'CHURNED_C',
    'UniqueID': 'UNIQUEID',
    'Avg_Number_of_Call_Center_Calls_c': 'AVG_NUMBER_OF_CALL_CENTER_CALLS_C',
}
# (min, max) clamps after jitter, from the generator vocab.
INT_RANGES = {
    'CROSS_SELL_SCORE_C': (1, 7), 'AVG_NUMBER_OF_TRANSACTIONS_C': (0, 45),
    'TENURE_IN_MONTHS_C': (1, 74), 'DAYS_SINCE_LAST_INTERACTION_C': (0, 65),
    'AVG_NUMBER_OF_CALL_CENTER_CALLS_C': (0, 11),
}
YES = lambda v: 1.0 if v == 'Yes' else 0.0  # noqa: E731


def jitter(rng, row):
    out = dict(row)
    for col, (lo, hi) in INT_RANGES.items():
        v = int(float(row[col])) + rng.choice((-1, 0, 0, 1)) * max(1, round((hi - lo) * 0.04))
        out[col] = min(hi, max(lo, v))
    out['AVG_BALANCE_6_MONTHS_C'] = round(max(0.0, float(row['AVG_BALANCE_6_MONTHS_C']) * rng.uniform(0.85, 1.15)), 2)
    out['PCT_BALANCE_DROP_6_MONTHS_AVG_C'] = round(min(0.84, max(0.0, float(row['PCT_BALANCE_DROP_6_MONTHS_AVG_C'] or 0)
                                                              + rng.uniform(-0.02, 0.02))), 2)
    # Widen the live NPS mix a little (4% Promoter) so every level is learnable.
    if rng.random() < 0.12:
        out['NPS_SCORE_C'] = rng.choice(('Promoter', 'Passive', 'Detractor'))
    return out


def risk(r):
    """Log-odds of churn, before the intercept."""
    nps = {'Detractor': 1.1, 'Passive': 0.2, 'Promoter': -0.9}[r['NPS_SCORE_C']]
    seg = {'Preferred': -0.6, 'Premium': -0.2, 'Regular': 0.2}[r['CUSTOMER_SEGMENT_C']]
    return (nps + seg
            + 0.28 * r['AVG_NUMBER_OF_CALL_CENTER_CALLS_C']
            + 0.035 * r['DAYS_SINCE_LAST_INTERACTION_C']
            - 0.028 * r['TENURE_IN_MONTHS_C']
            - 0.045 * r['AVG_NUMBER_OF_TRANSACTIONS_C']
            - 0.25 * r['CROSS_SELL_SCORE_C']
            - 0.18 * math.log10(1 + r['AVG_BALANCE_6_MONTHS_C'])
            + 0.8 * YES(r['SINGLE_PRODUCT_CUSTOMER_C'])
            + 0.6 * YES(r['PROMOTIONAL_PRODUCT_C'])
            - 2.0 * YES(r['DIRECT_DEPOSIT_C'])
            - 0.45 * YES(r['ONLINE_BANKING_C'])
            - 0.4 * YES(r['MOBILE_BANKING_C']))


def intercept_for(scores, target):
    lo, hi = -20.0, 20.0
    for _ in range(60):
        mid = (lo + hi) / 2
        rate = sum(1 / (1 + math.exp(-(s + mid))) for s in scores) / len(scores)
        lo, hi = (mid, hi) if rate < target else (lo, mid)
    return (lo + hi) / 2


def build(live, rng):
    rows = [jitter(rng, rng.choice(live)) for _ in range(ROWS)]
    scores = [risk(r) for r in rows]
    b0 = intercept_for(scores, TARGET_CHURN)
    for r, s in zip(rows, scores):
        r['CHURNED_C'] = 'Yes' if rng.random() < 1 / (1 + math.exp(-(s + b0))) else 'No'
        r['UNIQUEID'] = str(uuid.UUID(int=rng.getrandbits(128), version=4))
    return rows


def holdout_auc(rows):
    """AUC of a gradient-boosted model on the 14 ingested features, 70/30 split."""
    from sklearn.ensemble import HistGradientBoostingClassifier
    from sklearn.metrics import roc_auc_score
    feats = [c for c in COLUMNS.values() if c not in ('CHURNED_C', 'UNIQUEID', 'PCT_BALANCE_DROP_6_MONTHS_AVG_C')]
    cats = {c: sorted({r[c] for r in rows}) for c in feats if isinstance(rows[0][c], str)}
    X = [[cats[c].index(r[c]) if c in cats else float(r[c]) for c in feats] for r in rows]
    y = [r['CHURNED_C'] == 'Yes' for r in rows]
    cut = int(len(rows) * 0.7)
    m = HistGradientBoostingClassifier(random_state=0).fit(X[:cut], y[:cut])
    return roc_auc_score(y[cut:], m.predict_proba(X[cut:])[:, 1])


def profile(rows):
    n = len(rows)
    print(f'{n} rows, churn {sum(r["CHURNED_C"] == "Yes" for r in rows) / n:.3f}')
    for col in ('NPS_SCORE_C', 'DIRECT_DEPOSIT_C', 'SINGLE_PRODUCT_CUSTOMER_C', 'CUSTOMER_SEGMENT_C'):
        for v in sorted({r[col] for r in rows}):
            sub = [r for r in rows if r[col] == v]
            print(f'  {col:28} {v:10} n={len(sub):5} churn {sum(r["CHURNED_C"] == "Yes" for r in sub) / len(sub):.3f}')
    print(f'holdout AUC {holdout_auc(rows):.3f}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('scoring_csv')
    ap.add_argument('--write', action='store_true')
    args = ap.parse_args()

    with open(args.scoring_csv, newline='') as f:
        live = list(csv.DictReader(f))
    rows = build(live, random.Random(SEED))
    profile(rows)
    if not args.write:
        return

    import db
    conn = db.connect()
    backup = f'"Fins"."Retail_Attrition_Training_Data_bak_{date.today():%Y%m%d}"'
    cols = ', '.join(f'"{c}"' for c in COLUMNS)
    with conn.transaction():
        conn.execute(f'CREATE TABLE IF NOT EXISTS {backup} AS TABLE {TABLE}')
        conn.execute(f'DELETE FROM {TABLE}')
        with conn.cursor() as cur:
            cur.executemany(f'INSERT INTO {TABLE} ({cols}) VALUES ({", ".join(["%s"] * len(COLUMNS))})',
                            [tuple(r[src] for src in COLUMNS.values()) for r in rows])
    print(f'replaced {TABLE} with {len(rows)} rows (backup {backup})')


if __name__ == '__main__':
    main()
