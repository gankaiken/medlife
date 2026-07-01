# medkit backend

Two Python processes power the simulator:

1. **FastAPI server** (`server.py`) — Managed Agents proxy (`/agent/*`), patient-text-chat SSE (`/agent/patient/stream`), and the LiveKit token mint (`/voice/token`). Lives at `127.0.0.1:8787`.
2. **LiveKit voice worker** (`voice_agent.py`) — joins every room created by `/voice/token`, runs Deepgram Nova-3 STT → Claude Haiku 4.5 → Cartesia Sonic-2 TTS over WebRTC.

Both must be running for real-time voice to work.

## Install

The two processes use **separate venvs** so the worker's deps don't tangle with the FastAPI server's.

```bash
cd backend

# Server venv — small, just FastAPI + Anthropic + livekit-api.
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt

# Voice worker venv — pulls in livekit-agents + Deepgram/Cartesia/Silero plugins.
python -m venv .venv-voice
.venv-voice/Scripts/python.exe -m pip install -r voice_agent_requirements.txt
```

## Configure

Copy `.env.example` to `.env.local` and fill in:

- `ANTHROPIC_API_KEY` — Managed Agent + patient persona LLM.
- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` — from LiveKit Cloud.
- `DEEPGRAM_API_KEY` — streaming STT.
- `CARTESIA_API_KEY` — streaming TTS.
- `MEDKIT_AGENT_ID`, `MEDKIT_ENV_ID` — leave blank on first run, paste back from `/agent/bootstrap`.

## Run

```bash
# Terminal 1 — FastAPI
.venv/Scripts/python.exe server.py

# Terminal 2 — voice worker
.venv-voice/Scripts/python.exe voice_agent.py dev
```

The worker logs `registered worker` once it's connected to LiveKit Cloud. From then on, any room created via `POST /voice/token` will dispatch a worker into it; the worker reads the persona payload from room metadata and starts the patient.

## Endpoints

- `GET  /health` — backend + agent + voice config status.
- `POST /voice/token` — body `{caseId, systemPrompt, initialLine, gender}`. Pre-creates a LiveKit room with the persona payload as metadata, returns `{token, url, roomName}`.
- `POST /agent/*` — Managed Agents proxy for the medkit-attending. See inline docs in `server.py`.
- `POST /agent/patient/stream` — text-only patient persona SSE; used by the right-sidebar text chat.
