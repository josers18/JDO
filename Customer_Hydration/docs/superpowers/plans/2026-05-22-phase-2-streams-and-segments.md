# Phase 2 — DC stream refresh + segment creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `Customer_Hydration/` with two new CLI subcommands — `refresh-streams` (kicks the existing DC streams now that Phase 1 records are loaded) and `create-segments` (reads `config/segments.yaml`, creates and publishes ~20 persona-driven Data Cloud segments via the DC REST API). Extend `dc-status` to report segment publication state alongside stream-run state.

**Architecture:** Extends `customer_hydration/phase5/data_cloud.py` with 5 new REST methods (segment CRUD) and adds a new `customer_hydration/phase5/segments.py` orchestrator. Adds `config/segments.yaml` with 20 segment definitions covering 4 persona base + 6 lifecycle sub-segments + 10 campaign-aligned segments. Wires three new CLI subcommands into `cli.py` plus extends `dc-status`. No new runner — Phase 2 lives outside the hydrate pipeline as standalone subcommands.

**Tech Stack:** Python 3.11, stdlib `urllib.request` (no new deps), PyYAML (existing), Salesforce CLI v2 for org session token. Target org `jdo-fw51xz`. Anchor date 2026-05-22.

---

## Context the engineer needs

**Working directory:** `/Users/jsifontes/Documents/Git/JDO`. Current branch: `main`. The Phase 1 implementation is merged + pushed (commit `b3ff442`). Phase 2 work happens directly on `main` OR in a fresh feature branch — the user has indicated direct-to-main is acceptable for this scope, but the executing skill should set up a worktree per its own conventions.

**Reference spec:** `Customer_Hydration/docs/superpowers/specs/2026-05-22-phase-2-streams-and-segments-design.md`. Read it before starting any task — every "field name", "filter", "API name format" decision in this plan traces back to that spec.

**Existing Phase 5.5 module to extend:** `Customer_Hydration/customer_hydration/phase5/data_cloud.py` (~150 LoC, has `execute_phase5_5`, `get_org_session`, `list_streams`, `trigger_stream_refresh`, `poll_stream_run_status`, dataclasses `StreamInfo` / `StreamRunResult` / `DataCloudStreamRefreshResult`). Phase 2 adds segment-related symbols alongside, doesn't replace anything.

**Existing CLI subcommands** (in `Customer_Hydration/customer_hydration/cli.py`): `hydrate`, `validate-config`, `reset`, `resume`, `status`, `dc-status`, `briefs`. Phase 2 adds `refresh-streams` and `create-segments`. The spec calls for promoting `--data-cloud-only` from a `hydrate` flag to its own `refresh-streams` subcommand, but the existing `--data-cloud-only` flag stays functional for backwards compatibility (no breaking changes).

**Existing tests:** 399 unit tests pass on main (`cd Customer_Hydration && source .venv/bin/activate && pytest -q` → `399 passed`). Phase 2 target: ~427 tests.

**Phase 5.5 fire-and-forget convention:** All Phase 2 REST calls follow this pattern. Errors NEVER raise from `execute_*` functions; they're recorded on the result dataclass and the caller decides whether to exit non-zero. This contract is critical for unattended demo-org operations — a single bad segment shouldn't abort the whole publish run.

**Idempotency contract:** `execute_create_segments` is fully re-runnable. List existing segments first, then per YAML entry decide PATCH vs POST. Always call publish (no-op if no changes; otherwise triggers a fresh computation). Re-runs are useful when underlying data has changed and segment membership needs refreshing.

**Conventions:**
- All work is committed in TDD pairs (failing test → impl → green → commit) where applicable
- Verbatim test + verbatim impl content per task
- One commit per task; commit messages from the steps verbatim
- Python type hints on every public function
- All new code follows the project's `# noqa: SLF001` pattern when reaching into private members (avoid where possible)
- The Phase 5.5 `--allow-production` guard pattern carries forward: any subcommand that touches the org checks `IsSandbox` and refuses without `--allow-production` for non-sandbox orgs

---

## File structure produced by Phase 2

```
Customer_Hydration/
├── config/
│   └── segments.yaml                                # NEW — 20 segment definitions
├── customer_hydration/
│   ├── phase5/
│   │   ├── data_cloud.py                            # MODIFIED — add 5 segment REST methods + 2 dataclasses
│   │   └── segments.py                              # NEW — YAML loader + create + publish + query orchestration
│   └── cli.py                                       # MODIFIED — add refresh-streams + create-segments + dc-status segment view
├── tests/
│   ├── test_data_cloud_segments.py                  # NEW — REST method tests for segment CRUD
│   ├── test_segments_orchestration.py               # NEW — load_segment_definitions + execute_create_segments tests
│   └── test_cli_phase2.py                           # NEW — CLI dispatch tests for new subcommands
├── README.md                                        # MODIFIED — append Phase 2 status section
└── docs/
    └── superpowers/plans/2026-05-22-phase-2-streams-and-segments.md   ← this file
```

(Top-level `CHANGELOG.md` also gets a Phase 2 entry in the closeout task.)

---

## Task 1: Pre-flight — verify Account DMO API name + filter syntax against jdo-fw51xz

**Files:**
- (no file changes; this is verification + decision-recording)
- (records findings in plan body via Edit if the assumed values are wrong)

The spec assumes the segment `target_dmo` is `Account` and that filter clauses reference `FinServ__ClientCategory__c` and `External_ID__c` field names directly. This task verifies both against the actual DC mappings in the user's org before any segment YAML is written.

- [ ] **Step 1: List the org's DC mappings**

```bash
sf data360 mapping list --target-org jdo-fw51xz 2>&1 | head -40
```

If `sf data360` isn't a recognized command in this CLI version, fall back to:

```bash
sf data360 list-data-models --target-org jdo-fw51xz --json 2>&1 | head -40
```

If neither command exists, query the org's metadata directly:

```bash
sf data query --target-org jdo-fw51xz \
    --query "SELECT QualifiedApiName FROM EntityDefinition WHERE QualifiedApiName LIKE '%__dlm' OR QualifiedApiName LIKE '%Dmo%' ORDER BY QualifiedApiName LIMIT 50" \
    --use-tooling-api
```

- [ ] **Step 2: Identify the Account DMO API name**

From the output of Step 1, find the DMO that maps from the `Account` source object. Likely candidates by naming convention:
- `Account__dlm`
- `ssot__Account__dlm`
- `IndustriesAccount__dlm`
- `UnifiedssotAccount__dlm`

Record the actual API name in a comment for the next task. If multiple DMOs map from Account (e.g., a base + a unified one), prefer the one named with the customer-unified semantic — the implementation defaults to whichever exists, but the YAML can explicitly target a different DMO per segment.

- [ ] **Step 3: Identify the field names**

For the chosen Account DMO, list its fields:

```bash
sf sobject describe --sobject <DMO_API_NAME> --target-org jdo-fw51xz --json 2>&1 \
    | python3 -c "
import json, sys
d = json.load(sys.stdin)
fields = d.get('result', {}).get('fields', [])
for f in fields:
    if any(s in f['name'].lower() for s in ['client', 'category', 'external', 'birth', 'mailingstate']):
        print(f\"  {f['name']:50s} type={f['type']}\")
"
```

The mapped field names should appear here. The Phase 1 records had `FinServ__ClientCategory__c` and `External_ID__c` populated; the question is whether the DMO mapping kept those exact names (likely) or transformed them (e.g., `ClientCategory__c`).

- [ ] **Step 4: Record findings**

If the DMO API name is something OTHER than `Account` (e.g., `Account__dlm`), update the plan body in three places:

1. The Step 6 in **Task 2** (`segments.yaml` template) — replace `target_dmo: Account` with `target_dmo: <ActualName>`
2. The **Task 4** test fixture
3. The plan's "Context the engineer needs" assumption block above

If the field names differ from spec assumptions (`FinServ__ClientCategory__c`, `External_ID__c`), update the same three places + every filter expression in **Task 2**.

If the DMO API name AND field names match spec (most likely outcome): record this in a one-line comment in **Task 2's** `segments.yaml` header block — `# Verified against jdo-fw51xz on 2026-MM-DD: Account DMO + FinServ__ClientCategory__c + External_ID__c all confirmed`.

- [ ] **Step 5: No commit for this task — Task 2 commits the verified config**

The verification findings flow into Task 2's `segments.yaml`. No standalone commit.

---

## Task 2: Create `config/segments.yaml` with all 20 segment definitions

**Files:**
- Create: `Customer_Hydration/config/segments.yaml`

This is the canonical inventory of Phase 2 segments. Verbatim content below, modulo any DMO name / field name corrections from Task 1.

- [ ] **Step 1: Create segments.yaml**

`Customer_Hydration/config/segments.yaml`:

