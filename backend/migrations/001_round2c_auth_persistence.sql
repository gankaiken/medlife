CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    email_normalized TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_login_at TEXT,
    email_verified_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    session_token_hash TEXT NOT NULL UNIQUE,
    csrf_token_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    user_agent TEXT,
    last_seen_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS encounters (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    case_id TEXT NOT NULL,
    case_version TEXT NOT NULL,
    case_name TEXT NOT NULL,
    case_status TEXT NOT NULL,
    approval_status TEXT NOT NULL,
    review_banner TEXT NOT NULL,
    conversation_mode TEXT NOT NULL,
    status TEXT NOT NULL,
    integrity_status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    last_activity_at TEXT NOT NULL,
    completed_at TEXT,
    submitted_at TEXT,
    assessment_engine TEXT,
    optimistic_version INTEGER NOT NULL DEFAULT 0,
    draft_snapshot_json TEXT NOT NULL,
    completion_snapshot_json TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS encounter_events (
    id TEXT PRIMARY KEY,
    encounter_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    sequence_number INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (encounter_id, idempotency_key),
    UNIQUE (encounter_id, sequence_number),
    FOREIGN KEY (encounter_id) REFERENCES encounters(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS disclosure_receipts (
    id TEXT PRIMARY KEY,
    encounter_id TEXT NOT NULL,
    receipt_id TEXT NOT NULL,
    validation_status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    UNIQUE (encounter_id, receipt_id),
    FOREIGN KEY (encounter_id) REFERENCES encounters(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS assessments (
    id TEXT PRIMARY KEY,
    encounter_id TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    engine TEXT NOT NULL,
    status TEXT NOT NULL,
    case_id TEXT NOT NULL,
    case_version TEXT NOT NULL,
    assessment_schema_version TEXT NOT NULL,
    integrity_status TEXT NOT NULL,
    evaluation_json TEXT NOT NULL,
    evidence_refs_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (encounter_id) REFERENCES encounters(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS local_history_migrations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    source_encounter_id TEXT NOT NULL,
    result_encounter_id TEXT,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (user_id, fingerprint),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_encounters_user_status ON encounters(user_id, status);
CREATE INDEX IF NOT EXISTS idx_encounters_user_activity ON encounters(user_id, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_encounter_sequence ON encounter_events(encounter_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_assessments_user_created ON assessments(user_id, created_at DESC);
