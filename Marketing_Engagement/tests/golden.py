"""Golden hash of the event funnel, captured from the pre-refactor backfill.py.

    python tests/golden.py    # writes tests/golden_events.txt (run once, before the refactor)
"""
import hashlib
import os
import sys
from datetime import date, datetime, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

AS_OF = datetime(2026, 10, 15)
LOADED = datetime(2026, 10, 15, 12)


def synthetic_sends(n=3000):
    sends = []
    for i in range(n):
        start = date(2026, 1, 5) + timedelta(days=i % 280)
        member = i % 3 == 0
        sends.append({
            "send_id": hashlib.md5(f"golden|{i}".encode()).hexdigest(),
            "campaign_id": f"701GOLDEN{i % 7:09d}", "campaign_name": f"Golden {i % 7}",
            "audience_source": "Campaign Member" if member else "Segment",
            "campaign_member_id": f"00vGOLD{i:011d}" if member else None,
            "account_id": f"001GOLD{i:011d}", "contact_id": None,
            "personal_business": "Personal" if i % 2 else "Business",
            "product_name": "P", "product_category": "C",
            "start": start, "end": None if i % 11 == 0 else start + timedelta(days=10),
            "responded": (i % 4 == 0) if member else None,
        })
    return sends


def rows_hash(build_rows):
    return hashlib.md5(repr(build_rows(synthetic_sends(), AS_OF, LOADED)).encode()).hexdigest()


if __name__ == "__main__":
    import backfill
    with open(os.path.join(HERE, "golden_events.txt"), "w") as f:
        f.write(rows_hash(backfill.build_rows) + "\n")
    print("golden written")