```yaml
# Phase 2 segment definitions for Customer_Hydration.
# Each entry creates one Data Cloud Segment via the REST API.
# Segment API names are deterministic: <ConfigKeyInPascalCase>__seg
# Members are filtered by External_ID__c LIKE 'HYDRATE-%' to avoid leaking
# non-hydrate accounts into the demo segments. The HYDRATE-* clause is
# automatically appended to every rule.filter at load time, so no need to
# repeat it in the YAML.
#
# Verified against jdo-fw51xz on 2026-05-22: Account DMO + FinServ__ClientCategory__c
# + External_ID__c all confirmed (or update via Task 1 findings).

segments:

  # ----- 4 persona base segments -----

  retail_all:
    name: "Retail Customers"
    description: "All hydrated retail Person Account customers"
    persona: retail
    publish_schedule: hourly
    target_dmo: Account
    rule:
      type: sql
      filter: "FinServ__ClientCategory__c = 'Retail'"

  wealth_all:
    name: "Wealth Management Clients"
    description: "All hydrated wealth Person Account customers"
    persona: wealth
    publish_schedule: hourly
    target_dmo: Account
    rule:
      type: sql
      filter: "FinServ__ClientCategory__c = 'Wealth Management'"

  smb_all:
    name: "Small Business Clients"
    description: "All hydrated SMB business Account customers"
    persona: smb
    publish_schedule: daily
    target_dmo: Account
    rule:
      type: sql
      filter: "FinServ__ClientCategory__c = 'Small Business'"

  commercial_all:
    name: "Commercial Banking Clients"
    description: "All hydrated commercial business Account customers"
    persona: commercial
    publish_schedule: daily
    target_dmo: Account
    rule:
      type: sql
      filter: "FinServ__ClientCategory__c = 'Commercial Banking'"

  # ----- 6 lifecycle / sub-segments -----

  wealth_pre_retiree:
    name: "Wealth Pre-Retirees (55-65)"
    description: "Wealth Management clients in pre-retirement window"
    persona: wealth
    publish_schedule: daily
    target_dmo: Account
    rule:
      type: sql
      filter: |
        FinServ__ClientCategory__c = 'Wealth Management'
        AND DATE_DIFF(CURRENT_DATE(), PersonBirthdate, YEAR) BETWEEN 55 AND 65

  retail_family_with_mortgage:
    name: "Retail Family-Building with Mortgage"
    description: "Family-building retail customers (35-45) with active mortgage FA"
    persona: retail
    publish_schedule: daily
    target_dmo: Account
    rule:
      type: sql
      filter: |
        FinServ__ClientCategory__c = 'Retail'
        AND DATE_DIFF(CURRENT_DATE(), PersonBirthdate, YEAR) BETWEEN 33 AND 45
        AND EXISTS (
          SELECT 1 FROM FinServ__FinancialAccount__c
          WHERE FinServ__PrimaryOwner__c = Account.Id
            AND (Name LIKE '%Mortgage%' OR Name LIKE '%HELOC%')
        )

  retail_heloc_drawn:
    name: "Retail HELOC Drawn 50%+"
    description: "Retail customers with active HELOC drawn to 50%+ of credit limit"
    persona: retail
    publish_schedule: daily
    target_dmo: Account
    rule:
      type: sql
      filter: |
        FinServ__ClientCategory__c = 'Retail'
        AND EXISTS (
          SELECT 1 FROM FinServ__FinancialAccount__c
          WHERE FinServ__PrimaryOwner__c = Account.Id
            AND Name LIKE '%HELOC%'
            AND FinServ__Balance__c >= 0.5 * FinServ__LoanAmount__c
        )
    linked_campaign: HYDRATE-CMP-001

  smb_with_sba:
    name: "SMB Owners with SBA Loan"
    description: "Small Business owners with active SBA loan FA"
    persona: smb
    publish_schedule: daily
    target_dmo: Account
    rule:
      type: sql
      filter: |
        FinServ__ClientCategory__c = 'Small Business'
        AND EXISTS (
          SELECT 1 FROM FinServ__FinancialAccount__c
          WHERE FinServ__PrimaryOwner__c = Account.Id
            AND Name LIKE '%SBA%'
        )

  commercial_with_treasury:
    name: "Commercial with Treasury Services"
    description: "Commercial Banking clients with active Treasury Management FA"
    persona: commercial
    publish_schedule: daily
    target_dmo: Account
    rule:
      type: sql
      filter: |
        FinServ__ClientCategory__c = 'Commercial Banking'
        AND EXISTS (
          SELECT 1 FROM FinServ__FinancialAccount__c
          WHERE FinServ__PrimaryOwner__c = Account.Id
            AND FinServ__FinancialAccountType__c = 'Treasury Management'
        )

  wealth_recent_life_event:
    name: "Wealth with Recent Life Event (90d)"
    description: "Wealth Management clients with a LifeEvent in the last 90 days"
    persona: wealth
    publish_schedule: daily
    target_dmo: Account
    rule:
      type: sql
      filter: |
        FinServ__ClientCategory__c = 'Wealth Management'
        AND EXISTS (
          SELECT 1 FROM FinServ__LifeEvent__c
          WHERE FinServ__Client__c = Account.Id
            AND FinServ__EventDate__c >= DATE_ADD(CURRENT_DATE(), -90, 'DAY')
        )

  # ----- 10 campaign-aligned segments -----

  cmp_heloc_refi_outreach:
    name: "HELOC Refi Outreach Q2 audience"
    description: "Retail customers wired to Campaign HYDRATE-CMP-001"
    persona: retail
    publish_schedule: daily
    target_dmo: Account
    linked_campaign: HYDRATE-CMP-001
    rule:
      type: sql
      filter: |
        FinServ__ClientCategory__c = 'Retail'
        AND Id IN (
          SELECT AccountId FROM CampaignMember
          WHERE Campaign.External_ID__c = 'HYDRATE-CMP-001'
        )

  cmp_auto_loan_rate_drop:
    name: "Auto Loan Rate Drop Promo audience"
    description: "Retail customers wired to Campaign HYDRATE-CMP-002"
    persona: retail
    publish_schedule: daily
    target_dmo: Account
    linked_campaign: HYDRATE-CMP-002
    rule:
      type: sql
      filter: |
        FinServ__ClientCategory__c = 'Retail'
        AND Id IN (
          SELECT AccountId FROM CampaignMember
          WHERE Campaign.External_ID__c = 'HYDRATE-CMP-002'
        )

  cmp_premier_checking_onboarding:
    name: "Premier Checking Onboarding cohort"
    description: "Retail customers wired to Campaign HYDRATE-CMP-003"
    persona: retail
    publish_schedule: daily
    target_dmo: Account
    linked_campaign: HYDRATE-CMP-003
    rule:
      type: sql
      filter: |
        FinServ__ClientCategory__c = 'Retail'
        AND Id IN (
          SELECT AccountId FROM CampaignMember
          WHERE Campaign.External_ID__c = 'HYDRATE-CMP-003'
        )

  cmp_wealth_tax_strategy_webinar:
    name: "Wealth Tax Strategy Webinar 2026 audience"
    description: "Wealth clients wired to Campaign HYDRATE-CMP-004"
    persona: wealth
    publish_schedule: daily
    target_dmo: Account
    linked_campaign: HYDRATE-CMP-004
    rule:
      type: sql
      filter: |
        FinServ__ClientCategory__c = 'Wealth Management'
        AND Id IN (
          SELECT AccountId FROM CampaignMember
          WHERE Campaign.External_ID__c = 'HYDRATE-CMP-004'
        )

  cmp_wealth_estate_planning_roundtable:
    name: "Wealth Estate Planning Roundtable audience"
    description: "Wealth clients wired to Campaign HYDRATE-CMP-005"
    persona: wealth
    publish_schedule: daily
    target_dmo: Account
    linked_campaign: HYDRATE-CMP-005
    rule:
      type: sql
      filter: |
        FinServ__ClientCategory__c = 'Wealth Management'
        AND Id IN (
          SELECT AccountId FROM CampaignMember
          WHERE Campaign.External_ID__c = 'HYDRATE-CMP-005'
        )

  cmp_sba_awareness:
    name: "SBA Awareness Q1 2026 audience"
    description: "Small Business clients wired to Campaign HYDRATE-CMP-006"
    persona: smb
    publish_schedule: daily
    target_dmo: Account
    linked_campaign: HYDRATE-CMP-006
    rule:
      type: sql
      filter: |
        FinServ__ClientCategory__c = 'Small Business'
        AND Id IN (
          SELECT AccountId FROM CampaignMember
          WHERE Campaign.External_ID__c = 'HYDRATE-CMP-006'
        )

  cmp_treasury_modernization_brief:
    name: "Treasury Modernization Brief audience"
    description: "Commercial clients wired to Campaign HYDRATE-CMP-007"
    persona: commercial
    publish_schedule: daily
    target_dmo: Account
    linked_campaign: HYDRATE-CMP-007
    rule:
      type: sql
      filter: |
        FinServ__ClientCategory__c = 'Commercial Banking'
        AND Id IN (
          SELECT AccountId FROM CampaignMember
          WHERE Campaign.External_ID__c = 'HYDRATE-CMP-007'
        )

  cmp_commercial_rm_roundtable:
    name: "Commercial RM Roundtable audience"
    description: "Commercial clients wired to Campaign HYDRATE-CMP-008"
    persona: commercial
    publish_schedule: daily
    target_dmo: Account
    linked_campaign: HYDRATE-CMP-008
    rule:
      type: sql
      filter: |
        FinServ__ClientCategory__c = 'Commercial Banking'
        AND Id IN (
          SELECT AccountId FROM CampaignMember
          WHERE Campaign.External_ID__c = 'HYDRATE-CMP-008'
        )

  cmp_multi_persona_spring_newsletter:
    name: "Multi-Persona Spring Newsletter audience"
    description: "All-persona audience wired to Campaign HYDRATE-CMP-009"
    persona: mixed
    publish_schedule: weekly
    target_dmo: Account
    linked_campaign: HYDRATE-CMP-009
    rule:
      type: sql
      filter: |
        Id IN (
          SELECT AccountId FROM CampaignMember
          WHERE Campaign.External_ID__c = 'HYDRATE-CMP-009'
        )

  cmp_mobile_banking_adoption:
    name: "Mobile Banking Adoption audience"
    description: "Retail customers wired to Campaign HYDRATE-CMP-010"
    persona: retail
    publish_schedule: daily
    target_dmo: Account
    linked_campaign: HYDRATE-CMP-010
    rule:
      type: sql
      filter: |
        FinServ__ClientCategory__c = 'Retail'
        AND Id IN (
          SELECT AccountId FROM CampaignMember
          WHERE Campaign.External_ID__c = 'HYDRATE-CMP-010'
        )
```

- [ ] **Step 2: Verify YAML parses cleanly**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration
source .venv/bin/activate
python -c "
import yaml
data = yaml.safe_load(open('config/segments.yaml'))
segments = data['segments']
print(f'Loaded {len(segments)} segments:')
for key, seg in segments.items():
    print(f'  {key:42s} persona={seg[\"persona\"]:11s} target_dmo={seg[\"target_dmo\"]}')
"
```

Expected output: 20 lines listing each segment + persona + target_dmo. If any line errors out, fix the YAML.

- [ ] **Step 3: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO
git add Customer_Hydration/config/segments.yaml
git commit -m "feat(customer-hydration): add segments.yaml with 20 Phase 2 segment definitions"
```

---

## Task 3: Extend `phase5/data_cloud.py` with segment dataclasses + 5 REST methods

**Files:**
- Modify: `Customer_Hydration/customer_hydration/phase5/data_cloud.py`
- Create: `Customer_Hydration/tests/test_data_cloud_segments.py`

TDD pair. Add new dataclasses + 5 segment-related REST methods alongside the existing stream-related code, using the same auth pattern (`get_org_session(target_org)` for instance URL + access token).

- [ ] **Step 1: Write the failing tests**

`Customer_Hydration/tests/test_data_cloud_segments.py`:

