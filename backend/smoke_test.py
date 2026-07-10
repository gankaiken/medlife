"""Round 1 smoke test for the active medlife backend contract.

Usage:

    python backend/smoke_test.py

This checks only the endpoints that still exist in the simplified
Round 1 architecture.
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from typing import Any

BASE = "http://127.0.0.1:8787"
TIMEOUT = 20.0


def _request(method: str, path: str, body: dict[str, Any] | None = None) -> tuple[int, dict | str]:
    url = f"{BASE}{path}"
    data = None
    headers: dict[str, str] = {}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json; charset=utf-8"
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            payload = resp.read().decode("utf-8", errors="replace")
            status = resp.status
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode("utf-8", errors="replace")
        status = exc.code
    try:
        return status, json.loads(payload)
    except ValueError:
        return status, payload


class Reporter:
    def __init__(self) -> None:
        self.passed = 0
        self.failed: list[str] = []

    def check(self, name: str, condition: bool, detail: str = "") -> None:
        if condition:
            self.passed += 1
            print(f"PASS  {name}")
            return
        self.failed.append(f"{name}: {detail}")
        print(f"FAIL  {name}  ({detail})")

    def exit_code(self) -> int:
        print(f"\n{self.passed} passed, {len(self.failed)} failed.")
        return 1 if self.failed else 0


def sample_debrief_request() -> dict[str, Any]:
    return {
        "case_id": "case-headache-001",
        "case_summary": {
            "chief_complaint": "Headache",
            "correct_diagnosis_id": "tension-headache",
            "diagnosis_options": ["tension-headache", "migraine"],
            "severity": "stable",
            "age": 28,
            "gender": "F",
        },
        "case_expectations": {
            "relevant_history_question_ids": ["onset", "red-flags"],
            "acceptable_treatment_ids": ["paracetamol"],
            "critical_treatment_ids": [],
        },
        "rubric": {
            "data_gathering": [],
            "clinical_management": [],
            "interpersonal": [],
            "safety_netting": None,
        },
        "registry_slice": [],
        "encounter_log": {
            "arrived_at_iso": "2026-07-09T10:00:00Z",
            "ended_at_iso": "2026-07-09T10:08:00Z",
            "elapsed_seconds": 480,
            "history_questions_asked": [
                {
                    "id": "onset",
                    "question": "When did this start?",
                    "answer_shown_to_trainee": "Two days ago.",
                    "relevant_per_case": True,
                }
            ],
            "tests_ordered": [],
            "treatments_given": [],
            "prescriptions": [],
            "transcript": [],
            "results_opened": [],
            "end_confirm": {"sum": True, "safe": True, "ice": False},
            "submitted_diagnosis_id": "tension-headache",
            "diagnosis_was_correct": True,
        },
    }


def main() -> int:
    reporter = Reporter()

    status, body = _request("GET", "/health")
    reporter.check("GET /health returns 200", status == 200, f"status={status}")
    reporter.check("health response is JSON", isinstance(body, dict), str(body))
    if isinstance(body, dict):
        reporter.check("health exposes backend flag", "backend" in body, str(body))
        reporter.check("health exposes persistence_mode", body.get("persistence_mode") == "local_storage", str(body))

    status, body = _request("GET", "/agent/capabilities")
    reporter.check("GET /agent/capabilities returns 200", status == 200, f"status={status}")
    reporter.check("capabilities response is JSON", isinstance(body, dict), str(body))

    status, body = _request("POST", "/agent/debrief", sample_debrief_request())
    reporter.check("POST /agent/debrief returns 200", status == 200, f"status={status} body={body}")
    if isinstance(body, dict):
        reporter.check("debrief returns engine", body.get("engine") in {"ai", "rule_based"}, str(body))
        reporter.check("debrief returns evaluation", isinstance(body.get("evaluation"), dict), str(body))

    status, _ = _request(
        "POST",
        "/voice/token",
        {
            "room_name": "case-headache-001",
            "identity": "smoke-test",
            "metadata": {"case_id": "case-headache-001"},
        },
    )
    reporter.check("POST /voice/token returns 200 or 503", status in {200, 503}, f"status={status}")

    return reporter.exit_code()


if __name__ == "__main__":
    sys.exit(main())
