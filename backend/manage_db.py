from __future__ import annotations

import os
import sys
from pathlib import Path

from .db import connect, resolve_database_path, run_migrations, sqlite_backup, sqlite_restore


def _default_backup_path(db_path: Path) -> Path:
    stamp = db_path.with_suffix("")
    return stamp.parent / f"{stamp.name}.backup.sqlite3"


def main() -> int:
    command = sys.argv[1] if len(sys.argv) > 1 else "migrate"
    db_path = resolve_database_path(os.environ.get("MEDLIFE_DB_PATH"))

    if command == "restore":
        if len(sys.argv) < 3:
            print("usage: python -m backend.manage_db restore <backup_path>")
            return 1
        source_path = Path(sys.argv[2]).expanduser().resolve()
        sqlite_restore(source_path, db_path)
        print(f"database={db_path}")
        print(f"restored_from={source_path}")
        return 0

    conn = connect(db_path)
    try:
        if command == "migrate":
            applied = run_migrations(conn)
            print(f"database={db_path}")
            print(f"applied={','.join(applied) if applied else 'none'}")
            return 0
        if command == "backup":
            target_path = Path(sys.argv[2]).expanduser().resolve() if len(sys.argv) > 2 else _default_backup_path(db_path)
            sqlite_backup(conn, target_path)
            print(f"database={db_path}")
            print(f"backup={target_path}")
            return 0
        print("usage: python -m backend.manage_db migrate|backup [backup_path]|restore <backup_path>")
        return 1
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
