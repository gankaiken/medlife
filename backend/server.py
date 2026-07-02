"""Minimal medlife FastAPI backend surface used by tests and local tooling."""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="medlife Backend", version="0.2.0")

_agent_log = logging.getLogger("medlife.agent")
if not _agent_log.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("[medlife.agent] %(levelname)s %(message)s"))
    _agent_log.addHandler(_handler)
_agent_log.setLevel(logging.INFO)

MEDLIFE_CUSTOM_TOOLS: list[dict] = [
    {
        "name": "render_vitals_chart",
        "description": "Render a vitals chart for a patient.",
        "input_schema": {
            "type": "object",
            "properties": {"patient_id": {"type": "string", "minLength": 1}},
            "required": ["patient_id"],
            "additionalProperties": False,
        },
    },
    {
        "name": "render_bed_map",
        "description": "Render the current bed map.",
        "input_schema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "render_triage_badge",
        "description": "Render a triage badge for the case.",
        "input_schema": {
            "type": "object",
            "properties": {
                "zone": {"type": "string", "enum": ["red", "yellow", "green"]},
                "reason": {"type": "string", "minLength": 1},
            },
            "required": ["zone", "reason"],
            "additionalProperties": False,
        },
    },
    {
        "name": "render_patient_timeline",
        "description": "Render the patient timeline.",
        "input_schema": {
            "type": "object",
            "properties": {"patient_id": {"type": "string", "minLength": 1}},
            "required": ["patient_id"],
            "additionalProperties": False,
        },
    },
    {
        "name": "render_case_evaluation",
        "description": "Render the end-of-encounter case evaluation.",
        "input_schema": {
            "type": "object",
            "properties": {"case_id": {"type": "string", "minLength": 1}},
            "required": ["case_id"],
            "additionalProperties": True,
        },
    },
    {
        "name": "flag_critical_finding",
        "description": (
            "Raise a disruptive critical-finding banner for imminent patient risk. "
            "This tool is confirm-gated and requires explicit human confirmation "
            "through an approve/decline interaction."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "patient_id": {"type": "string", "minLength": 1},
                "severity": {"type": "string", "enum": ["critical", "urgent"]},
                "reason": {"type": "string", "minLength": 1},
            },
            "required": ["patient_id", "severity", "reason"],
            "additionalProperties": False,
        },
    },
    {
        "name": "lookup_ehr_history",
        "description": "Lookup credential-vault EHR history for a patient.",
        "input_schema": {
            "type": "object",
            "properties": {"patient_id": {"type": "string", "minLength": 1}},
            "required": ["patient_id"],
            "additionalProperties": False,
        },
    },
]

MEDLIFE_ATTENDING_SYSTEM_PROMPT = """
Use the MEDLIFE_CUSTOM_TOOLS registry when visualizing case state.
If you believe a patient is in imminent danger, call flag_critical_finding.
That tool is confirm-gated: it requires explicit human confirmation through an
approve/decline interaction before execution.
""".strip()


class EhrLookupRequest(BaseModel):
    patient_id: str = Field(min_length=1)


class VitalsSnapshot(BaseModel):
    hr: int
    bp_systolic: int
    bp_diastolic: int
    spo2: int
    rr: int


class TriageClassifyRequest(BaseModel):
    patient_id: str = Field(min_length=1)
    chief_complaint: str = Field(min_length=1)
    vitals: VitalsSnapshot
    ecg_findings: str | None = None


class TriageClassifyResponse(BaseModel):
    patient_id: str
    esi_level: Literal["critical", "urgent", "stable"]
    rationale: str
    red_flags: list[str] = Field(default_factory=list)
    model: str


_anthropic_client = None

_EHR_RECORDS = {
    "poly-001": {
        "patient_id": "poly-001",
        "prior_encounters": ["2026-05-21 viral URTI", "2026-02-02 tension headache"],
        "active_medications": ["paracetamol"],
        "allergies": ["none known"],
    },
    "er-101": {
        "patient_id": "er-101",
        "prior_encounters": ["2025-12-12 chest pain observation"],
        "active_medications": ["aspirin"],
        "allergies": ["penicillin"],
    },
}


def _extract_json_block(text: str) -> str:
    body = text.strip()
    if body.startswith("```"):
        body = re.sub(r"^```(?:json)?\s*", "", body)
        body = re.sub(r"\s*```$", "", body)
    return body.strip()


def run_triage_reasoning(client, req: TriageClassifyRequest) -> TriageClassifyResponse:
    system = (
        "You are an ESI triage assistant. Return JSON only. "
        "Classify the patient as critical, urgent, or stable. "
        "Always mention red flag reasoning when present."
    )
    user = (
        f"patient_id={req.patient_id}\n"
        f"chief_complaint={req.chief_complaint}\n"
        f"HR {req.vitals.hr}\n"
        f"BP {req.vitals.bp_systolic}/{req.vitals.bp_diastolic}\n"
        f"SpO2 {req.vitals.spo2}\n"
        f"RR {req.vitals.rr}\n"
        f"ECG {req.ecg_findings or 'none'}"
    )
    msg = client.messages.create(
        model="claude-opus-4-7",
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    text_blocks = [block.text for block in getattr(msg, "content", []) if getattr(block, "type", "") == "text"]
    raw = "\n".join(text_blocks).strip()
    if not raw:
        raise HTTPException(status_code=502, detail="empty triage response")

    try:
        payload = json.loads(_extract_json_block(raw))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail=f"malformed triage JSON: {exc.msg}") from exc

    level = payload.get("esi_level")
    if level not in {"critical", "urgent", "stable"}:
        raise HTTPException(status_code=502, detail="invalid esi_level")

    return TriageClassifyResponse(
        patient_id=req.patient_id,
        esi_level=level,
        rationale=payload.get("rationale", ""),
        red_flags=payload.get("red_flags") or [],
        model="claude-opus-4-7",
    )


@app.post("/agent/vault/ehr/lookup")
def lookup_ehr_history(req: EhrLookupRequest):
    patient_id = req.patient_id.strip()
    if not patient_id:
        raise HTTPException(status_code=400, detail="patient_id is required")

    token = os.environ.get("EHR_API_TOKEN")
    if not token:
        raise HTTPException(status_code=503, detail="credential vault unavailable")

    record = _EHR_RECORDS.get(patient_id)
    if not record:
        raise HTTPException(status_code=404, detail="patient not found")

    _agent_log.info("vault lookup for patient %s", patient_id)
    return {
        "patient_id": patient_id,
        "fetched_via": "credential-vault",
        "record": record,
    }


@app.post("/agent/triage/classify", response_model=TriageClassifyResponse)
def triage_classify(req: TriageClassifyRequest):
    global _anthropic_client
    if _anthropic_client is None:
        class _UnavailableClient:
            class messages:
                @staticmethod
                def create(**_kwargs):
                    raise HTTPException(status_code=503, detail="anthropic client not configured")

        _anthropic_client = _UnavailableClient()
    return run_triage_reasoning(_anthropic_client, req)
