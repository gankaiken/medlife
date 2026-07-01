# medkit

Medkit is a voice-first clinical training simulator for medical learners. The product combines a React frontend, a Python backend, real-time patient voice interactions, and an AI attending-style debrief flow.

## Repository Layout

- `.claude/` - Claude command and skill prompts
- `agent/` - agent-facing skill assets and schemas
- `backend/` - FastAPI/voice-worker related files and backend docs
- `docs/` - product notes, references, and recovery notes
- `loop/` - long-running loop instructions
- `public/` - static assets
- `scripts/` - audit, verify, loop, and test scripts
- `src/` - frontend app code

## Recovery Note

This repository was previously shuffled, with many files living under the wrong names. The folder structure has now been normalized. See `docs/recovery-notes.md` for what was recovered automatically and what still needs manual application-level reconstruction.
