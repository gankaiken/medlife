from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


@dataclass(frozen=True)
class DatabaseConfig:
    path: Path


def resolve_database_path(raw: str | None) -> Path:
    if raw:
        return Path(raw).expanduser().resolve()
    return (Path(__file__).resolve().parent / "medlife.sqlite3").resolve()


def connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path), check_same_thread=False, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 5000")
    conn.execute("PRAGMA synchronous = NORMAL")
    return conn


def ensure_schema_migrations(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            name TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL
        )
        """
    )
    conn.commit()


def applied_migrations(conn: sqlite3.Connection) -> set[str]:
    ensure_schema_migrations(conn)
    rows = conn.execute("SELECT name FROM schema_migrations").fetchall()
    return {str(row["name"]) for row in rows}


def migration_files() -> list[Path]:
    root = Path(__file__).resolve().parent / "migrations"
    return sorted(root.glob("*.sql"))


def run_migrations(conn: sqlite3.Connection) -> list[str]:
    ensure_schema_migrations(conn)
    applied = applied_migrations(conn)
    newly_applied: list[str] = []
    for path in migration_files():
        name = path.name
        if name in applied:
            continue
        script = path.read_text(encoding="utf-8")
        with conn:
            conn.executescript(script)
            conn.execute(
                "INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)",
                (name, utc_now_iso()),
            )
        newly_applied.append(name)
    return newly_applied


def schema_health_error(conn: sqlite3.Connection) -> str | None:
    required_tables = {
        "schema_migrations": (),
        "users": ("password_updated_at", "role"),
        "sessions": ("idle_expires_at",),
        "encounters": (),
        "encounter_events": (),
        "disclosure_receipts": (),
        "assessments": (),
        "local_history_migrations": (),
        "security_audit_events": (),
        "user_preferences": ("research_consent_version", "research_consented_at"),
        "attempt_reviews": (),
        "case_review_records": ("institution_profile_version", "source_registry_version"),
        "research_consent_events": (),
        "educator_attempt_scores": (),
    }
    for table_name, required_columns in required_tables.items():
        row = conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
            (table_name,),
        ).fetchone()
        if row is None:
            return f"missing table: {table_name}"
        if not required_columns:
            continue
        columns = {
            str(item["name"])
            for item in conn.execute(f"PRAGMA table_info({table_name})").fetchall()
        }
        for column_name in required_columns:
            if column_name not in columns:
                return f"missing column: {table_name}.{column_name}"
    applied = applied_migrations(conn)
    latest = [path.name for path in migration_files()]
    missing = [name for name in latest if name not in applied]
    if missing:
        return f"missing migrations: {','.join(missing)}"
    return None


@contextmanager
def transaction(conn: sqlite3.Connection, *, immediate: bool = False) -> Iterator[sqlite3.Connection]:
    try:
        conn.execute("BEGIN IMMEDIATE" if immediate else "BEGIN")
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise


def sqlite_backup(source: sqlite3.Connection, destination_path: Path) -> Path:
    destination_path.parent.mkdir(parents=True, exist_ok=True)
    dest = sqlite3.connect(str(destination_path))
    try:
        source.backup(dest)
        dest.commit()
        return destination_path
    finally:
        dest.close()


def sqlite_restore(source_path: Path, destination_path: Path) -> Path:
    destination_path.parent.mkdir(parents=True, exist_ok=True)
    source = sqlite3.connect(str(source_path))
    dest = sqlite3.connect(str(destination_path))
    try:
        source.backup(dest)
        dest.commit()
        return destination_path
    finally:
        source.close()
        dest.close()
