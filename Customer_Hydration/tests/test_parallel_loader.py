"""Tests for loader/parallel.py — wave-parallel bulk loader with retry.

Covers RetryPolicy defaults, CsvLoadResult shape, WaveResult aggregate
properties, and run_wave_parallel concurrency + retry behavior. The
underlying `bulk_upsert` is patched so no real subprocess fires.
"""
from __future__ import annotations

import time
from pathlib import Path
from unittest.mock import patch

import pytest

from customer_hydration.loader._legacy import BulkLoadResult
from customer_hydration.loader.parallel import (
    CsvLoadResult,
    CsvLoadSpec,
    RetryPolicy,
    WaveResult,
    run_wave_parallel,
)
from customer_hydration.loader.wave import WAVE_DEFS


# ---------------------------------------------------------------------------
# RetryPolicy
# ---------------------------------------------------------------------------


class TestRetryPolicy:
    def test_default_retry_policy_max_5_attempts(self) -> None:
        assert RetryPolicy().max_attempts == 5

    def test_default_base_backoff_1s(self) -> None:
        assert RetryPolicy().base_backoff_s == 1.0


# ---------------------------------------------------------------------------
# CsvLoadResult
# ---------------------------------------------------------------------------


class TestCsvLoadResult:
    def test_default_load_result_no_error(self) -> None:
        r = CsvLoadResult(sobject="Account", csv_path=Path("/tmp/a.csv"))
        assert r.error is None
        assert r.records_processed == 0
        assert r.records_failed == 0
        assert r.attempts == 1
        assert r.duration_s == 0.0

    def test_load_result_with_failed_records(self) -> None:
        r = CsvLoadResult(
            sobject="Contact",
            csv_path=Path("/tmp/c.csv"),
            records_processed=10,
            records_failed=2,
        )
        assert r.records_failed == 2
        assert r.error is None  # row-level fails != hard error

    def test_load_result_with_unrecoverable_error(self) -> None:
        r = CsvLoadResult(
            sobject="Account",
            csv_path=Path("/tmp/a.csv"),
            attempts=5,
            error="sf data upsert bulk failed (exit 1): auth expired",
        )
        assert r.error is not None
        assert r.attempts == 5


# ---------------------------------------------------------------------------
# WaveResult aggregate properties
# ---------------------------------------------------------------------------


class TestWaveResultProperties:
    def test_failed_csvs_list_includes_records_failed_and_errors(self) -> None:
        ok = CsvLoadResult(
            sobject="Account", csv_path=Path("/tmp/ok.csv"),
            records_processed=10, records_failed=0,
        )
        row_fail = CsvLoadResult(
            sobject="Contact", csv_path=Path("/tmp/c.csv"),
            records_processed=8, records_failed=2,
        )
        hard_err = CsvLoadResult(
            sobject="Opportunity", csv_path=Path("/tmp/o.csv"),
            error="auth expired",
        )
        wr = WaveResult(wave_name="D", csv_results=[ok, row_fail, hard_err])
        failed = wr.failed_csvs
        assert ok not in failed
        assert row_fail in failed
        assert hard_err in failed
        assert len(failed) == 2

    def test_total_records_processed_sums(self) -> None:
        wr = WaveResult(
            wave_name="D",
            csv_results=[
                CsvLoadResult(sobject="A", csv_path=Path("/a"), records_processed=10),
                CsvLoadResult(sobject="B", csv_path=Path("/b"), records_processed=25),
                CsvLoadResult(sobject="C", csv_path=Path("/c"), records_processed=7),
            ],
        )
        assert wr.total_records_processed == 42

    def test_total_records_failed_sums(self) -> None:
        wr = WaveResult(
            wave_name="D",
            csv_results=[
                CsvLoadResult(sobject="A", csv_path=Path("/a"), records_failed=2),
                CsvLoadResult(sobject="B", csv_path=Path("/b"), records_failed=0),
                CsvLoadResult(sobject="C", csv_path=Path("/c"), records_failed=3),
            ],
        )
        assert wr.total_records_failed == 5


# ---------------------------------------------------------------------------
# run_wave_parallel
# ---------------------------------------------------------------------------


def _spec(sobject: str, name: str = "x.csv") -> CsvLoadSpec:
    return CsvLoadSpec(
        sobject=sobject,
        csv_path=Path(f"/tmp/{name}"),
        external_id_field="External_ID__c",
    )


