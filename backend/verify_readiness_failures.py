from __future__ import annotations

import tempfile
from pathlib import Path

from .db import connect, schema_health_error
from .server import readiness_error


def main() -> int:
    with tempfile.TemporaryDirectory() as tmpdir_name:
        tmpdir = Path(tmpdir_name)
        broken = connect(tmpdir / "broken.sqlite3")
        broken.close()
        assert readiness_error(broken) == "database unavailable"

        incompatible = connect(tmpdir / "incompatible.sqlite3")
        try:
            incompatible.execute("CREATE TABLE users (id TEXT PRIMARY KEY)")
            incompatible.commit()
            assert schema_health_error(incompatible) is not None
            assert readiness_error(incompatible) == "missing table: schema_migrations"
        finally:
            incompatible.close()
    print("verify:readiness-failures PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
