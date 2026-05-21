"""Tests for customer_hydration.phase5.apex_wireup.

All ``sf`` invocations are mocked at the boundary
(``customer_hydration.phase5.apex_wireup.subprocess.run``).
"""
from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from customer_hydration.phase5 import apex_wireup
from customer_hydration.phase5.apex_wireup import (
    ApexWireupResult,
    deploy_force_app,
    execute_phase5,
    run_apex_wireup,
)


def _proc(*, returncode: int = 0, stdout: str = "", stderr: str = "") -> SimpleNamespace:
    """Build a stand-in for ``subprocess.CompletedProcess``."""
    return SimpleNamespace(returncode=returncode, stdout=stdout, stderr=stderr)


# --------------------------------------------------------------------------
# deploy_force_app
# --------------------------------------------------------------------------

def test_deploy_force_app_success():
    """Returncode 0 + JSON with result.id => (True, deploy_id)."""
    deploy_id = "0Af0X00001AbCdEFGHi"
    payload = {"status": 0, "result": {"id": deploy_id, "status": "Succeeded"}}
    fake = _proc(returncode=0, stdout=json.dumps(payload))
    with patch.object(apex_wireup.subprocess, "run", return_value=fake):
        ok, returned_id = deploy_force_app(
            force_app_dir=Path("/tmp/force-app"),
            target_org="my-org",
        )
    assert ok is True
    assert returned_id == deploy_id


def test_deploy_force_app_failure():
    """Returncode 1 => (False, error_message)."""
    payload = {"status": 1, "message": "Component FscGroupRollupBatch failed"}
    fake = _proc(returncode=1, stdout=json.dumps(payload))
    with patch.object(apex_wireup.subprocess, "run", return_value=fake):
        ok, err = deploy_force_app(
            force_app_dir=Path("/tmp/force-app"),
            target_org="my-org",
        )
    assert ok is False
    assert err is not None
    assert "FscGroupRollupBatch" in err


def test_deploy_force_app_with_run_tests_adds_flags():
    """run_tests=True must add --test-level and --tests flags."""
    captured: dict = {}

    def fake_run(cmd, *args, **kwargs):
        captured["cmd"] = list(cmd)
        return _proc(
            returncode=0,
            stdout=json.dumps({"result": {"id": "0Af000"}}),
        )

    with patch.object(apex_wireup.subprocess, "run", side_effect=fake_run):
        deploy_force_app(
            force_app_dir=Path("/tmp/force-app"),
            target_org="my-org",
            run_tests=True,
        )

    cmd = captured["cmd"]
    assert "--test-level" in cmd
    assert "RunSpecifiedTests" in cmd
    assert "--tests" in cmd
    assert "FscGroupRollupBatchTest" in cmd
    # And the index relationship is correct (flag immediately precedes value)
    assert cmd[cmd.index("--test-level") + 1] == "RunSpecifiedTests"
    assert cmd[cmd.index("--tests") + 1] == "FscGroupRollupBatchTest"


# --------------------------------------------------------------------------
# run_apex_wireup
# --------------------------------------------------------------------------

def test_run_apex_wireup_success():
    """compiled=true, success=true => (True, logs, '')."""
    payload = {
        "result": {
            "compiled": True,
            "success": True,
            "logs": "DEBUG|Wireup OK\n",
        }
    }
    fake = _proc(returncode=0, stdout=json.dumps(payload))
    with patch.object(apex_wireup.subprocess, "run", return_value=fake):
        ok, stdout, stderr = run_apex_wireup(
            apex_file=Path("/tmp/post_load_wireup.apex"),
            target_org="my-org",
        )
    assert ok is True
    assert "DEBUG|Wireup OK" in stdout
    assert stderr == ""


def test_run_apex_wireup_compile_failure():
    """compiled=false => (False, _, error including compileProblem)."""
    payload = {
        "result": {
            "compiled": False,
            "success": False,
            "compileProblem": "Variable does not exist: FscGroupRollupBatch",
            "logs": "",
        }
    }
    fake = _proc(returncode=0, stdout=json.dumps(payload))
    with patch.object(apex_wireup.subprocess, "run", return_value=fake):
        ok, stdout, stderr = run_apex_wireup(
            apex_file=Path("/tmp/post_load_wireup.apex"),
            target_org="my-org",
        )
    assert ok is False
    assert "compile" in stderr.lower()
    assert "FscGroupRollupBatch" in stderr


