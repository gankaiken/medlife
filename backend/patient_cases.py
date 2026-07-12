from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field, ValidationError, model_validator


REGISTRY_PATH = Path(__file__).resolve().parents[1] / "shared" / "patient_case_registry.json"
LEARNER_CATALOG_PATH = Path(__file__).resolve().parents[1] / "shared" / "learner_case_catalog.json"


class CaseReferenceModel(BaseModel):
    source_id: str
    title: str
    organisation: str
    publication_or_revision_date: str
    relevant_sections: list[str] = Field(default_factory=list)
    notes: str


class CaseFactModel(BaseModel):
    fact_id: str
    concept_id: str
    history_domain_id: str
    disclosure: str
    prompt: str
    answer: str
    match_terms: list[str] = Field(default_factory=list)
    verification_anchors: list[str] = Field(default_factory=list)
    value_polarity: Literal["positive", "negative", "mixed"]


class PatientVisibleCaseModel(BaseModel):
    identity: dict[str, Any]
    demographics: dict[str, Any]
    presenting_complaint: str
    opening_style: str
    emotional_tone: str
    main_concern: str
    patient_vocabulary: list[str] = Field(default_factory=list)
    patient_unknown_topics: list[str] = Field(default_factory=list)
    communication_notes: list[str] = Field(default_factory=list)
    facts: list[CaseFactModel] = Field(default_factory=list)


class ManagementExpectationsModel(BaseModel):
    acceptable_treatment_ids: list[str] = Field(default_factory=list)
    critical_treatment_ids: list[str] = Field(default_factory=list)


class RubricCriterionModel(BaseModel):
    criterion_id: str
    label: str
    description: str
    weight: int | float


class ClinicianOnlyCaseModel(BaseModel):
    correct_diagnosis_id: str
    correct_diagnosis_label: str
    differential_diagnoses: list[str] = Field(default_factory=list)
    examination_findings: list[str] = Field(default_factory=list)
    investigation_findings: list[str] = Field(default_factory=list)
    management_expectations: ManagementExpectationsModel
    hidden_notes: list[str] = Field(default_factory=list)
    red_flags: list[str] = Field(default_factory=list)
    rubric: dict[str, list[RubricCriterionModel]] = Field(default_factory=dict)
    forbidden_terms: list[str] = Field(default_factory=list)


class AuthorshipModel(BaseModel):
    author: str
    clinical_reviewer: str | None = None
    reviewer_role: str | None = None


class EducationalDesignModel(BaseModel):
    learning_objectives: list[str] = Field(default_factory=list)
    intended_learner_level: str
    specialty: str
    difficulty: str
    consultation_type: str
    expected_duration_min: int


CaseStatus = Literal["draft", "in_review", "approved", "retired", "development_only"]
ApprovalStatus = Literal["clinically_reviewed", "clinical_review_required", "retired", "draft"]


class GovernedCaseModel(BaseModel):
    case_id: str
    case_version: str
    status: CaseStatus
    created_date: str
    updated_date: str
    last_clinical_review_date: str | None = None
    review_due_date: str | None = None
    approval_status: ApprovalStatus
    review_notes: list[str] = Field(default_factory=list)
    known_limitations: list[str] = Field(default_factory=list)
    authorship: AuthorshipModel
    educational_design: EducationalDesignModel
    references: list[CaseReferenceModel] = Field(default_factory=list)
    patient_visible: PatientVisibleCaseModel
    clinician_only: ClinicianOnlyCaseModel

    @model_validator(mode="after")
    def validate_governance(self) -> "GovernedCaseModel":
        fact_ids = [fact.fact_id for fact in self.patient_visible.facts]
        if len(fact_ids) != len(set(fact_ids)):
            raise ValueError(f"{self.case_id}: duplicate patient-visible fact ids")
        if self.status == "approved":
            if not self.authorship.clinical_reviewer or not self.authorship.reviewer_role:
                raise ValueError(f"{self.case_id}: approved case missing reviewer metadata")
            if self.approval_status != "clinically_reviewed":
                raise ValueError(f"{self.case_id}: approved case must be clinically reviewed")
        return self


class CaseRegistryModel(BaseModel):
    schema_version: Literal["medlife.case-registry.v1"]
    cases: list[GovernedCaseModel] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_registry(self) -> "CaseRegistryModel":
        seen_versions: set[tuple[str, str]] = set()
        for case in self.cases:
            key = (case.case_id, case.case_version)
            if key in seen_versions:
                raise ValueError(f"duplicate case id/version: {case.case_id}@{case.case_version}")
            seen_versions.add(key)
        return self


def _read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def load_patient_case_registry() -> CaseRegistryModel:
    return CaseRegistryModel.model_validate(_read_json(REGISTRY_PATH))


@lru_cache(maxsize=1)
def load_learner_case_catalog() -> dict[str, Any]:
    return _read_json(LEARNER_CATALOG_PATH)


@lru_cache(maxsize=1)
def get_patient_cases_by_id() -> dict[str, GovernedCaseModel]:
    return {case.case_id: case for case in load_patient_case_registry().cases}


def get_patient_case(case_id: str) -> GovernedCaseModel | None:
    return get_patient_cases_by_id().get(case_id)


def get_patient_visible_case(case_id: str) -> dict[str, Any] | None:
    case = get_patient_case(case_id)
    return case.patient_visible.model_dump() if case else None


def get_clinician_only_case(case_id: str) -> dict[str, Any] | None:
    case = get_patient_case(case_id)
    return case.clinician_only.model_dump() if case else None


def get_case_status(case_id: str) -> CaseStatus | None:
    case = get_patient_case(case_id)
    return case.status if case else None


def get_case_version(case_id: str) -> str | None:
    case = get_patient_case(case_id)
    return case.case_version if case else None


def validate_case_registry_file(path: Path | None = None) -> tuple[bool, str | None]:
    target = path or REGISTRY_PATH
    try:
        CaseRegistryModel.model_validate(_read_json(target))
    except (ValidationError, ValueError) as exc:
        return False, str(exc)
    return True, None
