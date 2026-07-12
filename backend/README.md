# medlife backend

This FastAPI backend supports the current Medlife guided flow, secure learner accounts, server-side persistence, learner progress, and the optional text AI patient flow.

## Active endpoints

- `GET /health`
- `GET /livez`
- `GET /readyz`
- `GET /agent/capabilities`
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/logout-all`
- `GET /auth/me`
- `GET /auth/export`
- `POST /auth/migrate-local`
- `GET /progress`
- `POST /encounters`
- `GET /encounters`
- `GET /encounters/{id}`
- `POST /encounters/{id}/events`
- `POST /encounters/{id}/assessment`
- `DELETE /encounters/{id}`
- `POST /agent/debrief`
- `POST /agent/patient/respond`
- `POST /agent/vault/ehr/lookup`
- `POST /agent/triage/classify`
- `POST /voice/token`

## Capability semantics

`/health` and `/agent/capabilities` return the same non-secret runtime model:

- `backend_available`: backend is up and serving requests
- `ai_debrief_available`: Anthropic debrief path is configured
- `guided_mode_available`: guided consultation is supported
- `text_ai_patient_available`: learner-facing text AI patient mode is available
- `voice_backend_configured`: backend can mint voice tokens
- `voice_frontend_supported`: frontend implements the learner voice flow
- `live_voice_usable`: both backend and frontend support a real learner voice consultation
- `ehr_demo_available`: demo EHR lookup is enabled
- `triage_available`: AI triage helper is enabled
- `persistence_mode`: current persistence backing, presently `server_session_sqlite`

## Debrief contract and safety

`POST /agent/debrief` accepts one structured completed encounter.

Current implementation:

- Provider: Anthropic
- Model: `claude-opus-4-7`
- Timeout: 20 seconds
- Max request size: `120000` JSON characters
- Max transcript size: `8000` characters
- Output schema: validated by Pydantic before returning to the browser
- Fallback: rule-based assessment
- Logging: warning-level summary only, no keys or full payload dumps

Safety boundaries:

- Case facts and rubric are treated as trusted application data
- Transcript content and student-entered content are treated as untrusted
- Untrusted content is wrapped inside `<UNTRUSTED_ENCOUNTER_JSON>` delimiters
- Invalid JSON, invalid schema, timeout, and provider exceptions all fall back safely
- Browser responses do not include provider stack traces

## Text AI patient contract and safety

`POST /agent/patient/respond` accepts one learner text turn for one active encounter.

Current implementation:

- Canonical case source: `shared/patient_case_registry.json`
- Backend resolution: request `case_id` is resolved server-side; the browser is not trusted for patient facts
- Modes: guided consultation remains available even when this endpoint is unavailable
- Provider gate: `text_ai_patient_available` is independent from `ai_debrief_available`
- Input limits: learner message, transcript turns, transcript characters, and turn count are bounded
- Output schema: validated before any patient reply is returned to the browser
- Hidden-data boundary: patient-visible facts and clinician-only facts are separated in the registry and only the patient-visible slice is sent to the model
- Fallback: browser keeps the encounter and can switch to guided mode immediately on failure

Safety boundaries:

- Learner message and transcript are treated as untrusted content
- Prompt, rubric, diagnosis, hidden findings, and unsupported fact ids are rejected on validation
- Provider errors are collapsed to safe unavailable responses; raw provider internals are not returned to the browser
- Free-text disclosures are captured as structured ids for deterministic assessment evidence

## Environment

See the root `.env.example`.

Optional integrations:

- `MEDLIFE_DB_PATH`
- `MEDLIFE_COOKIE_SECURE`
- `MEDLIFE_ENV`
- `MEDLIFE_CORS_ORIGINS`
- `MEDLIFE_PASSWORD_PBKDF2_ITERATIONS`
- `MEDLIFE_SESSION_ABSOLUTE_HOURS`
- `MEDLIFE_SESSION_IDLE_MINUTES`
- `MEDLIFE_MAX_ACTIVE_SESSIONS`
- `MEDLIFE_MAX_EVENT_PAYLOAD_BYTES`
- `MEDLIFE_LOGIN_FAILURE_LIMIT`
- `MEDLIFE_LOGIN_FAILURE_WINDOW_MINUTES`
- `ANTHROPIC_API_KEY`
- `MEDLIFE_TEXT_AI_PATIENT_ENABLED`
- `MEDLIFE_TEXT_AI_PATIENT_MODEL`
- `EHR_API_TOKEN`
- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`

The backend loads `.env` itself for local development and still starts if optional credentials are missing.

## Password profile

- Digest: `PBKDF2-HMAC-SHA256`
- Stored format: `pbkdf2_sha256$<iterations>$<digest>`
- Default iteration floor: `240000`
- Salt source: `secrets.token_bytes(16)` encoded as base64
- Derived-key length: SHA-256 PBKDF2 default output (`32` bytes)
- Maximum password length: `256` characters
- Upgrade condition: any stored hash below the current configured iteration target is re-hashed after a successful login

## Security notes

- Session and CSRF values are random browser cookies; the database stores only one-way hashes.
- Authenticated state-changing routes require cookie-plus-header CSRF validation.
- Production startup fails fast if secure cookies are disabled or wildcard/local CORS origins are used with `MEDLIFE_ENV=production`.
- The backend records non-secret audit events for login, logout, export, migration, and rejected access.
- Learner export excludes password hashes, sessions, and secrets.
- Account deletion is not implemented yet.
- Client IP resolution currently uses the direct ASGI client address. `X-Forwarded-For` is not trusted by default.
- Rate limiting is in-memory and therefore single-process protection only.

## Local run

```powershell
python -m backend.manage_db migrate
python -m uvicorn backend.server:app --host 127.0.0.1 --port 8787
```

Database operations:

```powershell
python -m backend.manage_db backup
python -m backend.manage_db restore .\backend\medlife.backup.sqlite3
```

Dedicated verification commands:

```powershell
python -m backend.verify_migration_upgrade
python -m backend.verify_backup_restore
python -m backend.verify_security_config
python -m backend.verify_readiness_failures
```

To enable learner-facing text AI patient mode locally:

```powershell
$env:ANTHROPIC_API_KEY="your-key"
$env:MEDLIFE_TEXT_AI_PATIENT_ENABLED="1"
python -m uvicorn backend.server:app --host 127.0.0.1 --port 8787
```

## Backend verification

```powershell
python -m backend.manage_db migrate
python -m unittest discover backend/tests
python -m py_compile backend/server.py backend/smoke_test.py backend/db.py backend/persistence.py backend/security.py backend/manage_db.py
```
