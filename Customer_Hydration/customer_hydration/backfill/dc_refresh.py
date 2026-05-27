"""Phase 4d DC stream refresh trigger.

Wraps phase5.data_cloud primitives with the Plan 4d-specific contract:
return (status, run_id, fallback_message) so the orchestrator can emit
the right manifest entry + a follow-up nudge when the stream is in
UPSERT refresh mode (spec §6.2 row 'DC stream is refreshMode UPSERT').
"""
from __future__ import annotations

import logging

from customer_hydration.phase5.data_cloud import (
    get_org_session,
    trigger_stream_refresh,
)

logger = logging.getLogger(__name__)


# Default stream name. Operators can override via the orchestrator argument.
# Verified in jdo-uqj0jr (2026-05-27): the SalesforceDotCom-typed Account
# stream is named "Account_Home". The earlier default "Account_jdo" was a
# spec-time guess that didn't match any of the org's 289 streams.
DEFAULT_ACCOUNT_STREAM_NAME: str = "Account_Home"


_UI_FALLBACK_HINT = (
    "Stream {stream!r} returned HTTP 412 — it is in UPSERT refresh mode and "
    "REST cannot trigger a one-shot full refresh. Run the playwright fallback: "
    "skill `dc-stream-full-refresh-via-ui` (see AGENTS.md note 18)."
)


def refresh_account_stream(
    *,
    target_org: str,
    stream_name: str = DEFAULT_ACCOUNT_STREAM_NAME,
) -> tuple[str, str | None, str | None]:
    """Trigger the Account stream refresh. Returns (status, run_id, fallback_message).

    status is one of:
      - 'Triggered'      — REST trigger succeeded
      - 'PolicySkipped'  — stream is UPSERT-mode (412); fallback_message guides the operator
      - 'Skipped'        — stream not found or auth resolution failed
      - 'Failed'         — other non-policy failure (5xx, network, etc.)

    fallback_message is None on success; otherwise a human-readable hint.

    Never raises — all errors are returned as Skipped/Failed. The orchestrator
    decides whether to surface them as warnings (rc=0) or partial-failure (rc=2).
    """
    try:
        instance_url, access_token = get_org_session(target_org)
    except Exception as exc:  # noqa: BLE001
        logger.warning("DC refresh skipped — cannot resolve org session: %s", exc)
        return ("Skipped", None, f"sf org display failed: {exc}")

    success, run_id, error = trigger_stream_refresh(
        instance_url, access_token, stream_name,
    )
    if success:
        return ("Triggered", run_id, None)

    err_text = error or ""
    err_lower = err_text.lower()
    # Policy-skipped covers any rejection where the API accepted the request
    # but the stream config blocked the operation (vs. real 5xx/network errors).
    is_policy = (
        "412" in err_text
        or "upsert" in err_lower
        or "policy" in err_lower
        or "full_refresh" in err_lower
        or "not allowed" in err_lower
        or "non-interactive" in err_lower
    )
    if is_policy:
        return (
            "PolicySkipped",
            None,
            _UI_FALLBACK_HINT.format(stream=stream_name) + f" (raw: {err_text})",
        )
    if "404" in err_text or "not found" in err_lower:
        return (
            "Skipped",
            None,
            f"Stream {stream_name!r} not found in org: {err_text}",
        )
    return ("Failed", None, err_text)
