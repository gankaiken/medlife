from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

_ROOT_DIR = Path(__file__).resolve().parents[2]
if str(_ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(_ROOT_DIR))

from fastapi.testclient import TestClient  # noqa: E402

from backend import server  # noqa: E402
from backend.db import connect, run_migrations, sqlite_backup, sqlite_restore  # noqa: E402
from backend.persistence import MAX_ACTIVE_SESSIONS  # noqa: E402


def build_snapshot(case_id: str = "case-headache-001", encounter_id: str = "enc-1") -> dict:
    case = server.get_patient_case(case_id)
    assert case is not None
    learner = next(item for item in server.load_learner_case_catalog()["cases"] if item["case_id"] == case_id)
    return {
        "encounterId": encounter_id,
        "arrivedAt": 1720603200000,
        "bedIndex": 0,
        "case": {
            "id": case.case_id,
            "caseVersion": case.case_version,
            "status": case.status,
            "approvalStatus": case.approval_status,
            "reviewBanner": learner["review_banner"],
            "name": learner["name"],
            "age": int(learner["age"]),
            "gender": learner["gender"],
            "diagnosisOptions": learner["diagnosisOptions"],
        },
        "askedQuestionIds": [],
        "orderedTestIds": [],
        "completedTestIds": [],
        "viewedResultIds": [],
        "testOrderedAt": {},
        "givenTreatmentIds": [],
        "prescriptions": [],
        "submittedDiagnosisId": None,
        "conversationMode": "guided",
        "conversationTurnCount": 0,
        "failedConversationTurnIds": [],
        "fallbackTransitions": [],
        "transcript": [],
        "disclosureReceipts": [],
        "evidenceIntegrityStatus": "pending_sync",
        "completedAt": None,
        "endConfirm": {"sum": False, "safe": False, "ice": False},
    }


class AuthPersistenceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmpdir.name) / "test.sqlite3"
        self.original_conn = server.DB_CONN
        self.original_cookie_secure = os.environ.get("MEDLIFE_COOKIE_SECURE")
        os.environ["MEDLIFE_COOKIE_SECURE"] = "0"
        server._LOGIN_FAILURES.clear()
        if hasattr(server.limiter, "_storage") and hasattr(server.limiter._storage, "reset"):
            server.limiter._storage.reset()
        server.DB_CONN = connect(self.db_path)
        run_migrations(server.DB_CONN)
        self.client = TestClient(server.app)

    def tearDown(self) -> None:
        server.DB_CONN.close()
        server.DB_CONN = self.original_conn
        if self.original_cookie_secure is None:
            os.environ.pop("MEDLIFE_COOKIE_SECURE", None)
        else:
            os.environ["MEDLIFE_COOKIE_SECURE"] = self.original_cookie_secure
        self.tmpdir.cleanup()

    def _csrf(self, client: TestClient | None = None) -> str:
        jar = (client if client is not None else self.client).cookies
        token = jar.get("medlife_csrf")
        assert token
        return token

    def _register(self, email: str, password: str = "correct horse battery", display_name: str = "Learner", client: TestClient | None = None):
        active = client if client is not None else self.client
        return active.post(
            "/auth/register",
            json={"email": email, "password": password, "display_name": display_name},
        )

    def _login(self, email: str, password: str = "correct horse battery", client: TestClient | None = None):
        active = client if client is not None else self.client
        return active.post("/auth/login", json={"email": email, "password": password})

    def test_register_login_logout_and_password_hashing(self) -> None:
        resp = self._register("student@example.com")
        self.assertEqual(resp.status_code, 200, resp.text)
        body = resp.json()
        self.assertTrue(body["authenticated"])
        row = server.DB_CONN.execute("SELECT * FROM users WHERE email_normalized = ?", ("student@example.com",)).fetchone()
        self.assertIsNotNone(row)
        self.assertNotEqual(row["password_hash"], "correct horse battery")
        self.assertNotEqual(row["password_salt"], "")

        me = self.client.get("/auth/me")
        self.assertEqual(me.status_code, 200)
        self.assertTrue(me.json()["authenticated"])

        logout = self.client.post("/auth/logout")
        self.assertEqual(logout.status_code, 200)
        self.assertFalse(logout.json()["authenticated"])

        bad = self._login("student@example.com", password="wrong password")
        self.assertEqual(bad.status_code, 401)

        good = self._login("student@example.com")
        self.assertEqual(good.status_code, 200)
        self.assertTrue(good.json()["authenticated"])

    def test_duplicate_registration_rejected(self) -> None:
        first = self._register("duplicate@example.com")
        self.assertEqual(first.status_code, 200)
        second = self._register("duplicate@example.com")
        self.assertEqual(second.status_code, 409)
        self.assertEqual(second.json()["detail"], "registration unavailable")

    def test_expired_session_is_rejected(self) -> None:
        self._register("expired@example.com")
        server.DB_CONN.execute(
            "UPDATE sessions SET expires_at = ? WHERE user_id = (SELECT id FROM users WHERE email_normalized = ?)",
            ("2000-01-01T00:00:00+00:00", "expired@example.com"),
        )
        server.DB_CONN.commit()
        me = self.client.get("/auth/me")
        self.assertEqual(me.status_code, 200)
        self.assertFalse(me.json()["authenticated"])

        denied = self.client.get("/encounters")
        self.assertEqual(denied.status_code, 401)

    def test_idle_expired_session_is_rejected(self) -> None:
        self._register("idle@example.com")
        server.DB_CONN.execute(
            "UPDATE sessions SET idle_expires_at = ? WHERE user_id = (SELECT id FROM users WHERE email_normalized = ?)",
            ("2000-01-01T00:00:00+00:00", "idle@example.com"),
        )
        server.DB_CONN.commit()
        me = self.client.get("/auth/me")
        self.assertEqual(me.status_code, 200)
        self.assertFalse(me.json()["authenticated"])

    def test_database_session_hash_cannot_be_used_as_cookie(self) -> None:
        self._register("hashcookie@example.com")
        row = server.DB_CONN.execute("SELECT session_token_hash FROM sessions LIMIT 1").fetchone()
        self.assertIsNotNone(row)
        denied = self.client.get("/encounters", cookies={"medlife_session": row["session_token_hash"]})
        self.assertEqual(denied.status_code, 401)

    def test_csrf_is_required_for_mutating_authenticated_requests(self) -> None:
        self._register("csrf@example.com")
        missing_header = self.client.post(
            "/encounters",
            json={"encounter_id": "enc-csrf", "case_id": "case-headache-001", "conversation_mode": "guided", "draft_snapshot": build_snapshot(encounter_id="enc-csrf")},
        )
        self.assertEqual(missing_header.status_code, 403)
        self.assertEqual(missing_header.json()["detail"], "request rejected")

    def test_unauthenticated_and_cross_user_access_rejected(self) -> None:
        unauth = self.client.post("/encounters", json={"encounter_id": "enc-1", "case_id": "case-headache-001", "conversation_mode": "guided", "draft_snapshot": build_snapshot()})
        self.assertEqual(unauth.status_code, 401)

        password_hash_a, password_salt_a = server.hash_password("correct horse battery")
        password_hash_b, password_salt_b = server.hash_password("correct horse battery")
        user_a = server.create_user(
            server.DB_CONN,
            email="a@example.com",
            display_name="Learner A",
            password_hash=password_hash_a,
            password_salt=password_salt_a,
        )
        user_b = server.create_user(
            server.DB_CONN,
            email="b@example.com",
            display_name="Learner B",
            password_hash=password_hash_b,
            password_salt=password_salt_b,
        )
        raw_session_a = "session-a"
        raw_csrf_a = "csrf-a"
        raw_session_b = "session-b"
        raw_csrf_b = "csrf-b"
        server.create_session(
            server.DB_CONN,
            user_id=user_a["id"],
            raw_session_token=raw_session_a,
            raw_csrf_token=raw_csrf_a,
            user_agent="test-suite",
        )
        server.create_session(
            server.DB_CONN,
            user_id=user_b["id"],
            raw_session_token=raw_session_b,
            raw_csrf_token=raw_csrf_b,
            user_agent="test-suite",
        )
        start = self.client.post(
            "/encounters",
            headers={"X-CSRF-Token": raw_csrf_a},
            cookies={"medlife_session": raw_session_a, "medlife_csrf": raw_csrf_a},
            json={
                "encounter_id": "enc-a",
                "case_id": "case-headache-001",
                "conversation_mode": "guided",
                "draft_snapshot": build_snapshot(encounter_id="enc-a"),
            },
        )
        self.assertEqual(start.status_code, 200, start.text)

        denied = self.client.get(
            "/encounters/enc-a",
            cookies={"medlife_session": raw_session_b, "medlife_csrf": raw_csrf_b},
        )
        self.assertEqual(denied.status_code, 404)

    def test_event_append_is_idempotent_and_ordered(self) -> None:
        self._register("events@example.com")
        start = self.client.post(
            "/encounters",
            headers={"X-CSRF-Token": self._csrf()},
            json={
                "encounter_id": "enc-events",
                "case_id": "case-headache-001",
                "conversation_mode": "guided",
                "draft_snapshot": build_snapshot(encounter_id="enc-events"),
            },
        )
        self.assertEqual(start.status_code, 200, start.text)

        event_body = {
            "event_id": "evt-1",
            "idempotency_key": "enc-events:hx:ha-onset",
            "sequence_number": 1,
            "event_type": "history_question",
            "payload": {"question_id": "ha-onset"},
            "draft_snapshot": build_snapshot(encounter_id="enc-events"),
            "integrity_status": "pending_sync",
        }
        first = self.client.post("/encounters/enc-events/events", headers={"X-CSRF-Token": self._csrf()}, json=event_body)
        self.assertEqual(first.status_code, 200, first.text)
        duplicate = self.client.post("/encounters/enc-events/events", headers={"X-CSRF-Token": self._csrf()}, json=event_body)
        self.assertEqual(duplicate.status_code, 200, duplicate.text)
        rows = server.DB_CONN.execute("SELECT COUNT(*) AS c FROM encounter_events WHERE encounter_id = ?", ("enc-events",)).fetchone()
        self.assertEqual(rows["c"], 1)

        out_of_order = dict(event_body)
        out_of_order["event_id"] = "evt-2"
        out_of_order["idempotency_key"] = "enc-events:hx:ha-redflags"
        out_of_order["sequence_number"] = 3
        out = self.client.post("/encounters/enc-events/events", headers={"X-CSRF-Token": self._csrf()}, json=out_of_order)
        self.assertEqual(out.status_code, 409)

    def test_event_payload_too_large_is_rejected(self) -> None:
        self._register("large-event@example.com")
        self.client.post(
            "/encounters",
            headers={"X-CSRF-Token": self._csrf()},
            json={
                "encounter_id": "enc-large",
                "case_id": "case-headache-001",
                "conversation_mode": "guided",
                "draft_snapshot": build_snapshot(encounter_id="enc-large"),
            },
        )
        oversized = self.client.post(
            "/encounters/enc-large/events",
            headers={"X-CSRF-Token": self._csrf()},
            json={
                "event_id": "evt-large",
                "idempotency_key": "enc-large:blob",
                "sequence_number": 1,
                "event_type": "history_question",
                "payload": {"blob": "x" * 210000},
                "draft_snapshot": build_snapshot(encounter_id="enc-large"),
                "integrity_status": "pending_sync",
            },
        )
        self.assertEqual(oversized.status_code, 413)

    def test_completed_encounter_rejects_new_events_and_assessment_upserts(self) -> None:
        self._register("complete@example.com")
        snapshot = build_snapshot(encounter_id="enc-complete")
        self.client.post(
            "/encounters",
            headers={"X-CSRF-Token": self._csrf()},
            json={
                "encounter_id": "enc-complete",
                "case_id": "case-headache-001",
                "conversation_mode": "guided",
                "draft_snapshot": snapshot,
            },
        )
        req = server.DebriefRequestModel.model_validate(
            {
                "encounter_id": "enc-complete",
                "case_id": "case-headache-001",
                "case_summary": {
                    "chief_complaint": "Headache",
                    "case_version": "1.0.0",
                    "correct_diagnosis_digest": "medlife:v1:4011490407",
                    "diagnosis_options": ["tension_headache", "migraine"],
                    "severity": "stable",
                    "age": 28,
                    "gender": "F",
                },
                "case_expectations": {
                    "relevant_history_question_ids": ["ha-onset"],
                    "allowed_history_fact_ids": ["ha-onset"],
                    "acceptable_treatment_ids": [],
                    "critical_treatment_ids": [],
                },
                "rubric": {"data_gathering": [], "clinical_management": [], "interpersonal": [], "safety_netting": None},
                "registry_slice": [],
                "encounter_log": {
                    "arrived_at_iso": "2026-07-09T12:00:00Z",
                    "ended_at_iso": "2026-07-09T12:07:00Z",
                    "elapsed_seconds": 420,
                    "history_questions_asked": [],
                    "tests_ordered": [],
                    "treatments_given": [],
                    "prescriptions": [],
                    "conversation_mode": "guided",
                    "disclosed_fact_ids": [],
                    "disclosure_receipts": [],
                    "failed_conversation_turn_ids": [],
                    "fallback_transitions": [],
                    "transcript": [],
                    "evidence_integrity_status": "pending_sync",
                    "results_opened": [],
                    "end_confirm": {"sum": True, "safe": True, "ice": False},
                    "submitted_diagnosis_id": "tension_headache",
                    "diagnosis_was_correct": True,
                },
            }
        )
        evaluation = server.build_rule_based_assessment(req).model_dump(mode="json")
        complete_payload = {
            "completion_snapshot": snapshot,
            "integrity_status": "server_verified",
            "engine": "rule_based",
            "assessment_status": "fallback_completed",
            "evaluation": evaluation,
            "evidence_refs": [],
            "receipts": [],
        }
        first = self.client.post("/encounters/enc-complete/assessment", headers={"X-CSRF-Token": self._csrf()}, json=complete_payload)
        self.assertEqual(first.status_code, 200, first.text)
        second = self.client.post("/encounters/enc-complete/assessment", headers={"X-CSRF-Token": self._csrf()}, json=complete_payload)
        self.assertEqual(second.status_code, 200, second.text)
        assessment_rows = server.DB_CONN.execute("SELECT COUNT(*) AS c FROM assessments WHERE encounter_id = ?", ("enc-complete",)).fetchone()
        self.assertEqual(assessment_rows["c"], 1)

        event_resp = self.client.post(
            "/encounters/enc-complete/events",
            headers={"X-CSRF-Token": self._csrf()},
            json={
                "event_id": "evt-after",
                "idempotency_key": "enc-complete:after",
                "sequence_number": 1,
                "event_type": "history_question",
                "payload": {"question_id": "ha-onset"},
                "draft_snapshot": snapshot,
                "integrity_status": "pending_sync",
            },
        )
        self.assertEqual(event_resp.status_code, 409)

    def test_local_history_migration_is_honest_and_idempotent(self) -> None:
        self._register("migrate@example.com")
        entry = {
            "id": "eval-1",
            "encounterId": "enc-local-1",
            "savedAt": "2026-07-11T10:00:00Z",
            "caseId": "case-headache-001",
            "caseName": "Aisha Rahman",
            "caseAge": 28,
            "caseGender": "F",
            "diagnosisLabel": "Tension headache",
            "patientName": "Aisha Rahman",
            "verdict": "good",
            "engine": "rule_based",
            "evaluation": {"case_id": "case-headache-001", "global_rating": "good", "domain_scores": {}, "criteria": [], "highlights": [], "improvements": [], "narrative": "Saved locally", "safety_breach": None},
            "integrityStatus": "live_verified",
            "patientSnapshot": build_snapshot(encounter_id="enc-local-1"),
        }
        resp = self.client.post("/auth/migrate-local", headers={"X-CSRF-Token": self._csrf()}, json={"entries": [entry]})
        self.assertEqual(resp.status_code, 200, resp.text)
        body = resp.json()
        self.assertEqual(body[0]["integrity_status"], "server_recorded_legacy_evidence")

        duplicate = self.client.post("/auth/migrate-local", headers={"X-CSRF-Token": self._csrf()}, json={"entries": [entry]})
        self.assertEqual(duplicate.status_code, 200, duplicate.text)
        rows = server.DB_CONN.execute("SELECT COUNT(*) AS c FROM encounters WHERE user_id = (SELECT id FROM users WHERE email_normalized = ?)", ("migrate@example.com",)).fetchone()
        self.assertEqual(rows["c"], 1)

    def test_export_returns_profile_attempts_progress_without_secrets(self) -> None:
        self._register("export@example.com")
        export_response = self.client.get("/auth/export")
        self.assertEqual(export_response.status_code, 200, export_response.text)
        self.assertEqual(export_response.headers["content-type"], "application/json")
        self.assertIn("attachment;", export_response.headers["content-disposition"])
        payload = export_response.json()
        self.assertEqual(payload["profile"]["email"], "export@example.com")
        self.assertNotIn("password_hash", json.dumps(payload))
        self.assertNotIn("session_token_hash", json.dumps(payload))
        self.assertIn("progress", payload)

    def test_login_rate_limit_resets_after_success(self) -> None:
        self._register("ratelimit@example.com")
        self.client.post("/auth/logout")
        for _ in range(server.LOGIN_FAILURE_LIMIT - 1):
            failed = self._login("ratelimit@example.com", password="wrong password")
            self.assertEqual(failed.status_code, 401)
        success = self._login("ratelimit@example.com")
        self.assertEqual(success.status_code, 200)
        again = self._login("ratelimit@example.com", password="wrong password")
        self.assertEqual(again.status_code, 401)

    def test_active_session_limit_revokes_oldest_sessions(self) -> None:
        password_hash, password_salt = server.hash_password("correct horse battery")
        user = server.create_user(
            server.DB_CONN,
            email="manysessions@example.com",
            display_name="Multi",
            password_hash=password_hash,
            password_salt=password_salt,
        )
        for idx in range(MAX_ACTIVE_SESSIONS + 1):
            server.create_session(
                server.DB_CONN,
                user_id=user["id"],
                raw_session_token=f"session-{idx}",
                raw_csrf_token=f"csrf-{idx}",
                user_agent="test-suite",
            )
        active_count = server.DB_CONN.execute(
            "SELECT COUNT(*) AS c FROM sessions WHERE user_id = ? AND revoked_at IS NULL",
            (user["id"],),
        ).fetchone()["c"]
        self.assertEqual(active_count, MAX_ACTIVE_SESSIONS)

    def test_invalid_local_history_migration_fails_safely(self) -> None:
        self._register("invalid-migrate@example.com")
        invalid = self.client.post(
            "/auth/migrate-local",
            headers={"X-CSRF-Token": self._csrf()},
            json={"entries": [{"id": "broken"}]},
        )
        self.assertEqual(invalid.status_code, 422, invalid.text)

    def test_progress_endpoint_uses_only_current_user_records(self) -> None:
        client_a = TestClient(server.app)
        client_b = TestClient(server.app)
        self._register("progress-a@example.com", client=client_a)
        self._register("progress-b@example.com", client=client_b)

        for active, encounter_id in ((client_a, "enc-pa"), (client_b, "enc-pb")):
            snapshot = build_snapshot(encounter_id=encounter_id)
            active.post("/encounters", headers={"X-CSRF-Token": self._csrf(active)}, json={"encounter_id": encounter_id, "case_id": "case-headache-001", "conversation_mode": "guided", "draft_snapshot": snapshot})
            active.post(
                f"/encounters/{encounter_id}/assessment",
                headers={"X-CSRF-Token": self._csrf(active)},
                json={
                    "completion_snapshot": snapshot,
                    "integrity_status": "server_verified",
                    "engine": "rule_based",
                    "assessment_status": "completed",
                    "evaluation": {"case_id": "case-headache-001", "global_rating": "good", "domain_scores": {}, "criteria": [], "highlights": [], "improvements": [], "narrative": "Done", "safety_breach": None},
                    "evidence_refs": [],
                    "receipts": [],
                },
            )

        progress = client_a.get("/progress")
        self.assertEqual(progress.status_code, 200, progress.text)
        body = progress.json()
        self.assertEqual(body["attempts_completed"], 1)
        self.assertEqual(body["cases_attempted"], 1)

    def test_backup_and_restore_preserve_registered_user(self) -> None:
        self._register("backup@example.com")
        backup_path = Path(self.tmpdir.name) / "backup.sqlite3"
        sqlite_backup(server.DB_CONN, backup_path)
        restored_path = Path(self.tmpdir.name) / "restored.sqlite3"
        sqlite_restore(backup_path, restored_path)
        restored = connect(restored_path)
        try:
            row = restored.execute("SELECT email_normalized FROM users WHERE email_normalized = ?", ("backup@example.com",)).fetchone()
            self.assertIsNotNone(row)
        finally:
            restored.close()

    def test_migration_failure_raises_and_startup_can_fail_safely(self) -> None:
        conn = connect(Path(self.tmpdir.name) / "migrate-fail.sqlite3")
        try:
            with patch("backend.db.migration_files") as migration_files:
                broken = Path(self.tmpdir.name) / "broken.sql"
                broken.write_text("THIS IS NOT SQL;", encoding="utf-8")
                migration_files.return_value = [broken]
                with self.assertRaises(Exception):
                    run_migrations(conn)
        finally:
            conn.close()


if __name__ == "__main__":
    unittest.main()
