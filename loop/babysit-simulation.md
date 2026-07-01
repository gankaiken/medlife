# /loop 20m — babysit the simulator

Invoke via `/loop 20m /babysit-simulation`. Each tick is a 20-minute check-in against the simulator's invariants, not a free-form code generation.

This loop is intentionally narrow. It does NOT generate new cases, touch the 3D scene, or modify the Managed Agent. It verifies the things that tend to regress silently during a busy hackathon day.

## Every tick, do this in order

1. **Run `npm run verify`.** If it fails, read the violations, open the offending data file, fix it, re-run. Do not edit the verify script to suppress a violation — fix the data.
2. **Run `node node_modules/typescript/bin/tsc --noEmit`** (TypeScript type-check; `npx` is group-policy-blocked on this machine, see `CLAUDE.md`). If it fails, fix it. Type errors in `src/agents/*` are high-signal — they usually mean the three-place contract (backend JSON schema / Zod / renderer switch) drifted.
3. **`git status`.** If there are uncommitted changes that look like stale debug code (extra `console.log`, commented-out sections, a `.bak` file), flag them to the user. Don't auto-commit.
4. **Read `docs/evolution.md`.** If the latest entry is more than 24 hours old, remind the user that the Keep Thinking prize wants to see the log move.
5. **Read the last entry in `.claude/settings.local.json`'s permission allowlist**. If auto-mode has granted anything obviously wrong (write access to somewhere unexpected), flag it.

## What to report each tick

One-line summary: `PASS: verify, tsc, git clean, evolution fresh` — or the specific thing that failed.

Don't paginate. Don't narrate what you're about to do. Don't summarize the project. The user is ambient-aware; they just want the delta since last tick.

## When to stop the loop

- Submission is in. `/loop stop`.
- The user explicitly says to stop.
- Three consecutive ticks find no change. At that point the loop is burning tokens — propose `/loop stop` to the user.

## Don'ts in this loop

- Don't invoke the Managed Agent. This loop is about the repo, not live game state.
- Don't read the whole codebase every tick. The five checks above are cheap and specific; that's the point.
- Don't rewrite `verify` or `tsc` scripts from inside the loop. If they are wrong, stop the loop and fix them outside.
