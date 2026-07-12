from __future__ import annotations

import tempfile
from pathlib import Path

from .db import connect, run_migrations, sqlite_restore
from .persistence import (
    append_event,
    compute_progress,
    create_encounter,
    create_session,
    create_user,
    export_user_data,
    import_local_attempt,
    record_security_audit_event,
    upsert_assessment_and_complete,
)
from .security import hash_password


def snapshot(encounter_id: str, case_id: str = "case-headache-001") -> dict:
    return {
        "encounterId": encounter_id,
        "case": {
            "id": case_id,
            "caseVersion": "1.0.0",
            "status": "development_only",
            "approvalStatus": "clinical_review_required",
            "reviewBanner": "Development case",
            "name": "Aisha Rahman",
            "age": 28,
            "gender": "F",
        },
        "transcript": [{"id": "turn-1", "role": "user", "content": "I have a headache"}],
        "disclosureReceipts": [],
        "conversationMode": "guided",
        "evidenceIntegrityStatus": "server_verified",
    }


def main() -> int:
    with tempfile.TemporaryDirectory() as tmpdir_name:
        tmpdir = Path(tmpdir_name)
        db_path = tmpdir / "backup-source.sqlite3"
        backup_path = tmpdir / "backup.sqlite3"
        restored_path = tmpdir / "restored.sqlite3"
        conn = connect(db_path)
        try:
            run_migrations(conn)
            user_rows = []
            for idx in range(2):
                password_hash, password_salt = hash_password("correct horse battery")
                user_rows.append(
                    create_user(
                        conn,
                        email=f"learner{idx}@example.com",
                        display_name=f"Learner {idx}",
                        password_hash=password_hash,
                        password_salt=password_salt,
                    )
                )
            create_session(conn, user_id=user_rows[0]["id"], raw_session_token="token-a", raw_csrf_token="csrf-a", user_agent="verify")
            create_session(conn, user_id=user_rows[1]["id"], raw_session_token="token-b", raw_csrf_token="csrf-b", user_agent="verify")
            create_encounter(
                conn,
                user_id=user_rows[0]["id"],
                encounter_id="enc-guided",
                case_id="case-headache-001",
                case_version="1.0.0",
                case_name="Aisha Rahman",
                case_status="development_only",
                approval_status="clinical_review_required",
                review_banner="Development case",
                conversation_mode="guided",
                integrity_status="pending_sync",
                draft_snapshot=snapshot("enc-guided"),
            )
            append_event(
                conn,
                user_id=user_rows[0]["id"],
                encounter_id="enc-guided",
                event_id="evt-1",
                idempotency_key="enc-guided:hx:ha-onset",
                sequence_number=1,
                event_type="history_question",
                payload={"question_id": "ha-onset", "mode": "guided"},
                draft_snapshot=snapshot("enc-guided"),
                integrity_status="pending_sync",
            )
            upsert_assessment_and_complete(
                conn,
                user_id=user_rows[0]["id"],
                encounter_id="enc-guided",
                completion_snapshot=snapshot("enc-guided"),
                integrity_status="server_verified",
                engine="rule_based",
                assessment_status="completed",
                case_id="case-headache-001",
                case_version="1.0.0",
                evaluation={"case_id": "case-headache-001", "global_rating": "good", "domain_scores": {}, "criteria": [], "highlights": [], "improvements": [], "narrative": "ok", "safety_breach": None},
                evidence_refs=[{"kind": "receipt", "receiptId": "receipt-1"}],
                receipts=[{"receiptId": "receipt-1", "status": "verified", "verifiedDisclosedFactIds": ["ha-onset"]}],
            )
            create_encounter(
                conn,
                user_id=user_rows[1]["id"],
                encounter_id="enc-ai-draft",
                case_id="case-headache-001",
                case_version="1.0.0",
                case_name="Aisha Rahman",
                case_status="development_only",
                approval_status="clinical_review_required",
                review_banner="Development case",
                conversation_mode="text_ai",
                integrity_status="pending_sync",
                draft_snapshot=snapshot("enc-ai-draft"),
            )
            append_event(
                conn,
                user_id=user_rows[1]["id"],
                encounter_id="enc-ai-draft",
                event_id="evt-2",
                idempotency_key="enc-ai-draft:text:1",
                sequence_number=1,
                event_type="patient_reply",
                payload={"text": "The headache started yesterday", "mode": "text_ai"},
                draft_snapshot=snapshot("enc-ai-draft"),
                integrity_status="pending_sync",
            )
            import_local_attempt(
                conn,
                user_id=user_rows[0]["id"],
                entry={
                    "id": "legacy-1",
                    "encounterId": "legacy-1",
                    "savedAt": "2026-07-11T09:00:00Z",
                    "caseId": "case-headache-001",
                    "caseName": "Aisha Rahman",
                    "verdict": "good",
                    "evaluation": {"case_id": "case-headache-001", "global_rating": "good", "domain_scores": {}, "criteria": [], "highlights": [], "improvements": [], "narrative": "legacy", "safety_breach": None},
                    "patientSnapshot": snapshot("legacy-1"),
                },
                mapped_integrity_status="server_recorded_legacy_evidence",
            )
            record_security_audit_event(conn, event_type="export", event_status="success", user_id=user_rows[0]["id"], metadata={"route": "/auth/export"})
            from .db import sqlite_backup
            sqlite_backup(conn, backup_path)
        finally:
            conn.close()

        sqlite_restore(backup_path, restored_path)
        restored = connect(restored_path)
        try:
            tables = {
                "users": 2,
                "sessions": 2,
                "encounters": 3,
                "encounter_events": 2,
                "disclosure_receipts": 1,
                "assessments": 2,
                "local_history_migrations": 1,
                "security_audit_events": 1,
            }
            for table_name, expected in tables.items():
                actual = restored.execute(f"SELECT COUNT(*) AS c FROM {table_name}").fetchone()["c"]
                assert actual == expected, (table_name, actual, expected)
            ordered = restored.execute("SELECT sequence_number FROM encounter_events WHERE encounter_id = 'enc-guided' ORDER BY sequence_number").fetchall()
            assert [row["sequence_number"] for row in ordered] == [1]
            export_payload = export_user_data(restored, user_rows[0]["id"])
            serialized = str(export_payload)
            assert "password_hash" not in serialized
            assert "session_token_hash" not in serialized
            assert "csrf" not in serialized.lower()
            assert "security_audit_events" not in serialized
            assert compute_progress(export_payload["encounters"])["attempts_completed"] >= 1
        finally:
            restored.close()
    print("verify:backup-restore PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
