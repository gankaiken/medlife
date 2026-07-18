# medlife

Medlife is a clinical education simulator for medical learners. The current working product is a guided outpatient consultation flow:

`splash -> onboarding -> clinic selection -> case selection -> doorway brief -> 3D encounter -> examination overlay -> diagnosis -> debrief -> saved history`

## Product truth

What is working now:

- Guided scripted consultation in the browser
- Three shipped educational cases
- Optional text-based AI patient conversation when the backend explicitly reports it available
- Lazy-loaded 3D encounter scene
- Learner registration, login, logout, and cookie-based sessions
- Server-backed encounter persistence, resume, history, and learner progress for authenticated users
- Local rule-based assessment with distinct offline/local history in `localStorage`
- Local-to-account migration for anonymous saved attempts
- Account data export for authenticated learners
- Optional backend health, capabilities, AI debrief, demo EHR, triage, and voice-token endpoints

What is not learner-ready yet:

- Live learner-facing voice consultations
- Clinical governance or production monitoring workflows
- Institution dashboards or educator cohort tooling

Educational disclaimer:

- Medlife is a clinical education simulator.
- Cases are synthetic or educational.
- AI feedback may be imperfect.
- It does not provide medical advice and does not replace qualified supervision.

## API routing strategy

Medlife uses one frontend API strategy:

- Development: use relative requests such as `/health` and `/agent/debrief`; Vite proxies them to `http://127.0.0.1:8787`
- Local production preview: build the frontend with `VITE_API_BASE_URL=http://127.0.0.1:8787`
- Hosted frontend with separate backend: build with `VITE_API_BASE_URL=https://your-backend.example`
- Hosted same-origin proxy deployment: configure `MEDLIFE_BACKEND_URL` in `middleware.ts`; secrets stay server-side
- Offline mode: leave the backend unavailable; the guided encounter and local rule-based assessment still work

Only public routing information belongs in `VITE_API_BASE_URL`. Secrets such as `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GRAFILAB_API_KEY`, `LIVEKIT_API_SECRET`, and `BACKEND_SHARED_SECRET` must stay on the server.

## Environment

Copy `.env.example` to `.env` only for local development. `.env` is ignored by git.

Important variables:

- `VITE_API_BASE_URL`
- `MEDLIFE_BACKEND_URL`
- `BACKEND_SHARED_SECRET`
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
- `MEDLIFE_LLM_PROVIDER`
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `GRAFILAB_API_KEY`
- `GRAFILAB_BASE_URL`
- `MEDLIFE_TEXT_AI_PATIENT_ENABLED`
- `MEDLIFE_DEBRIEF_MODEL`
- `MEDLIFE_TEXT_AI_PATIENT_MODEL`
- `MEDLIFE_TRIAGE_MODEL`
- `MEDLIFE_VOICE_LLM_PROVIDER`
- `MEDLIFE_VOICE_MODEL`
- `MEDLIFE_VOICE_TEMPERATURE`
- `EHR_API_TOKEN`
- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `DEEPGRAM_API_KEY`
- `CARTESIA_API_KEY`

The backend safely starts without Anthropic, OpenAI, Grafilab, or LiveKit credentials. Missing optional integrations only reduce capabilities; they do not block the guided flow.

## Security and data lifecycle

- SQLite remains the primary Medlife database. The backend enables foreign keys, WAL mode, busy timeouts, and explicit migrations.
- Session cookies carry only raw cookie tokens; the database stores one-way session and CSRF hashes, plus creation, last-seen, idle-expiry, absolute-expiry, and revocation timestamps.
- Passwords use PBKDF2-SHA256 with a unique salt and configurable iterations. Legacy lower-cost hashes are upgraded on successful login.
- Sensitive API responses send `Cache-Control: no-store`, and the backend adds CSP, frame, referrer, content-type, and permissions headers.
- Learners can export profile, encounters, transcripts, assessments, and progress. Exports exclude password hashes, sessions, and backend secrets.
- Account deletion is still unavailable in this build.
- Backups can be created and restored with `python -m backend.manage_db backup` and `python -m backend.manage_db restore <path>`.

## Local run commands

Offline guided mode:

```powershell
npm install
npm run dev
```

Frontend and backend locally in development:

```powershell
npm install
npm run db:migrate
npm run dev
```

In a second terminal:

```powershell
python -m uvicorn backend.server:app --host 127.0.0.1 --port 8787
```

AI-enabled debrief with Anthropic:

```powershell
$env:MEDLIFE_LLM_PROVIDER="anthropic"
$env:ANTHROPIC_API_KEY="your-key"
python -m uvicorn backend.server:app --host 127.0.0.1 --port 8787
```

