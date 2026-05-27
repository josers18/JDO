# Phase 3d — Cross-DMO Segments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the persona-only filters in 5 placeholder + 10 campaign-aligned segments with real cross-DMO clauses (`related_to` rule type) and migrate the live segments via DELETE-then-POST.

**Architecture:** Two-layer change — (1) add `related_to` rule type to the YAML translator in `customer_hydration/phase5/segments.py` so it emits a DC `NestedAttribute` clause referencing a related DMO via its native AccountId-style FK; (2) extend the segment loader with a `--recreate <pattern>` flag that DELETEs then POSTs each affected segment, since PATCH on Dynamic segments returns `ENTITY_SAVE_ERROR`. A live probe of v62 relative-date semantics on `PersonLifeEvent` runs first and persists an artifact that gates whether the translator emits relative-date or frozen-anchor filters for the 90-day life-event window.

**Tech Stack:** Python 3.11, PyYAML, urllib (no external HTTP deps in the codebase), pytest. Salesforce Data Cloud REST API v60.0 / v62.0.

**Spec:** `docs/superpowers/specs/2026-05-27-phase-3d-cross-dmo-segments-design.md`

---

## File Structure

**New files:**
- `customer_hydration/phase5/segments_probe.py` — live probe for v62 relative-date semantics. Owns: throwaway segment POST/DELETE, row-count comparison, artifact persistence.
- `tests/test_segments_translator_related_to.py` — unit tests for the `related_to` rule type and its DC JSON shape.
- `tests/test_segments_translator_relative_date.py` — unit tests for relative-date emission switching on the probe artifact.
- `tests/test_segments_yaml_validation.py` — fixture-backed validation: every `related_to` in committed YAML resolves to a real DMO + field per a checked-in describe fixture.
- `tests/test_segments_loader_recreate.py` — unit tests for the `--recreate` DELETE-then-POST loop.
- `tests/fixtures/dmo_describes/ssot__FinServ_FinancialAccount__dlm.json` — minimal describe fixture (just `{"name": "...", "fields": [{"name": "AccountId__c"}, ...]}`)
- `tests/fixtures/dmo_describes/ssot__PersonLifeEvent__dlm.json` — same shape
- `tests/fixtures/dmo_describes/ssot__CampaignMember__dlm.json` — same shape
- `tests/fixtures/segment_baselines.json` — pre-recreate row counts for the 15 segments (committed; updated by live test).

**Modified files:**
- `customer_hydration/phase5/segments.py` — add `_translate_related_to`, extend `_translate_rule` dispatch, new `relative_date_after_days` / `relative_date_before_days` rule params, new `delete_segment_if_exists` helper plumbing into a `recreate=True` mode of `execute_create_segments`.
- `customer_hydration/phase5/data_cloud.py` — add `delete_segment(instance_url, access_token, *, api_name)` returning `(ok, msg)` with HTTP 404 → `(True, "404 not found, treated as idempotent success")`.
- `customer_hydration/cli.py` — extend `create-segments` subcommand with `--recreate <pattern>` flag.
- `config/segments.yaml` — rewrite the 5 placeholder + 10 campaign-aligned entries.
- `docs/segment_briefs.md` — regenerated from new YAML (auto-generated; commit alongside YAML rewrite).
- `AGENTS.md` — append Phase 3d entry to "Plans history".

---

## Pre-Task setup

- [ ] **Pre-Step 1: Confirm Python venv exists or create one**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration
test -d .venv || python3 -m venv .venv
source .venv/bin/activate
pip install -e . pytest pyyaml >/dev/null
```

- [ ] **Pre-Step 2: Confirm baseline test suite is green**

Run: `pytest tests/ -q 2>&1 | tail -5`
Expected: `787 passed`, `5 skipped` (matches Phase 4 v1.1 final state).

If any failures, stop and investigate before proceeding.

- [ ] **Pre-Step 3: Capture pre-recreate baseline row counts (live, one-shot)**

```bash
python -c "
from customer_hydration.phase5.data_cloud import get_org_session, list_segments
import urllib.request, json
url, tok = get_org_session('jdo-uqj0jr')
keys = ['retail_family_with_mortgage','retail_heloc_drawn','smb_with_sba',
        'commercial_with_treasury','wealth_recent_life_event',
        'cmp_heloc_refi_outreach','cmp_auto_loan_rate_drop',
        'cmp_premier_checking_onboarding','cmp_wealth_tax_strategy_webinar',
        'cmp_wealth_estate_planning_roundtable','cmp_sba_awareness',
        'cmp_treasury_modernization_brief','cmp_commercial_rm_roundtable',
        'cmp_multi_persona_spring_newsletter','cmp_mobile_banking_adoption']
def to_pascal(s): return ''.join(p.capitalize() for p in s.split('_'))
out = {}
for s in list_segments(url, tok):
    for k in keys:
        if s.api_name == f'{to_pascal(k)}__seg':
            out[k] = getattr(s, 'population_count', None) or getattr(s, 'memberCount', None)
import json
with open('tests/fixtures/segment_baselines.json', 'w') as f:
    json.dump(out, f, indent=2, sort_keys=True)
print(json.dumps(out, indent=2))
"
```

Expected: a JSON file with 15 keys mapping to row counts. Each count should be the persona's full size (~25K for retail/wealth, ~10K for SMB/commercial, etc.) since they all currently use `ClientCategory = <persona>`. **The post-recreate counts must be strictly less.**

Commit the baseline file:

```bash
git add tests/fixtures/segment_baselines.json
git commit -m "test(customer-hydration): capture Phase 3d pre-recreate baselines"
```

---

## Task 1: Live probe of v62 relative-date semantics

**Files:**
- Create: `customer_hydration/phase5/segments_probe.py`
- Create: `tests/test_segments_probe.py`
- Modify (later): `customer_hydration/cli.py:89-105` (add `--probe-relative-dates` flag in Task 6)

- [ ] **Step 1.1: Write the failing unit test for the probe artifact format**

```python
# tests/test_segments_probe.py
from pathlib import Path
import json
from customer_hydration.phase5.segments_probe import (
    ProbeResult, write_probe_artifact, read_probe_artifact,
    RELATIVE_DATES_OK, RELATIVE_DATES_BROKEN, RELATIVE_DATES_UNKNOWN,
)


def test_write_and_read_probe_artifact_roundtrip(tmp_path: Path):
    out = tmp_path / "probe.json"
    result = ProbeResult(
        verdict=RELATIVE_DATES_OK,
        target_dmo="ssot__PersonLifeEvent__dlm",
        field="EventDate__c",
        days=90,
        count_recent=12_345,
        count_old=67_890,
        count_recent_frozen=12_300,
        ts="2026-05-27T18:00:00Z",
    )
    write_probe_artifact(out, result)

    loaded = read_probe_artifact(out)
    assert loaded.verdict == RELATIVE_DATES_OK
    assert loaded.count_recent == 12_345
    assert loaded.count_recent_frozen == 12_300


def test_read_probe_artifact_missing_file_returns_unknown(tmp_path: Path):
    result = read_probe_artifact(tmp_path / "nope.json")
    assert result.verdict == RELATIVE_DATES_UNKNOWN
