# medkit spec

Medkit is a browser-based clinical training simulator where the learner plays the doctor, an AI system plays the patient, and an attending-style grading flow reviews the encounter afterward.

## Core product loop

1. Pick a clinic or case.
2. Run the encounter.
3. Talk to the patient in real time.
4. Order tests, assess findings, and choose treatment.
5. End the session and receive a structured debrief.

## Repo goal

This repository should be organized around a standard product structure:

- `src/` for frontend code
- `backend/` for Python services
- `scripts/` for deterministic tooling
- `docs/` for product and engineering notes
- `.claude/` and `agent/` for prompt and skill assets

## Current state

The filesystem has been normalized, but some runtime modules are still missing or were not recoverable from the shuffled snapshot. See `docs/recovery-notes.md`.