AI-enabled debrief with OpenAI / ChatGPT:

```powershell
$env:MEDLIFE_LLM_PROVIDER="openai"
$env:OPENAI_API_KEY="your-key"
python -m uvicorn backend.server:app --host 127.0.0.1 --port 8787
```

AI-enabled debrief with Grafilab:

```powershell
$env:MEDLIFE_LLM_PROVIDER="grafilab"
$env:GRAFILAB_API_KEY="your-key"
$env:GRAFILAB_BASE_URL="https://your-grafilab-openai-compatible-endpoint/v1"
python -m uvicorn backend.server:app --host 127.0.0.1 --port 8787
```

AI patient text mode with Anthropic:

```powershell
$env:MEDLIFE_LLM_PROVIDER="anthropic"
$env:ANTHROPIC_API_KEY="your-key"
$env:MEDLIFE_TEXT_AI_PATIENT_ENABLED="1"
python -m uvicorn backend.server:app --host 127.0.0.1 --port 8787
```

AI patient text mode with OpenAI / ChatGPT:

```powershell
$env:MEDLIFE_LLM_PROVIDER="openai"
$env:OPENAI_API_KEY="your-key"
$env:MEDLIFE_TEXT_AI_PATIENT_ENABLED="1"
python -m uvicorn backend.server:app --host 127.0.0.1 --port 8787
```

AI patient text mode with Grafilab:

```powershell
$env:MEDLIFE_LLM_PROVIDER="grafilab"
$env:GRAFILAB_API_KEY="your-key"
$env:GRAFILAB_BASE_URL="https://your-grafilab-openai-compatible-endpoint/v1"
$env:MEDLIFE_TEXT_AI_PATIENT_ENABLED="1"
python -m uvicorn backend.server:app --host 127.0.0.1 --port 8787
```

Optional backend voice-token capability:

```powershell
$env:LIVEKIT_URL="wss://your-livekit.example"
$env:LIVEKIT_API_KEY="your-key"
$env:LIVEKIT_API_SECRET="your-secret"
python -m uvicorn backend.server:app --host 127.0.0.1 --port 8787
```

Voice worker with Anthropic:

```powershell
$env:MEDLIFE_VOICE_LLM_PROVIDER="anthropic"
$env:ANTHROPIC_API_KEY="your-key"
backend\.venv-voice\Scripts\python backend\voice_agent.py dev
```

Voice worker with OpenAI / ChatGPT:

```powershell
$env:MEDLIFE_VOICE_LLM_PROVIDER="openai"
$env:OPENAI_API_KEY="your-key"
$env:MEDLIFE_VOICE_MODEL="gpt-4o-mini"
backend\.venv-voice\Scripts\python backend\voice_agent.py dev
```

Voice worker with Grafilab:

```powershell
$env:MEDLIFE_VOICE_LLM_PROVIDER="grafilab"
$env:GRAFILAB_API_KEY="your-key"
$env:GRAFILAB_BASE_URL="https://your-grafilab-openai-compatible-endpoint/v1"
$env:MEDLIFE_VOICE_MODEL="gpt-4o-mini"
backend\.venv-voice\Scripts\python backend\voice_agent.py dev
```

Local production preview against the backend:

```powershell
$env:VITE_API_BASE_URL="http://127.0.0.1:8787"
npm run build
node scripts/e2e/serve-static.mjs --dir dist --port 4173
```

Then start the backend in another terminal:

```powershell
python -m uvicorn backend.server:app --host 127.0.0.1 --port 8787
```

## Test and verification commands

```powershell
npm test
npm run verify
npm run build
npm run test:e2e
npm run test:e2e:real
npm run typecheck
npm run validate:cases
npm run verify:client-boundary
npm run db:migrate
python -m unittest discover backend/tests
python -m py_compile backend/server.py backend/smoke_test.py backend/db.py backend/persistence.py backend/security.py backend/manage_db.py
```

There is currently no lint script configured.

## Repository layout

- `src/` frontend app, runtime detection, guided encounter, debrief rendering
- `shared/` canonical patient case registry for backend-grounded text conversation
- `src/components/three/` 3D encounter scene
- `src/data/` cases, tests, medications, guidelines, and local history repository
- `src/agents/` debrief request packaging, patient conversation API client, and rule-based assessment
- `backend/` FastAPI backend and backend tests
- `fixtures/rule-based/` shared frontend-backend rule-based assessment fixtures
- `scripts/test/` frontend unit and contract tests
- `scripts/e2e/` Playwright browser harness
- `scripts/verify/` case and rubric verification scripts
