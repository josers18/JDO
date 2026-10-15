"""Insert any missing "Fins".marketing_engagement rows for every Linked campaign.

Insert-only: existing rows are never changed or removed, so it is always safe
to re-run. Audiences and funnel come from engine.py; campaigns from
"Fins".marketing_campaign.

    python3 backfill.py --dry-run --as-of 2026-10-15
    python3 backfill.py --as-of 2026-10-15
"""

import argparse
import collections
import sys
from datetime import date, datetime, time, timezone

import crm
import db
import engine
from catalog import MEMBER_SOURCE


def plan(conn, query, as_of, loaded_at):
    """Rows due by as_of for all Linked campaigns (bounced sends skipped), plus the account map."""
    campaigns = db.campaigns(conn, state="Linked")
    accounts, business_contact = crm.load_accounts(query)
    members = crm.load_members(query, [c["campaign_id"] for c in campaigns if c["audience_source"] == MEMBER_SOURCE])
    sends = engine.build_sends(campaigns, accounts, business_contact, members)
    skip = db.bounced_send_ids(conn, [c["campaign_id"] for c in campaigns])
    return engine.build_rows(sends, as_of, loaded_at, skip), accounts


def report(rows, accounts, already_covered):
    by_campaign = collections.Counter()
    sources = {}
    sends_by_type = collections.defaultdict(lambda: collections.defaultdict(set))
    for r in rows:
        name, src, send_id, kind = r[3], r[4], r[1], r[11]
        sources[name] = src
        by_campaign[name] += 1
        sends_by_type[name][kind].add(send_id)

    hdr = f"{'Campaign':44} {'Source':15} {'Sent':>7} {'Deliv':>7} {'Bounce':>6} {'Opened':>7} {'Clicked':>7} {'Unsub':>5} {'Events':>8}"
    print(hdr); print("─" * len(hdr))
    for name in sorted(by_campaign, key=lambda n: (sources[n], n)):
        n = {k: len(sends_by_type[name][k]) for k in ("Sent", "Delivered", "Bounced", "Opened", "Clicked", "Unsubscribed")}
        print(f"{name[:44]:44} {sources[name]:15} {n['Sent']:>7,} {n['Delivered']:>7,} {n['Bounced']:>6,} "
              f"{n['Opened']:>7,} {n['Clicked']:>7,} {n['Unsubscribed']:>5,} {by_campaign[name]:>8,}")
    covered = already_covered | {r[6] for r in rows if r[11] == "Sent"}
    print(f"\nCoverage: {len(covered & set(accounts)):,} / {len(accounts):,} CRM accounts have ≥1 Sent "
          "(table + this run)")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--as-of", type=date.fromisoformat, default=datetime.now(timezone.utc).date(),
                   help="Events after this date (UTC midnight) are not inserted; default today")
    a = p.parse_args()
    as_of = datetime.combine(a.as_of, time())

    with db.connect() as conn:
        known = [c["campaign_name"] for c in db.campaigns(conn)]
        extra = crm.uncatalogued_member_campaigns(crm.cli_query, known)
        if extra:
            sys.exit(f"Email campaigns with account members missing from marketing_campaign: {extra}")
        rows, accounts = plan(conn, crm.cli_query, as_of, datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0))
        report(rows, accounts, db.covered_accounts(conn))
        n = db.insert_events(conn, rows, dry_run=a.dry_run)
    print(f"\n{'Would insert' if a.dry_run else 'Inserted'} {n:,} new rows; existing rows untouched.")
