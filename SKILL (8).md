---
name: medkit-verify-simulation
description: Run the deterministic verification scripts over the simulator's data and state. Use whenever you change anything under src/data/, src/game/store.ts, src/game/types.ts, or finish a batch of 3D-scene edits. Also call before committing and before submission.
---

# medkit — verification skill

The simulator has a set of deterministic checks in `scripts/verify/` that catch:

- Dangling IDs in `src/data/*` (tests, treatments, medications, diagnoses).
- Triage severity labels inconsistent with the case's vitals.
- (Future) 3D-scene geometry regressions.

## When to run

- After editing any file in `src/data/`.
- After changing `src/game/store.ts` or `src/game/types.ts`.
- After a batch of 3D-scene edits in `src/components/three/` or `src/components/exam-room/`.
- Before every commit you're about to make on the developer's behalf.
- Before packaging the submission on Sunday.

## How to run

```
npm run verify
```

(Under the hood this is `node scripts/verify/run-all.ts` — Node 22+ runs `.ts` files natively via type stripping, no transpiler needed. Do NOT add `tsx` to devDependencies: the BrynQ dev machines block `tsx.exe` via group policy.)

## How to react to output

- All PASS → proceed.
- Any FAIL → stop the task you were about to do. Read the offending entry, open the file it points at, fix it, re-run. Don't suppress the check by editing the script to ignore the case — fix the data instead.

## When to EXTEND this skill

If you change the shape of `PatientCase`, `Test`, `Treatment`, `Medication`, or add a new major data file, add a new rule inside one of the existing scripts (or a new script in `scripts/verify/`), and update `run-all.ts` to include it. One check = one file.

## What not to do

- Don't run the Vite dev server as a "verification" step — that's not deterministic.
- Don't use screenshots as verification (Tharek's rule: screenshots alone don't carry enough signal).
- Don't add project-wide linting to these scripts — keep them narrowly about simulator invariants.