```

- [ ] **Step 1.2: Run test to verify it fails**

Run: `pytest tests/test_segments_probe.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'customer_hydration.phase5.segments_probe'`

- [ ] **Step 1.3: Create `segments_probe.py` skeleton with constants + dataclass + IO**

```python
# customer_hydration/phase5/segments_probe.py
"""Live probe of v62 relative-date filter semantics on Profile-category DMOs.

Phase 2 docs (config/segments.yaml header) note that
ExactlyRelativeDateComparison was broken on Profile DMOs as of 2026-05-25.
Phase 3d's wealth_recent_life_event segment needs a 90-day window on
ssot__PersonLifeEvent__dlm; rather than assume the bug persists, this
module probes live and persists a verdict that gates which translator
branch the YAML loader uses.

If the probe is unavailable (auth fail, network, etc.), the verdict is
RELATIVE_DATES_UNKNOWN and the translator falls back to frozen anchors.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Optional

RELATIVE_DATES_OK = "RELATIVE_DATES_OK"
RELATIVE_DATES_BROKEN = "RELATIVE_DATES_BROKEN"
RELATIVE_DATES_UNKNOWN = "RELATIVE_DATES_UNKNOWN"


@dataclass
class ProbeResult:
    verdict: str
    target_dmo: str
    field: str
    days: int
    count_recent: Optional[int] = None
    count_old: Optional[int] = None
    count_recent_frozen: Optional[int] = None
    ts: Optional[str] = None
    error: Optional[str] = None


def write_probe_artifact(path: Path, result: ProbeResult) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(asdict(result), indent=2, sort_keys=True))


def read_probe_artifact(path: Path) -> ProbeResult:
    if not path.exists():
        return ProbeResult(
            verdict=RELATIVE_DATES_UNKNOWN,
            target_dmo="",
            field="",
            days=0,
        )
    data = json.loads(path.read_text())
    return ProbeResult(**data)
```

- [ ] **Step 1.4: Run test to verify it passes**

Run: `pytest tests/test_segments_probe.py -v`
Expected: 2 PASSED.

- [ ] **Step 1.5: Add the probe runner function (with mock-friendly seam)**

Append to `customer_hydration/phase5/segments_probe.py`:

```python
from datetime import datetime, timedelta, timezone


def probe_relative_date_filter(
    instance_url: str,
    access_token: str,
    *,
    target_dmo: str = "ssot__PersonLifeEvent__dlm",
    field: str = "EventDate__c",
    days: int = 90,
    create_segment_fn=None,
    delete_segment_fn=None,
    get_status_fn=None,
) -> ProbeResult:
    """Run the three-segment probe and return a verdict.

    `create_segment_fn`, `delete_segment_fn`, `get_status_fn` are injectable
    seams so tests can mock the live API. When None, defaults route to
    customer_hydration.phase5.data_cloud.{create_segment, delete_segment,
    get_segment_status}.
    """
    if create_segment_fn is None:
        from customer_hydration.phase5.data_cloud import create_segment
        create_segment_fn = create_segment
    if delete_segment_fn is None:
        from customer_hydration.phase5.data_cloud import delete_segment
        delete_segment_fn = delete_segment
    if get_status_fn is None:
        from customer_hydration.phase5.data_cloud import get_segment_status
        get_status_fn = get_segment_status

    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    anchor = (datetime.now(timezone.utc) - timedelta(days=days)).date().isoformat()

    probes = {
        "after":   _probe_segment_def(target_dmo, field, "after",  -days),
        "before":  _probe_segment_def(target_dmo, field, "before", -days),
        "frozen":  _probe_segment_def_frozen(target_dmo, field, anchor),
    }
    api_names: dict[str, str] = {}
    counts: dict[str, Optional[int]] = {}
    error: Optional[str] = None

    try:
        for tag, defn in probes.items():
            developer = f"PROBE_RELDATE_{tag.upper()}_{ts}"
            ok, info = create_segment_fn(
                instance_url, access_token,
                developer_name=developer,
                display_name=f"Probe RelDate {tag} {ts}",
                description="Phase 3d probe — safe to delete",
                segment_on_api_name="ssot__Account__dlm",
                include_criteria=defn,
            )
            if not ok:
                raise RuntimeError(f"create probe {tag}: {info}")
            api_names[tag] = info or f"{developer}__seg"
            counts[tag] = get_status_fn(instance_url, access_token, api_name=api_names[tag])
    except Exception as exc:
        error = str(exc)
    finally:
        for api_name in api_names.values():
            try:
                delete_segment_fn(instance_url, access_token, api_name=api_name)
            except Exception:
                pass

    if error is not None:
        return ProbeResult(
            verdict=RELATIVE_DATES_UNKNOWN, target_dmo=target_dmo, field=field,
            days=days, ts=ts, error=error,
        )

    a, b, c = counts.get("after"), counts.get("before"), counts.get("frozen")
    if None in (a, b, c):
        verdict = RELATIVE_DATES_UNKNOWN
    elif a is not None and c is not None and abs(a - c) <= max(5, c // 100) and a < (b or 0):
        verdict = RELATIVE_DATES_OK
    else:
        verdict = RELATIVE_DATES_BROKEN

    return ProbeResult(
        verdict=verdict, target_dmo=target_dmo, field=field, days=days,
        count_recent=a, count_old=b, count_recent_frozen=c, ts=ts,
    )


def _probe_segment_def(target_dmo: str, field: str, op: str, value: int) -> dict:
    return {
        "type": "LogicalComparison", "operator": "and",
        "filters": [
            {
                "type": "TextComparison",
                "subject": {"objectApiName": "ssot__Account__dlm",
                            "fieldApiName": "External_ID_c__c"},
                "operator": "contains", "values": ["HYDRATE-"],
            },
            {
                "type": "ExactlyRelativeDateComparison",
                "subject": {"objectApiName": target_dmo, "fieldApiName": field},
                "operator": op, "dateUnits": "days", "value": value,
            },
        ],
    }


def _probe_segment_def_frozen(target_dmo: str, field: str, anchor_iso: str) -> dict:
    return {
        "type": "LogicalComparison", "operator": "and",
        "filters": [
            {
                "type": "TextComparison",
                "subject": {"objectApiName": "ssot__Account__dlm",
                            "fieldApiName": "External_ID_c__c"},
                "operator": "contains", "values": ["HYDRATE-"],
            },
            {
                "type": "DateComparison",
                "subject": {"objectApiName": target_dmo, "fieldApiName": field},
                "operator": "after", "value": [anchor_iso],
            },
        ],
    }
```

- [ ] **Step 1.6: Add unit tests with mocked seams (no live calls)**

Append to `tests/test_segments_probe.py`:

```python
def test_probe_returns_ok_when_recent_matches_frozen_and_less_than_old():
    create_calls = []

    def fake_create(instance_url, access_token, **kwargs):
        create_calls.append(kwargs["developer_name"])
        return True, kwargs["developer_name"] + "__seg"

    counts_by_tag = {"AFTER": 12_345, "BEFORE": 67_890, "FROZEN": 12_300}

    def fake_status(instance_url, access_token, *, api_name):
        for tag, c in counts_by_tag.items():
            if tag in api_name:
                return c
        return None

    def fake_delete(instance_url, access_token, *, api_name):
        return True, "deleted"

    from customer_hydration.phase5.segments_probe import (
        probe_relative_date_filter, RELATIVE_DATES_OK,
    )
    res = probe_relative_date_filter(
        "https://x", "tok",
        create_segment_fn=fake_create,
        delete_segment_fn=fake_delete,
        get_status_fn=fake_status,
    )
    assert res.verdict == RELATIVE_DATES_OK
    assert res.count_recent == 12_345
    assert len(create_calls) == 3


def test_probe_returns_broken_when_recent_equals_old():
    counts_by_tag = {"AFTER": 410, "BEFORE": 410, "FROZEN": 410}
    def fake_create(iu, t, **kwargs): return True, kwargs["developer_name"] + "__seg"
    def fake_status(iu, t, *, api_name):
        for tag, c in counts_by_tag.items():
            if tag in api_name:
                return c
        return None
    def fake_delete(iu, t, *, api_name): return True, "deleted"

    from customer_hydration.phase5.segments_probe import (
        probe_relative_date_filter, RELATIVE_DATES_BROKEN,
    )
    res = probe_relative_date_filter(
        "https://x", "tok",
        create_segment_fn=fake_create,
        delete_segment_fn=fake_delete,
        get_status_fn=fake_status,
    )
    assert res.verdict == RELATIVE_DATES_BROKEN


def test_probe_returns_unknown_when_create_fails():
    def fake_create(iu, t, **kwargs): return False, "boom"
    def fake_status(iu, t, *, api_name): return None
    def fake_delete(iu, t, *, api_name): return True, "deleted"

    from customer_hydration.phase5.segments_probe import (
        probe_relative_date_filter, RELATIVE_DATES_UNKNOWN,
    )
    res = probe_relative_date_filter(
        "https://x", "tok",
        create_segment_fn=fake_create,
        delete_segment_fn=fake_delete,
        get_status_fn=fake_status,
    )
    assert res.verdict == RELATIVE_DATES_UNKNOWN
    assert res.error and "boom" in res.error
```

- [ ] **Step 1.7: Run all probe tests; expect 5 PASSED**

Run: `pytest tests/test_segments_probe.py -v`
Expected: 5 PASSED.

- [ ] **Step 1.8: Commit Task 1**

```bash
git add customer_hydration/phase5/segments_probe.py tests/test_segments_probe.py
git commit -m "feat(customer-hydration): live probe for v62 relative-date semantics on Profile DMOs"
```

---

## Task 2: `delete_segment` helper in data_cloud.py

**Files:**
- Modify: `customer_hydration/phase5/data_cloud.py:545-552` (add after the patch_segment removal note)
- Test: `tests/test_segments_data_cloud_delete.py`

- [ ] **Step 2.1: Write the failing test**

```python
# tests/test_segments_data_cloud_delete.py
from unittest.mock import patch, MagicMock
from urllib.error import HTTPError
from io import BytesIO


def test_delete_segment_returns_true_on_204():
    with patch("urllib.request.urlopen") as urlopen:
        cm = MagicMock()
        cm.__enter__.return_value.read.return_value = b""
        cm.__enter__.return_value.status = 204
        urlopen.return_value = cm

        from customer_hydration.phase5.data_cloud import delete_segment
        ok, msg = delete_segment("https://x", "tok", api_name="WealthAll__seg")
        assert ok is True
        assert "WealthAll__seg" in msg or "deleted" in msg.lower()


def test_delete_segment_returns_true_on_404():
    err = HTTPError(
        url="https://x/services/data/v60.0/ssot/segments/WealthAll__seg",
        code=404, msg="Not Found", hdrs=None, fp=BytesIO(b'{"error":"not found"}'),
    )
    with patch("urllib.request.urlopen", side_effect=err):
        from customer_hydration.phase5.data_cloud import delete_segment
        ok, msg = delete_segment("https://x", "tok", api_name="WealthAll__seg")
        assert ok is True
        assert "404" in msg


def test_delete_segment_returns_false_on_403():
    err = HTTPError(
        url="https://x/services/data/v60.0/ssot/segments/WealthAll__seg",
        code=403, msg="Forbidden", hdrs=None, fp=BytesIO(b'{"error":"perm"}'),
    )
    with patch("urllib.request.urlopen", side_effect=err):
        from customer_hydration.phase5.data_cloud import delete_segment
        ok, msg = delete_segment("https://x", "tok", api_name="WealthAll__seg")
        assert ok is False
        assert "403" in msg
```

- [ ] **Step 2.2: Run test to verify it fails**

Run: `pytest tests/test_segments_data_cloud_delete.py -v`
Expected: FAIL with `ImportError: cannot import name 'delete_segment'`.

- [ ] **Step 2.3: Add `delete_segment` to `data_cloud.py`**

Insert the following function in `customer_hydration/phase5/data_cloud.py` immediately after the `patch_segment was removed` comment block (around line 552):

```python
def delete_segment(
    instance_url: str,
    access_token: str,
    *,
    api_name: str,
    api_version: str = "v60.0",
) -> tuple[bool, str]:
    """Delete a segment via DELETE /services/data/{v}/ssot/segments/{api_name}.

    HTTP 404 is treated as idempotent success (segment already gone).
    All other 4xx/5xx return (False, "<status> <body[:200]>"). Never raises.
    """
    import urllib.request
    from urllib.error import HTTPError, URLError
    url = f"{instance_url}/services/data/{api_version}/ssot/segments/{api_name}"
    req = urllib.request.Request(url, method="DELETE", headers={
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            _ = resp.read()
        return (True, f"deleted {api_name}")
    except HTTPError as exc:
        try:
            err_body = exc.fp.read().decode("utf-8") if exc.fp else ""
        except Exception:
            err_body = ""
        if exc.code == 404:
            return (True, f"HTTP 404 (already gone) {api_name}")
        return (False, f"HTTP {exc.code} {exc.reason}: {err_body[:200]}")
    except (URLError, json.JSONDecodeError) as exc:
        return (False, str(exc))
```

- [ ] **Step 2.4: Run test to verify it passes**

Run: `pytest tests/test_segments_data_cloud_delete.py -v`
Expected: 3 PASSED.

- [ ] **Step 2.5: Commit Task 2**

```bash
git add customer_hydration/phase5/data_cloud.py tests/test_segments_data_cloud_delete.py
git commit -m "feat(customer-hydration): delete_segment helper with 404-idempotent semantics"
```

---

## Task 3: `related_to` rule type in the translator

**Files:**
- Modify: `customer_hydration/phase5/segments.py:266-381` (extend `_translate_rule`)
- Test: `tests/test_segments_translator_related_to.py`

- [ ] **Step 3.1: Write failing test for atomic `related_to`**

```python
# tests/test_segments_translator_related_to.py
from pathlib import Path
import pytest
from customer_hydration.phase5.segments import load_segment_definitions


def _write(tmp_path: Path, body: str) -> Path:
    p = tmp_path / "segments.yaml"
    p.write_text(body)
    return p


def test_related_to_translates_to_nested_attribute(tmp_path: Path):
    yaml_path = _write(tmp_path, """\
