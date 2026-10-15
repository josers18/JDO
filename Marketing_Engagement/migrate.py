"""Apply sql/*.sql and seed marketing_campaign with the catalog.py campaigns.

Re-runnable: DDL is IF NOT EXISTS and seeds are ON CONFLICT DO NOTHING.

    python3 migrate.py
"""

import glob
import os
import re
from datetime import date

import crm
import db
from catalog import CRM_CAMPAIGNS, MEMBER_SOURCE, SEGMENT_SOURCE, SIMULATED_CAMPAIGNS

HERE = os.path.dirname(os.path.abspath(__file__))


def apply_sql(conn):
    conn.execute(f'CREATE SCHEMA IF NOT EXISTS "{db.SCHEMA}"')
    for path in sorted(glob.glob(os.path.join(HERE, "sql", "*.sql"))):
        with open(path) as f:
            conn.execute(f.read().replace('"Fins".', f'"{db.SCHEMA}".'))


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40]


def _row(name, rec, source, target, rule, product, category):
    return {
        "campaign_key": slug(name), "campaign_id": rec["Id"], "campaign_name": name,
        "audience_source": source, "target": target, "audience_rule": rule,
        "product_name": product, "product_category": category,
        "start_date": date.fromisoformat(rec["StartDate"]),
        "end_date": date.fromisoformat(rec["EndDate"]) if rec["EndDate"] else None,
        "template_key": None, "crm_state": "Linked",
    }


def catalog_rows(crm_campaigns):
    """marketing_campaign rows for catalog.py; crm_campaigns maps Name → {Id, StartDate, EndDate}."""
    missing = [n for n in [*CRM_CAMPAIGNS, *SIMULATED_CAMPAIGNS] if n not in crm_campaigns]
    if missing:
        raise SystemExit(f"Catalog campaigns not found in CRM: {missing}")
    rows = [_row(n, crm_campaigns[n], MEMBER_SOURCE, None, "members", *product)
            for n, product in CRM_CAMPAIGNS.items()]
    for n, spec in SIMULATED_CAMPAIGNS.items():
        rule = spec["audience"] if isinstance(spec["audience"], str) else f"share:{spec['audience']:.2f}"
        rows.append(_row(n, crm_campaigns[n], SEGMENT_SOURCE, spec["target"], rule, *spec["product"]))
    return rows


if __name__ == "__main__":
    names = [*CRM_CAMPAIGNS, *SIMULATED_CAMPAIGNS]
    recs = crm.cli_query("SELECT Id, Name, StartDate, EndDate FROM Campaign "
                         f"WHERE Name IN ({', '.join(crm.quote(n) for n in names)})")
    with db.connect() as conn:
        apply_sql(conn)
        seeded = sum(db.insert_campaign(conn, r) for r in catalog_rows({r["Name"]: r for r in recs}))
        print(f"schema {db.SCHEMA}: sql applied; {seeded} catalog campaigns seeded; counts {db.table_counts(conn)}")
