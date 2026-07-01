---
name: medkit-attending-debrief
description: Reference for the DEBRIEF MODE that lives inside the `medkit-attending` Managed Agent. Use this skill when debugging why the agent emitted a particular `render_case_evaluation` payload, when modifying the rubric scoring logic, or when a citation appears unresolved in the UI. NOT used to author new rubrics — see medkit-rubric-author for that.
---

# medkit-attending — DEBRIEF MODE reference

The `medkit-attending` Managed Agent (Opus 4.7) runs in two modes during a session:

1. **Live mode** — observes the encounter, optionally emits `render_triage_badge`
   on ER arrivals.
2. **DEBRIEF MODE** — kicks in when the trainee submits a `[debrief request]`
   message at end of encounter; emits exactly one `render_case_evaluation` and
   stops.

This skill documents mode 2. The full system prompt is in
[backend/server.py](../../../backend/server.py) under `MEDKIT_ATTENDING_SYSTEM_PROMPT`.

## Trigger contract

The trainee's frontend posts a `user.message` whose body starts with the
literal header `[debrief request]`, followed by a JSON block produced by
[buildDebriefRequest()](../../../src/agents/debriefRequest.ts). The block
contains:

- `case_id` and `case_summary` (chief complaint, correct diagnosis, severity)
- `rubric` — full `CaseRubric` object (data_gathering, clinical_management,
  interpersonal, optional safety_netting)
- `registry_slice` — only the guidelines + recommendations cited by the rubric;
  acts as both context AND an allowlist
- `encounter_log` — chronological history Q&A, ordered tests with timestamps,
  treatments given, prescriptions, submitted diagnosis, correctness flag

## Output contract

A single `render_case_evaluation` tool use whose input validates against
[caseEvaluationInput](../../../src/agents/customTools.ts) (Zod schema mirrors
the JSON schema in `backend/server.py:MEDKIT_CUSTOM_TOOLS`). Required fields:

```
case_id, global_rating, domain_scores, criteria, highlights, improvements, narrative
```

Optional: `safety_breach` (object or null).

## Hard rules baked into the agent prompt

1. **Cite, don't invent.** Every `clinical_management` criterion's
   `guideline_ref` must appear in `registry_slice.recommendations[].recId`.
   If no rec applies, the agent drops the criterion. Never fabricates.
2. **Specific evidence.** "You missed ICE" is not enough. The expected bar is
   a transcript-quoted observation tied to the case (e.g. patient hinted at
   father's stroke, trainee didn't pick it up).
3. **Safety first.** A contraindicated drug, missed red-flag escalation, or
   no safety-netting on a high-risk diagnosis sets `safety_breach` and the
   narrative leads with it regardless of total score.
4. **Bands for `verdict`** (per domain and global): `≥0.85 excellent`, `≥0.70 good`,
   `≥0.55 satisfactory`, `≥0.40 borderline`, otherwise `clear-fail`.
5. **No clinical advice for real patients.** Output framed as training only.

## Files in the chain

| File | Role |
|---|---|
| [backend/server.py](../../../backend/server.py) | `MEDKIT_ATTENDING_SYSTEM_PROMPT` (DEBRIEF MODE section) + `MEDKIT_CUSTOM_TOOLS[render_case_evaluation]` JSON schema |
| [src/agents/customTools.ts](../../../src/agents/customTools.ts) | `caseEvaluationInput` Zod mirror; validates the tool-use input before render |
| [src/agents/debriefRequest.ts](../../../src/agents/debriefRequest.ts) | Packs the encounter into the `[debrief request]` payload |
| [src/agents/useAttendingDebrief.ts](../../../src/agents/useAttendingDebrief.ts) | Hook: bootstrap → session → message → stream → eval emit |
| [src/components/CaseEvaluationCard.tsx](../../../src/components/CaseEvaluationCard.tsx) | Standalone card (used elsewhere if needed) |
| [src/components/DebriefScreen.tsx](../../../src/components/DebriefScreen.tsx) | Cozy-cartoon screen consuming the live evaluation |

## Deploying changes to the agent

The agent definition lives on Anthropic's platform. After editing the system
prompt or tool schema in `backend/server.py`:

1. Restart the FastAPI backend (so the Python module re-loads the constants).
2. `curl -X POST http://127.0.0.1:8787/agent/refresh -H "Origin: http://localhost:5173"`.
3. The response shows the new agent version. Existing sessions keep their
   pinned version; new sessions pick up the latest.

If the schema or system prompt drifts between code and platform, the agent
might emit shapes the Zod parser rejects. The `useAttendingDebrief` hook
returns a validation error in that case; check the browser console.

## Smoke tests

- [`scripts/verify/rubric-smoke.ts`](../../../scripts/verify/rubric-smoke.ts)
  — every cited `guideline_ref` in every authored rubric resolves; auto-rubric
  fallback works.
- [`scripts/verify/evaluation-flow.ts`](../../../scripts/verify/evaluation-flow.ts)
  — end-to-end with a synthetic encounter; Zod validates a hand-crafted
  evaluation.
- [`scripts/verify/live-debrief.ts`](../../../scripts/verify/live-debrief.ts)
  — drives a live agent session through the running backend; takes ~60–90 s
  per case.

Run these whenever you touch the rubric schema, the registry, or the agent
prompt.

## Anti-patterns

- Editing the Zod schema without updating the matching JSON schema in
  `backend/server.py` (or vice versa) — they MUST match.
- Letting the agent emit `render_case_grade` (the legacy flat-score tool) — it
  was deprecated when DEBRIEF MODE shipped; the system prompt should never
  mention it.
- Treating an unresolved citation in the UI as an agent bug. It usually means
  the rubric cites a `recId` that isn't in the registry: either author the
  recommendation in `guidelines.ts` (via medkit-guideline-curator) or remove the
  citation from the rubric.