segments:
  retail_with_mortgage:
    name: "Retail with Mortgage"
    description: "x"
    persona: retail
    publish_schedule: daily
    target_dmo: ssot__Account__dlm
    rule:
      type: related_to
      dmo: ssot__FinServ_FinancialAccount__dlm
      via: AccountId__c
      where:
        type: text_equals
        field: FinServ_AccountType_c__c
        value: "Mortgage"
""")
    defs = load_segment_definitions(yaml_path)
    user = defs[0].include_criteria["filters"][1]

    assert user["type"] == "NestedAttribute"
    assert user["primaryObjectApiName"] == "ssot__Account__dlm"
    assert user["primaryFieldApiName"] == "Id"
    assert user["relatedObjectApiName"] == "ssot__FinServ_FinancialAccount__dlm"
    assert user["relatedFieldApiName"] == "AccountId__c"
    inner = user["filter"]
    assert inner["type"] == "TextComparison"
    assert inner["operator"] == "matches"
    assert inner["values"] == ["Mortgage"]
    assert inner["subject"] == {
        "objectApiName": "ssot__FinServ_FinancialAccount__dlm",
        "fieldApiName": "FinServ_AccountType_c__c",
    }


def test_related_to_with_compound_where_translates(tmp_path: Path):
    yaml_path = _write(tmp_path, """\
segments:
  retail_heloc_drawn:
    name: "HELOC drawn"
    description: "x"
    persona: retail
    publish_schedule: daily
    target_dmo: ssot__Account__dlm
    rule:
      type: all_of
      rules:
        - type: text_equals
          field: FinServ_ClientCategory_c__c
          value: "Retail"
        - type: related_to
          dmo: ssot__FinServ_FinancialAccount__dlm
          via: AccountId__c
          where:
            type: all_of
            rules:
              - type: text_equals
                field: FinServ_AccountType_c__c
                value: "HELOC"
              - type: number_gte
                field: Drawn_Ratio_c__c
                value: 0.5
""")
    defs = load_segment_definitions(yaml_path)
    user = defs[0].include_criteria["filters"][1]
    assert user["type"] == "LogicalComparison"
    assert user["operator"] == "and"
    persona_filter = user["filters"][0]
    related_filter = user["filters"][1]
    assert persona_filter["type"] == "TextComparison"
    assert related_filter["type"] == "NestedAttribute"
    inner = related_filter["filter"]
    assert inner["type"] == "LogicalComparison"
    assert inner["filters"][0]["subject"]["objectApiName"] == \
        "ssot__FinServ_FinancialAccount__dlm"
    assert inner["filters"][1]["operator"] == "greater than or equal"


def test_nested_related_to_inside_related_to_is_rejected(tmp_path: Path):
    yaml_path = _write(tmp_path, """\
segments:
  bad_nested:
    name: "x"
    description: "x"
    persona: retail
    publish_schedule: manual
    target_dmo: ssot__Account__dlm
    rule:
      type: related_to
      dmo: ssot__FinServ_FinancialAccount__dlm
      where:
        type: related_to
        dmo: ssot__OtherDMO__dlm
        where:
          type: text_equals
          field: x
          value: y
""")
    with pytest.raises(ValueError, match="nested related_to"):
        load_segment_definitions(yaml_path)


def test_related_to_default_via_is_AccountId(tmp_path: Path):
    yaml_path = _write(tmp_path, """\
segments:
  default_via:
    name: "x"
    description: "x"
    persona: wealth
    publish_schedule: daily
    target_dmo: ssot__Account__dlm
    rule:
      type: related_to
      dmo: ssot__PersonLifeEvent__dlm
      where:
        type: text_has_value
        field: EventDate__c
