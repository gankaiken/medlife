---
description: Run deterministic simulator invariants and append PASS/FAIL to verify.log. Safe for `/loop 20m /medkit-verify-simulation`.
---

# `/medkit-verify-simulation`

Long-running verification tick. Designed to be fired every 20 minutes
via `/loop 20m /medkit-verify-simulation` so the simulator's invariants
stay green through a multi-hour build.

## What to do

Run the loop runner (it wraps `npm run verify` and appends a line to
`verify.log` in the repo root):

```
node scripts/loop/verify-loop.ts
```

That single command is the whole thing. Do NOT re-run `npm run verify`
separately — the runner already does it, parses the output, and writes
the log entry.

## Expected outcome per firing

- **PASS firing:** `verify.log` gets one new line `<ISO8601> PASS`,
  exit code 0. Nothing else to do — acknowledge and end the turn.
- **FAIL firing:** `verify.log` gets `<ISO8601> FAIL  <count>`, exit
  code 1. The runner also prints the upstream violation list. Take
  these actions, in order:
  1. Identify which check failed (`data-integrity`, `triage-priority`,
     `three-scene`).
  2. Fix the underlying data/code — NOT the verify script. The skill
     [medkit-verify-simulation](../skills/medkit-verify-simulation.md) spells
     out the rule.
  3. Re-run this command to confirm it's green again.
  4. If you cannot fix it in this firing, stop and surface the failure
     to the user rather than suppressing the check.

## Do not

- Do not delete or rotate `verify.log` — it's the long-running proof
  shown in the submission video.
- Do not commit on FAIL firings.
- Do not silently edit `scripts/verify/*` to make a check pass.
