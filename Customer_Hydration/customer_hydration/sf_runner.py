"""Subprocess wrapper around the `sf` CLI.

Every call shells out to `sf data query` or `sf sobject describe` with
`--json`. We parse stdout, raise on non-zero exit, and return Python dicts
or lists. No long-lived session — the user's `sf config` selects the org.
"""
from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass


class SfCliError(RuntimeError):
    """Raised when `sf` returns non-zero or emits invalid JSON."""


@dataclass
class SfRunner:
    """Run `sf` CLI commands against a given target-org alias."""

    target_org: str
    timeout_s: int = 120

    def query(self, soql: str) -> list[dict]:
        """Run a SOQL query and return the records."""
        cmd = [
            "sf", "data", "query",
            "--query", soql,
            "--target-org", self.target_org,
            "--json",
        ]
        result = self._run(cmd)
        return result.get("result", {}).get("records", [])

    def describe(self, sobject: str) -> dict:
        """Describe an sObject and return the full describe payload."""
        cmd = [
            "sf", "sobject", "describe",
            "--sobject", sobject,
            "--target-org", self.target_org,
            "--json",
        ]
        result = self._run(cmd)
        return result.get("result", {})

    def _run(self, cmd: list[str]) -> dict:
        try:
            proc = subprocess.run(
                cmd, capture_output=True, text=True,
                check=False, timeout=self.timeout_s,
            )
        except subprocess.TimeoutExpired as exc:
            raise SfCliError(f"sf CLI timed out after {self.timeout_s}s: {' '.join(cmd)}") from exc

        if proc.returncode != 0:
            raise SfCliError(
                f"sf CLI exit {proc.returncode}: {proc.stderr.strip() or proc.stdout.strip()}"
            )
        try:
            return json.loads(proc.stdout)
        except json.JSONDecodeError as exc:
            raise SfCliError(f"sf CLI returned non-JSON output: {proc.stdout[:200]}") from exc