""")
    defs = load_segment_definitions(yaml_path)
    user = defs[0].include_criteria["filters"][1]
    assert user["relatedFieldApiName"] == "AccountId__c"
```

- [ ] **Step 3.2: Run tests to verify they fail**

Run: `pytest tests/test_segments_translator_related_to.py -v`
Expected: 4 FAIL with `unsupported rule type 'related_to'`.

- [ ] **Step 3.3: Extend `_translate_rule` in `segments.py` to handle `related_to`**

In `customer_hydration/phase5/segments.py`, replace the `raise ValueError(...)` at the end of `_translate_rule` (currently around line 376-381) with a `related_to` branch followed by the existing raise. The simplest patch: insert this block right BEFORE the final `raise ValueError(...)` line:

```python
    if rule_type == "related_to":
        related_dmo = rule.get("dmo")
        if not related_dmo:
            raise ValueError(
                f"Segment {config_key!r}.rule.dmo is required for type related_to"
            )
        via = rule.get("via", "AccountId__c")
        where = rule.get("where")
        if not isinstance(where, dict):
            raise ValueError(
                f"Segment {config_key!r}.rule.where must be a mapping for type related_to"
            )
        if where.get("type") == "related_to":
            raise ValueError(
                f"Segment {config_key!r}: nested related_to inside related_to "
                f"is not supported (v62 NestedAttribute does not compose)."
            )
        # Recurse with target_dmo set to the related DMO so inner field
        # references resolve there, not on the outer Account DMO.
        inner = _translate_rule(where, related_dmo, config_key)
        return {
            "type": "NestedAttribute",
            "primaryObjectApiName": target_dmo,
            "primaryFieldApiName": "Id",
            "relatedObjectApiName": related_dmo,
            "relatedFieldApiName": via,
            "filter": inner,
        }
```

- [ ] **Step 3.4: Update the `raise ValueError(...)` "Supported:" list**

In the same function's terminal `raise ValueError(...)`, append `, related_to` to the supported types list so the error message stays accurate.

- [ ] **Step 3.5: Run tests to verify they pass**

Run: `pytest tests/test_segments_translator_related_to.py -v`
Expected: 4 PASSED.

- [ ] **Step 3.6: Run the full segments translator test suite to confirm no regressions**

Run: `pytest tests/test_segments_orchestration.py -v 2>&1 | tail -20`
Expected: same number of pre-existing tests passing as before (likely ~50+).

- [ ] **Step 3.7: Commit Task 3**

```bash
git add customer_hydration/phase5/segments.py tests/test_segments_translator_related_to.py
git commit -m "feat(customer-hydration): related_to rule type emits NestedAttribute"
```

---

## Task 4: Probe-gated relative-date emission

**Files:**
- Modify: `customer_hydration/phase5/segments.py:266-381` (extend `_translate_rule` for `relative_date_after_days`)
- Test: `tests/test_segments_translator_relative_date.py`

- [ ] **Step 4.1: Write failing tests for both branches**

```python
# tests/test_segments_translator_relative_date.py
from pathlib import Path
import pytest
from customer_hydration.phase5.segments import load_segment_definitions
from customer_hydration.phase5.segments_probe import (
    ProbeResult, write_probe_artifact,
    RELATIVE_DATES_OK, RELATIVE_DATES_BROKEN,
)


def _write_yaml(tmp_path: Path) -> Path:
    p = tmp_path / "segments.yaml"
    p.write_text("""\
segments:
  recent:
    name: "Recent"
    description: "x"
    persona: wealth
    publish_schedule: daily
    target_dmo: ssot__PersonLifeEvent__dlm
    rule:
      type: relative_date_after_days
      field: EventDate__c
      days: 90
""")
    return p


def test_relative_date_emits_relative_when_probe_ok(tmp_path: Path, monkeypatch):
    probe_path = tmp_path / "probe.json"
    write_probe_artifact(probe_path, ProbeResult(
        verdict=RELATIVE_DATES_OK,
        target_dmo="ssot__PersonLifeEvent__dlm",
        field="EventDate__c", days=90,
    ))
    monkeypatch.setenv("PHASE3D_PROBE_ARTIFACT", str(probe_path))

    yaml_path = _write_yaml(tmp_path)
    defs = load_segment_definitions(yaml_path)
    user = defs[0].include_criteria["filters"][1]
    assert user["type"] == "ExactlyRelativeDateComparison"
    assert user["operator"] == "after"
    assert user["dateUnits"] == "days"
    assert user["value"] == -90


def test_relative_date_emits_frozen_anchor_when_probe_broken(tmp_path: Path, monkeypatch):
    probe_path = tmp_path / "probe.json"
    write_probe_artifact(probe_path, ProbeResult(
        verdict=RELATIVE_DATES_BROKEN,
        target_dmo="ssot__PersonLifeEvent__dlm",
        field="EventDate__c", days=90,
    ))
    monkeypatch.setenv("PHASE3D_PROBE_ARTIFACT", str(probe_path))

    yaml_path = _write_yaml(tmp_path)
    defs = load_segment_definitions(yaml_path)
    user = defs[0].include_criteria["filters"][1]
    assert user["type"] == "DateComparison"
    assert user["operator"] == "after"
    # Frozen anchor: ISO date 90 days ago. We don't pin the exact date —
    # just verify the form is YYYY-MM-DD and that there's exactly one value.
    import re
    assert isinstance(user["value"], list) and len(user["value"]) == 1
    assert re.match(r"^\d{4}-\d{2}-\d{2}$", user["value"][0])


def test_relative_date_emits_frozen_when_no_probe_artifact(tmp_path: Path, monkeypatch):
    monkeypatch.delenv("PHASE3D_PROBE_ARTIFACT", raising=False)
    yaml_path = _write_yaml(tmp_path)
    defs = load_segment_definitions(yaml_path)
    user = defs[0].include_criteria["filters"][1]
    # Default (no artifact => UNKNOWN) falls through to frozen anchor.
    assert user["type"] == "DateComparison"
```

- [ ] **Step 4.2: Run tests to verify they fail**

Run: `pytest tests/test_segments_translator_relative_date.py -v`
Expected: 3 FAIL with `unsupported rule type 'relative_date_after_days'`.

- [ ] **Step 4.3: Add the `relative_date_after_days` / `relative_date_before_days` branch**

In `customer_hydration/phase5/segments.py`, insert this block before the final `raise ValueError(...)` in `_translate_rule` (after the `related_to` block from Task 3):

```python
    if rule_type in ("relative_date_after_days", "relative_date_before_days"):
        days = int(rule["days"])
        if rule_type == "relative_date_after_days":
            relative_op, frozen_op, frozen_delta = "after", "after", -days
        else:
            relative_op, frozen_op, frozen_delta = "before", "before", -days

        verdict = _read_probe_verdict()
        if verdict == "RELATIVE_DATES_OK":
            return _relative_date_comparison(target_dmo, field, relative_op, -days, units="days")
        # Fall through to frozen anchor for BROKEN / UNKNOWN
        from datetime import datetime, timedelta, timezone
        anchor_iso = (datetime.now(timezone.utc) + timedelta(days=frozen_delta)).date().isoformat()
        return _datetime_comparison(target_dmo, field, frozen_op, [anchor_iso])
```

- [ ] **Step 4.4: Add the `_read_probe_verdict` helper module-level**

Above `_translate_rule` (or just below the imports) in `segments.py`:

```python
def _read_probe_verdict() -> str:
    """Read probe verdict from PHASE3D_PROBE_ARTIFACT env var, defaulting
    to RELATIVE_DATES_UNKNOWN. The env var indirection keeps the
    translator pure (no I/O on every call) while letting orchestration
    point at a fresh artifact."""
    import os
    from pathlib import Path
    from customer_hydration.phase5.segments_probe import (
        read_probe_artifact, RELATIVE_DATES_UNKNOWN,
    )
    artifact = os.environ.get("PHASE3D_PROBE_ARTIFACT")
    if not artifact:
        return RELATIVE_DATES_UNKNOWN
    return read_probe_artifact(Path(artifact)).verdict
```

- [ ] **Step 4.5: Update the supported-types list in the terminal `raise ValueError(...)`**

Append `, relative_date_after_days, relative_date_before_days` to the message string.

- [ ] **Step 4.6: Run tests to verify they pass**

Run: `pytest tests/test_segments_translator_relative_date.py -v`
Expected: 3 PASSED.

- [ ] **Step 4.7: Run full translator test suite to confirm no regressions**

Run: `pytest tests/test_segments_orchestration.py tests/test_segments_translator_related_to.py tests/test_segments_translator_relative_date.py -q 2>&1 | tail -5`
Expected: all PASSED, no regressions.

- [ ] **Step 4.8: Commit Task 4**

```bash
git add customer_hydration/phase5/segments.py tests/test_segments_translator_relative_date.py
git commit -m "feat(customer-hydration): probe-gated relative-date filters with frozen-anchor fallback"
```

---

## Task 5: Loader `--recreate` mode + `execute_recreate_segments`

**Files:**
- Modify: `customer_hydration/phase5/segments.py:427-509` (add `recreate` keyword to `execute_create_segments` OR add new `execute_recreate_segments` function)
- Test: `tests/test_segments_loader_recreate.py`

The cleaner choice is a new function `execute_recreate_segments` — single-responsibility, no flag-flipped behavior buried in `execute_create_segments`.

- [ ] **Step 5.1: Write failing tests for `execute_recreate_segments`**

```python
# tests/test_segments_loader_recreate.py
from pathlib import Path
from unittest.mock import patch, MagicMock
from customer_hydration.phase5.segments import execute_recreate_segments


def _yaml(tmp_path: Path, body: str) -> Path:
    p = tmp_path / "segments.yaml"
    p.write_text(body)
    return p


def test_recreate_deletes_then_creates_each_match(tmp_path: Path):
    yaml_path = _yaml(tmp_path, """\
