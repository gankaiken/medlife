from __future__ import annotations

import sqlite3
import tempfile
from pathlib import Path

from . import server
from .db import connect, run_migrations, sqlite_restore, utc_now_iso
from .persistence import compute_progress, export_user_data
from .security import compare_token_hash


def main() -> int:
    with tempfile.TemporaryDirectory() as tmpdir_name:
        tmpdir = Path(tmpdir_name)
        db_path = tmpdir / "pre002.sqlite3"
        backup_path = tmpdir / "pre002-backup.sqlite3"
        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row
        try:
            migration_001 = (Path(__file__).resolve().parent / "migrations" / "001_round2c_auth_persistence.sql").read_text(encoding="utf-8")
            conn.executescript(migration_001)
            conn.execute("CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)")
            conn.execute(
                "INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)",
                ("001_round2c_auth_persistence.sql", utc_now_iso()),
            )
            now = utc_now_iso()
            conn.execute(
                """
                INSERT INTO users (
                    id, email, email_normalized, display_name, password_hash, password_salt,
                    status, created_at, updated_at, last_login_at, email_verified_at
                ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
                """,
                ("user-legacy", "legacy@example.com", "legacy@example.com", "Legacy Learner", "pbkdf2_sha256$240000$digest", "legacy-salt", now, now, now, now),
            )
            conn.execute(
                """
                INSERT INTO sessions (
                    id, user_id, session_token_hash, csrf_token_hash, created_at, expires_at, revoked_at, user_agent, last_seen_at
                ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
                """,
                ("sess-legacy", "user-legacy", "abc123hash", "csrfhash", now, "2099-01-01T00:00:00+00:00", "legacy-agent", now),
            )
            conn.execute(
                """
                INSERT INTO encounters (
                    id, user_id, case_id, case_version, case_name, case_status, approval_status, review_banner,
                    conversation_mode, status, integrity_status, started_at, last_activity_at, completed_at,
                    submitted_at, assessment_engine, optimistic_version, draft_snapshot_json, completion_snapshot_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    "enc-legacy",
                    "user-legacy",
                    "case-headache-001",
                    "1.0.0",
                    "Aisha Rahman",
                    "development_only",
                    "clinical_review_required",
                    "Development case",
                    "guided",
                    "completed",
                    "server_verified",
                    now,
                    now,
                    now,
                    now,
                    "rule_based",
                    1,
                    '{"encounterId":"enc-legacy"}',
                    '{"encounterId":"enc-legacy"}',
                ),
            )
            conn.execute(
                """
                INSERT INTO encounter_events (
                    id, encounter_id, user_id, idempotency_key, sequence_number, event_type, payload_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                ("evt-legacy", "enc-legacy", "user-legacy", "enc-legacy:hx:ha-onset", 1, "history_question", '{"question_id":"ha-onset"}', now),
            )
            conn.execute(
                """
                INSERT INTO disclosure_receipts (
                    id, encounter_id, receipt_id, validation_status, created_at, payload_json
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                ("dbrec-legacy", "enc-legacy", "receipt-1", "verified", now, '{"receiptId":"receipt-1"}'),
            )
            conn.execute(
                """
                INSERT INTO assessments (
                    id, encounter_id, user_id, engine, status, case_id, case_version, assessment_schema_version,
                    integrity_status, evaluation_json, evidence_refs_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    "asm-legacy",
                    "enc-legacy",
                    "user-legacy",
                    "rule_based",
                    "completed",
                    "case-headache-001",
                    "1.0.0",
                    "round2c-v1",
                    "server_verified",
                    '{"case_id":"case-headache-001","global_rating":"good","domain_scores":{},"criteria":[],"highlights":[],"improvements":[],"narrative":"ok","safety_breach":null}',
                    "[]",
                    now,
                    now,
                ),
            )
            conn.commit()
        finally:
            conn.close()

        migrated = connect(db_path)
        try:
            applied = run_migrations(migrated)
            assert "002_round2c5_security_lifecycle.sql" in applied
            user = migrated.execute("SELECT email_normalized, password_updated_at FROM users WHERE id = 'user-legacy'").fetchone()
            assert user is not None
            session = migrated.execute("SELECT session_token_hash, idle_expires_at FROM sessions WHERE id = 'sess-legacy'").fetchone()
            assert session is not None
            assert session["idle_expires_at"] is None
            encounter = migrated.execute("SELECT case_id, case_version, user_id FROM encounters WHERE id = 'enc-legacy'").fetchone()
            assert encounter["case_id"] == "case-headache-001"
            assert encounter["case_version"] == "1.0.0"
            events = migrated.execute("SELECT sequence_number FROM encounter_events WHERE encounter_id = 'enc-legacy' ORDER BY sequence_number").fetchall()
            assert [row["sequence_number"] for row in events] == [1]
            receipt = migrated.execute("SELECT receipt_id FROM disclosure_receipts WHERE encounter_id = 'enc-legacy'").fetchone()
            assert receipt is not None
            assessment_count = migrated.execute("SELECT COUNT(*) AS c FROM assessments WHERE encounter_id = 'enc-legacy'").fetchone()["c"]
            assert assessment_count == 1
            export_payload = export_user_data(migrated, "user-legacy")
            assert export_payload["profile"]["email"] == "legacy@example.com"
            assert compute_progress(export_payload["encounters"])["attempts_completed"] == 1
            assert not compare_token_hash("abc123hash", session["session_token_hash"])
            from .db import sqlite_backup
            sqlite_backup(migrated, backup_path)
        finally:
            migrated.close()

        restored_path = tmpdir / "restored.sqlite3"
        sqlite_restore(backup_path, restored_path)
        assert restored_path.exists()
    print("verify:migration-upgrade PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