```python
"""Unit tests for Phase 2 segment REST methods on phase5/data_cloud.py."""
from __future__ import annotations

import io
import json
from unittest.mock import patch, MagicMock

import pytest

from customer_hydration.phase5.data_cloud import (
    SegmentInfo,
    SegmentStatus,
    list_segments,
    create_segment,
    patch_segment,
    publish_segment,
    get_segment_status,
)


def _mock_response(payload: dict) -> MagicMock:
    """Build a mock response object for urllib.request.urlopen."""
    body = json.dumps(payload).encode("utf-8")
    resp = MagicMock()
    resp.read.return_value = body
    resp.__enter__.return_value = resp
    resp.__exit__.return_value = False
    return resp


class TestSegmentInfoDataclass:
    def test_required_fields(self):
        s = SegmentInfo(
            api_name="RetailAll__seg",
            display_name="Retail Customers",
            description="All retail customers",
            target_dmo="Account",
            publish_schedule="hourly",
        )
        assert s.api_name == "RetailAll__seg"
        assert s.target_dmo == "Account"


class TestSegmentStatusDataclass:
    def test_default_member_count_none(self):
        s = SegmentStatus(api_name="X__seg", status="DRAFT", member_count=None,
                          last_publish_time=None)
        assert s.member_count is None
        assert s.error is None


class TestListSegments:
    @patch("urllib.request.urlopen")
    def test_returns_segments_from_data_streams_response(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response({
            "segments": [
                {"apiName": "RetailAll__seg", "displayName": "Retail Customers",
                 "description": "All retail", "targetDmo": "Account",
                 "publishSchedule": "hourly"},
                {"apiName": "WealthAll__seg", "displayName": "Wealth Clients",
                 "description": "All wealth", "targetDmo": "Account",
                 "publishSchedule": "hourly"},
            ]
        })
        segs = list_segments("https://example.my.salesforce.com", "tok")
        assert len(segs) == 2
        assert segs[0].api_name == "RetailAll__seg"
        assert segs[1].display_name == "Wealth Clients"

    @patch("urllib.request.urlopen")
    def test_empty_response_returns_empty_list(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response({"segments": []})
        segs = list_segments("https://example.my.salesforce.com", "tok")
        assert segs == []

    @patch("urllib.request.urlopen")
    def test_uses_authorization_bearer_header(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response({"segments": []})
        list_segments("https://example.my.salesforce.com", "abc123")
        request = mock_urlopen.call_args[0][0]
        assert request.headers.get("Authorization") == "Bearer abc123"


class TestCreateSegment:
    @patch("urllib.request.urlopen")
    def test_returns_success_and_id(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response({"id": "0sX..."})
        ok, sid = create_segment(
            "https://example.my.salesforce.com", "tok",
            api_name="RetailAll__seg", display_name="Retail Customers",
            description="All retail", target_dmo="Account",
            filter_sql="FinServ__ClientCategory__c = 'Retail'",
            publish_schedule="hourly",
        )
        assert ok is True
        assert sid == "0sX..."

    @patch("urllib.request.urlopen")
    def test_handles_http_error(self, mock_urlopen):
        from urllib.error import HTTPError
        mock_urlopen.side_effect = HTTPError(
            url="x", code=400, msg="Bad Request", hdrs=None,
            fp=io.BytesIO(b'{"error":"invalid filter"}'),
        )
        ok, err = create_segment(
            "https://example.my.salesforce.com", "tok",
            api_name="X__seg", display_name="X", description="",
            target_dmo="Account", filter_sql="bad",
        )
        assert ok is False
        assert "400" in err or "Bad Request" in err or "invalid filter" in err

    @patch("urllib.request.urlopen")
    def test_posts_to_correct_endpoint(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response({"id": "0sX..."})
        create_segment(
            "https://x.salesforce.com", "tok",
            api_name="A__seg", display_name="A", description="",
            target_dmo="Account", filter_sql="X = 'Y'",
        )
        request = mock_urlopen.call_args[0][0]
        assert "/ssot/segments" in request.full_url
        assert request.get_method() == "POST"


class TestPatchSegment:
    @patch("urllib.request.urlopen")
    def test_returns_success(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response({"id": "0sX..."})
        ok, _ = patch_segment(
            "https://example.my.salesforce.com", "tok",
            api_name="RetailAll__seg", display_name="Retail Customers (updated)",
            description="updated", filter_sql="FinServ__ClientCategory__c = 'Retail'",
            publish_schedule="hourly",
        )
        assert ok is True

    @patch("urllib.request.urlopen")
    def test_uses_patch_verb(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response({"id": "0sX..."})
        patch_segment(
            "https://x.salesforce.com", "tok",
            api_name="A__seg", display_name="A", description="",
            filter_sql="X = 'Y'", publish_schedule="hourly",
        )
        request = mock_urlopen.call_args[0][0]
        assert request.get_method() == "PATCH"


class TestPublishSegment:
    @patch("urllib.request.urlopen")
    def test_returns_success(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response({"runId": "r-123"})
        ok, run_id = publish_segment("https://x.salesforce.com", "tok",
                                     api_name="RetailAll__seg")
        assert ok is True
        assert run_id == "r-123"

    @patch("urllib.request.urlopen")
    def test_posts_to_publish_endpoint(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response({"runId": "r-1"})
        publish_segment("https://x.salesforce.com", "tok", api_name="A__seg")
        request = mock_urlopen.call_args[0][0]
        assert "/segments/A__seg/publish" in request.full_url
        assert request.get_method() == "POST"


class TestGetSegmentStatus:
    @patch("urllib.request.urlopen")
    def test_returns_status_dataclass(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response({
            "apiName": "RetailAll__seg",
            "status": "PUBLISHED",
            "memberCount": 14012,
            "lastPublishTime": "2026-05-22T18:30:00Z",
        })
        s = get_segment_status("https://x.salesforce.com", "tok",
                               api_name="RetailAll__seg")
        assert s.api_name == "RetailAll__seg"
        assert s.status == "PUBLISHED"
        assert s.member_count == 14012
        assert s.last_publish_time == "2026-05-22T18:30:00Z"

    @patch("urllib.request.urlopen")
    def test_handles_404_gracefully(self, mock_urlopen):
        from urllib.error import HTTPError
        mock_urlopen.side_effect = HTTPError(
            url="x", code=404, msg="Not Found", hdrs=None, fp=io.BytesIO(b"{}"),
        )
        s = get_segment_status("https://x.salesforce.com", "tok",
                               api_name="Missing__seg")
        # Returns a status object with status=NOT_FOUND or similar; never raises
        assert s.api_name == "Missing__seg"
        assert s.status in ("NOT_FOUND", "FAILED")
        assert s.error is not None
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration
source .venv/bin/activate
pytest tests/test_data_cloud_segments.py -v
```

Expected: `ImportError: cannot import name 'SegmentInfo' from 'customer_hydration.phase5.data_cloud'`.

- [ ] **Step 3: Add the new dataclasses and methods to `data_cloud.py`**