segments:
  retail_all:
    name: "Retail Customers"
    description: "x"
    persona: retail
    publish_schedule: hourly
    target_dmo: ssot__Account__dlm
    rule:
      type: text_equals
      field: FinServ_ClientCategory_c__c
      value: "Retail"
""")
    with patch("customer_hydration.phase5.segments.get_org_session",
               return_value=("https://x", "tok")), \
         patch("customer_hydration.phase5.segments.list_segments",
               return_value=[MagicMock(api_name="RetailAll__seg")]), \
         patch("customer_hydration.phase5.segments.delete_segment",
               return_value=(True, "deleted RetailAll__seg")) as p_del, \
         patch("customer_hydration.phase5.segments.create_segment",
               return_value=(True, "RetailAll__seg")) as p_create:
        result = execute_recreate_segments(
            target_org="jdo-uqj0jr", yaml_path=yaml_path, pattern="*",
        )

    assert result.segments_processed == 1
    assert result.segments_recreated == 1
    assert result.segments_failed == 0
    assert p_del.call_count == 1
    assert p_create.call_count == 1


def test_recreate_treats_404_as_idempotent(tmp_path: Path):
    yaml_path = _yaml(tmp_path, """\
segments:
  retail_all:
    name: "Retail Customers"
    description: "x"
    persona: retail
    publish_schedule: hourly
    target_dmo: ssot__Account__dlm
    rule:
      type: text_equals
      field: FinServ_ClientCategory_c__c
      value: "Retail"
""")
    with patch("customer_hydration.phase5.segments.get_org_session",
               return_value=("https://x", "tok")), \
         patch("customer_hydration.phase5.segments.list_segments",
               return_value=[]), \
         patch("customer_hydration.phase5.segments.delete_segment",
               return_value=(True, "HTTP 404 (already gone)")) as p_del, \
         patch("customer_hydration.phase5.segments.create_segment",
               return_value=(True, "RetailAll__seg")) as p_create:
        result = execute_recreate_segments(
            target_org="jdo-uqj0jr", yaml_path=yaml_path, pattern="*",
        )

    assert result.segments_recreated == 1
    assert p_del.call_count == 1
    assert p_create.call_count == 1


def test_recreate_aborts_create_when_delete_fails_4xx(tmp_path: Path):
    yaml_path = _yaml(tmp_path, """\
segments:
  retail_all:
    name: "Retail Customers"
    description: "x"
    persona: retail
    publish_schedule: hourly
    target_dmo: ssot__Account__dlm
    rule:
      type: text_equals
      field: FinServ_ClientCategory_c__c
      value: "Retail"
""")
    with patch("customer_hydration.phase5.segments.get_org_session",
               return_value=("https://x", "tok")), \
         patch("customer_hydration.phase5.segments.list_segments",
               return_value=[MagicMock(api_name="RetailAll__seg")]), \
         patch("customer_hydration.phase5.segments.delete_segment",
               return_value=(False, "HTTP 403 Forbidden")), \
         patch("customer_hydration.phase5.segments.create_segment") as p_create:
        result = execute_recreate_segments(
            target_org="jdo-uqj0jr", yaml_path=yaml_path, pattern="*",
        )

    assert result.segments_failed == 1
    assert result.segments_recreated == 0
    assert p_create.call_count == 0
    assert "403" in (result.results[0].error or "")


def test_recreate_filters_by_pattern(tmp_path: Path):
    yaml_path = _yaml(tmp_path, """\
segments:
  retail_all:
    name: "Retail Customers"
    description: "x"
    persona: retail
    publish_schedule: hourly
    target_dmo: ssot__Account__dlm
    rule:
      type: text_equals
      field: FinServ_ClientCategory_c__c
      value: "Retail"
  cmp_one:
    name: "Cmp"
    description: "x"
    persona: retail
    publish_schedule: daily
    target_dmo: ssot__Account__dlm
    rule:
      type: text_equals
      field: FinServ_ClientCategory_c__c
      value: "Retail"
