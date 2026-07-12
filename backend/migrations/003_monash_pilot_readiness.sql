ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'learner';

CREATE TABLE IF NOT EXISTS user_preferences (
    user_id TEXT PRIMARY KEY,
    learner_stage TEXT NOT NULL DEFAULT 'transition_to_clinical_learning',
    non_3d_mode INTEGER NOT NULL DEFAULT 0,
    low_bandwidth_mode INTEGER NOT NULL DEFAULT 0,
    reduced_motion_mode INTEGER NOT NULL DEFAULT 0,
    background_audio_enabled INTEGER NOT NULL DEFAULT 1,
    educational_notice_acknowledged_at TEXT,
    research_participation_status TEXT NOT NULL DEFAULT 'not_answered',
    research_withdrawn_at TEXT,
    deidentified_research_id TEXT,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS attempt_reviews (
    id TEXT PRIMARY KEY,
    encounter_id TEXT NOT NULL,
    learner_user_id TEXT NOT NULL,
    reviewer_user_id TEXT NOT NULL,
    reviewer_role TEXT NOT NULL,
    educator_comment TEXT NOT NULL,
    agreement_label TEXT NOT NULL,
    safety_concern_level TEXT NOT NULL,
    reviewed_status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (encounter_id) REFERENCES encounters(id) ON DELETE CASCADE,
    FOREIGN KEY (learner_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewer_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_attempt_reviews_encounter_created
    ON attempt_reviews(encounter_id, created_at DESC);

CREATE TABLE IF NOT EXISTS case_review_records (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL,
    case_version TEXT NOT NULL,
    review_type TEXT NOT NULL,
    decision TEXT NOT NULL,
    reviewer_user_id TEXT NOT NULL,
    reviewer_role TEXT NOT NULL,
    comments TEXT NOT NULL,
    mapping_version TEXT,
    reviewed_at TEXT NOT NULL,
    next_review_date TEXT,
    FOREIGN KEY (reviewer_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_case_review_records_case_reviewed
    ON case_review_records(case_id, case_version, reviewed_at DESC);