Edit `Customer_Hydration/customer_hydration/phase5/data_cloud.py`. Add these alongside existing code (don't replace anything). Find the existing `@dataclass` block near the top and add after the existing dataclasses:

```python
@dataclass
class SegmentInfo:
    """Subset of a segment's metadata returned by list_segments."""
    api_name: str
    display_name: str
    description: str
    target_dmo: str
    publish_schedule: str


@dataclass
class SegmentStatus:
    """Current state of a segment: status + member count + last publish time."""
    api_name: str
    status: str  # DRAFT | PUBLISHING | PUBLISHED | FAILED | NOT_FOUND
    member_count: int | None
    last_publish_time: str | None
    error: str | None = None
```

Then add these 5 functions after the existing `poll_stream_run_status` (or wherever the existing exports end):

```python
def list_segments(
    instance_url: str, access_token: str, api_version: str = "v60.0",
) -> list[SegmentInfo]:
    """List all DC Segments via GET /services/data/{v}/ssot/segments.

    Tolerates response shape variation: tries `segments`, `dataSegments`,
    `records` keys in order. Returns empty list on any HTTP error
    (Phase 5.5 fire-and-forget convention)."""
    import urllib.request
    from urllib.error import HTTPError, URLError
    url = f"{instance_url}/services/data/{api_version}/ssot/segments"
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
    except (HTTPError, URLError, json.JSONDecodeError):
        return []
    raw = data.get("segments") or data.get("dataSegments") or data.get("records") or []
    out: list[SegmentInfo] = []
    for entry in raw:
        api_name = entry.get("apiName") or entry.get("name") or entry.get("DataSegmentApiName") or ""
        if not api_name:
            continue
        out.append(SegmentInfo(
            api_name=api_name,
            display_name=entry.get("displayName") or entry.get("masterLabel") or api_name,
            description=entry.get("description") or "",
            target_dmo=entry.get("targetDmo") or entry.get("targetEntity") or "",
            publish_schedule=entry.get("publishSchedule") or "manual",
        ))
    return out


def create_segment(
    instance_url: str, access_token: str, *,
    api_name: str,
    display_name: str,
    description: str,
    target_dmo: str,
    filter_sql: str,
    publish_schedule: str = "manual",
    api_version: str = "v60.0",
) -> tuple[bool, str | None]:
    """Create a new segment via POST /services/data/{v}/ssot/segments.

    Returns (success, segment_id_or_error_message). Never raises.
    Phase 5.5 fire-and-forget contract: HTTP errors are returned as
    (False, error_string), not raised."""
    import urllib.request
    from urllib.error import HTTPError, URLError
    url = f"{instance_url}/services/data/{api_version}/ssot/segments"
    body = {
        "apiName": api_name,
        "displayName": display_name,
        "description": description,
        "targetDmo": target_dmo,
        "filter": filter_sql,
        "publishSchedule": publish_schedule,
    }
    req = urllib.request.Request(
        url, method="POST",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read())
        return (True, data.get("id") or data.get("segmentId") or api_name)
    except HTTPError as exc:
        try:
            err_body = exc.fp.read().decode("utf-8") if exc.fp else ""
        except Exception:
            err_body = ""
        return (False, f"HTTP {exc.code} {exc.reason}: {err_body[:200]}")
    except (URLError, json.JSONDecodeError) as exc:
        return (False, str(exc))


def patch_segment(
    instance_url: str, access_token: str, *,
    api_name: str,
    display_name: str,
    description: str,
    filter_sql: str,
    publish_schedule: str = "manual",
    api_version: str = "v60.0",
) -> tuple[bool, str | None]:
    """Update an existing segment via PATCH /services/data/{v}/ssot/segments/{api_name}.

    Returns (success, segment_id_or_error). Never raises."""
    import urllib.request
    from urllib.error import HTTPError, URLError
    url = f"{instance_url}/services/data/{api_version}/ssot/segments/{api_name}"
    body = {
        "displayName": display_name,
        "description": description,
        "filter": filter_sql,
        "publishSchedule": publish_schedule,
    }
    req = urllib.request.Request(
        url, method="PATCH",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read())
        return (True, data.get("id") or data.get("segmentId") or api_name)
    except HTTPError as exc:
        try:
            err_body = exc.fp.read().decode("utf-8") if exc.fp else ""
        except Exception:
            err_body = ""
        return (False, f"HTTP {exc.code} {exc.reason}: {err_body[:200]}")
    except (URLError, json.JSONDecodeError) as exc:
        return (False, str(exc))


def publish_segment(
    instance_url: str, access_token: str, *,
    api_name: str,
    api_version: str = "v60.0",
) -> tuple[bool, str | None]:
    """Trigger a publish (membership computation) for a segment via
    POST /services/data/{v}/ssot/segments/{api_name}/publish.

    Returns (success, run_id_or_error). Never raises."""
    import urllib.request
    from urllib.error import HTTPError, URLError
    url = f"{instance_url}/services/data/{api_version}/ssot/segments/{api_name}/publish"
    req = urllib.request.Request(url, method="POST", headers={
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
        return (True, data.get("runId") or data.get("id") or api_name)
    except HTTPError as exc:
        try:
            err_body = exc.fp.read().decode("utf-8") if exc.fp else ""
        except Exception:
            err_body = ""
        return (False, f"HTTP {exc.code} {exc.reason}: {err_body[:200]}")
    except (URLError, json.JSONDecodeError) as exc:
        return (False, str(exc))


def get_segment_status(
    instance_url: str, access_token: str, *,
    api_name: str,
    api_version: str = "v60.0",
) -> SegmentStatus:
    """Fetch a segment's current state via GET /services/data/{v}/ssot/segments/{api_name}.

    Returns SegmentStatus. Never raises — returns a status with status=NOT_FOUND or FAILED
    on HTTP error."""
    import urllib.request
    from urllib.error import HTTPError, URLError
    url = f"{instance_url}/services/data/{api_version}/ssot/segments/{api_name}"
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
        return SegmentStatus(
            api_name=api_name,
            status=data.get("status") or "UNKNOWN",
            member_count=data.get("memberCount"),
            last_publish_time=data.get("lastPublishTime"),
            error=None,
        )
    except HTTPError as exc:
        return SegmentStatus(
            api_name=api_name,
            status="NOT_FOUND" if exc.code == 404 else "FAILED",
            member_count=None,
            last_publish_time=None,
            error=f"HTTP {exc.code} {exc.reason}",
        )
    except (URLError, json.JSONDecodeError) as exc:
        return SegmentStatus(
            api_name=api_name,
            status="FAILED",
            member_count=None,
            last_publish_time=None,
            error=str(exc),
        )
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration
source .venv/bin/activate
pytest tests/test_data_cloud_segments.py -v
```

Expected: 13 passed.

- [ ] **Step 5: Run full suite — confirm no regressions**

```bash
pytest -q 2>&1 | tail -3
```

Expected: 412 passed (399 prior + 13 new).

- [ ] **Step 6: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO
git add Customer_Hydration/customer_hydration/phase5/data_cloud.py \
    Customer_Hydration/tests/test_data_cloud_segments.py
git commit -m "feat(customer-hydration): add segment CRUD + status REST methods to phase5/data_cloud"
```

---

## Task 4: Create `phase5/segments.py` with YAML loader + orchestration

**Files:**
- Create: `Customer_Hydration/customer_hydration/phase5/segments.py`
- Create: `Customer_Hydration/tests/test_segments_orchestration.py`

TDD pair. The orchestrator + YAML loader. Reuses the REST methods from Task 3.

- [ ] **Step 1: Write the failing tests**

`Customer_Hydration/tests/test_segments_orchestration.py`:

```python
"""Unit tests for phase5/segments.py — YAML loader + execute_create_segments."""
from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pytest

from customer_hydration.phase5.segments import (
    SegmentDefinition,
    SegmentCreateResult,
    CreateSegmentsResult,
    load_segment_definitions,
    config_key_to_api_name,
    inject_hydrate_clause,
    execute_create_segments,
    execute_refresh_streams,
)


# ---- config_key_to_api_name ----

class TestConfigKeyToApiName:
    def test_simple_snake_case(self):
        assert config_key_to_api_name("retail_all") == "RetailAll__seg"

    def test_three_word_key(self):
        assert config_key_to_api_name("wealth_pre_retiree") == "WealthPreRetiree__seg"

    def test_campaign_aligned_key(self):
        assert config_key_to_api_name("cmp_heloc_refi_outreach") == "CmpHelocRefiOutreach__seg"

    def test_single_word(self):
        assert config_key_to_api_name("commercial") == "Commercial__seg"


# ---- inject_hydrate_clause ----

class TestInjectHydrateClause:
    def test_appends_and_clause_to_simple_filter(self):
        out = inject_hydrate_clause("FinServ__ClientCategory__c = 'Retail'")
        assert "FinServ__ClientCategory__c = 'Retail'" in out
        assert "External_ID__c LIKE 'HYDRATE-%'" in out
        assert " AND " in out

    def test_idempotent_when_clause_already_present(self):
        already_has = "FinServ__ClientCategory__c = 'Retail' AND External_ID__c LIKE 'HYDRATE-%'"
        out = inject_hydrate_clause(already_has)
        # Should NOT double-inject
        assert out.count("HYDRATE-%") == 1

    def test_handles_multiline_filter(self):
        multiline = "FinServ__ClientCategory__c = 'Wealth Management'\nAND DATE_DIFF(...)"
        out = inject_hydrate_clause(multiline)
        assert "External_ID__c LIKE 'HYDRATE-%'" in out


# ---- load_segment_definitions ----

class TestLoadSegmentDefinitions:
    def test_loads_yaml_and_parses_each_segment(self, tmp_path: Path):
        yaml_path = tmp_path / "segments.yaml"
        yaml_path.write_text("""\
segments:
  retail_all:
    name: "Retail Customers"
    description: "All retail"
    persona: retail
    publish_schedule: hourly
    target_dmo: Account
    rule:
      type: sql
      filter: "FinServ__ClientCategory__c = 'Retail'"
""")
        defs = load_segment_definitions(yaml_path)
        assert len(defs) == 1
        d = defs[0]
        assert d.config_key == "retail_all"
        assert d.api_name == "RetailAll__seg"
        assert d.display_name == "Retail Customers"
        assert d.persona == "retail"
        assert d.target_dmo == "Account"
        assert "External_ID__c LIKE 'HYDRATE-%'" in d.filter_sql

    def test_raises_on_missing_required_field(self, tmp_path: Path):
        yaml_path = tmp_path / "bad.yaml"
        yaml_path.write_text("""\
segments:
  retail_all:
    name: "Retail Customers"
    # missing description, persona, publish_schedule, target_dmo, rule
""")
        with pytest.raises(ValueError, match="missing required"):
            load_segment_definitions(yaml_path)

    def test_raises_on_missing_segments_key(self, tmp_path: Path):
        yaml_path = tmp_path / "bad.yaml"
        yaml_path.write_text("""\
something_else: foo
""")
        with pytest.raises(ValueError, match="segments"):
            load_segment_definitions(yaml_path)

    def test_linked_campaign_optional(self, tmp_path: Path):
        yaml_path = tmp_path / "segments.yaml"
        yaml_path.write_text("""\
segments:
  cmp_heloc:
    name: "HELOC"
    description: "x"
    persona: retail
    publish_schedule: daily
    target_dmo: Account
    linked_campaign: HYDRATE-CMP-001
    rule:
      type: sql
      filter: "X = 'Y'"
  retail_all:
    name: "Retail All"
    description: "x"
    persona: retail
    publish_schedule: hourly
    target_dmo: Account
    rule:
      type: sql
      filter: "X = 'Y'"
""")
        defs = load_segment_definitions(yaml_path)
        d_with = next(d for d in defs if d.config_key == "cmp_heloc")
        d_without = next(d for d in defs if d.config_key == "retail_all")
        assert d_with.linked_campaign == "HYDRATE-CMP-001"
        assert d_without.linked_campaign is None


# ---- execute_create_segments ----

class TestExecuteCreateSegmentsDryRun:
    def test_dry_run_makes_no_rest_calls(self, tmp_path: Path):
        yaml_path = tmp_path / "segments.yaml"
        yaml_path.write_text("""\
segments:
  retail_all:
    name: "Retail Customers"
    description: "x"
    persona: retail
    publish_schedule: hourly
    target_dmo: Account
    rule:
      type: sql
      filter: "FinServ__ClientCategory__c = 'Retail'"
""")
        with patch("customer_hydration.phase5.segments.get_org_session") as mock_sess, \
             patch("customer_hydration.phase5.segments.list_segments") as mock_list, \
             patch("customer_hydration.phase5.segments.create_segment") as mock_create, \
             patch("customer_hydration.phase5.segments.publish_segment") as mock_pub:
            result = execute_create_segments(
                target_org="DRY-RUN", yaml_path=yaml_path, dry_run=True,
            )
            assert mock_sess.call_count == 0
            assert mock_list.call_count == 0
            assert mock_create.call_count == 0
            assert mock_pub.call_count == 0
            assert result.segments_processed == 1


class TestExecuteCreateSegmentsLive:
    @patch("customer_hydration.phase5.segments.get_org_session")
    @patch("customer_hydration.phase5.segments.list_segments")
    @patch("customer_hydration.phase5.segments.create_segment")
    @patch("customer_hydration.phase5.segments.publish_segment")
    def test_creates_when_segment_not_in_existing_list(
        self, mock_pub, mock_create, mock_list, mock_sess, tmp_path: Path,
    ):
        yaml_path = tmp_path / "segments.yaml"
        yaml_path.write_text("""\
segments:
  retail_all:
    name: "Retail Customers"
    description: "x"
    persona: retail
    publish_schedule: hourly
    target_dmo: Account
    rule:
      type: sql
      filter: "X = 'Y'"
""")
        mock_sess.return_value = ("https://x.salesforce.com", "tok")
        mock_list.return_value = []  # No existing segments
        mock_create.return_value = (True, "0sX...")
        mock_pub.return_value = (True, "r-1")
        result = execute_create_segments(target_org="alias", yaml_path=yaml_path)
        assert result.segments_created == 1
        assert result.segments_patched == 0
        assert result.segments_published == 1
        assert mock_create.call_count == 1
        assert mock_pub.call_count == 1

    @patch("customer_hydration.phase5.segments.get_org_session")
    @patch("customer_hydration.phase5.segments.list_segments")
    @patch("customer_hydration.phase5.segments.patch_segment")
    @patch("customer_hydration.phase5.segments.publish_segment")
    def test_patches_when_segment_already_exists(
        self, mock_pub, mock_patch, mock_list, mock_sess, tmp_path: Path,
    ):
        from customer_hydration.phase5.data_cloud import SegmentInfo
        yaml_path = tmp_path / "segments.yaml"
        yaml_path.write_text("""\
segments:
  retail_all:
    name: "Retail Customers"
    description: "x"
    persona: retail
    publish_schedule: hourly
    target_dmo: Account
    rule:
      type: sql
      filter: "X = 'Y'"
""")
        mock_sess.return_value = ("https://x.salesforce.com", "tok")
        mock_list.return_value = [SegmentInfo(
            api_name="RetailAll__seg", display_name="Old Name",
            description="old", target_dmo="Account", publish_schedule="manual",
        )]
        mock_patch.return_value = (True, "0sX...")
        mock_pub.return_value = (True, "r-1")
        result = execute_create_segments(target_org="alias", yaml_path=yaml_path)
        assert result.segments_created == 0
        assert result.segments_patched == 1
        assert result.segments_published == 1

    @patch("customer_hydration.phase5.segments.get_org_session")
    @patch("customer_hydration.phase5.segments.list_segments")
    @patch("customer_hydration.phase5.segments.create_segment")
    @patch("customer_hydration.phase5.segments.publish_segment")
    def test_skip_publish_does_not_call_publish(
        self, mock_pub, mock_create, mock_list, mock_sess, tmp_path: Path,
    ):
        yaml_path = tmp_path / "segments.yaml"
        yaml_path.write_text("""\
segments:
  retail_all:
    name: "Retail Customers"
    description: "x"
    persona: retail
    publish_schedule: hourly
    target_dmo: Account
    rule:
      type: sql
      filter: "X = 'Y'"
""")
        mock_sess.return_value = ("https://x.salesforce.com", "tok")
        mock_list.return_value = []
        mock_create.return_value = (True, "0sX...")
        result = execute_create_segments(
            target_org="alias", yaml_path=yaml_path, skip_publish=True,
        )
        assert result.segments_created == 1
        assert result.segments_published == 0
        assert mock_pub.call_count == 0

    @patch("customer_hydration.phase5.segments.get_org_session")
    @patch("customer_hydration.phase5.segments.list_segments")
    @patch("customer_hydration.phase5.segments.create_segment")
    @patch("customer_hydration.phase5.segments.publish_segment")
    def test_segment_id_filters_to_one_entry(
        self, mock_pub, mock_create, mock_list, mock_sess, tmp_path: Path,
    ):
        yaml_path = tmp_path / "segments.yaml"
        yaml_path.write_text("""\
segments:
  retail_all:
    name: "Retail Customers"
    description: "x"
    persona: retail
    publish_schedule: hourly
    target_dmo: Account
    rule:
      type: sql
      filter: "X = 'Y'"
  wealth_all:
    name: "Wealth Clients"
    description: "x"
    persona: wealth
    publish_schedule: hourly
    target_dmo: Account
    rule:
      type: sql
      filter: "X = 'Y'"
""")
        mock_sess.return_value = ("https://x.salesforce.com", "tok")
        mock_list.return_value = []
        mock_create.return_value = (True, "0sX...")
        mock_pub.return_value = (True, "r-1")
        result = execute_create_segments(
            target_org="alias", yaml_path=yaml_path, segment_id="wealth_all",
        )
        assert result.segments_processed == 1
        assert mock_create.call_count == 1
        # Verify it created the wealth one, not the retail one
        called_api_name = mock_create.call_args.kwargs["api_name"]
        assert called_api_name == "WealthAll__seg"

    @patch("customer_hydration.phase5.segments.get_org_session")
    @patch("customer_hydration.phase5.segments.list_segments")
    @patch("customer_hydration.phase5.segments.create_segment")
    @patch("customer_hydration.phase5.segments.publish_segment")
    def test_create_failure_recorded_does_not_raise(
        self, mock_pub, mock_create, mock_list, mock_sess, tmp_path: Path,
    ):
        yaml_path = tmp_path / "segments.yaml"
        yaml_path.write_text("""\
segments:
  retail_all:
    name: "Retail Customers"
    description: "x"
    persona: retail
    publish_schedule: hourly
    target_dmo: Account
    rule:
      type: sql
      filter: "X = 'Y'"
""")
        mock_sess.return_value = ("https://x.salesforce.com", "tok")
        mock_list.return_value = []
        mock_create.return_value = (False, "HTTP 400 Bad Request")
        result = execute_create_segments(target_org="alias", yaml_path=yaml_path)
        assert result.segments_failed == 1
        assert result.segments_created == 0
        assert mock_pub.call_count == 0  # No publish on failed create
        assert "HTTP 400" in result.results[0].error


# ---- execute_refresh_streams ----

class TestExecuteRefreshStreams:
    @patch("customer_hydration.phase5.segments.execute_phase5_5")
    def test_delegates_to_phase5_5(self, mock_p55):
        from customer_hydration.phase5.data_cloud import DataCloudStreamRefreshResult
        mock_p55.return_value = DataCloudStreamRefreshResult(
            streams_discovered=5, streams_matched=3, streams_triggered=3,
        )
        result = execute_refresh_streams(target_org="alias")
        assert result.streams_discovered == 5
        assert result.streams_matched == 3
        assert result.streams_triggered == 3
        mock_p55.assert_called_once_with(target_org="alias")
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration
source .venv/bin/activate
pytest tests/test_segments_orchestration.py -v
```

Expected: `ModuleNotFoundError: No module named 'customer_hydration.phase5.segments'`.

- [ ] **Step 3: Create `segments.py`**

`Customer_Hydration/customer_hydration/phase5/segments.py`:

```python
"""Phase 2: orchestrate Data Cloud segment creation + publish.

Reads config/segments.yaml, creates each segment via the REST API
(or PATCHes if it already exists), and triggers a publish. Idempotent:
re-runs are safe and effectively become a "republish all" pass.

Fire-and-forget per Phase 5.5 convention: per-segment failures are
recorded on the result, not raised.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import yaml

from customer_hydration.phase5.data_cloud import (
    DataCloudStreamRefreshResult,
    SegmentInfo,
    create_segment,
    execute_phase5_5,
    get_org_session,
    list_segments,
    patch_segment,
    publish_segment,
)


@dataclass
class SegmentDefinition:
    """One segment as parsed from segments.yaml."""
    config_key: str
    api_name: str
    display_name: str
    description: str
    persona: str
    publish_schedule: str
    target_dmo: str
    filter_sql: str
    linked_campaign: Optional[str] = None


@dataclass
class SegmentCreateResult:
    """Per-segment outcome from execute_create_segments."""
    config_key: str
    api_name: str
    created: bool = False  # True if newly created
    patched: bool = False  # True if updated in place
    published: bool = False
    member_count: Optional[int] = None
    error: Optional[str] = None


@dataclass
class CreateSegmentsResult:
    """Aggregate result for an execute_create_segments run."""
    segments_processed: int = 0
    segments_created: int = 0
    segments_patched: int = 0
    segments_published: int = 0
    segments_failed: int = 0
    results: list[SegmentCreateResult] = field(default_factory=list)


_HYDRATE_CLAUSE = "External_ID__c LIKE 'HYDRATE-%'"


def config_key_to_api_name(config_key: str) -> str:
    """Map snake_case config key to PascalCase__seg API name.

    Examples:
        retail_all → RetailAll__seg
        wealth_pre_retiree → WealthPreRetiree__seg
        cmp_heloc_refi_outreach → CmpHelocRefiOutreach__seg
    """
    parts = config_key.split("_")
    pascal = "".join(p.capitalize() for p in parts)
    return f"{pascal}__seg"


def inject_hydrate_clause(filter_sql: str) -> str:
    """Append `AND External_ID__c LIKE 'HYDRATE-%'` to a filter unless already present.

    Idempotent: if the HYDRATE-* clause already appears in the filter (in any form),
    the input is returned unchanged."""
    if "HYDRATE-%" in filter_sql:
        return filter_sql
    stripped = filter_sql.strip()
    return f"{stripped} AND {_HYDRATE_CLAUSE}"


def load_segment_definitions(yaml_path: Path) -> list[SegmentDefinition]:
    """Parse segments.yaml. Validates required fields. Injects the
    HYDRATE-* clause into each rule.filter. Raises ValueError on
    malformed YAML."""
    text = yaml_path.read_text(encoding="utf-8")
    data = yaml.safe_load(text) or {}
    segments_section = data.get("segments")
    if segments_section is None:
        raise ValueError(f"YAML at {yaml_path} is missing top-level 'segments' key")
    if not isinstance(segments_section, dict):
        raise ValueError(f"'segments' must be a mapping in {yaml_path}")

    required = {"name", "description", "persona", "publish_schedule", "target_dmo", "rule"}
    out: list[SegmentDefinition] = []
    for config_key, entry in segments_section.items():
        if not isinstance(entry, dict):
            raise ValueError(f"Segment {config_key!r} must be a mapping")
        missing = required - set(entry.keys())
        if missing:
            raise ValueError(
                f"Segment {config_key!r} is missing required field(s): {sorted(missing)}"
            )
        rule = entry["rule"]
        if not isinstance(rule, dict) or "filter" not in rule:
            raise ValueError(f"Segment {config_key!r}.rule must contain 'filter'")
        filter_sql = inject_hydrate_clause(str(rule["filter"]))
        out.append(SegmentDefinition(
            config_key=config_key,
            api_name=config_key_to_api_name(config_key),
            display_name=entry["name"],
            description=entry["description"],
            persona=entry["persona"],
            publish_schedule=entry["publish_schedule"],
            target_dmo=entry["target_dmo"],
            filter_sql=filter_sql,
            linked_campaign=entry.get("linked_campaign"),
        ))
    return out


def execute_create_segments(
    *,
    target_org: str,
    yaml_path: Path,
    segment_id: Optional[str] = None,
    skip_publish: bool = False,
    dry_run: bool = False,
) -> CreateSegmentsResult:
    """Create + publish segments per segments.yaml.

    Idempotent: if a segment exists (matching api_name), PATCH it; else POST.
    Always publish (subject to skip_publish).

    Per-segment failures are recorded on the result; this function never raises."""
    definitions = load_segment_definitions(yaml_path)
    if segment_id is not None:
        definitions = [d for d in definitions if d.config_key == segment_id]
        if not definitions:
            result = CreateSegmentsResult()
            return result

    result = CreateSegmentsResult()
    result.segments_processed = len(definitions)

    if dry_run:
        for d in definitions:
            r = SegmentCreateResult(config_key=d.config_key, api_name=d.api_name)
            result.results.append(r)
            print(f"  DRY-RUN would create/patch {d.api_name} ({d.display_name})")
        return result

    try:
        instance_url, access_token = get_org_session(target_org)
    except Exception as exc:
        # Mark every definition as failed
        for d in definitions:
            r = SegmentCreateResult(
                config_key=d.config_key, api_name=d.api_name,
                error=f"get_org_session failed: {exc}",
            )
            result.results.append(r)
            result.segments_failed += 1
        return result

    existing = {s.api_name for s in list_segments(instance_url, access_token)}

    for d in definitions:
        r = SegmentCreateResult(config_key=d.config_key, api_name=d.api_name)
        if d.api_name in existing:
            ok, info = patch_segment(
                instance_url, access_token,
                api_name=d.api_name,
                display_name=d.display_name,
                description=d.description,
                filter_sql=d.filter_sql,
                publish_schedule=d.publish_schedule,
            )
            if ok:
                r.patched = True
                result.segments_patched += 1
            else:
                r.error = info
                result.segments_failed += 1
                result.results.append(r)
                continue
        else:
            ok, info = create_segment(
                instance_url, access_token,
                api_name=d.api_name,
                display_name=d.display_name,
                description=d.description,
                target_dmo=d.target_dmo,
                filter_sql=d.filter_sql,
                publish_schedule=d.publish_schedule,
            )
            if ok:
                r.created = True
                result.segments_created += 1
            else:
                r.error = info
                result.segments_failed += 1
                result.results.append(r)
                continue

        if not skip_publish:
            ok, info = publish_segment(
                instance_url, access_token, api_name=d.api_name,
            )
            if ok:
                r.published = True
                result.segments_published += 1
            else:
                # Publish-only failure — segment was successfully created/patched
                # but couldn't trigger publish. Don't count toward `segments_failed`
                # (the create/patch succeeded); just record the publish error.
                r.error = f"publish failed: {info}"

        result.results.append(r)

    return result


def execute_refresh_streams(*, target_org: str) -> DataCloudStreamRefreshResult:
    """Refresh DC streams sourcing from hydrated objects.

    Thin wrapper around execute_phase5_5 from data_cloud.py, exposed as a
    standalone function so the new `refresh-streams` CLI subcommand can call
    it directly without going through the hydrate runner."""
    return execute_phase5_5(target_org=target_org)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration
source .venv/bin/activate
pytest tests/test_segments_orchestration.py -v
```

Expected: ~14 passed.

- [ ] **Step 5: Run full suite**

```bash
pytest -q 2>&1 | tail -3
```

Expected: 426 passed (412 prior + 14 new).

- [ ] **Step 6: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO
git add Customer_Hydration/customer_hydration/phase5/segments.py \
    Customer_Hydration/tests/test_segments_orchestration.py
git commit -m "feat(customer-hydration): add phase5/segments.py orchestration + YAML loader"
```

---

## Task 5: Add `refresh-streams` CLI subcommand

**Files:**
- Modify: `Customer_Hydration/customer_hydration/cli.py`
- Create: `Customer_Hydration/tests/test_cli_phase2.py`

TDD pair (smaller — just argparse + dispatch tests).

- [ ] **Step 1: Write the failing test for `refresh-streams`**

`Customer_Hydration/tests/test_cli_phase2.py`:

```python
"""Tests for Phase 2 CLI subcommands: refresh-streams + create-segments."""
from __future__ import annotations

from unittest.mock import patch

import pytest

from customer_hydration.cli import build_parser, main


class TestRefreshStreamsArgparse:
    def test_subcommand_parses(self):
        p = build_parser()
        args = p.parse_args([
            "refresh-streams", "--target-org", "jdo-fw51xz",
        ])
        assert args.subcommand == "refresh-streams"
        assert args.target_org == "jdo-fw51xz"

    def test_allow_production_flag_parses(self):
        p = build_parser()
        args = p.parse_args([
            "refresh-streams", "--target-org", "jdo-fw51xz",
            "--allow-production",
        ])
        assert args.allow_production is True


class TestRefreshStreamsDispatch:
    def test_no_target_org_returns_2(self):
        rc = main(["refresh-streams"])
        assert rc == 2

    @patch("customer_hydration.cli.SfRunner")
    @patch("customer_hydration.phase5.segments.execute_refresh_streams")
    def test_calls_execute_refresh_streams_when_sandbox(
        self, mock_exec, mock_runner,
    ):
        from customer_hydration.phase5.data_cloud import DataCloudStreamRefreshResult
        mock_runner.return_value._run.return_value = {
            "result": {"isSandbox": True}
        }
        mock_exec.return_value = DataCloudStreamRefreshResult(
            streams_discovered=3, streams_matched=2, streams_triggered=2,
        )
        rc = main(["refresh-streams", "--target-org", "alias"])
        assert rc == 0
        mock_exec.assert_called_once_with(target_org="alias")

    @patch("customer_hydration.cli.SfRunner")
    def test_non_sandbox_without_allow_production_returns_2(self, mock_runner):
        mock_runner.return_value._run.return_value = {
            "result": {"isSandbox": False}
        }
        rc = main(["refresh-streams", "--target-org", "alias"])
        assert rc == 2
```

- [ ] **Step 2: Run the test — expect failures (subcommand not in parser yet)**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration
source .venv/bin/activate
pytest tests/test_cli_phase2.py -v
```

Expected: argparse errors out on unknown subcommand `refresh-streams`.

- [ ] **Step 3: Add `refresh-streams` to `cli.py`**

Edit `Customer_Hydration/customer_hydration/cli.py`. Find the `build_parser()` function and the line where `dc-status` is added. Add immediately before/after:

```python
    p_refresh = sub.add_parser(
        "refresh-streams",
        help="Refresh DC streams sourcing from hydrated objects (Phase 2)",
    )
    _add_global_args(p_refresh)
    p_refresh.add_argument(
        "--allow-production", action="store_true",
        help="Required for non-sandbox orgs",
    )
```

Find `main()` and add the dispatch case (alongside the others):

```python
    if args.subcommand == "refresh-streams":
        return _run_refresh_streams(args)
```

Add the implementation function (in the body of the cli module, near the other `_run_*` helpers):

```python
def _run_refresh_streams(args) -> int:
    """Refresh DC streams sourcing from hydrated objects (Phase 2)."""
    if args.target_org is None:
        print("--target-org is required", file=sys.stderr)
        return 2

    runner = SfRunner(args.target_org)
    org_info = runner._run([  # noqa: SLF001
        "sf", "org", "display", "--target-org", args.target_org, "--json",
    ])
    is_sandbox = bool(org_info.get("result", {}).get("isSandbox", False))
    if not is_sandbox and not getattr(args, "allow_production", False):
        print(
            f"Refusing to refresh streams in non-sandbox org {args.target_org}. "
            f"Pass --allow-production to override.",
            file=sys.stderr,
        )
        return 2

    from customer_hydration.phase5.segments import execute_refresh_streams
    result = execute_refresh_streams(target_org=args.target_org)

    # Write a small manifest in output_dir
    from datetime import datetime, timezone
    from pathlib import Path
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M")
    manifest_path = Path(args.output_dir) / f"refresh-streams-{ts}.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps({
        "target_org": args.target_org,
        "streams_discovered": result.streams_discovered,
        "streams_matched": result.streams_matched,
        "streams_triggered": result.streams_triggered,
        "stream_runs": [
            {
                "stream_api_name": sr.stream_api_name,
                "source_object": sr.source_object,
                "run_id": sr.run_id,
                "status": sr.status,
                "triggered_at": sr.triggered_at,
                "error": sr.error,
            }
            for sr in result.stream_runs
        ],
        "stream_trigger_failures": result.stream_trigger_failures,
    }, indent=2), encoding="utf-8")

    print(f"Refreshed {result.streams_triggered} of {result.streams_matched} matched streams")
    print(f"Manifest: {manifest_path}")
    # Phase 5.5 fire-and-forget: even with trigger failures, exit 0
    return 0
```

- [ ] **Step 4: Run tests to verify pass**

```bash
pytest tests/test_cli_phase2.py::TestRefreshStreamsArgparse tests/test_cli_phase2.py::TestRefreshStreamsDispatch -v
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO
git add Customer_Hydration/customer_hydration/cli.py \
    Customer_Hydration/tests/test_cli_phase2.py
git commit -m "feat(customer-hydration): add refresh-streams CLI subcommand"
```

---

## Task 6: Add `create-segments` CLI subcommand

**Files:**
- Modify: `Customer_Hydration/customer_hydration/cli.py`
- Modify: `Customer_Hydration/tests/test_cli_phase2.py`

- [ ] **Step 1: Add tests to `test_cli_phase2.py`**

Append to `Customer_Hydration/tests/test_cli_phase2.py`:

```python
class TestCreateSegmentsArgparse:
    def test_subcommand_parses(self):
        p = build_parser()
        args = p.parse_args([
            "create-segments", "--target-org", "jdo-fw51xz",
        ])
        assert args.subcommand == "create-segments"

    def test_segment_id_flag(self):
        p = build_parser()
        args = p.parse_args([
            "create-segments", "--target-org", "alias", "--segment-id", "retail_all",
        ])
        assert args.segment_id == "retail_all"

    def test_skip_publish_flag(self):
        p = build_parser()
        args = p.parse_args([
            "create-segments", "--target-org", "alias", "--skip-publish",
        ])
        assert args.skip_publish is True

    def test_dry_run_flag(self):
        p = build_parser()
        args = p.parse_args([
            "create-segments", "--target-org", "alias", "--dry-run",
        ])
        assert args.dry_run is True


class TestCreateSegmentsDispatch:
    def test_dry_run_does_not_require_target_org(self, tmp_path):
        # Write a valid segments.yaml
        cfg = tmp_path / "config"
        cfg.mkdir()
        (cfg / "segments.yaml").write_text("""\
segments:
  retail_all:
    name: "Retail Customers"
    description: "x"
    persona: retail
    publish_schedule: hourly
    target_dmo: Account
    rule:
      type: sql
      filter: "X = 'Y'"
""")
        rc = main([
            "create-segments", "--config-dir", str(cfg), "--dry-run",
        ])
        assert rc == 0

    def test_no_target_org_and_not_dry_run_returns_2(self, tmp_path):
        cfg = tmp_path / "config"
        cfg.mkdir()
        (cfg / "segments.yaml").write_text("""\
segments:
  retail_all:
    name: "Retail Customers"
    description: "x"
    persona: retail
    publish_schedule: hourly
    target_dmo: Account
    rule:
      type: sql
      filter: "X = 'Y'"
""")
        rc = main([
            "create-segments", "--config-dir", str(cfg),
        ])
        assert rc == 2

    def test_missing_yaml_returns_2(self, tmp_path):
        cfg = tmp_path / "config"
        cfg.mkdir()  # exists but no segments.yaml
        rc = main([
            "create-segments", "--target-org", "alias", "--config-dir", str(cfg),
            "--dry-run",
        ])
        assert rc == 2

    @patch("customer_hydration.cli.SfRunner")
    @patch("customer_hydration.phase5.segments.execute_create_segments")
    def test_passes_flags_to_execute(self, mock_exec, mock_runner, tmp_path):
        from customer_hydration.phase5.segments import CreateSegmentsResult
        cfg = tmp_path / "config"
        cfg.mkdir()
        (cfg / "segments.yaml").write_text("""\
segments:
  retail_all:
    name: "Retail Customers"
    description: "x"
    persona: retail
    publish_schedule: hourly
    target_dmo: Account
    rule:
      type: sql
      filter: "X = 'Y'"
""")
        mock_runner.return_value._run.return_value = {"result": {"isSandbox": True}}
        mock_exec.return_value = CreateSegmentsResult(
            segments_processed=1, segments_created=1, segments_published=1,
        )
        rc = main([
            "create-segments", "--target-org", "alias", "--config-dir", str(cfg),
            "--segment-id", "retail_all", "--skip-publish",
        ])
        assert rc == 0
        kwargs = mock_exec.call_args.kwargs
        assert kwargs["segment_id"] == "retail_all"
        assert kwargs["skip_publish"] is True
        assert kwargs["dry_run"] is False
```

- [ ] **Step 2: Run tests — expect failures**

```bash
pytest tests/test_cli_phase2.py::TestCreateSegmentsArgparse -v
```

Expected: argparse errors on unknown subcommand `create-segments`.

- [ ] **Step 3: Add `create-segments` to `cli.py`**

In `build_parser()`, add the subparser:

```python
    p_segments = sub.add_parser(
        "create-segments",
        help="Create + publish DC segments from segments.yaml (Phase 2)",
    )
    _add_global_args(p_segments)
    p_segments.add_argument("--allow-production", action="store_true")
    p_segments.add_argument(
        "--segment-id", default=None,
        help="Process only one segment by config key",
    )
    p_segments.add_argument(
        "--skip-publish", action="store_true",
        help="Create/patch but don't publish",
    )
    p_segments.add_argument(
        "--dry-run", action="store_true",
        help="Print what would happen without making changes",
    )
```

In `main()` dispatch, add:

```python
    if args.subcommand == "create-segments":
        return _run_create_segments(args)
```

Add the implementation:

```python
def _run_create_segments(args) -> int:
    """Create + publish DC segments from segments.yaml (Phase 2)."""
    from pathlib import Path
    yaml_path = Path(args.config_dir) / "segments.yaml"
    if not yaml_path.exists():
        print(f"segments.yaml not found at {yaml_path}", file=sys.stderr)
        return 2

    if not args.dry_run:
        if args.target_org is None:
            print("--target-org is required (unless --dry-run)", file=sys.stderr)
            return 2
        runner = SfRunner(args.target_org)
        org_info = runner._run([  # noqa: SLF001
            "sf", "org", "display", "--target-org", args.target_org, "--json",
        ])
        is_sandbox = bool(org_info.get("result", {}).get("isSandbox", False))
        if not is_sandbox and not getattr(args, "allow_production", False):
            print(
                f"Refusing to create segments in non-sandbox org {args.target_org}. "
                f"Pass --allow-production to override.",
                file=sys.stderr,
            )
            return 2

    from customer_hydration.phase5.segments import execute_create_segments
    result = execute_create_segments(
        target_org=args.target_org or "DRY-RUN",
        yaml_path=yaml_path,
        segment_id=args.segment_id,
        skip_publish=args.skip_publish,
        dry_run=args.dry_run,
    )

    if not args.dry_run:
        from datetime import datetime, timezone
        ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M")
        manifest_path = Path(args.output_dir) / f"create-segments-{ts}.json"
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(json.dumps({
            "target_org": args.target_org,
            "segments_processed": result.segments_processed,
            "segments_created": result.segments_created,
            "segments_patched": result.segments_patched,
            "segments_published": result.segments_published,
            "segments_failed": result.segments_failed,
            "results": [
                {
                    "config_key": r.config_key,
                    "api_name": r.api_name,
                    "created": r.created,
                    "patched": r.patched,
                    "published": r.published,
                    "error": r.error,
                }
                for r in result.results
            ],
        }, indent=2), encoding="utf-8")
        print(f"Manifest: {manifest_path}")

    print(f"Segments processed: {result.segments_processed}")
    print(f"  Created: {result.segments_created}")
    print(f"  Patched: {result.segments_patched}")
    print(f"  Published: {result.segments_published}")
    print(f"  Failed: {result.segments_failed}")
    # Fire-and-forget: per-segment failures don't make the run exit non-zero
    return 0
```

- [ ] **Step 4: Run tests — expect pass**

```bash
pytest tests/test_cli_phase2.py -v
```

Expected: 13 passed (5 from Task 5 + 8 new).

- [ ] **Step 5: Run full suite**

```bash
pytest -q 2>&1 | tail -3
```

Expected: 434 passed (426 prior + 8 new).

- [ ] **Step 6: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO
git add Customer_Hydration/customer_hydration/cli.py \
    Customer_Hydration/tests/test_cli_phase2.py
git commit -m "feat(customer-hydration): add create-segments CLI subcommand"
```

---

## Task 7: Extend `dc-status` to report segment publication state

**Files:**
- Modify: `Customer_Hydration/customer_hydration/cli.py`
- Modify: `Customer_Hydration/tests/test_cli_phase2.py`

`dc-status` currently only reports stream runs. Phase 2 adds a Segments section.

- [ ] **Step 1: Add tests to `test_cli_phase2.py`**

Append:

```python
class TestDcStatusSegmentView:
    @patch("customer_hydration.phase5.data_cloud.get_org_session")
    @patch("customer_hydration.phase5.data_cloud.get_segment_status")
    def test_dc_status_polls_each_segment_in_yaml(
        self, mock_get_status, mock_sess, tmp_path,
    ):
        from customer_hydration.phase5.data_cloud import SegmentStatus
        cfg = tmp_path / "config"
        cfg.mkdir()
        (cfg / "segments.yaml").write_text("""\
segments:
  retail_all:
    name: "Retail Customers"
    description: "x"
    persona: retail
    publish_schedule: hourly
    target_dmo: Account
    rule:
      type: sql
      filter: "X = 'Y'"
  wealth_all:
    name: "Wealth Clients"
    description: "x"
    persona: wealth
    publish_schedule: hourly
    target_dmo: Account
    rule:
      type: sql
      filter: "X = 'Y'"
""")
        out = tmp_path / "output"
        out.mkdir()  # output dir with no manifest — segment-only path
        mock_sess.return_value = ("https://x.salesforce.com", "tok")
        mock_get_status.side_effect = [
            SegmentStatus("RetailAll__seg", "PUBLISHED", 1000, "2026-05-22T10:00:00Z"),
            SegmentStatus("WealthAll__seg", "PUBLISHING", None, None),
        ]
        rc = main([
            "dc-status", "--target-org", "alias",
            "--config-dir", str(cfg), "--output-dir", str(out),
        ])
        # dc-status should at least call get_segment_status for each entry
        # (return code may be 0 or 2 depending on whether mock_segment_status
        # returns success — we just verify it ran the segment view)
        assert mock_get_status.call_count == 2
```

- [ ] **Step 2: Run test — expect failure**

```bash
pytest tests/test_cli_phase2.py::TestDcStatusSegmentView -v
```

Expected: `mock_get_status.call_count` is 0, not 2 (the existing dc-status doesn't poll segments).

- [ ] **Step 3: Modify `_run_dc_status` in `cli.py`**

Find the existing `_run_dc_status` function in `cli.py`. After the existing stream-status output (the loop that calls `poll_stream_run_status`), add a new Segments section:

```python
    # NEW Phase 2 — segment publication state from segments.yaml
    if args.target_org:
        from pathlib import Path
        yaml_path = Path(args.config_dir) / "segments.yaml"
        if yaml_path.exists():
            try:
                from customer_hydration.phase5.segments import load_segment_definitions
                from customer_hydration.phase5.data_cloud import (
                    get_org_session, get_segment_status,
                )
                instance_url, access_token = get_org_session(args.target_org)
                definitions = load_segment_definitions(yaml_path)
                print()
                print("=== Segments ===")
                segment_complete = 0
                segment_in_progress = 0
                segment_failed = 0
                for sd in definitions:
                    status = get_segment_status(
                        instance_url, access_token, api_name=sd.api_name,
                    )
                    member_str = (
                        f"{status.member_count:,}"
                        if status.member_count is not None
                        else "?"
                    )
                    last_str = status.last_publish_time or "never"
                    print(f"  {sd.api_name:42s} {status.status:12s} "
                          f"members={member_str:>10s}  last={last_str}")
                    if status.status == "PUBLISHED":
                        segment_complete += 1
                    elif status.status in ("FAILED", "NOT_FOUND"):
                        segment_failed += 1
                    else:
                        segment_in_progress += 1
                print(
                    f"---\n{segment_complete} published, {segment_in_progress} in progress, "
                    f"{segment_failed} failed"
                )
            except Exception as exc:
                print(f"Segment polling failed: {exc}", file=sys.stderr)
```

- [ ] **Step 4: Run tests — expect pass**

```bash
pytest tests/test_cli_phase2.py::TestDcStatusSegmentView -v
```

Expected: 1 passed.

- [ ] **Step 5: Run full suite**

```bash
pytest -q 2>&1 | tail -3
```

Expected: 435 passed (434 prior + 1 new).

- [ ] **Step 6: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO
git add Customer_Hydration/customer_hydration/cli.py \
    Customer_Hydration/tests/test_cli_phase2.py
git commit -m "feat(customer-hydration): dc-status reports segment publication state (Phase 2)"
```

---

## Task 8: Live smoke — `refresh-streams` against jdo-fw51xz

**Files:** none (verification step)

This task verifies the `refresh-streams` CLI works end-to-end. No commit unless something needs fixing.

- [ ] **Step 1: Run refresh-streams**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration
source .venv/bin/activate
python hydrate.py refresh-streams --target-org jdo-fw51xz --allow-production
```

Expected output:

```
Refreshed N of M matched streams
Manifest: output/refresh-streams-2026-05-22THHMM.json
```

(N and M depend on how many streams the user has configured in DC. The Phase 1 `--data-cloud-only` smoke at session-start showed 0 streams; if the user has now configured them, N and M should both be non-zero.)

- [ ] **Step 2: Inspect the manifest**

```bash
cat output/refresh-streams-*.json | python3 -m json.tool | head -40
```

Expected: a JSON object with `streams_discovered`, `streams_matched`, `streams_triggered`, `stream_runs` (one entry per triggered stream with `run_id` populated), and an empty `stream_trigger_failures` list.

- [ ] **Step 3: Verify on the org side via dc-status**

```bash
python hydrate.py dc-status --target-org jdo-fw51xz
```

Expected: see "=== Streams ===" block with each triggered stream's status (Triggered/Success/InProgress) and row count.

If `streams_discovered == 0`: user hasn't configured any streams yet OR the REST endpoint shape this code expects doesn't match what the org returns. Check the manifest's `stream_trigger_failures` for clues. If endpoint discovery is the issue, surface as DONE_WITH_CONCERNS — Plan task to add an alternative endpoint probe in `phase5/data_cloud.py:list_streams`.

If everything works: status DONE.

---

## Task 9: Live smoke — `create-segments --dry-run`

**Files:** none (verification step)

- [ ] **Step 1: Run dry-run**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration
source .venv/bin/activate
python hydrate.py create-segments --target-org jdo-fw51xz --dry-run
```

Expected output (~22 lines):

```
  DRY-RUN would create/patch RetailAll__seg (Retail Customers)
  DRY-RUN would create/patch WealthAll__seg (Wealth Management Clients)
  DRY-RUN would create/patch SmbAll__seg (Small Business Clients)
  DRY-RUN would create/patch CommercialAll__seg (Commercial Banking Clients)
  DRY-RUN would create/patch WealthPreRetiree__seg (Wealth Pre-Retirees (55-65))
  ... (15 more) ...
  DRY-RUN would create/patch CmpMobileBankingAdoption__seg (Mobile Banking Adoption audience)
Segments processed: 20
  Created: 0
  Patched: 0
  Published: 0
  Failed: 0
```

- [ ] **Step 2: Verify the api_name format is correct in the output**

Each line should show `<PascalCase>__seg`. No `HYDRATE_` prefix. Confirms config_key_to_api_name works as designed.

- [ ] **Step 3: If output is wrong**

If the segment count is not 20, or any api_name has the wrong format, report DONE_WITH_CONCERNS and surface the specific issue. Otherwise: DONE.

---

## Task 10: Live smoke — `create-segments` (full)

**Files:** none (verification step)

This is the Phase 2 acceptance gate.

- [ ] **Step 1: Run live create-segments**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration
source .venv/bin/activate
python hydrate.py create-segments --target-org jdo-fw51xz --allow-production
```

Expected: ~20 segments created or patched + published; exit 0; manifest written. Wall-clock ~30-60 seconds (REST calls × 20 segments × 2-3 calls each).

If any segments fail with `HTTP 400`: capture the error from the manifest. Most likely: the filter SQL references a field name the DMO doesn't expose. Adjust segments.yaml and re-run (idempotent).

- [ ] **Step 2: Verify via dc-status**

```bash
python hydrate.py dc-status --target-org jdo-fw51xz
```

Expected: `=== Segments ===` section lists all 20 segments with `PUBLISHING` or `PUBLISHED` status. Member counts may be 0 initially if Data Cloud hasn't yet finished computing membership; re-run dc-status after a few minutes to see updated counts.

- [ ] **Step 3: Spot-check a single segment**

```bash
python hydrate.py dc-status --target-org jdo-fw51xz --json | python3 -c "
import json, sys
d = json.load(sys.stdin)
print('Segments by status:', {r[2]: 0 for r in d.get('rows', [])})
"
```

(The `dc-status --json` flag was added in Plan 5. If it doesn't already include segments in the JSON output, that's a Plan 5 / 6 polish — segments live in the human-readable section only. Don't block on it.)

- [ ] **Step 4: Status**

If 20 segments created + published with no failures: DONE.

If some failures + the rest succeeded: DONE_WITH_CONCERNS — list the failed segments + their errors. Iterate by editing `segments.yaml` and re-running `create-segments` (idempotent).

---

## Task 11: README + CHANGELOG closeout

**Files:**
- Modify: `Customer_Hydration/README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Append Phase 2 status to `Customer_Hydration/README.md`**

```bash
cat >> Customer_Hydration/README.md << 'EOF'

## Phase 2 status — DC stream refresh + segment creation

Phase 2 is **complete** when:

- [x] `customer_hydration/phase5/data_cloud.py` extended with `list_segments`, `create_segment`, `patch_segment`, `publish_segment`, `get_segment_status` REST methods + `SegmentInfo` / `SegmentStatus` dataclasses
- [x] `customer_hydration/phase5/segments.py` — YAML loader (`load_segment_definitions`), api-name converter (`config_key_to_api_name`), HYDRATE-* clause injector (`inject_hydrate_clause`), idempotent orchestrator (`execute_create_segments`)
- [x] `config/segments.yaml` defines 20 segments: 4 persona base + 6 lifecycle + 10 campaign-aligned. All target the Account DMO (FSC + Person Accounts org). HYDRATE-* clause auto-appended at load time.
- [x] CLI gains `refresh-streams` and `create-segments` subcommands (each with `--allow-production` guard)
- [x] `dc-status` extended to report segment publication state alongside stream-run state
- [x] All 435+ unit tests pass

### How to run Phase 2

```bash
cd Customer_Hydration
source .venv/bin/activate

# After Phase 1 records are loaded + DC streams configured + DMO mappings done:
python hydrate.py refresh-streams --target-org jdo-fw51xz --allow-production
python hydrate.py create-segments --target-org jdo-fw51xz --dry-run
python hydrate.py create-segments --target-org jdo-fw51xz --allow-production
python hydrate.py dc-status --target-org jdo-fw51xz
```

### Phase 2 idempotency contract

Re-running `create-segments` is safe:
- Existing segments → PATCHed with current YAML values
- Missing segments → POSTed (created)
- Publish always called (no-op if no changes; otherwise triggers fresh computation)

This makes it the canonical "republish all segments after Phase 1 data refresh" command.
EOF
```

- [ ] **Step 2: Add Phase 2 entry to top-level CHANGELOG.md**

Read the current top of `CHANGELOG.md` to match formatting, then prepend a new entry under the May 2026 section:

```bash
# Use Edit tool to insert this entry in CHANGELOG.md, just under "## [May 2026]":
```

Entry text:

```markdown
### 2026-05-22 — Customer_Hydration: Phase 2 (DC stream refresh + segment creation)
- **`Customer_Hydration/`** — Phase 2 extends the package with two new CLI subcommands and a third extension. `refresh-streams` (kicks the existing DC streams now that Phase 1 records are loaded), `create-segments` (reads new `config/segments.yaml`, creates + publishes 20 persona-driven segments via the DC REST API: 4 persona base + 6 lifecycle + 10 campaign-aligned, all targeting the Account DMO), and a `dc-status` extension that reports segment publication state alongside stream-run state. Architectural addition: `customer_hydration/phase5/segments.py` orchestrator + 5 new REST methods on `phase5/data_cloud.py` (`list_segments`, `create_segment`, `patch_segment`, `publish_segment`, `get_segment_status`). Idempotent: re-runs PATCH existing segments rather than duplicating. Member filtering scoped to `External_ID__c LIKE 'HYDRATE-%'` to avoid leaking the org's pre-existing 178 non-hydrate accounts. Test count grew from 399 → **435 unit tests, all green**. Live verification against `jdo-fw51xz`: refresh-streams kicks N matched streams; create-segments lands 20 segments in PUBLISHING or PUBLISHED state with non-zero member counts. Spec at `Customer_Hydration/docs/superpowers/specs/2026-05-22-phase-2-streams-and-segments-design.md`.
```

- [ ] **Step 3: Bump the badge date in CHANGELOG.md to May 22**

Find the existing `[![Updated](...May_21_2026...)]` line and change `21` to `22`.

- [ ] **Step 4: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO
git add Customer_Hydration/README.md CHANGELOG.md
git commit -m "docs(customer-hydration): mark Phase 2 acceptance + CHANGELOG entry"
```

---

## Task 12: AGENTS.md final pass for Phase 2

**Files:**
- Modify: `Customer_Hydration/AGENTS.md`

- [ ] **Step 1: Append Phase 2 entries to "Things that bite" section**

Find the existing "Things that bite" numbered list (currently goes through item 12 from Phase 1 close-out). Append:

```markdown
13. Phase 2 segments target the **Account DMO** because this is an FSC +
    Person Accounts org. Person Accounts merge Account + Contact into one
    sObject; the DC Account DMO mirrors that single-record-per-customer
    semantic. Don't try to use UnifiedIndividual or any unification DMO —
    the customer entity IS the Account record here.

14. Segment api_names are **deterministic but un-prefixed**:
    `<ConfigKeyInPascalCase>__seg`. No `HYDRATE_` prefix. Cleanup of just
    the Phase 2 segments uses `config/segments.yaml` as the canonical
    inventory (iterate the file, compute names, DELETE each), NOT a name
    prefix scan.

15. The HYDRATE-* member-filter clause is auto-injected into every segment
    rule.filter at YAML load time. Don't repeat it in segments.yaml entries.
    `inject_hydrate_clause` is idempotent — if the clause already appears,
    it's not double-added.
```

- [ ] **Step 2: Append a "Phase 2 history" subsection to "Plans 1–6 history"**

Find the existing "Plans 1–6 history" section (added in Plan 6) and append after the Plan 6 entry:

```markdown
- **Phase 2** (DC stream refresh + segment creation) — Two new CLI
  subcommands extend Customer_Hydration. `refresh-streams` (promotes
  Phase 5.5 `--data-cloud-only` to its own subcommand). `create-segments`
  (reads new `config/segments.yaml`, creates + publishes 20 persona-driven
  segments via DC REST API). `dc-status` extended to report segment state.
  20 segments: 4 persona base + 6 lifecycle + 10 campaign-aligned, all
  targeting the Account DMO. Test count: **435 unit tests, all green**.
  Spec: `docs/superpowers/specs/2026-05-22-phase-2-streams-and-segments-design.md`.
```

- [ ] **Step 3: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO
git add Customer_Hydration/AGENTS.md
git commit -m "docs(customer-hydration): AGENTS.md Phase 2 final pass"
```

---

## Plan done

After Task 12 the Phase 2 deliverables are complete: 20 segments live in `jdo-fw51xz`, streams refreshed, dc-status reports both, README/CHANGELOG/AGENTS.md updated. Total test count target: 435+. Total Phase 2 commits: 11 (one per task plus the verification tasks which don't commit).

If Tasks 8 / 9 / 10 surfaced live-org issues (REST endpoint shape mismatches, filter SQL field name corrections, etc.), those become follow-up commits on the same branch — `segments.yaml` is meant to be iterated.

---

## Self-review summary

Plan against spec:

- §1 Scope (5 deliverables: refresh-streams, create-segments, dc-status extension, segments.yaml, tests) → Tasks 5, 6, 7, 2, 3+4
- §2 File additions → Tasks 2, 3, 4, 5+6+7
- §3 segments.yaml → Task 2
- §4 5 REST methods + 2 dataclasses → Task 3
- §5 phase5/segments.py orchestration → Task 4
- §6 CLI changes → Tasks 5, 6, 7
- §7 Idempotency → Task 4 (PATCH-vs-POST logic in execute_create_segments)
- §8 Tests → Tasks 3, 4, 5, 6, 7 (each TDD pair)
- §9 Implementation plan task list → corresponds to Tasks 1-12
- §10 Success criteria → Tasks 8 (refresh-streams), 9 (dry-run), 10 (full create), README+CHANGELOG (Task 11), AGENTS.md (Task 12)

No spec gaps. No placeholder text. Type names consistent (`SegmentInfo`, `SegmentStatus`, `SegmentDefinition`, `SegmentCreateResult`, `CreateSegmentsResult` — all defined in Task 3 or Task 4 and used consistently in later tasks). All function signatures match between definition and use.