""")
    with patch("customer_hydration.phase5.segments.get_org_session",
               return_value=("https://x", "tok")), \
         patch("customer_hydration.phase5.segments.list_segments",
               return_value=[]), \
         patch("customer_hydration.phase5.segments.delete_segment",
               return_value=(True, "HTTP 404")), \
         patch("customer_hydration.phase5.segments.create_segment",
               return_value=(True, "ok")) as p_create:
        result = execute_recreate_segments(
            target_org="jdo-uqj0jr", yaml_path=yaml_path, pattern="cmp_*",
        )

    assert result.segments_processed == 1
    assert p_create.call_count == 1
    # Only the cmp_one segment should have been touched.
    assert result.results[0].config_key == "cmp_one"
```

- [ ] **Step 5.2: Run tests to verify they fail**

Run: `pytest tests/test_segments_loader_recreate.py -v`
Expected: 4 FAIL with `ImportError: cannot import name 'execute_recreate_segments'`.

- [ ] **Step 5.3: Add `execute_recreate_segments` to `segments.py`**

Append after `execute_create_segments` in `customer_hydration/phase5/segments.py`:

```python
@dataclass
class SegmentRecreateResult:
    config_key: str
    api_name: str
    deleted: bool = False
    created: bool = False
    error: Optional[str] = None


@dataclass
class RecreateSegmentsResult:
    segments_processed: int = 0
    segments_recreated: int = 0
    segments_failed: int = 0
    results: list[SegmentRecreateResult] = field(default_factory=list)


def _matches_pattern(config_key: str, pattern: str) -> bool:
    """Glob-style match: '*' matches all, 'cmp_*' matches prefix, exact otherwise."""
    import fnmatch
    return fnmatch.fnmatchcase(config_key, pattern)


def execute_recreate_segments(
    *,
    target_org: str,
    yaml_path: Path,
    pattern: str,
    dry_run: bool = False,
) -> RecreateSegmentsResult:
    """DELETE-then-POST migration for segments matching `pattern`.

    Used to push new YAML rules onto an existing live segment, since
    PATCH on Dynamic segments returns ENTITY_SAVE_ERROR.

    Per-segment failures are recorded; this function never raises.
    """
    from customer_hydration.phase5.data_cloud import delete_segment

    definitions = [d for d in load_segment_definitions(yaml_path)
                   if _matches_pattern(d.config_key, pattern)]
    result = RecreateSegmentsResult(segments_processed=len(definitions))

    if dry_run:
        for d in definitions:
            result.results.append(SegmentRecreateResult(
                config_key=d.config_key, api_name=d.api_name,
            ))
            print(f"  DRY-RUN would DELETE+POST {d.api_name} ({d.display_name})")
        return result

    if not definitions:
        return result

    try:
        instance_url, access_token = get_org_session(target_org)
    except Exception as exc:
        for d in definitions:
            result.results.append(SegmentRecreateResult(
                config_key=d.config_key, api_name=d.api_name,
                error=f"get_org_session failed: {exc}",
            ))
            result.segments_failed += 1
        return result

    existing = {s.api_name for s in list_segments(instance_url, access_token)}

    for d in definitions:
        r = SegmentRecreateResult(config_key=d.config_key, api_name=d.api_name)

        # DELETE phase — only if segment is known to exist.
        if d.api_name in existing:
            ok, info = delete_segment(
                instance_url, access_token, api_name=d.api_name,
            )
            if not ok:
                r.error = info
                result.segments_failed += 1
                result.results.append(r)
                continue
            r.deleted = True
        # else: not present in `existing`, skip DELETE entirely.

        # POST phase
        ok, info = create_segment(
            instance_url, access_token,
            developer_name=d.developer_name,
            display_name=d.display_name,
            description=d.description,
            segment_on_api_name=d.target_dmo,
            include_criteria=d.include_criteria,
            publish_schedule="NoRefresh",
        )
        if ok:
            r.created = True
            result.segments_recreated += 1
        else:
            r.error = info
            result.segments_failed += 1
        result.results.append(r)

    return result
```

- [ ] **Step 5.4: Run tests to verify they pass**

Run: `pytest tests/test_segments_loader_recreate.py -v`
Expected: 4 PASSED.

- [ ] **Step 5.5: Commit Task 5**

```bash
git add customer_hydration/phase5/segments.py tests/test_segments_loader_recreate.py
git commit -m "feat(customer-hydration): execute_recreate_segments DELETE-then-POST migration"
```

---

## Task 6: Wire `--recreate` and `--probe-relative-dates` into the CLI

**Files:**
- Modify: `customer_hydration/cli.py:89-105`, and the dispatch around line 220.
- Test: `tests/test_cli_create_segments_recreate.py`

- [ ] **Step 6.1: Write failing test for the CLI dispatch**

```python
# tests/test_cli_create_segments_recreate.py
import sys
from unittest.mock import patch
from customer_hydration.cli import main


def test_cli_create_segments_recreate_pattern_routes_to_recreate(monkeypatch):
    argv = ["hydrate.py", "create-segments", "--target-org", "jdo-uqj0jr",
            "--recreate", "cmp_*"]
    monkeypatch.setattr(sys, "argv", argv)

    with patch("customer_hydration.cli.execute_recreate_segments") as p_recreate, \
         patch("customer_hydration.cli.execute_create_segments") as p_create:
        from customer_hydration.phase5.segments import RecreateSegmentsResult
        p_recreate.return_value = RecreateSegmentsResult()
        rc = main()

    assert p_recreate.call_count == 1
    kwargs = p_recreate.call_args.kwargs
    assert kwargs["pattern"] == "cmp_*"
    assert kwargs["target_org"] == "jdo-uqj0jr"
    assert p_create.call_count == 0
    assert rc == 0


def test_cli_probe_relative_dates_runs_probe_and_writes_artifact(tmp_path, monkeypatch):
    argv = ["hydrate.py", "create-segments", "--target-org", "jdo-uqj0jr",
            "--probe-relative-dates",
            "--probe-artifact", str(tmp_path / "probe.json")]
    monkeypatch.setattr(sys, "argv", argv)

    from customer_hydration.phase5.segments_probe import (
        ProbeResult, RELATIVE_DATES_OK,
    )
    with patch("customer_hydration.cli.get_org_session",
               return_value=("https://x", "tok")), \
         patch("customer_hydration.cli.probe_relative_date_filter",
               return_value=ProbeResult(
                   verdict=RELATIVE_DATES_OK,
                   target_dmo="ssot__PersonLifeEvent__dlm",
                   field="EventDate__c", days=90,
               )):
        rc = main()

    assert rc == 0
    artifact = tmp_path / "probe.json"
    assert artifact.exists()
    import json
    data = json.loads(artifact.read_text())
    assert data["verdict"] == "RELATIVE_DATES_OK"
```

- [ ] **Step 6.2: Run tests to verify they fail**

Run: `pytest tests/test_cli_create_segments_recreate.py -v`
Expected: FAIL with `unrecognized arguments: --recreate cmp_*` (and similar for probe).

- [ ] **Step 6.3: Extend the `create-segments` argparse parser in `cli.py`**

In `customer_hydration/cli.py`, around line 99-102, add the new flags:

```python
    p_segments.add_argument(
        "--recreate", default=None, metavar="PATTERN",
        help="Glob over config keys; runs DELETE+POST for matching segments. "
             "Mutually exclusive with --segment-id.",
    )
    p_segments.add_argument(
        "--probe-relative-dates", action="store_true",
        help="One-shot: probe v62 relative-date semantics and write a verdict "
             "artifact, then exit. Use --probe-artifact to control the path.",
    )
    p_segments.add_argument(
        "--probe-artifact", default="output/phase3d/probe_latest.json",
        help="Where to read/write the probe verdict (default: %(default)s)",
    )
```

- [ ] **Step 6.4: Update the dispatch in `cli.py:220` to route to recreate or probe**

Find the `_run_create_segments` function (search for `def _run_create_segments`) and replace it with:

```python
def _run_create_segments(args):
    from customer_hydration.phase5.segments import (
        execute_create_segments, execute_recreate_segments,
    )
    from customer_hydration.phase5.segments_probe import (
        probe_relative_date_filter, write_probe_artifact,
    )
    from customer_hydration.phase5.data_cloud import get_org_session
    from pathlib import Path
    import os, sys

    yaml_path = Path("config/segments.yaml")

    if args.probe_relative_dates:
        try:
            instance_url, access_token = get_org_session(args.target_org)
        except Exception as exc:
            print(f"Probe FAILED to authenticate: {exc}", file=sys.stderr)
            return 3
        result = probe_relative_date_filter(instance_url, access_token)
        artifact_path = Path(args.probe_artifact)
        write_probe_artifact(artifact_path, result)
        print(f"Probe verdict: {result.verdict}")
        print(f"  target_dmo={result.target_dmo}  field={result.field}  days={result.days}")
        print(f"  recent={result.count_recent}  old={result.count_old}  frozen={result.count_recent_frozen}")
        print(f"Artifact: {artifact_path}")
        return 0

    # Make the recently-written probe artifact visible to the translator.
    probe_artifact = Path(args.probe_artifact)
    if probe_artifact.exists():
        os.environ["PHASE3D_PROBE_ARTIFACT"] = str(probe_artifact)

    if args.recreate is not None:
        result = execute_recreate_segments(
            target_org=args.target_org,
            yaml_path=yaml_path,
            pattern=args.recreate,
            dry_run=args.dry_run,
        )
        print(f"recreated={result.segments_recreated} "
              f"failed={result.segments_failed} "
              f"processed={result.segments_processed}")
        for r in result.results:
            tag = "OK" if r.created else ("FAIL" if r.error else "SKIP")
            print(f"  [{tag}] {r.config_key} ({r.api_name}) {r.error or ''}")
        return 0 if result.segments_failed == 0 else 2

    # Default path: existing create-or-skip behavior.
    result = execute_create_segments(
        target_org=args.target_org,
        yaml_path=yaml_path,
        segment_id=args.segment_id,
        skip_publish=args.skip_publish,
        dry_run=args.dry_run,
    )
    print(f"created={result.segments_created} "
          f"skipped={result.segments_skipped} "
          f"failed={result.segments_failed} "
          f"processed={result.segments_processed}")
    return 0 if result.segments_failed == 0 else 2
```

- [ ] **Step 6.5: Run tests to verify they pass**

Run: `pytest tests/test_cli_create_segments_recreate.py -v`
Expected: 2 PASSED.

- [ ] **Step 6.6: Run the full suite to confirm no regressions**

Run: `pytest tests/ -q 2>&1 | tail -5`
Expected: prior 787 + new tests, all PASSED, 5 SKIPPED.

- [ ] **Step 6.7: Commit Task 6**

```bash
git add customer_hydration/cli.py tests/test_cli_create_segments_recreate.py
git commit -m "feat(customer-hydration): wire --recreate and --probe-relative-dates into create-segments CLI"
```

---

## Task 7: Rewrite the 15 segment YAML entries + live execute + briefs refresh

**Files:**
- Modify: `config/segments.yaml`
- Modify: `docs/segment_briefs.md` (regenerated)
- Modify: `AGENTS.md` (Plans history entry)
- Test: `tests/test_segments_yaml_validation.py`

- [ ] **Step 7.1: Run the live probe to write the artifact**

```bash
python hydrate.py create-segments --target-org jdo-uqj0jr \
    --probe-relative-dates \
    --probe-artifact output/phase3d/probe_latest.json
```

Expected: prints `Probe verdict: RELATIVE_DATES_OK` or `RELATIVE_DATES_BROKEN`. Artifact lands at `output/phase3d/probe_latest.json`.

Inspect the artifact:

```bash
cat output/phase3d/probe_latest.json
```

Note the verdict; both translator branches are tested already, so either result is fine. Phase 3d v1.1 (future) can re-run this probe periodically to detect when v62 is fixed upstream.

- [ ] **Step 7.2: Rewrite the 5 placeholder segments in `config/segments.yaml`**

Replace lines 179-233 of `config/segments.yaml` (the five "placeholder until X DMO hydrated" entries) with:

```yaml
  retail_family_with_mortgage:
    name: "Retail Family-Building with Mortgage"
    description: "Retail customers with at least one Mortgage FinancialAccount"
    persona: retail
    publish_schedule: daily
    target_dmo: ssot__Account__dlm
    rule:
      type: all_of
      rules:
        - type: text_equals
          field: FinServ_ClientCategory_c__c
          value: "Retail"
        - type: related_to
          dmo: ssot__FinServ_FinancialAccount__dlm
          via: AccountId__c
          where:
            type: text_equals
            field: FinServ_AccountType_c__c
            value: "Mortgage"

  retail_heloc_drawn:
    name: "Retail HELOC Drawn 50%+"
    description: "Retail customers with a HELOC FinancialAccount drawn at least 50%"
    persona: retail
    publish_schedule: daily
    target_dmo: ssot__Account__dlm
    linked_campaign: HYDRATE-CMP-001
    rule:
      type: all_of
      rules:
        - type: text_equals
          field: FinServ_ClientCategory_c__c
          value: "Retail"
        - type: related_to
          dmo: ssot__FinServ_FinancialAccount__dlm
          via: AccountId__c
          where:
            type: all_of
            rules:
              - type: text_equals
                field: FinServ_AccountType_c__c
                value: "HELOC"
              - type: number_gte
                field: FinServ_DrawnRatio_c__c
                value: 0.5

  smb_with_sba:
    name: "SMB Owners with SBA Loan"
    description: "Small-business clients with at least one SBA FinancialAccount"
    persona: smb
    publish_schedule: daily
    target_dmo: ssot__Account__dlm
    rule:
      type: all_of
      rules:
        - type: text_equals
          field: FinServ_ClientCategory_c__c
          value: "Small Business"
        - type: related_to
          dmo: ssot__FinServ_FinancialAccount__dlm
          via: AccountId__c
          where:
            type: text_equals
            field: FinServ_AccountType_c__c
            value: "SBA Loan"

  commercial_with_treasury:
    name: "Commercial with Treasury Services"
    description: "Commercial banking clients with at least one Treasury FinancialAccount"
    persona: commercial
    publish_schedule: daily
    target_dmo: ssot__Account__dlm
    rule:
      type: all_of
      rules:
        - type: text_equals
          field: FinServ_ClientCategory_c__c
          value: "Commercial Banking"
        - type: related_to
          dmo: ssot__FinServ_FinancialAccount__dlm
          via: AccountId__c
          where:
            type: text_equals
            field: FinServ_AccountType_c__c
            value: "Treasury"

  wealth_recent_life_event:
    name: "Wealth with Recent Life Event (90d)"
    description: "Wealth clients with a PersonLifeEvent in the last 90 days. Window is probe-gated: relative-date when v62 supports it on Profile DMOs, frozen anchor otherwise (regenerate via 'create-segments --probe-relative-dates' weekly)."
    persona: wealth
    publish_schedule: daily
    target_dmo: ssot__Account__dlm
    rule:
      type: all_of
      rules:
        - type: text_equals
          field: FinServ_ClientCategory_c__c
          value: "Wealth Management"
        - type: related_to
          dmo: ssot__PersonLifeEvent__dlm
          via: AccountId__c
          where:
            type: relative_date_after_days
            field: EventDate__c
            days: 90
```

- [ ] **Step 7.3: Rewrite the 10 campaign-aligned segments**

Replace lines 243-359 of `config/segments.yaml` (the ten `cmp_*` entries) with the pattern below — example for `cmp_heloc_refi_outreach`; repeat for all 10, swapping `linked_campaign` and persona accordingly. Pattern:

```yaml
  cmp_heloc_refi_outreach:
    name: "HELOC Refi Outreach Q2 audience"
    description: "Retail customers who are members of Campaign HYDRATE-CMP-001"
    persona: retail
    publish_schedule: daily
    target_dmo: ssot__Account__dlm
    linked_campaign: HYDRATE-CMP-001
    rule:
      type: all_of
      rules:
        - type: text_equals
          field: FinServ_ClientCategory_c__c
          value: "Retail"
        - type: related_to
          dmo: ssot__CampaignMember__dlm
          via: AccountId__c
          where:
            type: text_equals
            field: CampaignId__c
            value: "HYDRATE-CMP-001"
```

The 10 entries to rewrite (with the persona and `linked_campaign` value to use):

| Key | Persona | Campaign |
|---|---|---|
| `cmp_heloc_refi_outreach` | retail | HYDRATE-CMP-001 |
| `cmp_auto_loan_rate_drop` | retail | HYDRATE-CMP-002 |
| `cmp_premier_checking_onboarding` | retail | HYDRATE-CMP-003 |
| `cmp_wealth_tax_strategy_webinar` | wealth | HYDRATE-CMP-004 |
| `cmp_wealth_estate_planning_roundtable` | wealth | HYDRATE-CMP-005 |
| `cmp_sba_awareness` | smb | HYDRATE-CMP-006 |
| `cmp_treasury_modernization_brief` | commercial | HYDRATE-CMP-007 |
| `cmp_commercial_rm_roundtable` | commercial | HYDRATE-CMP-008 |
| `cmp_multi_persona_spring_newsletter` | mixed | HYDRATE-CMP-009 |
| `cmp_mobile_banking_adoption` | retail | HYDRATE-CMP-010 |

The `cmp_multi_persona_spring_newsletter` is the one exception: omit the `text_equals FinServ_ClientCategory_c__c` clause (any persona). Its `rule` is just the `related_to CampaignMember` clause directly, no `all_of` wrapper:

```yaml
  cmp_multi_persona_spring_newsletter:
    name: "Multi-Persona Spring Newsletter audience"
    description: "Any persona who is a member of Campaign HYDRATE-CMP-009"
    persona: mixed
    publish_schedule: daily
    target_dmo: ssot__Account__dlm
    linked_campaign: HYDRATE-CMP-009
    rule:
      type: related_to
      dmo: ssot__CampaignMember__dlm
      via: AccountId__c
      where:
        type: text_equals
        field: CampaignId__c
        value: "HYDRATE-CMP-009"
```

- [ ] **Step 7.4: Add the YAML-validation test**

```python
# tests/test_segments_yaml_validation.py
from pathlib import Path
import os
import pytest
from customer_hydration.phase5.segments import load_segment_definitions


REPO_ROOT = Path(__file__).resolve().parents[1]


def test_committed_yaml_loads_without_errors(monkeypatch):
    # Ensure no probe artifact pollutes the test (so unknown verdict =>
    # frozen-anchor branch, which doesn't need a live API).
    monkeypatch.delenv("PHASE3D_PROBE_ARTIFACT", raising=False)

    yaml_path = REPO_ROOT / "config" / "segments.yaml"
    defs = load_segment_definitions(yaml_path)
    keys = {d.config_key for d in defs}
    # All 15 Phase 3d-touched segments are present.
    expected = {
        "retail_family_with_mortgage", "retail_heloc_drawn",
        "smb_with_sba", "commercial_with_treasury",
        "wealth_recent_life_event",
        "cmp_heloc_refi_outreach", "cmp_auto_loan_rate_drop",
        "cmp_premier_checking_onboarding",
        "cmp_wealth_tax_strategy_webinar",
        "cmp_wealth_estate_planning_roundtable",
        "cmp_sba_awareness", "cmp_treasury_modernization_brief",
        "cmp_commercial_rm_roundtable",
        "cmp_multi_persona_spring_newsletter",
        "cmp_mobile_banking_adoption",
    }
    assert expected.issubset(keys)


def test_phase_3d_segments_use_related_to():
    yaml_path = REPO_ROOT / "config" / "segments.yaml"
    defs = load_segment_definitions(yaml_path)
    by_key = {d.config_key: d for d in defs}

    targeted = [
        "retail_family_with_mortgage", "retail_heloc_drawn",
        "smb_with_sba", "commercial_with_treasury",
        "wealth_recent_life_event",
        "cmp_heloc_refi_outreach", "cmp_mobile_banking_adoption",
        "cmp_multi_persona_spring_newsletter",
    ]
    for k in targeted:
        d = by_key[k]
        # Walk the include_criteria tree looking for at least one
        # NestedAttribute (= related_to was emitted).
        assert _has_nested_attribute(d.include_criteria), \
            f"{k}: expected NestedAttribute, got {d.include_criteria}"


def _has_nested_attribute(node) -> bool:
    if isinstance(node, dict):
        if node.get("type") == "NestedAttribute":
            return True
        for v in node.values():
            if _has_nested_attribute(v):
                return True
    elif isinstance(node, list):
        return any(_has_nested_attribute(v) for v in node)
    return False
```

- [ ] **Step 7.5: Run the YAML-validation test**

Run: `pytest tests/test_segments_yaml_validation.py -v`
Expected: 2 PASSED.

- [ ] **Step 7.6: Live recreate dry-run**

```bash
python hydrate.py create-segments --target-org jdo-uqj0jr \
    --recreate '*' --dry-run
```

Expected: prints `DRY-RUN would DELETE+POST RetailFamilyWithMortgage__seg ...` for the 15 affected segments.

- [ ] **Step 7.7: Live recreate (real)**

```bash
python hydrate.py create-segments --target-org jdo-uqj0jr --recreate '*'
```

Expected: `recreated=15 failed=0 processed=15`. If `failed > 0`, inspect output, fix the underlying issue (most likely an unknown DMO field name — the validation test only checks that YAML loads, not that fields exist on the live DMO), and rerun. The recreate command is idempotent.

- [ ] **Step 7.8: Verify post-recreate row counts strictly less than baselines**

```bash
python -c "
from customer_hydration.phase5.data_cloud import get_org_session, list_segments
import json
url, tok = get_org_session('jdo-uqj0jr')
def to_pascal(s): return ''.join(p.capitalize() for p in s.split('_'))
baselines = json.load(open('tests/fixtures/segment_baselines.json'))
print(f'{\"key\":40} {\"before\":>8} {\"after\":>8}  ok?')
for s in list_segments(url, tok):
    for k, b in baselines.items():
        if s.api_name == f'{to_pascal(k)}__seg':
            after = getattr(s, 'population_count', None) or getattr(s, 'memberCount', None)
            ok = '✓' if (b is None or after is None or after < b) else '✗'
            print(f'{k:40} {b!s:>8} {after!s:>8}  {ok}')
"
```

Expected: every row shows `before > after` (`✓`). If any row shows `✗`, the cross-DMO clause is failing to filter. Likely causes: wrong field name in YAML, FK field not yet populated on the related DMO, the related DMO stream hasn't refreshed since hydration. Diagnose via `hydrate.py dc-status`.

- [ ] **Step 7.9: Update `docs/segment_briefs.md` by hand**

Open `docs/segment_briefs.md`. For each of the 15 segments touched, find its existing entry and:

1. Remove the "(placeholder until X DMO hydrated)" disclaimer.
2. Replace the rule paragraph with a one-sentence description of the new cross-DMO filter (matches the `description:` field in the YAML rewrite from Step 7.2/7.3).
3. Replace the row-count line with the post-recreate count from Step 7.8's output.

Example: for `retail_family_with_mortgage`, change the row from:

```markdown
- **Retail Family-Building with Mortgage** (placeholder) — Retail customers, ~25,400 rows.
```

to:

```markdown
- **Retail Family-Building with Mortgage** — Retail customers with at least one Mortgage FinancialAccount, ~<after-count> rows.
```

This is a docs-only step. No automation exists for segment briefs (the `briefs` subcommand in `cli.py:53` is for banker briefs, not segment briefs).

- [ ] **Step 7.10: Add Phase 3d entry to AGENTS.md "Plans history"**

In `AGENTS.md`, append after the Phase 4 v1.1 entry (the last entry before "When extending personas"):

```markdown
- **Phase 3d** (Cross-DMO segment YAML, 2026-05-27) — Replaced
  persona-only filters in 5 placeholder + 10 campaign-aligned
  segments with real cross-DMO clauses. New `related_to` rule type in
  `customer_hydration/phase5/segments.py` translator emits a DC
  `NestedAttribute` clause via the related DMO's native AccountId-style
  FK; supports nested `where:` rules but rejects nested `related_to`
  inside `related_to`. New `relative_date_after_days` /
  `relative_date_before_days` rule params are probe-gated by
  `customer_hydration/phase5/segments_probe.py` — runs three throwaway
  segments live (relative-after, relative-before, frozen anchor),
  compares row counts, persists verdict to
  `output/phase3d/probe_latest.json`. Translator reads the artifact
  via `PHASE3D_PROBE_ARTIFACT` env var; defaults to frozen anchor when
  unknown/broken. New `delete_segment` helper in
  `phase5/data_cloud.py` (404 → idempotent success) and
  `execute_recreate_segments` in `phase5/segments.py` (DELETE-then-POST
  migration, since PATCH on Dynamic segments returns
  `ENTITY_SAVE_ERROR` per Phase 2 Task 10). New CLI flags:
  `create-segments --recreate <pattern>` (glob over config keys) and
  `create-segments --probe-relative-dates` (one-shot artifact write).
  Live run: 15 segments recreated, 0 failed; post-recreate row counts
  strictly less than baselines (proving the cross-DMO clauses are
  filtering, not no-op'd). New tests: probe (5), translator related_to
  (4), translator relative_date (3), data_cloud delete_segment (3),
  loader recreate (4), CLI dispatch (2), YAML validation (2). Spec:
  `docs/superpowers/specs/2026-05-27-phase-3d-cross-dmo-segments-design.md`.
```

- [ ] **Step 7.11: Final commit**

```bash
git add config/segments.yaml docs/segment_briefs.md AGENTS.md \
        tests/test_segments_yaml_validation.py \
        output/phase3d/probe_latest.json
git commit -m "$(cat <<'EOF'
feat(customer-hydration): Phase 3d cross-DMO segment YAML migration

Rewrites 15 placeholder/persona-only segments to use real cross-DMO
filters via the new related_to rule type. Live recreate against
jdo-uqj0jr completed with 0 failures; post-recreate row counts are
strictly less than baselines (cross-DMO clauses filtering as designed).
EOF
)"
```

- [ ] **Step 7.12: Run the full test suite to confirm green**

Run: `pytest tests/ -q 2>&1 | tail -5`
Expected: ~810 PASSED + 5 SKIPPED, 0 FAILED.

---

## Self-Review checklist (run by the executor before declaring done)

- [ ] **Spec coverage:** every numbered subsection of the spec has at least one task implementing it. Specifically:
  - §3 architecture — covered by Tasks 3 (DSL), 5 (loader), 1 (probe gate)
  - §4.1 DSL extensions — Tasks 3 + 4
  - §4.2 segments_probe.py — Task 1
  - §4.3 loader extension — Task 5 + Task 6 (CLI)
  - §4.4 YAML rewrite — Task 7
  - §4.5 briefs refresh — Task 7 step 7.9
  - §5 data flows — covered by Tasks 1 (probe), 3+4 (translator), 5 (migration)
  - §6 error handling — Tasks 1 (probe failures), 2 (delete 404), 5 (recreate failures)
  - §7 testing strategy — every category covered
- [ ] **Manifest section** of spec §6.1 ("manifest records orphans") is implicit; the `RecreateSegmentsResult` already carries this in its `results` list. No separate manifest file is written for Phase 3d (different from Phase 4d) — operator inspects stdout. Acceptable for this scope.
- [ ] No `INS_FEIN_Tax_ID__c`-style PII fields are referenced.
- [ ] Probe artifact path is consistent across CLI (`output/phase3d/probe_latest.json`) and tests (uses `tmp_path`).
- [ ] All `related_to` `via:` defaults are `AccountId__c` (Task 3 step 3.3 default + Task 7 YAML).
- [ ] Test counts add up: probe 5, related_to 4, relative_date 3, delete 3, recreate 4, CLI 2, YAML 2 = **23 new tests**.

## After completion

If autonomous execution is wanted, follow up with `superpowers:subagent-driven-development` (the recommended sub-skill from the plan header). Otherwise the implementer can work through tasks sequentially in this session via `superpowers:executing-plans`.
