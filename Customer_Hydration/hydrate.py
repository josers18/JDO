#!/usr/bin/env python3
"""Customer_Hydration CLI entrypoint."""
from __future__ import annotations

import sys

from customer_hydration.cli import main


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
