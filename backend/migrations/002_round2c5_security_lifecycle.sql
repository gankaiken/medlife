ALTER TABLE users ADD COLUMN password_updated_at TEXT;

ALTER TABLE sessions ADD COLUMN idle_expires_at TEXT;

CREATE INDEX IF NOT EXISTS idx_sessions_user_last_seen ON sessions(user_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_idle_expires_at ON sessions(idle_expires_at);

CREATE TABLE IF NOT EXISTS security_audit_events (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    event_type TEXT NOT NULL,
    event_status TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    metadata_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_security_audit_events_created ON security_audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_events_user_created ON security_audit_events(user_id, created_at DESC);
