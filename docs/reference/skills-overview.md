# MedKit skills

Five Claude skills compose into one Managed Agent. Each skill is a small, focused contract with strict input/output. Define the agent + environment **once** and reuse by ID across user sessions.

| Skill | Purpose | Lives in |
|---|---|---|
| `patient-roleplay` | Voices the patient in real time. Stays in character. Can lie. Sees `hidden.history_facts` + `personality` + `planted_cues`. | `patient-roleplay/` |
| `simulation-tick` | World physics. Outputs strict JSON for every student action — was it valid, what's the result, delta_stability, time cost, new vitals. Never speaks to student. | `simulation-tick/` |
| `attending-debrief` | Post-encounter debrief against the case rubric. Cites guideline IDs from registry. | `attending-debrief/` |
| `case-generator` | Produces case JSON variants from a guideline + variant brief. | `case-generator/` |
| `guideline-curator` | Drafts registry entries from authoritative society sources. Designed to run on a weekly `/loop` for auto-update. | `guideline-curator/` |

## Why one Managed Agent + skills (not 5 separate agents)

The hackathon hosts emphasised three primitives — Agent, Environment, Session — and explicitly warned against recreating them per session. One Managed Agent + composed skills lets us:
- Reuse credentials, environment, observability.
- Keep skills stateless and independently testable.
- Hot-swap a skill (e.g. iterate on the debrief prompt) without touching others.

## Composition pattern

```
Session opens
  ↓
case_id chosen (or generated on-demand by case-generator)
  ↓
LiveKit room joined; voice loop starts
  ↓
patient-roleplay handles every student utterance
  ↓
On each student action (test ordered, drug given, referral made):
    simulation-tick runs → returns delta + new state
  ↓
On case end (win condition, loss condition, time out, manual end):
    attending-debrief runs → returns rubric verdict + narrative
  ↓
Session closes
```

Background:
```
Weekly /loop → guideline-curator scans whitelist → drafts updates → MD reviews
```

## Custom tools (rendered as rich UI)

Skills call these as tool-use, the frontend renders the resulting events as UI components — Michael's `render_map` pattern from the Managed Agents session:

- `render_vitals(hr, bp, rr, spo2, temp)` → live vitals strip
- `render_ecg(rhythm, rate, intervals, abnormalities)` → ECG widget
- `render_labs(panel, results, references)` → lab card with abnormal flags
- `render_imaging(modality, findings, image_url)` → imaging viewer
- `render_guideline_card(guideline_id, rec_id)` → cite-card with title/year/DOI
- `render_debrief_rubric(domain_scores, criteria, narrative)` → end-of-case debrief panel
