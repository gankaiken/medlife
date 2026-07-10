# medlife backend

This FastAPI backend supports the Round 1.5 Medlife learner flow.

## Active endpoints

- `GET /health`
- `GET /agent/capabilities`
- `POST /agent/debrief`
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
- `persistence_mode`: current persistence backing, presently `local_storage`

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

## Environment

See the root `.env.example`.

Optional integrations:

- `ANTHROPIC_API_KEY`
- `EHR_API_TOKEN`
- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`

The backend loads `.env` itself for local development and still starts if optional credentials are missing.

## Local run

```powershell
python -m uvicorn backend.server:app --host 127.0.0.1 --port 8787
```

## Backend verification

```powershell
python -m unittest backend.tests.test_triage backend.tests.test_vault backend.tests.test_round1_contract backend.tests.test_rule_based_parity
python -m py_compile backend/server.py backend/smoke_test.py
```
