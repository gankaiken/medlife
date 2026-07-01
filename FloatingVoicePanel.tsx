# Spec — medkit hackathon submission

**Track:** Build from what you know (ER / clinical domain, doctor-in-training POV).
**One sentence:** A voice-driven emergency room and polyclinic simulator where the AI plays the patient, the player is the doctor, and a Claude Managed Agent quietly checks the player's clinical reasoning against real guidelines while they work.

**Event:** Built with Opus 4.7 hackathon. Submission due Sunday 2026-04-26, 8 p.m. EST.

---

## What wins prizes here

| Criterion | How we hit it |
|---|---|
| Impact | Clinical training is real, expensive, and under-served. Doctors in training everywhere spend hours on rote cases. This is only buildable because voice + LLM-as-patient is finally good enough. |
| Demo | Polyclinic already looks good in 3D. Remotion + extracted design-system HTML for the submission video. Show a full patient encounter in 90 s. |
| Opus 4.7 use | (a) Opus 4.7 on the `medkit-attending` Managed Agent (whole-encounter observer + grader). (b) *Separate* Opus 4.7 direct-inference endpoint `POST /agent/triage/classify` for one-shot ESI triage at ER arrival — two distinct Opus code paths in the same submission. (c) `/loop 20m /medkit-verify-simulation` writing timestamped PASS/FAIL to `verify.log` through the shift. (d) Auto mode for the whole build. |
| Depth | Skills composed (no specialist sub-agents): `medkit-patient-generator`, `medkit-verify-simulation`, `medkit-triage-logic`, `medkit-managed-agent-setup`, `medkit-interview`, `medkit-demo-video`. Keep-thinking log in `docs/evolution.md`. |
| Managed Agents special prize | Six primitives used: Agent (versioned), Environment, per-player Session, custom tools (render rich UI), permission policies (auto-allow reads, confirm writes), credential vault (`EHR_API_TOKEN` never leaves the backend). |

---

## The Managed Agent

**Name:** `medkit-attending` — virtual attending physician reviewing the player's decisions in real time.

**System prompt (shape, not final text):**
- You are an ER attending observing the player (a trainee) work through a case.
- You see the patient's vitals, the chief complaint, the tests ordered, the meds given.
- Use the `render_*` custom tools to surface your feedback as cards/charts, not as walls of text.
- When the player submits a diagnosis, grade it against the case's `correctDiagnosisId` and score their workup (completeness, time-to-critical-treatment, extraneous orders).

**Versioning:** V1 ships at submission. Later iterations create V2 — reuse by agent ID.

**Model:** Opus 4.7 for the agent (precision on clinical reasoning).

## The Environment

- Container template with `python`, `numpy`, `pandas` preinstalled.
- Network egress: allowed to `huggingface.co` and `anthropic.com` only.
- File I/O for scratch pad: `/workspace/case_<id>/notes.md`.

## Sessions

- Per-player, per-shift. The Session lives for the whole shift (≤ 30 min). Idle sessions are free — don't clean up.
- Event stream drives the UI directly: `agent.message`, `agent.custom_tool_use`, `session.status`.

## Custom tools (rich UI via the event stream)

Claude "calls" these; the frontend renders them. Claude never executes them.

| Tool | Rendered as |
|---|---|
| `render_vitals_chart(patient_id)` | `<VitalsChart />` line-chart over time |
| `render_bed_map()` | Miniature `<BedsGrid />` with current occupants |
| `render_triage_badge(zone, reason)` | `<TriageBadge />` — red/yellow/green with explanation tooltip |
| `render_patient_timeline(patient_id)` | `<PatientPanel />` with tests + treatments in order |
| `render_case_grade(score, notes[])` | End-of-case grading card |

Each has a zod-validated schema in `src/agents/customTools.ts`; the frontend maps tool name → component in `src/agents/eventStreamRenderer.tsx`.

## Credential vault (landed)

`POST /agent/vault/ehr/lookup` backs the `lookup_ehr_history` custom tool. `EHR_API_TOKEN` lives only in the backend environment; the browser never receives it, and `backend/tests/test_vault.py` asserts it never appears in response bodies, response headers, or log lines.

## Permission policies (landed)

- Reads (all `render_*` + `lookup_ehr_history`) → `auto` in `CUSTOM_TOOL_PERMISSIONS`; the renderer acks immediately.
- Writes (`flag_critical_finding`) → `confirm`; the renderer shows an approve/decline dialog and only sends `user.custom_tool_result` after the human clicks.
- See `src/agents/customTools.ts` for the full map. Tests in `scripts/test/custom-tools.test.ts` enforce that every tool name has a permission entry and that frontend/backend tool sets match exactly.

---

## Skills (`.claude/skills/`)

