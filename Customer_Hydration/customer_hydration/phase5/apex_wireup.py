"""Phase 5: deploy `force-app/` then run `apex/post_load_wireup.apex`.

Two stages:

1. ``deploy_force_app`` shells out to ``sf project deploy start`` so that
   ``FscGroupRollupBatch.cls`` (the fallback group rollup batch) exists in
   the target org before we run the wireup script.
2. ``run_apex_wireup`` shells out to ``sf apex run --file`` to execute the
   anonymous Apex script. Compile failures and runtime exceptions are
   surfaced through the JSON payload, NOT the subprocess exit code.

``execute_phase5`` glues the two together and returns an
:class:`ApexWireupResult` for the runner / manifest layer to record.
"""
from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path


@dataclass
class ApexWireupResult:
    """Outcome of a Phase 5 (deploy + apex run) invocation."""

    deployed_force_app: bool
    apex_run_succeeded: bool
    apex_stdout: str
    apex_stderr: str
    deploy_id: str | None = None
    apex_error: str | None = None


def deploy_force_app(
    *,
    force_app_dir: Path,
    target_org: str,
    run_tests: bool = False,
) -> tuple[bool, str | None]:
    """Deploy the force-app/ DX project to target org.

    Returns ``(success, deploy_id_or_error)``.

    If ``run_tests=True``, runs ``FscGroupRollupBatchTest`` as part of the
    deploy. For Plan 5's hydrate flow we DON'T run tests on every load —
    just the initial deploy gates them. Set ``run_tests=True`` for a one-time
    CI check.
    """
    cmd = [
        "sf", "project", "deploy", "start",
        "--source-dir", str(force_app_dir),
        "--target-org", target_org,
        "--wait", "20",
        "--json",
    ]
    if run_tests:
        cmd.extend([
            "--test-level", "RunSpecifiedTests",
            "--tests", "FscGroupRollupBatchTest",
        ])
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    try:
        payload = json.loads(proc.stdout)
        if proc.returncode == 0:
            deploy_id = (
                payload.get("result", {}).get("id")
                or payload.get("result", {}).get("deployId")
            )
            return (True, deploy_id)
        else:
            return (False, payload.get("message") or proc.stdout[:500])
    except json.JSONDecodeError:
        return (
            False,
            f"Non-JSON sf output: {proc.stdout[:500]} / stderr: {proc.stderr[:500]}",
        )


def run_apex_wireup(
    *,
    apex_file: Path,
    target_org: str,
) -> tuple[bool, str, str]:
    """Run an anonymous Apex script via ``sf apex run --file``.

    Returns ``(success, stdout, stderr)``.

    ``sf apex run --json`` outputs ``result.compiled`` (bool) and
    ``result.success`` (bool). Compile failures are NOT subprocess
    failures — they show up in the JSON.
    """
    cmd = [
        "sf", "apex", "run",
        "--file", str(apex_file),
        "--target-org", target_org,
        "--json",
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if proc.returncode != 0 and not proc.stdout:
        return (False, "", proc.stderr or f"sf apex run exited {proc.returncode}")
    try:
        payload = json.loads(proc.stdout)
        result = payload.get("result", {})
        compiled = result.get("compiled", False)
        success = result.get("success", False)
        logs = result.get("logs", "")
        if not compiled:
            return (
                False,
                logs,
                f"Apex compile failed: {result.get('compileProblem', 'unknown')}",
            )
        if not success:
            return (
                False,
                logs,
                f"Apex execution failed: {result.get('exceptionMessage', 'unknown')}",
            )
        return (True, logs, "")
    except json.JSONDecodeError:
        return (False, proc.stdout, "Non-JSON sf output (parse failed)")


def execute_phase5(
    *,
    package_root: Path,
    target_org: str,
    skip_deploy: bool = False,
) -> ApexWireupResult:
    """End-to-end Phase 5: deploy force-app/ then run the wireup Apex script.

    ``package_root`` is the absolute path to the ``Customer_Hydration``
    package — we expect ``package_root/force-app`` and
    ``package_root/apex/post_load_wireup.apex`` to exist.

    If ``skip_deploy`` is True, we assume ``force-app/`` is already
    deployed in the target org (e.g., from a previous run / CI step) and
    only execute the anonymous Apex script.
    """
    deployed = False
    deploy_id = None
    if not skip_deploy:
        force_app_dir = package_root / "force-app"
        deployed, deploy_id_or_err = deploy_force_app(
            force_app_dir=force_app_dir,
            target_org=target_org,
        )
        if deployed:
            deploy_id = deploy_id_or_err
        else:
            return ApexWireupResult(
                deployed_force_app=False,
                apex_run_succeeded=False,
                apex_stdout="",
                apex_stderr=f"Deploy failed: {deploy_id_or_err}",
                apex_error="deploy_failed",
            )

    # Run the anonymous Apex
    apex_file = package_root / "apex" / "post_load_wireup.apex"
    succeeded, stdout, stderr = run_apex_wireup(
        apex_file=apex_file,
        target_org=target_org,
    )
    return ApexWireupResult(
        deployed_force_app=deployed or skip_deploy,
        apex_run_succeeded=succeeded,
        apex_stdout=stdout,
        apex_stderr=stderr,
        deploy_id=deploy_id,
        apex_error=None if succeeded else stderr,
    )
