from __future__ import annotations

import json
import logging
import os
import sys
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
from pathlib import Path

_ROOT_DIR = Path(__file__).resolve().parents[2]
if str(_ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(_ROOT_DIR))

from fastapi.testclient import TestClient  # noqa: E402

from backend import server  # noqa: E402
from backend.db import connect, run_migrations, sqlite_backup, sqlite_restore  # noqa: E402
from backend.persistence import MAX_ACTIVE_SESSIONS  # noqa: E402
from backend.security import (  # noqa: E402
    PASSWORD_HASH_ALGORITHM,
    PASSWORD_ITERATIONS_FLOOR,
    hash_password,
    password_hash_iterations,
    verify_password,
)


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

    def _create_encounter(self, client: TestClient | None = None, encounter_id: str = "enc-1") -> None:
        active = client if client is not None else self.client
        response = active.post(
            "/encounters",
            headers={"X-CSRF-Token": self._csrf(active)},
            json={
                "encounter_id": encounter_id,
                "case_id": "case-headache-001",
                "conversation_mode": "guided",
                "draft_snapshot": build_snapshot(encounter_id=encounter_id),
            },
        )
        self.assertEqual(response.status_code, 200, response.text)

    def _cookie_headers(self, response) -> list[str]:
        if hasattr(response.headers, "get_list"):
            return list(response.headers.get_list("set-cookie"))
        joined = response.headers.get("set-cookie", "")
        return [joined] if joined else []

    def _cookie_value(self, client: TestClient, name: str, *, exclude: str | None = None) -> str | None:
        for cookie in client.cookies.jar:
            if cookie.name != name:
                continue
            if exclude is not None and cookie.value == exclude:
                continue
            return cookie.value
        return None

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

    def test_preferences_round_trip_and_research_decline_keeps_education_access(self) -> None:
        self._register("prefs@example.com")
        initial = self.client.get("/auth/preferences")
        self.assertEqual(initial.status_code, 200, initial.text)
        self.assertEqual(initial.json()["learner_stage"], "transition_to_clinical_learning")

        updated = self.client.put(
            "/auth/preferences",
            headers={"X-CSRF-Token": self._csrf()},
            json={
                "learner_stage": "early_clinical",
                "non_3d_mode": True,
                "low_bandwidth_mode": True,
                "reduced_motion_mode": True,
                "background_audio_enabled": False,
                "educational_notice_acknowledged_at": "2026-07-12T00:00:00+00:00",
                "research_participation_status": "declined",
            },
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        body = updated.json()
        self.assertTrue(body["non_3d_mode"])
        self.assertTrue(body["low_bandwidth_mode"])
        self.assertEqual(body["research_participation_status"], "declined")

        progress = self.client.get("/progress")
        self.assertEqual(progress.status_code, 200, progress.text)

    def test_configured_registration_assigns_reviewer_role_and_server_enforces_permissions(self) -> None:
        with patch.dict(os.environ, {"MEDLIFE_EDUCATOR_REVIEWER_EMAILS": "reviewer@example.com"}, clear=False):
            response = self._register("reviewer@example.com", display_name="Reviewer")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["user"]["role"], "educator_reviewer")

        attempts = self.client.get("/pilot/attempts")
        self.assertEqual(attempts.status_code, 200, attempts.text)

        learner_client = TestClient(server.app)
        self._register("learner-only@example.com", client=learner_client)
        denied = learner_client.get("/pilot/attempts")
        self.assertEqual(denied.status_code, 403, denied.text)

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

    def test_session_fixation_is_prevented_and_login_rotates_raw_tokens(self) -> None:
        attacker_supplied = "attacker-fixed-session-token"
        self.client.cookies.set("medlife_session", attacker_supplied)
        register = self._register("fixation@example.com")
        self.assertEqual(register.status_code, 200, register.text)
        first_raw = self._cookie_value(self.client, "medlife_session", exclude=attacker_supplied)
        self.assertIsNotNone(first_raw)
        self.assertNotEqual(first_raw, attacker_supplied)

        rows = server.DB_CONN.execute(
            "SELECT session_token_hash FROM sessions WHERE user_id = (SELECT id FROM users WHERE email_normalized = ?)",
            ("fixation@example.com",),
        ).fetchall()
        self.assertGreaterEqual(len(rows), 1)
        self.assertNotIn(attacker_supplied, [item["session_token_hash"] for item in rows])
        denied_client = TestClient(server.app)
        denied_client.cookies.set("medlife_session", attacker_supplied)
        denied = denied_client.get("/encounters")
        self.assertEqual(denied.status_code, 401)

        self.client.post("/auth/logout")
        relogin = self._login("fixation@example.com")
        self.assertEqual(relogin.status_code, 200, relogin.text)
        second_raw = self._cookie_value(self.client, "medlife_session", exclude=attacker_supplied)
        self.assertIsNotNone(second_raw)
        self.assertNotEqual(first_raw, second_raw)
        stale_client = TestClient(server.app)
        stale_client.cookies.set("medlife_session", first_raw)
        stale = stale_client.get("/auth/me")
        self.assertFalse(stale.json()["authenticated"])

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
        self.assertEqual(export_response.headers["cache-control"], "no-store")
        payload = export_response.json()
        self.assertEqual(payload["profile"]["email"], "export@example.com")
        self.assertNotIn("password_hash", json.dumps(payload))
        self.assertNotIn("session_token_hash", json.dumps(payload))
        self.assertNotIn("csrf", json.dumps(payload).lower())
        self.assertNotIn("security_audit_events", json.dumps(payload))
        self.assertIn("progress", payload)

    def test_export_isolated_per_user_and_uses_safe_filename(self) -> None:
        client_a = TestClient(server.app)
        client_b = TestClient(server.app)
        self._register("export-a@example.com", display_name="Learner A", client=client_a)
        self._register("export-b@example.com", display_name="Learner B", client=client_b)
        self._create_encounter(client=client_a, encounter_id="enc-export-a")
        export_a = client_a.get("/auth/export")
        self.assertEqual(export_a.status_code, 200, export_a.text)
        payload = export_a.json()
        self.assertEqual(payload["profile"]["email"], "export-a@example.com")
        serialized = json.dumps(payload)
        self.assertNotIn("export-b@example.com", serialized)
        self.assertNotIn("Learner B", serialized)
        self.assertIn('attachment; filename="export-a-example-com-medlife-export.json"', export_a.headers["content-disposition"])

    def test_research_consent_events_and_withdrawal_are_recorded(self) -> None:
        self._register("consent@example.com")
        consent = self.client.put(
            "/auth/preferences",
            headers={"X-CSRF-Token": self._csrf()},
            json={
                "learner_stage": "early_clinical",
                "non_3d_mode": True,
                "low_bandwidth_mode": False,
                "reduced_motion_mode": False,
                "background_audio_enabled": True,
                "educational_notice_acknowledged_at": "2026-07-12T00:00:00+00:00",
                "research_participation_status": "consented",
            },
        )
        self.assertEqual(consent.status_code, 200, consent.text)
        self.assertEqual(consent.json()["research_consent_version"], server.CURRENT_RESEARCH_CONSENT_VERSION)
        self.assertIsNotNone(consent.json()["deidentified_research_id"])

        withdraw = self.client.put(
            "/auth/preferences",
            headers={"X-CSRF-Token": self._csrf()},
            json={
                "learner_stage": "early_clinical",
                "non_3d_mode": True,
                "low_bandwidth_mode": False,
                "reduced_motion_mode": False,
                "background_audio_enabled": True,
                "educational_notice_acknowledged_at": "2026-07-12T00:00:00+00:00",
                "research_participation_status": "withdrawn",
            },
        )
        self.assertEqual(withdraw.status_code, 200, withdraw.text)
        self.assertIsNotNone(withdraw.json()["research_withdrawn_at"])

        events = self.client.get("/auth/research-consent-events")
        self.assertEqual(events.status_code, 200, events.text)
        body = events.json()
        self.assertGreaterEqual(len(body), 2)
        self.assertEqual(body[0]["research_participation_status"], "withdrawn")

    def test_pilot_research_export_requires_admin_and_excludes_declined_and_withdrawn(self) -> None:
        with patch.dict(os.environ, {"MEDLIFE_PILOT_ADMIN_EMAILS": "admin@example.com"}, clear=False):
            admin = TestClient(server.app)
            self._register("admin@example.com", display_name="Pilot Admin", client=admin)

        declined = TestClient(server.app)
        self._register("declined@example.com", client=declined)
        declined.put(
            "/auth/preferences",
            headers={"X-CSRF-Token": self._csrf(declined)},
            json={
                "learner_stage": "early_clinical",
                "non_3d_mode": True,
                "low_bandwidth_mode": False,
                "reduced_motion_mode": False,
                "background_audio_enabled": True,
                "educational_notice_acknowledged_at": "2026-07-12T00:00:00+00:00",
                "research_participation_status": "declined",
            },
        )
        self._create_encounter(client=declined, encounter_id="enc-declined")
        declined.post(
            "/encounters/enc-declined/assessment",
            headers={"X-CSRF-Token": self._csrf(declined)},
            json={
                "completion_snapshot": build_snapshot(encounter_id="enc-declined"),
                "integrity_status": "server_verified",
                "engine": "rule_based",
                "assessment_status": "completed",
                "evaluation": {"case_id": "case-headache-001", "global_rating": "good", "score": 72, "domain_scores": {}, "criteria": [], "highlights": [], "improvements": [], "narrative": "Done", "safety_breach": None},
                "evidence_refs": [],
                "receipts": [],
            },
        )

        consented = TestClient(server.app)
        self._register("consented@example.com", client=consented)
        consented.put(
            "/auth/preferences",
            headers={"X-CSRF-Token": self._csrf(consented)},
            json={
                "learner_stage": "early_clinical",
                "non_3d_mode": True,
                "low_bandwidth_mode": False,
                "reduced_motion_mode": False,
                "background_audio_enabled": True,
                "educational_notice_acknowledged_at": "2026-07-12T00:00:00+00:00",
                "research_participation_status": "consented",
            },
        )
        self._create_encounter(client=consented, encounter_id="enc-consented")
        consented.post(
            "/encounters/enc-consented/assessment",
            headers={"X-CSRF-Token": self._csrf(consented)},
            json={
                "completion_snapshot": build_snapshot(encounter_id="enc-consented"),
                "integrity_status": "server_verified",
                "engine": "rule_based",
                "assessment_status": "completed",
                "evaluation": {"case_id": "case-headache-001", "global_rating": "good", "score": 80, "domain_scores": {}, "criteria": [], "highlights": [], "improvements": [], "narrative": "Done", "safety_breach": None},
                "evidence_refs": [],
                "receipts": [],
            },
        )

        denied = declined.get("/pilot/research/export")
        self.assertEqual(denied.status_code, 403, denied.text)

        exported = admin.get("/pilot/research/export")
        self.assertEqual(exported.status_code, 200, exported.text)
        payload = exported.json()
        self.assertEqual(payload["deidentification_status"], "pseudonymised")
        serialized = json.dumps(payload)
        self.assertNotIn("consented@example.com", serialized)
        self.assertNotIn("declined@example.com", serialized)
        self.assertEqual(len(payload["rows"]), 1)
        self.assertEqual(payload["rows"][0]["encounter_id"], "enc-consented")

    def test_educator_independent_score_is_stored_separately(self) -> None:
        with patch.dict(os.environ, {"MEDLIFE_EDUCATOR_REVIEWER_EMAILS": "reviewer@example.com"}, clear=False):
            reviewer = TestClient(server.app)
            self._register("reviewer@example.com", display_name="Reviewer", client=reviewer)
        learner = TestClient(server.app)
        self._register("scored-learner@example.com", client=learner)
        self._create_encounter(client=learner, encounter_id="enc-score")
        learner.post(
            "/encounters/enc-score/assessment",
            headers={"X-CSRF-Token": self._csrf(learner)},
            json={
                "completion_snapshot": build_snapshot(encounter_id="enc-score"),
                "integrity_status": "server_verified",
                "engine": "rule_based",
                "assessment_status": "completed",
                "evaluation": {"case_id": "case-headache-001", "global_rating": "good", "score": 78, "domain_scores": {"data_gathering": {"verdict": "good"}}, "criteria": [], "highlights": [], "improvements": [], "narrative": "Done", "safety_breach": None},
                "evidence_refs": [],
                "receipts": [],
            },
        )
        score = reviewer.post(
            "/pilot/attempts/enc-score/scores",
            headers={"X-CSRF-Token": self._csrf(reviewer)},
            json={
                "rubric_version": "medlife-formative-rubric-v1",
                "review_mode": "independent",
                "overall_score": 70,
                "overall_category": "satisfactory",
                "domain_scores": {"data_gathering": {"verdict": "satisfactory"}},
                "safety_findings": ["no immediate safety breach"],
                "missed_history_concepts": ["stress context"],
                "investigation_evaluation": "Limited but acceptable",
                "diagnosis_evaluation": "Reasonable",
                "communication_evaluation": "Warm",
                "educator_comment": "Independent rating recorded.",
                "confidence_label": "medium",
                "review_minutes": 9,
                "submit_status": "submitted",
            },
        )
        self.assertEqual(score.status_code, 200, score.text)
        scores = reviewer.get("/pilot/attempts/enc-score/scores")
        self.assertEqual(scores.status_code, 200, scores.text)
        self.assertEqual(scores.json()[0]["overall_category"], "satisfactory")

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

    def test_logout_all_requires_csrf_and_revokes_all_sessions_for_one_learner_only(self) -> None:
        client_a1 = TestClient(server.app)
        client_a2 = TestClient(server.app)
        client_b = TestClient(server.app)
        self._register("revoke-a@example.com", display_name="Learner A", client=client_a1)
        login_a2 = self._login("revoke-a@example.com", client=client_a2)
        self.assertEqual(login_a2.status_code, 200, login_a2.text)
        self._register("revoke-b@example.com", display_name="Learner B", client=client_b)

        self.assertEqual(self.client.post("/auth/logout-all").status_code, 401)
        self.assertEqual(client_a1.post("/auth/logout-all").status_code, 403)

        logout_all = client_a1.post("/auth/logout-all", headers={"X-CSRF-Token": self._csrf(client_a1)})
        self.assertEqual(logout_all.status_code, 200, logout_all.text)
        self.assertFalse(logout_all.json()["authenticated"])
        self.assertFalse(client_a1.get("/auth/me").json()["authenticated"])
        self.assertFalse(client_a2.get("/auth/me").json()["authenticated"])
        self.assertTrue(client_b.get("/auth/me").json()["authenticated"])
        self.assertEqual(client_a2.get("/encounters").status_code, 401)
        self.assertEqual(client_b.get("/encounters").status_code, 200)

        rows = server.DB_CONN.execute(
            "SELECT metadata_json FROM security_audit_events WHERE event_type = 'logout_all' ORDER BY created_at DESC"
        ).fetchall()
        self.assertGreaterEqual(len(rows), 1)
        self.assertNotIn("medlife_session", rows[0]["metadata_json"])
        self.assertNotIn("csrf", rows[0]["metadata_json"].lower())

        relogin = self._login("revoke-a@example.com", client=client_a1)
        self.assertEqual(relogin.status_code, 200, relogin.text)

    def test_cookie_attributes_cover_dev_and_secure_modes(self) -> None:
        register = self._register("cookies@example.com")
        self.assertEqual(register.status_code, 200, register.text)
        set_cookies = self._cookie_headers(register)
        session_header = next(header for header in set_cookies if header.startswith("medlife_session="))
        csrf_header = next(header for header in set_cookies if header.startswith("medlife_csrf="))
        self.assertIn("HttpOnly", session_header)
        self.assertIn("SameSite=lax", session_header)
        self.assertIn("Path=/", session_header)
        self.assertIn("expires=", session_header.lower())
        self.assertNotIn("Domain=", session_header)
        self.assertNotIn("Secure", session_header)
        self.assertNotIn("HttpOnly", csrf_header)

        original = os.environ.get("MEDLIFE_COOKIE_SECURE")
        os.environ["MEDLIFE_COOKIE_SECURE"] = "1"
        try:
            response = server.Response()
            server._set_session_cookies(response, "raw-session", "raw-csrf", "2030-01-01T00:00:00+00:00")
            secure_headers = [value.decode("latin1") for name, value in response.raw_headers if name == b"set-cookie"]
            self.assertTrue(any("Secure" in header and header.startswith("medlife_session=") for header in secure_headers))

            cleared = server.Response()
            server._clear_session_cookies(cleared)
            clear_headers = [value.decode("latin1") for name, value in cleared.raw_headers if name == b"set-cookie"]
            self.assertTrue(any("Path=/" in header and "SameSite=lax" in header for header in clear_headers))
        finally:
            if original is None:
                os.environ.pop("MEDLIFE_COOKIE_SECURE", None)
            else:
                os.environ["MEDLIFE_COOKIE_SECURE"] = original

    def test_unsafe_production_configuration_is_rejected(self) -> None:
        with patch.dict(
            os.environ,
            {
                "MEDLIFE_ENV": "production",
                "MEDLIFE_COOKIE_SECURE": "0",
                "MEDLIFE_CORS_ORIGINS": "https://medlife.example",
            },
            clear=False,
        ):
            with self.assertRaises(RuntimeError):
                server._validate_runtime_configuration()
        with patch.dict(
            os.environ,
            {
                "MEDLIFE_ENV": "production",
                "MEDLIFE_COOKIE_SECURE": "1",
                "MEDLIFE_CORS_ORIGINS": "http://localhost:5173",
            },
            clear=False,
        ):
            with self.assertRaises(RuntimeError):
                server._validate_runtime_configuration()

    def test_password_hashing_uses_unique_salts_and_supports_upgrade(self) -> None:
        password = "correct horse battery"
        first_hash, first_salt = hash_password(password)
        second_hash, second_salt = hash_password(password)
        self.assertTrue(first_hash.startswith(f"{PASSWORD_HASH_ALGORITHM}$"))
        self.assertNotEqual(first_hash, second_hash)
        self.assertNotEqual(first_salt, second_salt)
        self.assertNotEqual(first_hash, password)
        self.assertTrue(verify_password(password, first_hash, first_salt))
        self.assertFalse(verify_password("wrong password", first_hash, first_salt))

        legacy_hash, legacy_salt = hash_password(password, iterations=PASSWORD_ITERATIONS_FLOOR)
        user = server.create_user(
            server.DB_CONN,
            email="rehash@example.com",
            display_name="Rehash",
            password_hash=legacy_hash,
            password_salt=legacy_salt,
        )
        with patch.dict(os.environ, {"MEDLIFE_PASSWORD_PBKDF2_ITERATIONS": str(PASSWORD_ITERATIONS_FLOOR + 10_000)}, clear=False):
            login = self._login("rehash@example.com")
            self.assertEqual(login.status_code, 200, login.text)
        refreshed = server.get_user_by_id(server.DB_CONN, user["id"])
        self.assertIsNotNone(refreshed)
        self.assertGreater(password_hash_iterations(refreshed["password_hash"]), PASSWORD_ITERATIONS_FLOOR)
        self.assertTrue(verify_password(password, refreshed["password_hash"], refreshed["password_salt"]))

    def test_invalid_login_is_generic_and_oversized_password_is_rejected(self) -> None:
        self._register("generic-login@example.com")
        wrong_existing = self._login("generic-login@example.com", password="wrong password")
        wrong_missing = self._login("missing@example.com", password="wrong password")
        self.assertEqual(wrong_existing.status_code, 401)
        self.assertEqual(wrong_missing.status_code, 401)
        self.assertEqual(wrong_existing.json()["detail"], wrong_missing.json()["detail"])

        oversized = self.client.post(
            "/auth/register",
            json={"email": "oversized@example.com", "password": "x" * 257, "display_name": "Large Password"},
        )
        self.assertEqual(oversized.status_code, 422, oversized.text)

    def test_security_logs_do_not_echo_secret_sentinels(self) -> None:
        sentinels = [
            "pw-sentinel-do-not-log",
            "sess-sentinel-do-not-log",
            "csrf-sentinel-do-not-log",
            "hash-sentinel-do-not-log",
            "sqlite-path-sentinel-do-not-log",
            "api-key-sentinel-do-not-log",
        ]
        handler = _CapturingHandler()
        server._security_log.addHandler(handler)
        try:
            self._register("redaction@example.com", password=sentinels[0])
            self.client.post("/auth/logout")
            self._login("redaction@example.com", password="wrong password")
            server._audit("sentinel_probe", event_status="success", metadata={"safe": "identifier"})
        finally:
            server._security_log.removeHandler(handler)
        combined = "\n".join(record.getMessage() for record in handler.records)
        for value in sentinels:
            self.assertNotIn(value, combined)

    def test_cors_preflight_allows_declared_origin_and_rejects_undeclared_origin(self) -> None:
        allowed = self.client.options(
            "/auth/login",
            headers={
                "Origin": "http://127.0.0.1:5173",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type,x-csrf-token",
            },
        )
        self.assertEqual(allowed.status_code, 200)
        self.assertEqual(allowed.headers.get("access-control-allow-origin"), "http://127.0.0.1:5173")
        self.assertEqual(allowed.headers.get("access-control-allow-credentials"), "true")

        denied = self.client.options(
            "/auth/login",
            headers={
                "Origin": "https://evil.example",
                "Access-Control-Request-Method": "POST",
            },
        )
        self.assertNotEqual(denied.headers.get("access-control-allow-origin"), "https://evil.example")

        with patch.dict(os.environ, {"MEDLIFE_CORS_ORIGINS": "*"}, clear=False):
            with self.assertRaises(RuntimeError):
                server._validate_runtime_configuration()

    def test_x_forwarded_for_is_ignored_without_proxy_trust(self) -> None:
        from starlette.requests import Request

        request = Request(
            {
                "type": "http",
                "headers": [(b"x-forwarded-for", b"203.0.113.44")],
                "client": ("127.0.0.1", 12345),
                "method": "GET",
                "path": "/health",
            }
        )
        self.assertEqual(server._request_ip(request), "127.0.0.1")

    def test_readyz_fails_for_unavailable_and_incompatible_sqlite(self) -> None:
        self.assertEqual(self.client.get("/livez").status_code, 200)

        broken = connect(Path(self.tmpdir.name) / "broken-readyz.sqlite3")
        broken.close()
        original = server.DB_CONN
        server.DB_CONN = broken
        try:
            unavailable = self.client.get("/readyz")
            self.assertEqual(unavailable.status_code, 503)
            self.assertEqual(unavailable.json()["detail"], "database unavailable")
        finally:
            server.DB_CONN = original

        incompatible = connect(Path(self.tmpdir.name) / "incompatible.sqlite3")
        incompatible.execute("CREATE TABLE users (id TEXT PRIMARY KEY)")
        incompatible.commit()
        server.DB_CONN = incompatible
        try:
            bad_schema = self.client.get("/readyz")
            self.assertEqual(bad_schema.status_code, 503)
            self.assertEqual(bad_schema.json()["detail"], "database schema incompatible")
        finally:
            server.DB_CONN = original
            incompatible.close()

    def test_concurrent_duplicate_event_submission_is_idempotent_and_sequence_conflicts_are_safe(self) -> None:
        self._register("concurrency@example.com")
        self._create_encounter(encounter_id="enc-concurrent")
        body = {
            "event_id": "evt-1",
            "idempotency_key": "enc-concurrent:hx:ha-onset",
            "sequence_number": 1,
            "event_type": "history_question",
            "payload": {"question_id": "ha-onset"},
            "draft_snapshot": build_snapshot(encounter_id="enc-concurrent"),
            "integrity_status": "pending_sync",
        }

        def submit(event_id: str, idempotency_key: str, sequence_number: int):
            return self.client.post(
                "/encounters/enc-concurrent/events",
                headers={"X-CSRF-Token": self._csrf()},
                json={**body, "event_id": event_id, "idempotency_key": idempotency_key, "sequence_number": sequence_number},
            )

        with ThreadPoolExecutor(max_workers=2) as pool:
            duplicates = list(pool.map(lambda _: submit("evt-1", "enc-concurrent:hx:ha-onset", 1), range(2)))
        self.assertTrue(all(item.status_code == 200 for item in duplicates))
        self.assertEqual(
            server.DB_CONN.execute("SELECT COUNT(*) AS c FROM encounter_events WHERE encounter_id = ?", ("enc-concurrent",)).fetchone()["c"],
            1,
        )

        with ThreadPoolExecutor(max_workers=2) as pool:
            raced = list(
                pool.map(
                    lambda args: submit(*args),
                    [
                        ("evt-2", "enc-concurrent:hx:redflags", 2),
                        ("evt-3", "enc-concurrent:hx:sleep", 2),
                    ],
                )
            )
        self.assertEqual(sorted(item.status_code for item in raced), [200, 409])

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


class _CapturingHandler(logging.Handler):
    def __init__(self) -> None:
        super().__init__(level=logging.DEBUG)
        self.records: list[logging.LogRecord] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.records.append(record)


if __name__ == "__main__":
    unittest.main()
