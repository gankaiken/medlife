# Skills catalog — medlife

The simulator runs on **one Managed Agent** (`medlife-attending`, Opus 4.7) plus a small
set of skills that compose around it. The agent is the only stateful actor that
talks to the trainee at run-time; skills are utilities that author or refresh
the data the agent grades against.

Two flavours of skill live here:

- **Authoring skills** — invoked on demand to extend the registry, add cases,
  or write rubrics. These are the ones with rich input contracts and
  citation-discipline rules.
- **Operational skills** — invoked while the simulator runs (`/loop`-style or
  one-shot) to keep things working: bootstrap, verify, demo capture.

## Architecture

```
trainee ──► medlife-attending Managed Agent (Opus 4.7) ──► render_case_evaluation
                  ▲                                       │
                  │ rubric + registry                     ▼
                  │                                 <CaseEvaluationCard>
   [registry]  guidelines.ts (NICE/ESC/AHA/...)
       ▲
       │ weekly /loop
   ┌───┴────────────────────────────┐
   │ medlife-guideline-curator       │
   └────────────────────────────────┘

   [case rubrics]  polyclinicPatients.ts.rubric
       ▲
       │ on-demand
   ┌───┴────────────────────┐
   │ medlife-rubric-author   │
   └────────────────────────┘
```

`patient-roleplay` is NOT a skill here — voice persona runs as a real-time
LiveKit worker (`backend/voice_agent.py`), and the text-chat path lives in
`src/voice/patientPersona.ts`. Different mechanism, same role.

`simulation-tick` is NOT a skill here — order_test / prescribe / counsel are
direct store mutations in `src/game/store.ts`, no agent gating layer.

## Catalog

| Skill | Folder / file | Trigger | Output |
|---|---|---|---|
| **medlife-attending-debrief** | `medlife-attending-debrief/SKILL.md` | reference / debugging | docs the DEBRIEF MODE contract baked into the live agent |
| **medlife-guideline-curator** | `medlife-guideline-curator/SKILL.md` | `/loop 7d` or on-demand | edits `src/data/guidelines.ts` |
| **medlife-rubric-author** | `medlife-rubric-author/SKILL.md` | on-demand per case | edits `src/data/polyclinicPatients.ts` (or `patients.ts`) — adds `rubric: {...}` |
| medlife-managed-agent-setup | `medlife-managed-agent-setup.md` | maintenance | bootstrap + refresh + custom-tool edits |
| medlife-patient-generator | `medlife-patient-generator.md` | author new case | new entry in `patients.ts` / `polyclinicPatients.ts` |
| medlife-triage-logic | `medlife-triage-logic.md` | reference | ESI rules, used by triage classifier |
| medlife-verify-simulation | `medlife-verify-simulation.md` | `/loop 20m` | `scripts/verify/run-all.ts` |
| medlife-interview | `medlife-interview.md` | demo / coaching | guides one-on-one walkthrough |
| medlife-demo-video | `medlife-demo-video.md` | submission | demo narrative beats |

## Hard rules across every authoring skill

1. **Cite, don't invent.** Every guideline citation must resolve to a real
   recommendation id in `src/data/guidelines.ts`. If a rec isn't in the
   registry, drop the criterion or flag `verificationStatus: "needs-verification"`.
2. **Whitelist sources.** Only authoritative society / agency documents — never
   UpToDate, Medscape, Wikipedia, consumer-health pages.
3. **Verbatim text.** Recommendation `text` is exact prose from the source
   document, escaped for TS strings.
4. **Don't fabricate metadata.** `recClass`, `lev`, `gradeStrength`, DOIs,
   PubMed ids — only when read directly from the source.
5. **Verify with the smoke tests.** Run `node scripts/verify/rubric-smoke.ts`
   and `node scripts/verify/evaluation-flow.ts` after any registry or rubric
   edit. Both must pass before the change is considered done.

## Composition example — adding a new hero case

1. `medlife-patient-generator` writes a new case into `polyclinicPatients.ts`.
2. `medlife-guideline-curator` checks the registry has a guideline for the relevant
   condition; if not, drafts one (and stops to ask for MD verification).
3. `medlife-rubric-author` adds the `rubric: {...}` field, citing only recIds the
   registry actually contains.
4. `npm run build` + `node scripts/verify/rubric-smoke.ts` + the live debrief
   smoke test confirms the new case grades end-to-end.

