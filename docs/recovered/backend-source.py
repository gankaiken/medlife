"""
Recovered backend source snapshot.

This file was previously mislabeled as an `.mp3` during repo recovery.
It is kept here only as an archival reference and is not used by the
runtime application.
"""

from __future__ import annotations

import os
import threading
from pathlib import Path
from typing import Optional


def _load_env_local() -> None:
    """Minimal .env.local loader without external dependencies."""
    env_path = Path(__file__).resolve().parent / ".env.local"
    if not env_path.exists():
        return
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if not key:
            continue
        if os.environ.get(key, "") == "":
            os.environ[key] = value


# Recovered snapshot intentionally truncated here.
