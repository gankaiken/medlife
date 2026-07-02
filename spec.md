# medlife spec

medlife is a browser-based clinical training simulator where the learner plays the doctor, an AI patient responds in real time, and an attending-style grading flow reviews the encounter afterward.

## Core product loop

1. Pick a clinic or case.
2. Enter the consultation room.
3. Speak with the patient.
4. Review history, order tests, inspect results, diagnose, and prescribe.
5. End the encounter and receive a structured AI debrief.

## Repo goal

The codebase should stay split by responsibility:

- `src/` for the web app
- `backend/` for Python services
- `scripts/` for deterministic tooling and verification
- `docs/` for product and engineering notes
- `.claude/` and `agent/` for skill and prompt assets

## Current state

- The filesystem has been normalized into the intended top-level structure.
- Missing core runtime files were reconstructed under `src/game`, `src/data`, and `src/voice`.
- `npm run build` now passes.
- The next engineering passes are about richer data, stronger verification, and runtime polish rather than basic repo recovery.

