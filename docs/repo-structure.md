# Medlife Repo Structure

This is the intended top-level layout for the project:

```text
medlife/
  .claude/     local command and skill assets
  agent/       reusable medlife skills and schemas
  backend/     Python backend and voice worker code
  docs/        specs, notes, recovery docs, references
  loop/        long-running operator notes
  public/      static web assets
  scripts/     test, verify, audit, and loop tooling
  src/         frontend app source
```

## `src/` breakdown

```text
src/
  agents/      AI debrief and managed-agent integration
  components/  screens, shared UI, and three.js scene pieces
  data/        cases, tests, guidelines, medications, eval history
  game/        app store, clinic metadata, shared game types
  state/       lightweight state helpers
  styles/      palette and global styling
  voice/       patient conversation runtime
```

## Source Of Truth

- App UI and routing logic: `src/components/` and `src/game/store.ts`
- Medical learning content: `src/data/`
- AI evaluation flow: `src/agents/`
- Voice interaction behavior: `src/voice/`
- Python services: `backend/`

## Cleanliness Rules

- Keep product code in `src/`, not at the repository root.
- Keep one-off notes in `docs/`, not beside runtime files.
- Put deterministic tooling in `scripts/`.
- Treat `dist/`, `node_modules/`, and `tsconfig.tsbuildinfo` as generated artifacts.
