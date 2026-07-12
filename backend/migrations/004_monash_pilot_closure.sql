ALTER TABLE user_preferences ADD COLUMN research_consent_version TEXT;
ALTER TABLE user_preferences ADD COLUMN research_consented_at TEXT;

ALTER TABLE case_review_records ADD COLUMN institution_profile_version TEXT;
ALTER TABLE case_review_records ADD COLUMN source_registry_version TEXT;
ALTER TABLE case_review_records ADD COLUMN diagnosis_definition_version TEXT;
ALTER TABLE case_review_records ADD COLUMN management_content_version TEXT;
ALTER TABLE case_review_records ADD COLUMN patient_safety_rule_version TEXT;
ALTER TABLE case_review_records ADD COLUMN review_scope_json TEXT;
ALTER TABLE case_review_records ADD COLUMN fixture_label TEXT;

CREATE TABLE IF NOT EXISTS research_consent_events (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    learner_stage TEXT NOT NULL,
    educational_notice_acknowledged_at TEXT,
    research_participation_status TEXT NOT NULL,
    research_consent_version TEXT,
    research_consented_at TEXT,
    research_withdrawn_at TEXT,
    deidentified_research_id TEXT,
    created_at TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_research_consent_events_user_created
    ON research_consent_events(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS educator_attempt_scores (
    id TEXT PRIMARY KEY,
    encounter_id TEXT NOT NULL,
    learner_user_id TEXT NOT NULL,
    reviewer_user_id TEXT NOT NULL,
    reviewer_role TEXT NOT NULL,
    rubric_version TEXT NOT NULL,
    review_mode TEXT NOT NULL DEFAULT 'independent',
    overall_score REAL,
    overall_category TEXT NOT NULL,
    domain_scores_json TEXT NOT NULL,
    safety_findings_json TEXT NOT NULL,
    missed_history_json TEXT NOT NULL,
    investigation_evaluation TEXT NOT NULL,
    diagnosis_evaluation TEXT NOT NULL,
    communication_evaluation TEXT NOT NULL,
    educator_comment TEXT NOT NULL,
    confidence_label TEXT NOT NULL,
    review_minutes INTEGER NOT NULL DEFAULT 0,
    submit_status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    amended_from_score_id TEXT,
    FOREIGN KEY (encounter_id) REFERENCES encounters(id) ON DELETE CASCADE,
    FOREIGN KEY (learner_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewer_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (amended_from_score_id) REFERENCES educator_attempt_scores(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_educator_attempt_scores_encounter_created
    ON educator_attempt_scores(encounter_id, created_at DESC);
