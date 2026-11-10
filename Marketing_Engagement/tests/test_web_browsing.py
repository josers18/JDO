import base64
import json
from datetime import datetime

import db
import feed
import web_browsing as wb
from test_feed import FakeSf


def test_plan_is_deterministic_and_earns_a_surge():
    now = datetime(2026, 11, 16, 15)
    plan = wb.week_plan(now)
    assert plan == wb.week_plan(datetime(2026, 11, 19, 3))  # same ISO week
    assert [d for d, _c, _l in plan] == [d for d, _c, _p in wb.HOUSEHOLDS]
    for (_d, _c, loads), (_d2, _c2, slugs) in zip(plan, wb.HOUSEHOLDS):
        lead = loads[0]
        assert 3 <= loads.count(lead) <= 4  # >= R6 SURGE_VIEWS
        assert set(loads) == set(slugs) and all(s in wb.PRODUCTS for s in loads)
        assert all(1 <= loads.count(s) <= 2 for s in slugs if s != lead)


def test_lead_product_rotates_by_week():
    a, b = wb.week_plan(datetime(2026, 11, 16)), wb.week_plan(datetime(2026, 11, 23))
    multi = [i for i, (_d, _c, slugs) in enumerate(wb.HOUSEHOLDS) if len(slugs) > 1]
    assert all(a[i][2][0] != b[i][2][0] for i in multi)


class FakeHttp:
    def __init__(self):
        self.calls = []

    def post(self, url, headers, data, timeout):
        self.calls.append((url, data))
        return type("R", (), {"raise_for_status": lambda self: None})()


def test_send_authenticates_each_device_then_one_beacon_per_load():
    plan = wb.week_plan(datetime(2026, 11, 16))
    http, naps = FakeHttp(), []
    n = wb.send(plan, http=http, sleep=naps.append, clock=lambda: datetime(2026, 11, 16, 15, 0, 0, 123000))
    loads = sum(len(l) for _d, _c, l in plan)
    assert n == loads and len(naps) == loads and all(x > 2 for x in naps)
    auths = [c for c in http.calls if c[0].endswith("/web/v2/authentication")]
    assert len(auths) == len(plan)
    ev = json.loads(base64.b64decode(http.calls[1][1]["event"]))["events"][0]
    assert ev["interactionName"] == "Viewed Product Detail" and ev["deviceId"] == plan[0][0]
    assert ev["sourceUrl"].endswith(f"/products/retail/{plan[0][2][0]}") and ev["dateTime"] == "2026-11-16T15:00:00.123Z"


def test_feed_runs_browsing_weekly_after_1500_utc(pg):
    fake = FakeSf()
    feed.run(pg, lambda: fake, datetime(2026, 11, 16, 14))
    assert db.last_success(pg, "web_browsing") is None
    feed.run(pg, lambda: fake, datetime(2026, 11, 16, 15))
    assert db.last_success(pg, "web_browsing") == datetime(2026, 11, 16, 15)
    feed.run(pg, lambda: fake, datetime(2026, 11, 22, 16))
    assert db.last_success(pg, "web_browsing") == datetime(2026, 11, 16, 15)
    feed.run(pg, lambda: fake, datetime(2026, 11, 23, 15))
    assert db.last_success(pg, "web_browsing") == datetime(2026, 11, 23, 15)
