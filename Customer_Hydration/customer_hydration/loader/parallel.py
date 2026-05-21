"""Parallel-within-wave bulk loader with retry/backoff.

Each wave's CSVs run as concurrent subprocesses via ThreadPoolExecutor.
Threads (not processes) are appropriate because the unit of work is a
shell-out to ``sf data upsert bulk`` — the GIL is released during the
subprocess wait, and threads share the parent's auth-cached environment
without IPC.

Per-CSV failure surfaces in :class:`CsvLoadResult` (``error`` set when
all retries exhaust). Callers decide whether to start the next wave by
inspecting :attr:`WaveResult.failed_csvs`. ``run_wave_parallel`` itself
does NOT fail-fast within a wave: every spec runs to completion (or
exhaustion) so a single bad CSV doesn't cancel sibling work that could
have succeeded.

Retry semantics: ``bulk_upsert`` raises ``RuntimeError`` only on
subprocess non-zero exit — auth, HTTP 5xx, job-state errors. Those are
transient and worth retrying. Row-level validation failures come back
as ``records_failed > 0`` from a *successful* invocation; we do NOT
retry those because they're deterministic (rerunning gives identical
row-level errors and just costs API calls).
"""
from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from pathlib import Path

from customer_hydration.loader._legacy import BulkLoadResult, bulk_upsert
from customer_hydration.loader.wave import Wave


@dataclass
class RetryPolicy:
    """Exponential backoff policy for transient subprocess failures.

    Defaults yield retry intervals of 1s, 2s, 4s, 8s, 16s — a hair under
    half a minute total worst-case before declaring a CSV unrecoverable.
    """

    max_attempts: int = 5
    base_backoff_s: float = 1.0
    backoff_multiplier: float = 2.0


@dataclass
class CsvLoadSpec:
    """Single CSV to upsert in a wave."""

    sobject: str
    csv_path: Path
    external_id_field: str


@dataclass
class CsvLoadResult:
    """Outcome of one CSV load (after all retries).

    ``error`` is ``None`` for clean runs OR for runs whose only
    failures were row-level (``records_failed > 0``). It is set only
    when subprocess invocation itself failed every retry.
    """

    sobject: str
    csv_path: Path
    records_processed: int = 0
    records_failed: int = 0
    duration_s: float = 0.0
    attempts: int = 1
    error: str | None = None


@dataclass
class WaveResult:
    """Aggregate outcome of one wave."""

    wave_name: str
    csv_results: list[CsvLoadResult] = field(default_factory=list)
    total_duration_s: float = 0.0

    @property
    def failed_csvs(self) -> list[CsvLoadResult]:
        """CSVs with row-level failures OR exhausted-retry hard errors."""
        return [
            r for r in self.csv_results
            if r.records_failed > 0 or r.error is not None
        ]

    @property
    def total_records_processed(self) -> int:
        return sum(r.records_processed for r in self.csv_results)

    @property
    def total_records_failed(self) -> int:
        return sum(r.records_failed for r in self.csv_results)


def run_wave_parallel(
    *,
    wave: Wave,
    specs: list[CsvLoadSpec],
    target_org: str,
    parallel: int = 4,
    retry: RetryPolicy | None = None,
) -> WaveResult:
    """Run all CSVs in ``specs`` concurrently against ``target_org``.

    Returns once every spec has resolved (success, row-fail, or hard
    error after retry exhaustion). The wave-level fail-fast decision
    is delegated to the caller via :attr:`WaveResult.failed_csvs`.
    """
    if retry is None:
        retry = RetryPolicy()
    start = time.time()
    result = WaveResult(wave_name=wave.name)
    with ThreadPoolExecutor(max_workers=parallel) as executor:
        future_to_spec = {
            executor.submit(_run_one_csv_with_retry, spec, target_org, retry): spec
            for spec in specs
        }
        for future in as_completed(future_to_spec):
            result.csv_results.append(future.result())
    result.total_duration_s = time.time() - start
    return result


def _run_one_csv_with_retry(
    spec: CsvLoadSpec,
    target_org: str,
    retry: RetryPolicy,
) -> CsvLoadResult:
    """Run one CSV, retrying subprocess RuntimeError up to retry.max_attempts."""
    last_error: Exception | None = None
    csv_start = time.time()
    for attempt in range(1, retry.max_attempts + 1):
        try:
            bulk_result: BulkLoadResult = bulk_upsert(
                spec.csv_path,
                spec.sobject,
                spec.external_id_field,
                target_org,
            )
            return CsvLoadResult(
                sobject=spec.sobject,
                csv_path=spec.csv_path,
                records_processed=bulk_result.records_processed,
                records_failed=bulk_result.records_failed,
                duration_s=time.time() - csv_start,
                attempts=attempt,
            )
        except RuntimeError as exc:
            last_error = exc
            if attempt < retry.max_attempts:
                backoff = retry.base_backoff_s * (
                    retry.backoff_multiplier ** (attempt - 1)
                )
                if backoff > 0:
                    time.sleep(backoff)
                continue
    return CsvLoadResult(
        sobject=spec.sobject,
        csv_path=spec.csv_path,
        duration_s=time.time() - csv_start,
        attempts=retry.max_attempts,
        error=str(last_error),
    )
