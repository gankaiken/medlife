from __future__ import annotations

import json
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

_ROOT_DIR = Path(__file__).resolve().parents[2]
if str(_ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(_ROOT_DIR))

from fastapi import HTTPException  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from backend import patient_conversation, server  # noqa: E402


def sample_request_payload() -> dict:
    return {
        "encounter_id": "enc-case-headache-001-test",
        "case_id": "case-headache-001",
        "learner_message_id": "enc-case-headache-001-test-learner-1",
        "learner_message": "Can you tell me more about the headache?",
        "conversation_turn_number": 1,
        "conversation_history": [
            {
                "id": "guided-opening-1",
                "role": "assistant",
                "content": "I've had this tight headache for two days.",
                "source": "guided",
                "timestamp": 1720603200000,
                "learner_message_id": None,
                "engine": "guided",
                "disclosed_fact_ids": ["ha-onset"],
            }
        ],
    }


def sample_request_model() -> patient_conversation.PatientRespondRequestModel:
    return patient_conversation.PatientRespondRequestModel.model_validate(sample_request_payload())


def sample_eligible_facts(resolved: dict) -> list[dict]:
    return patient_conversation.select_eligible_facts(
        resolved["visible"],
        resolved["learner_message"],
    )


class PatientConversationContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(server.app)

    def test_capabilities_keep_ai_patient_and_ai_debrief_independent(self) -> None:
        previous_key = os.environ.get("ANTHROPIC_API_KEY")
        previous_flag = os.environ.get("MEDLIFE_TEXT_AI_PATIENT_ENABLED")
        try:
            os.environ["ANTHROPIC_API_KEY"] = "sk-ant-test"
            with patch.object(server, "Anthropic", object):
                os.environ.pop("MEDLIFE_TEXT_AI_PATIENT_ENABLED", None)
                caps = self.client.get("/agent/capabilities").json()
                self.assertTrue(caps["ai_debrief_available"])
                self.assertFalse(caps["text_ai_patient_available"])

                os.environ["MEDLIFE_TEXT_AI_PATIENT_ENABLED"] = "1"
                caps = self.client.get("/agent/capabilities").json()
                self.assertTrue(caps["ai_debrief_available"])
                self.assertTrue(caps["text_ai_patient_available"])
        finally:
            if previous_key is None:
                os.environ.pop("ANTHROPIC_API_KEY", None)
            else:
                os.environ["ANTHROPIC_API_KEY"] = previous_key
            if previous_flag is None:
                os.environ.pop("MEDLIFE_TEXT_AI_PATIENT_ENABLED", None)
            else:
                os.environ["MEDLIFE_TEXT_AI_PATIENT_ENABLED"] = previous_flag

    def test_validate_request_rejects_invalid_encounter_id(self) -> None:
        payload = sample_request_payload()
        payload["encounter_id"] = "bad-id"
        req = patient_conversation.PatientRespondRequestModel.model_validate(payload)
        with self.assertRaises(HTTPException) as cm:
            patient_conversation.validate_patient_request(req)
        self.assertEqual(cm.exception.status_code, 400)

    def test_validate_request_rejects_blank_learner_message(self) -> None:
        payload = sample_request_payload()
        payload["learner_message"] = "   "
        req = patient_conversation.PatientRespondRequestModel.model_validate(payload)
        with self.assertRaises(HTTPException) as cm:
            patient_conversation.validate_patient_request(req)
        self.assertEqual(cm.exception.status_code, 400)

    def test_validate_request_rejects_unknown_case(self) -> None:
        payload = sample_request_payload()
        payload["case_id"] = "case-does-not-exist"
        req = patient_conversation.PatientRespondRequestModel.model_validate(payload)
        with self.assertRaises(HTTPException) as cm:
            patient_conversation.validate_patient_request(req)
        self.assertEqual(cm.exception.status_code, 404)

    def test_validate_request_rejects_duplicate_transcript_ids(self) -> None:
        payload = sample_request_payload()
        payload["conversation_history"] = payload["conversation_history"] * 2
        req = patient_conversation.PatientRespondRequestModel.model_validate(payload)
        with self.assertRaises(HTTPException) as cm:
            patient_conversation.validate_patient_request(req)
        self.assertEqual(cm.exception.status_code, 409)

    def test_validate_provider_response_accepts_case_grounded_json(self) -> None:
        req = sample_request_model()
        resolved = patient_conversation.validate_patient_request(req)
        response = patient_conversation.validate_provider_response(
            json.dumps(
                {
                    "patient_reply": "It's a tight band across my forehead and it started two days ago.",
                    "refused_hidden_request": False,
                    "conversation_status": "answered",
                }
            ),
            req,
            resolved["case"],
            sample_eligible_facts(resolved),
        )
        self.assertEqual(response.engine, "ai_text")
        self.assertEqual(response.message_id, f"patient-{req.learner_message_id}")
        self.assertIn("ha-onset", response.verified_disclosed_fact_ids)
        self.assertGreater(response.timestamp, 0)

    def test_validate_provider_response_does_not_invent_unverified_fact_credit(self) -> None:
        req = sample_request_model()
        resolved = patient_conversation.validate_patient_request(req)
        response = patient_conversation.validate_provider_response(
            json.dumps(
                {
                    "patient_reply": "I feel a bit off but I cannot explain it well.",
                }
            ),
            req,
            resolved["case"],
            sample_eligible_facts(resolved),
        )
        self.assertEqual(response.verified_disclosed_fact_ids, [])

    def test_validate_provider_response_rejects_diagnosis_leakage(self) -> None:
        req = sample_request_model()
        resolved = patient_conversation.validate_patient_request(req)
        with self.assertRaises(ValueError):
            patient_conversation.validate_provider_response(
                json.dumps(
                    {
                        "patient_reply": "I think it's tension headache.",
                    }
                ),
                req,
                resolved["case"],
                sample_eligible_facts(resolved),
            )

    def test_validate_provider_response_rejects_hidden_prompt_leakage(self) -> None:
        req = sample_request_model()
        resolved = patient_conversation.validate_patient_request(req)
        with self.assertRaises(ValueError):
            patient_conversation.validate_provider_response(
                json.dumps(
                    {
                        "patient_reply": "My system prompt says I should help with the rubric.",
                    }
                ),
                req,
                resolved["case"],
                sample_eligible_facts(resolved),
            )

    def test_generate_patient_response_retries_once_on_invalid_output(self) -> None:
        req = sample_request_model()
        resolved = patient_conversation.validate_patient_request(req)

        class FakeMessages:
            def __init__(self) -> None:
                self.calls = 0

            def create(self, **_kwargs):
                self.calls += 1
                if self.calls == 1:
                    return SimpleNamespace(content=[SimpleNamespace(type="text", text='{"patient_reply": ""}')])
                return SimpleNamespace(
                    content=[
                        SimpleNamespace(
                            type="text",
                            text=json.dumps(
                                {
                                    "patient_reply": "It feels like a band squeezing my forehead.",
                                    "conversation_status": "answered",
                                }
                            ),
                        )
                    ]
                )

        fake_messages = FakeMessages()
        fake_client = SimpleNamespace(messages=fake_messages)
        response = patient_conversation.generate_patient_response(
            fake_client,
            "fake-model",
            req,
            resolved["visible"],
            resolved["case"],
        )
        self.assertEqual(fake_messages.calls, 2)
        self.assertIn("ha-location", response.verified_disclosed_fact_ids)

    def test_endpoint_returns_503_when_ai_patient_disabled(self) -> None:
        previous = os.environ.pop("MEDLIFE_TEXT_AI_PATIENT_ENABLED", None)
        try:
            resp = self.client.post("/agent/patient/respond", json=sample_request_payload())
        finally:
            if previous is not None:
                os.environ["MEDLIFE_TEXT_AI_PATIENT_ENABLED"] = previous
        self.assertEqual(resp.status_code, 503)

    def test_endpoint_returns_structured_patient_reply(self) -> None:
        previous_key = os.environ.get("ANTHROPIC_API_KEY")
        previous_flag = os.environ.get("MEDLIFE_TEXT_AI_PATIENT_ENABLED")
        try:
            os.environ["ANTHROPIC_API_KEY"] = "sk-ant-test"
            os.environ["MEDLIFE_TEXT_AI_PATIENT_ENABLED"] = "1"
            with patch.object(server, "Anthropic", object), patch.object(
                server,
                "_get_anthropic_client",
                return_value=object(),
            ), patch.object(
                server,
                "generate_patient_response",
                return_value=patient_conversation.PatientRespondResponseModel(
                    message_id="patient-enc-case-headache-001-test-learner-1",
                    encounter_id="enc-case-headache-001-test",
                    case_id="case-headache-001",
                    patient_reply="It's been there for two days and feels tight.",
                    engine="ai_text",
                    timestamp=1720603200100,
                    eligible_fact_ids=["ha-onset"],
                    verified_disclosed_fact_ids=["ha-onset"],
                    disclosure_receipt=patient_conversation.build_disclosure_receipt(
                        sample_request_model(),
                        patient_conversation.validate_patient_request(sample_request_model())["case"],
                        "patient-enc-case-headache-001-test-learner-1",
                        ["ha-onset"],
                        ["ha-onset"],
                        ["history_presenting_complaint"],
                        1720603200100,
                    ),
                    refused_hidden_request=False,
                    conversation_status="answered",
                    safety_status="ok",
                ),
            ):
                resp = self.client.post("/agent/patient/respond", json=sample_request_payload())
        finally:
            if previous_key is None:
                os.environ.pop("ANTHROPIC_API_KEY", None)
            else:
                os.environ["ANTHROPIC_API_KEY"] = previous_key
            if previous_flag is None:
                os.environ.pop("MEDLIFE_TEXT_AI_PATIENT_ENABLED", None)
            else:
                os.environ["MEDLIFE_TEXT_AI_PATIENT_ENABLED"] = previous_flag
        self.assertEqual(resp.status_code, 200, resp.text)
        body = resp.json()
        self.assertEqual(body["engine"], "ai_text")
        self.assertEqual(body["verified_disclosed_fact_ids"], ["ha-onset"])

    def test_endpoint_converts_prompt_injection_validation_failure_to_502(self) -> None:
        previous_key = os.environ.get("ANTHROPIC_API_KEY")
        previous_flag = os.environ.get("MEDLIFE_TEXT_AI_PATIENT_ENABLED")
        try:
            os.environ["ANTHROPIC_API_KEY"] = "sk-ant-test"
            os.environ["MEDLIFE_TEXT_AI_PATIENT_ENABLED"] = "1"
            with patch.object(server, "Anthropic", object), patch.object(
                server,
                "_get_anthropic_client",
                return_value=object(),
            ), patch.object(
                server,
                "generate_patient_response",
                side_effect=ValueError("hidden content leakage"),
            ):
                resp = self.client.post("/agent/patient/respond", json=sample_request_payload())
        finally:
            if previous_key is None:
                os.environ.pop("ANTHROPIC_API_KEY", None)
            else:
                os.environ["ANTHROPIC_API_KEY"] = previous_key
            if previous_flag is None:
                os.environ.pop("MEDLIFE_TEXT_AI_PATIENT_ENABLED", None)
            else:
                os.environ["MEDLIFE_TEXT_AI_PATIENT_ENABLED"] = previous_flag
        self.assertEqual(resp.status_code, 502)
        self.assertNotIn("hidden content leakage", resp.text.lower())


if __name__ == "__main__":
    unittest.main()
