"""Shared pytest fixtures for Customer_Hydration."""
from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[2]
PACKAGE_ROOT = REPO_ROOT / "Customer_Hydration"


@pytest.fixture
def package_root() -> Path:
    """Absolute path to the Customer_Hydration/ package root."""
    return PACKAGE_ROOT


@pytest.fixture
def anchor_date() -> date:
    """Anchor date used in spec — fixed for deterministic tests."""
    return date(2026, 5, 19)


@pytest.fixture
def fixed_seed() -> int:
    """Default RNG seed used across deterministic tests."""
    return 42
