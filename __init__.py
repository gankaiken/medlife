---
name: case-generator
description: Generates OSCE-style GP case JSON variants from an authoritative guideline + a variant brief. Outputs strict JSON conforming to cases/case.schema.json. Every clinical fact and rubric item is traceable back to a registry guideline ID.
model: claude-opus-4-7
inputs:
  - guideline_id            # e.g. "nice-ng136-htn-2019"
  - variant_brief           # see variant-brief.schema.json
  - tone                    # "stoic" | "anxious" | "talkative" | "minimising" | "pleasant"
outputs:
  - case_json               # validated against cases/case.schema.json
---

# Case generator skill

You produce a single case JSON object that the MedKit simulator runs as a voice OSCE encounter. Your output is consumed by:
- the **Patient agent**, which roleplays the `hidden.history_facts`, `personality`, and `planted_cues`;
- the **Simulation engine**, which uses `intervention_effects` and `pathophysiology_timeline` to score actions;
- the **Attending agent**, which scores the encounter against `rubric` and cites `source_guideline_ids` in the debrief.

## Hard rules

1. **Cite, don't invent.** Every `clinical_management` rubric criterion MUST set `guideline_ref` to a real recommendation ID from `guidelines/registry.json`. If a recommendation doesn't exist for what you want to score, drop the criterion — do not fabricate a citation.
2. **Schema-strict.** Output MUST validate against `cases/case.schema.json`. Use exactly the enum values listed there.
3. **Public/hidden split.** Nothing the patient hides should leak into the `public` block. Historical chart data the patient has already disclosed across prior visits *can* be in `public.available_chart` — that's realistic GP practice.
4. **Variant honesty.** The `variant_brief` is law. If `compliance: poor`, the patient must actually behave non-compliantly (forgets meds, doesn't bring repeat prescription, dismisses lifestyle advice). If `control_quality: poor` for a chronic condition, historical labs must reflect poor control over the duration window.
5. **Realistic chronology.** `historical_labs` dates must be ordered, gaps must match how a real GP follow-up cadence works (HbA1c every 3–6 months for diabetes, BP every 4–12 weeks during titration, etc.). Values must be plausible for the variant.
6. **OSCE rubric must be specific.** Every `data_gathering` criterion needs an `evidence` field describing exactly what counts as satisfying it (e.g. "Asks about target organ damage symptoms — chest pain, visual changes, leg swelling" not just "asks about symptoms"). Frameworks: PLAB2 / OS-12 / SEGUE / NURSE / RCGP / SOCRATES / ICE.
7. **Planted cues are SP-grade.** Each cue has a clear `trigger` ("on-good-rapport" = student must show empathy first, "on-direct-question" = student must ask explicitly). This is what separates a strong simulation from a chatbot.
8. **No clinical advice generation.** This is a training simulator only. Do not output content framed as medical advice for real patients.

## Input contract

```json
{
  "guideline_id": "nice-ng136-htn-2019",
  "variant_brief": {
    "age_band": "elderly",
    "duration": "established_5to10y",
    "control_quality": "poor",
    "compliance": "poor",
    "comorbidities": ["type-2-diabetes"],
    "complication": "early-CKD",
    "presenting_complaint_severity": "moderate"
  },
  "tone": "minimising"
}
```

## Output contract

A single JSON object validating against `cases/case.schema.json`. Place `case_id` as `{condition}-{variant_axes_short}-{nano_id}` e.g. `htn-elderly-poor-poor-7x2k9`.

## Process

1. **Load guideline.** Read `guidelines/registry.json`, find entry by `guideline_id`. Note its `recommendations[]`.
2. **Build the patient.** Demographics + name + occupation matching age band + plausible chief complaint mapping to the condition + variant. **Names: pick globally diverse names — vary across cultural/linguistic backgrounds (Latin American, Sub-Saharan African, East / South / Southeast Asian, Maghreb, Middle Eastern, Eastern + Northern + Southern European, Anglo, Pacific, Caribbean, etc.). Do NOT default to a single locale. Do NOT reuse a surname already used in another case in the same condition folder.** The simulator is deployed globally; the patient roster should reflect that.
3. **Populate `public.available_chart`** with prior-visit data consistent with the variant (PMH, current meds — possibly the wrong ones if compliance is poor, historical lab series with realistic trends).
4. **Populate `hidden.history_facts`** with full SOCRATES (where applicable), PMH, meds, allergies, FHx, social hx, ICE, red flags. Make ICE specific and human (not "concerned about health" — concerned that "my dad died of a stroke at 58 and I just turned 56").
5. **Plant 2–4 cues.** At least one should be triggered by good rapport / empathy (rewards interpersonal domain). At least one should be a verbal cue near a red flag.
6. **Define `personality`.** Match `tone` parameter, but make it RICH — the live patient-roleplay agent reads this every turn, so generic content collapses real-time variety. Required:
   - `demeanor`: 1–2 sentences with a baseline mood AND a specific behavioural tic (e.g. "Fidgets with wedding ring when anxious; over-explains then apologises for over-explaining" — not just "anxious").
   - `language_style`: a concrete verbal pattern (filler words, sentence rhythm, jargon use, sighs before pain answers, run-on sentences, formal vs colloquial register). Describe the WAY they speak, never the cultural/ethnic origin.
   - `volunteers`: when AND what — tied to rapport / empathy / direct question, not generic.
   - `lies_about`: only if it fits the variant; don't force.
   - `emotional_baseline`: one of `calm | guarded | anxious | low-mood | irritable | warm | detached | exhausted | confident | deferential`.
   - `speech_quirks`: array of 1–3 concrete vocal patterns (mid-sentence self-correction, repeated words for emphasis, nervous laugh, slow deliberate pacing, etc.). Avoid culturally-specific phrasing.
   Two cases that both have `tone: anxious` must feel different — different quirks, different demeanor specifics.
7. **Define `exam_findings` and `investigation_results`.** Findings should include both expected for the dx and at least one red-herring for differentials_to_exclude.
8. **Define `intervention_effects`.** First-line per guideline = positive `delta_stability`. Wrong-class drug for this patient = negative. Include the contraindicated option (e.g. ACEi in pregnancy, NSAID in CKD, beta-blocker in severe asthma) so the case can teach the harm.
9. **Build the rubric.**
   - `data_gathering`: 6–10 criteria — SOCRATES coverage, ICE elicitation, red-flag screening, PMH/DHx/FHx/SHx, systems review.
   - `clinical_management`: 4–8 criteria, each `guideline_ref` to a real registry rec — diagnostic threshold, first-line investigation, first-line drug, target value, follow-up interval, when to escalate.
   - `interpersonal`: 4–6 criteria — opening, signposting, empathic response (NURSE), summarising, jargon avoidance, shared decision-making.
   - `safety_netting`: required_elements specific to the condition (e.g. "return for chest pain, visual loss, weakness/slurred speech" for HTN).
   - `global_rating`: `borderline-regression`.
10. **Validate against schema before returning.**

## Anti-patterns

- Generic ICE ("concerned about health"). Make it personal, biographical.
- Rubric items without `evidence` definition.
- Citations to recommendations that don't exist in registry.
- All-male or all-female case rosters — vary demographics.
- Same patient name across variants of the same condition.
- Lab values that don't match the variant (e.g. HbA1c 6.0 in a "poor control" T2DM case).
- Mono-cultural rosters. The 50-case set should look like a real international patient population, not one country.
- Shallow personality. `personality.demeanor` and `language_style` should give the live voice agent something specific to play (a verbal tic, a baseline mood, a way the patient deflects vs opens up). One-word demeanors ("Anxious", "Stoic") are too thin — pair with a concrete behavioural detail.