def test_run_apex_wireup_runtime_failure():
    """compiled=true, success=false => (False, _, error including exceptionMessage)."""
    payload = {
        "result": {
            "compiled": True,
            "success": False,
            "exceptionMessage": "System.QueryException: List has no rows",
            "logs": "DEBUG|Started\n",
        }
    }
    fake = _proc(returncode=0, stdout=json.dumps(payload))
    with patch.object(apex_wireup.subprocess, "run", return_value=fake):
        ok, stdout, stderr = run_apex_wireup(
            apex_file=Path("/tmp/post_load_wireup.apex"),
            target_org="my-org",
        )
    assert ok is False
    assert "execution failed" in stderr.lower()
    assert "QueryException" in stderr
    assert stdout == "DEBUG|Started\n"


def test_run_apex_wireup_non_json_output_returns_failure():
    """Non-JSON stdout => (False, stdout, parse-error)."""
    fake = _proc(returncode=0, stdout="this is not json at all")
    with patch.object(apex_wireup.subprocess, "run", return_value=fake):
        ok, stdout, stderr = run_apex_wireup(
            apex_file=Path("/tmp/post_load_wireup.apex"),
            target_org="my-org",
        )
    assert ok is False
    assert "this is not json" in stdout
    assert "Non-JSON" in stderr or "parse" in stderr.lower()


# --------------------------------------------------------------------------
# execute_phase5
# --------------------------------------------------------------------------

def test_execute_phase5_deploys_then_runs_apex(tmp_path: Path):
    """Both deploy and apex-run are invoked; result is fully populated."""
    # Both calls succeed
    deploy_payload = {"result": {"id": "0Af0X00001"}}
    apex_payload = {
        "result": {"compiled": True, "success": True, "logs": "OK"}
    }
    procs = [
        _proc(returncode=0, stdout=json.dumps(deploy_payload)),
        _proc(returncode=0, stdout=json.dumps(apex_payload)),
    ]
    with patch.object(apex_wireup.subprocess, "run", side_effect=procs) as run_mock:
        result = execute_phase5(
            package_root=tmp_path,
            target_org="my-org",
        )
    assert run_mock.call_count == 2
    # First call should be deploy
    first_cmd = run_mock.call_args_list[0].args[0]
    assert "project" in first_cmd and "deploy" in first_cmd
    # Second call should be apex run
    second_cmd = run_mock.call_args_list[1].args[0]
    assert "apex" in second_cmd and "run" in second_cmd

    assert isinstance(result, ApexWireupResult)
    assert result.deployed_force_app is True
    assert result.apex_run_succeeded is True
    assert result.deploy_id == "0Af0X00001"
    assert result.apex_error is None
    assert "OK" in result.apex_stdout


def test_execute_phase5_skip_deploy_skips_deploy_call(tmp_path: Path):
    """skip_deploy=True only fires the apex subprocess.run call."""
    apex_payload = {
        "result": {"compiled": True, "success": True, "logs": "OK"}
    }
    fake = _proc(returncode=0, stdout=json.dumps(apex_payload))
    with patch.object(apex_wireup.subprocess, "run", return_value=fake) as run_mock:
        result = execute_phase5(
            package_root=tmp_path,
            target_org="my-org",
            skip_deploy=True,
        )
    assert run_mock.call_count == 1
    only_cmd = run_mock.call_args_list[0].args[0]
    assert "apex" in only_cmd and "run" in only_cmd
    assert result.deployed_force_app is True  # skip_deploy => treated as deployed
    assert result.apex_run_succeeded is True
    assert result.deploy_id is None


def test_execute_phase5_returns_failure_when_deploy_fails(tmp_path: Path):
    """If deploy fails, no apex run subprocess call and result reflects the failure."""
    deploy_payload = {"status": 1, "message": "Deploy blew up"}
    fake = _proc(returncode=1, stdout=json.dumps(deploy_payload))
    with patch.object(apex_wireup.subprocess, "run", return_value=fake) as run_mock:
        result = execute_phase5(
            package_root=tmp_path,
            target_org="my-org",
        )
    assert run_mock.call_count == 1  # Only the deploy attempt
    assert result.deployed_force_app is False
    assert result.apex_run_succeeded is False
    assert result.apex_error == "deploy_failed"
    assert "Deploy failed" in result.apex_stderr
    assert "Deploy blew up" in result.apex_stderr