| Skill | Purpose |
|---|---|
| `medkit-interview.md` | Claude asks us questions about the idea before building. |
| `medkit-patient-generator.md` | Generate a new `PatientCase` given a chief complaint + correct diagnosis. |
| `medkit-verify-simulation.md` | Run every `scripts/verify/*.ts`. Fail loud on violation. |
| `medkit-managed-agent-setup.md` | Create/update the Agent, Environment, custom tools; wire the frontend event stream. |
| `medkit-triage-logic.md` | ESI protocol reference — when Claude makes triage calls, this skill scopes the reasoning. |
| `medkit-demo-video.md` | Extract design-system HTML, run Remotion, produce the submission MP4. |

## `/loop` usage

- `/loop 20m /medkit-verify-simulation` — runs verification over the current patient queue and log file. Writes a one-line PASS/FAIL to `verify.log`.
- `/loop 30m /medkit-idea-evolve` — reads `docs/evolution.md`, proposes one sharpening tweak, waits for approval.

---

## Verification scripts (`scripts/verify/`)

- `simulation-state.ts` — `beds.length === 4`, triage bed + bed slot disjoint, queue IDs unique.
- `three-scene.ts` — every mesh above floor plane, no overlap between furniture bounding boxes.
- `triage-priority.ts` — ESI rules hold against sample cases.
- `run-all.ts` — one command runs all of the above; exits non-zero on any failure.

`package.json` scripts: `"verify": "node scripts/verify/run-all.ts"` and `"test": "node scripts/test/run-all.ts"` — both zero-dep via Node 22+ native TypeScript, no `tsx` needed (BrynQ dev machines block `tsx.exe` via group policy).

## Test surface (landed)

- `npm test` — 30 Node test-runner tests in `scripts/test/` (custom tools, tool dispatcher, triage client, loop commands). Each firing also executes the real `scripts/loop/verify-loop.ts` end-to-end.
- `backend/.venv/Scripts/python.exe -m unittest discover backend/tests` — 22 FastAPI TestClient tests (credential vault no-leak invariants, triage reasoning with mocked Anthropic client).

Both suites run in under two seconds without network access.

---

## Demo video (`video/`)

- Remotion project under `video/remotion/`.
- Design-system HTML extracted from the running app saved to `docs/design-system.html`.
- Script in `video/script.md`. Target: 90 seconds. Beats:
  1. Patient walks into polyclinic (3D scene, 8 s).
  2. Doctor converses via voice (show waveform + transcript, 20 s).
  3. Order tests + see results land (15 s).
  4. Managed Agent surfaces a triage-badge custom tool rendering in real time (15 s).
  5. Submit diagnosis, agent grades it with render_case_grade (12 s).
  6. `/loop` hourly verify log rolls by in a corner — long-running proof (5 s).
  7. Final title card (5 s).

## Submission writeup — what to include

- **Idea evolution:** `docs/evolution.md` has entries for every day of the build week — 2026-04-24 kickoff & Managed Agents adoption, 2026-04-25 permission policy / credential vault / `/loop` / triage split.
- **Opus 4.7 use:** TWO distinct code paths on Opus 4.7 — (a) the `medkit-attending` Managed Agent (whole-encounter grading), (b) `POST /agent/triage/classify` direct-inference ESI classifier. Plus `/loop 20m /medkit-verify-simulation` for long-running verification and `/loop 30m /medkit-idea-evolve` for the Keep-Thinking cadence. Auto mode used throughout the build.
- **Managed Agents primitives used:** Agent (versioned — bump via `POST /agent/refresh`), Environment, Session (per-shift, idle-free), custom tools (six, rendered as rich UI), permission policies (`auto` / `confirm` enforced in the renderer), credential vault (`EHR_API_TOKEN` server-side only, tested for no-leak).
- **Skills we wrote** (six, in `.claude/skills/`): `medkit-interview`, `medkit-patient-generator`, `medkit-verify-simulation`, `medkit-triage-logic`, `medkit-managed-agent-setup`, `medkit-demo-video`. None of them are specialist sub-agents — each is a skill Claude composes as needed. Plus two slash commands in `.claude/commands/` (`medkit-verify-simulation` for the `/loop` runner, `medkit-idea-evolve` for the evolution-log cadence).
- **Domain expertise:** clinical ER training — what real trainees miss in rote cases, how ESI priority actually gets taught, why a simulator with LLM-played patients + attending-agent grading closes a real gap.

---

## Out of scope (don't build)

- Multi-agent handoffs / Outcomes — research preview, not available by Sunday.
- Persistent accounts, multiplayer, a server-side simulation authority.
- Accurate pharmacology beyond the curated `medications.ts` table.
- Mobile / touch — desktop demo only.

---

## Success criteria

Demo video shows, in order:
1. A patient encounter driven by voice.
2. A Managed Agent surfacing a custom-tool UI card during that encounter.
3. The triage-reasoning agent returning an Opus 4.7 response.
4. A `/loop` verification log having just updated.

If the submission hits all four we are competitive for the Managed Agents prize *and* the main prize.
