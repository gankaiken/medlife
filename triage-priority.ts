# Idea evolution log

Running log of how the medkit simulator concept sharpened during the Built-with-Opus-4.7 hackathon week. Kept for the "Keep Thinking" submission prize — judges want to see that the idea moved, not that the first shower-thought survived to Sunday.

Each entry: date, what changed, why, what it replaces.

---

## 2026-04-24 — Kickoff, shift from game to training tool

**What changed.** The project started as a browser-based ER game (score, lives, dispatch). Today I realized the real value is clinical training: a doctor-in-training can run through a dozen cases in an hour and get grading feedback.

**Why.** The kickoff reframed it: "build from what you know, domain expertise wins." I'm closer to clinical-training problems than to game design. The polyclinic flow I already built is actually a micro training environment — it just wasn't framed that way.

**What it replaces.** The "score + lives" framing still exists mechanically, but the *pitch* in the demo video is now "training simulator," not "game." `GameOver.tsx` stays, but it will be renamed to something like `ShiftDebrief.tsx` in the final version.

**Implication for submission.** Judges grading Impact will weigh a training tool higher than a game.

---

## 2026-04-24 — Adding a Managed Agent as the attending

**What changed.** The original plan was one Claude call per patient conversation (Haiku). Now there is a second Claude path: a Managed Agent playing the attending physician who watches the player work and surfaces rich-UI feedback cards via custom tools.

**Why.** The $5k Managed Agents special prize is specifically for using the new API primitives — Agent, Environment, Session, custom tools. Adding the attending agent checks that box *and* genuinely improves the product: training feedback is the thing the current prototype most clearly lacks.

**What it replaces.** The "score number in a corner" feedback loop. The attending agent gives grading as contextual cards, not as a raw number.

---

## 2026-04-24 — Managed Agent scaffolding in, custom tools wired

**What changed.** Added the full Managed Agents plumbing: FastAPI proxy at `/agent/*`, an `medkit-attending` agent config on Opus 4.7 with five custom tools (`render_vitals_chart`, `render_bed_map`, `render_triage_badge`, `render_patient_timeline`, `render_case_grade`), a browser-side stream consumer that honours the reconnect + idle-break gate from the official client patterns, and a Zod-validated dispatch layer from `agent.custom_tool_use` events → React cards.

**Why.** Needed to stake the $5k Managed Agents special-prize claim with a real end-to-end path, not a mock. Doing the plumbing before the UI cards also forces the card contracts to be Zod-defined, which means the attending agent can't silently emit a malformed card at demo time.

**What it replaces.** A single-endpoint browser call into the Anthropic SDK (which is still in place for the Haiku patient persona). Managed Agents gives us Agent/Environment/Session primitives, versioning, server-side context management, and the custom-tool UI escape hatch.

**Open questions.** Whether to route the patient-persona call through the backend too for a single API-key story — probably yes eventually, not this week. Idea in the Keep Thinking log for next session.

---

## 2026-04-25 — Permission policy + credential vault + /loop wired, triage split off

**What changed.** Four landings stacked the same day:

1. **Permission policy for custom tools.** Added `CUSTOM_TOOL_PERMISSIONS` in `src/agents/customTools.ts` plus a new `flag_critical_finding` write tool gated behind an approve/decline dialog in `src/agents/eventStreamRenderer.tsx`. The five `render_*` tools stay auto-allowed. Mirrors Michael's "auto-allow reads, confirm writes" pattern; custom tools sit outside Anthropic's native-tool permission gate so we enforce it client-side.

2. **Credential vault.** New `POST /agent/vault/ehr/lookup` endpoint with a fake hospital-EHR store, plus `lookup_ehr_history` custom tool. `EHR_API_TOKEN` stays server-side — log lines, response bodies, and response headers are asserted token-free in `backend/tests/test_vault.py`.

3. **`/loop` slash commands.** `.claude/commands/medkit-verify-simulation.md` wraps `scripts/loop/verify-loop.ts` which appends timestamped PASS/FAIL to `verify.log`. `.claude/commands/medkit-idea-evolve.md` drives this very file on a 30-minute cadence (draft-only; no auto-write).

4. **Dedicated triage-reasoning path.** `POST /agent/triage/classify` is a direct Opus 4.7 inference (not via Managed Agents) with an ESI-rules system prompt that mirrors `.claude/skills/medkit-triage-logic.md`. Pure function `run_triage_reasoning` is unit-tested with a mocked Anthropic client; the browser client is `src/agents/triageReasoning.ts`.

Added a zero-dep Node 22+ test harness at `scripts/test/` (30 TS tests) alongside `backend/tests/` (22 Python tests, TestClient-based). Both are runnable with a single command — `npm test` and `backend/.venv/Scripts/python.exe -m unittest discover backend/tests`.

**Why.** The hackathon guide explicitly rewards (in order of how loudly it was pushed): Opus 4.7 long-running work, auto mode, Managed Agents primitives, skills, `/loop` / routines, custom tools for rich UI. Before today the submission hit three of six. These four landings cover the remaining three: `/loop`, credential vault (one more Managed Agents primitive to cite in the writeup), and a second, demonstrably distinct Opus 4.7 code path that is not the attending agent.

**What it replaces.** A single-agent "one Opus 4.7 call does it all" story that conflated observer-grader with arrival-classifier, and a submission writeup that could only name four Managed Agents primitives (Agent, Environment, Session, custom tools). Now we can cite six: + credential vault + permission policies. Also replaces the unspoken expectation that verification runs only when a human remembers to type `npm run verify` — the `/loop` makes it a long-running guarantee.

**Open question.** After all these edits the `medkit-attending` agent's system prompt has drifted from the currently-deployed V1. Before the submission we need to call `POST /agent/refresh` so the live agent picks up the new custom tools (`flag_critical_finding`, `lookup_ehr_history`) and the permission-policy reminders. Noted in the `medkit-managed-agent-setup` skill.

---

## Template for new entries

```
## YYYY-MM-DD — <one-line change>

**What changed.**

**Why.**

**What it replaces.**
```
