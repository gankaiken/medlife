# medlife

medlife is a voice-first clinical training simulator for medical learners. The learner plays the doctor, the patient speaks back in real time, and an attending-style AI debrief scores the encounter afterward.

## Status

- Frontend build is passing with `npm run build`
- Core app modules now live under a normalized `src/` structure
- Backend, agent assets, docs, and scripts are separated into their own folders

## Repository Layout

- `.claude/` - local prompt, command, and skill assets
- `agent/` - reusable medlife agent skills and schemas
- `backend/` - Python voice/backend services
- `docs/` - product notes, recovery notes, and reference material
- `loop/` - long-running operator notes
- `public/` - static web assets
- `scripts/` - verification, test, audit, and loop tooling
- `src/` - React app, game state, voice runtime, and medical data

## Key Source Areas

- `src/components/` - screens and UI
- `src/components/three/` - 3D encounter scene
- `src/game/` - app state, routing, clinic metadata, shared types
- `src/data/` - cases, tests, treatments, medications, guidelines
- `src/voice/` - patient conversation runtime
- `src/agents/` - attending debrief integration

## Notes

- `scripts/` is intentionally excluded from the frontend build path so helper tooling does not block production app builds.
- Recovery history and cleanup notes live in [docs/recovery-notes.md](/abs/path/C:/Users/ganka/Downloads/medlife/medlife/docs/recovery-notes.md).
- A concise folder guide lives in [docs/repo-structure.md](/abs/path/C:/Users/ganka/Downloads/medlife/medlife/docs/repo-structure.md).