# A small RetryPolicy for tests so failing-path tests don't actually sleep
# 1+2+4+8 = 15s on the exhaustion case.
_FAST_RETRY = RetryPolicy(max_attempts=5, base_backoff_s=0.0, backoff_multiplier=1.0)


class TestRunWaveParallel:
    def test_runs_all_specs_in_wave(self) -> None:
        wave = WAVE_DEFS["D"]
        specs = [_spec("Account", "1.csv"), _spec("Contact", "2.csv"), _spec("Opportunity", "3.csv")]

        with patch(
            "customer_hydration.loader.parallel.bulk_upsert",
            return_value=BulkLoadResult(records_processed=5, records_failed=0),
        ):
            result = run_wave_parallel(
                wave=wave, specs=specs, target_org="demo",
                parallel=2, retry=_FAST_RETRY,
            )

        assert isinstance(result, WaveResult)
        assert result.wave_name == "D"
        assert len(result.csv_results) == 3
        assert {r.sobject for r in result.csv_results} == {"Account", "Contact", "Opportunity"}

    def test_records_processed_propagates(self) -> None:
        wave = WAVE_DEFS["D"]
        specs = [_spec("Account")]
        with patch(
            "customer_hydration.loader.parallel.bulk_upsert",
            return_value=BulkLoadResult(records_processed=10, records_failed=0),
        ):
            result = run_wave_parallel(
                wave=wave, specs=specs, target_org="demo",
                parallel=1, retry=_FAST_RETRY,
            )
        assert result.csv_results[0].records_processed == 10
        assert result.csv_results[0].records_failed == 0
        assert result.csv_results[0].attempts == 1
        assert result.csv_results[0].error is None

    def test_records_failed_propagates(self) -> None:
        wave = WAVE_DEFS["D"]
        specs = [_spec("Account")]
        with patch(
            "customer_hydration.loader.parallel.bulk_upsert",
            return_value=BulkLoadResult(records_processed=8, records_failed=2),
        ):
            result = run_wave_parallel(
                wave=wave, specs=specs, target_org="demo",
                parallel=1, retry=_FAST_RETRY,
            )
        assert result.csv_results[0].records_processed == 8
        assert result.csv_results[0].records_failed == 2
        # Row-level failures don't trigger retry — bulk_upsert returned cleanly.
        assert result.csv_results[0].attempts == 1
        assert result.csv_results[0].error is None

    def test_retries_on_runtime_error_then_succeeds(self) -> None:
        wave = WAVE_DEFS["D"]
        specs = [_spec("Account")]
        side_effects = [
            RuntimeError("transient HTTP 500"),
            RuntimeError("transient HTTP 503"),
            BulkLoadResult(records_processed=4, records_failed=0),
        ]
        with patch(
            "customer_hydration.loader.parallel.bulk_upsert",
            side_effect=side_effects,
        ):
            result = run_wave_parallel(
                wave=wave, specs=specs, target_org="demo",
                parallel=1, retry=_FAST_RETRY,
            )
        only = result.csv_results[0]
        assert only.attempts == 3
        assert only.records_processed == 4
        assert only.error is None

    def test_retries_exhausted_records_error(self) -> None:
        wave = WAVE_DEFS["D"]
        specs = [_spec("Account")]
        with patch(
            "customer_hydration.loader.parallel.bulk_upsert",
            side_effect=[RuntimeError("auth expired")] * 5,
        ):
            result = run_wave_parallel(
                wave=wave, specs=specs, target_org="demo",
                parallel=1, retry=_FAST_RETRY,
            )
        only = result.csv_results[0]
        assert only.attempts == 5
        assert only.error is not None
        assert "auth expired" in only.error

    def test_runs_concurrently(self) -> None:
        wave = WAVE_DEFS["D"]
        specs = [_spec("Account", f"{i}.csv") for i in range(4)]

        def slow_upsert(*args: object, **kwargs: object) -> BulkLoadResult:
            time.sleep(0.1)
            return BulkLoadResult(records_processed=1, records_failed=0)

        with patch(
            "customer_hydration.loader.parallel.bulk_upsert",
            side_effect=slow_upsert,
        ):
            start = time.time()
            result = run_wave_parallel(
                wave=wave, specs=specs, target_org="demo",
                parallel=4, retry=_FAST_RETRY,
            )
            elapsed = time.time() - start

        assert len(result.csv_results) == 4
        # Sequential would be ~0.4s; with 4 workers we expect close to 0.1s.
        assert elapsed < 0.3, f"expected concurrent execution, got {elapsed:.3f}s"
