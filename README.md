# medlife

Medlife is a clinical education simulator for medical learners. The current working product is a guided outpatient consultation flow:

`splash -> onboarding -> clinic selection -> case selection -> doorway brief -> 3D encounter -> examination overlay -> diagnosis -> debrief -> saved history`

## Product truth

What is working now:

- Guided scripted consultation in the browser
- Three shipped educational cases
- Lazy-loaded 3D encounter scene
- Local rule-based assessment with saved history in `localStorage`
- Optional backend health, capabilities, AI debrief, demo EHR, triage, and voice-token endpoints

What is not learner-ready yet:

- Live learner-facing voice consultations
- Live AI patient chat in the frontend
- Authentication
- Server-side persistence
- Clinical governance or production monitoring workflows

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

Only public routing information belongs in `VITE_API_BASE_URL`. Secrets such as `ANTHROPIC_API_KEY`, `LIVEKIT_API_SECRET`, and `BACKEND_SHARED_SECRET` must stay on the server.

## Environment

Copy `.env.example` to `.env` only for local development. `.env` is ignored by git.

Important variables:

- `VITE_API_BASE_URL`
- `MEDLIFE_BACKEND_URL`
- `BACKEND_SHARED_SECRET`
- `ANTHROPIC_API_KEY`
- `EHR_API_TOKEN`
- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `DEEPGRAM_API_KEY`
- `CARTESIA_API_KEY`

The backend safely starts without Anthropic or LiveKit credentials. Missing optional integrations only reduce capabilities; they do not block the guided flow.

## Local run commands

Offline guided mode:

```powershell
npm install
npm run dev
```

Frontend and backend locally in development:

```powershell
npm install
npm run dev
```

In a second terminal:

```powershell
python -m uvicorn backend.server:app --host 127.0.0.1 --port 8787
```

AI-enabled debrief:

```powershell
$env:ANTHROPIC_API_KEY="your-key"
python -m uvicorn backend.server:app --host 127.0.0.1 --port 8787
```

Optional backend voice-token capability:

```powershell
$env:LIVEKIT_URL="wss://your-livekit.example"
$env:LIVEKIT_API_KEY="your-key"
$env:LIVEKIT_API_SECRET="your-secret"
python -m uvicorn backend.server:app --host 127.0.0.1 --port 8787
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
npm run typecheck
python -m unittest backend.tests.test_triage backend.tests.test_vault backend.tests.test_round1_contract backend.tests.test_rule_based_parity
python -m py_compile backend/server.py backend/smoke_test.py
```

There is currently no lint script configured.

## Repository layout

- `src/` frontend app, runtime detection, guided encounter, debrief rendering
- `src/components/three/` 3D encounter scene
- `src/data/` cases, tests, medications, guidelines, and local history repository
- `src/agents/` debrief request packaging, API client, and rule-based assessment
- `backend/` FastAPI backend and backend tests
- `fixtures/rule-based/` shared frontend-backend rule-based assessment fixtures
- `scripts/test/` frontend unit and contract tests
- `scripts/e2e/` Playwright browser harness
- `scripts/verify/` case and rubric verification scripts
