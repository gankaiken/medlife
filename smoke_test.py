# case-generator skill

Generates OSCE-style GP case JSON variants from an authoritative guideline + a variant brief.

## Files

- `SKILL.md` — the skill manifest + system prompt for the Managed Agent.
- `variant-brief.schema.json` — input schema (which slice of the disease space).
- `examples/` — seed examples produced by hand to validate the schema (drop here after MD review).

## Variant matrix

For each of the 10 GP-scope conditions we aim to produce 5–10 variants by sampling the cross-product of:

| Axis | Values |
|---|---|
| age_band | paediatric, young_adult, middle_age, elderly |
| duration | first_presentation, recent_dx_under_1y, established_1to5y, established_5to10y, established_over_10y |
| control_quality | well_controlled, moderate, poor |
| compliance | good, moderate, poor |
| comorbidities | per condition |
| complication | per condition |

We don't enumerate the full cross-product — we hand-pick variants that exercise distinct *learning objectives* (first-time diagnosis, well-controlled f/u, poor-control titration, complication recognition, atypical presentation, etc.).

## Suggested seed variants per condition

### Hypertension
1. First-time diagnosis, middle_age, asymptomatic — *teaches: confirm with ABPM/HBPM, lifestyle first*
2. Established 5y, poor control, poor compliance, elderly — *teaches: medication review, target organ damage screen*
3. Pregnancy, young_adult — *teaches: contraindication of ACEi/ARB, labetalol/nifedipine first-line*
4. Resistant HTN, middle_age, established >5y, on 3 drugs — *teaches: secondary causes screen*
5. New diagnosis with end-organ damage (LVH on ECG, microalbuminuria) — *teaches: urgency tier*

### Type 2 diabetes
1. First-time dx, middle_age, BMI 32 — *teaches: metformin first-line, lifestyle*
2. Established 10y, poor control, multiple comorbidities — *teaches: SGLT2i / GLP-1 escalation, cardio-renal benefit*
3. Newly diagnosed with foot ulcer — *teaches: complication screening cadence*
4. DKA risk in T1/T2 mismatch on SGLT2i — *teaches: sick-day rules*
5. Pre-conception counselling, young_adult — *teaches: HbA1c target, switch to insulin*

(repeat the structure for the remaining conditions)

## How a case enters production

1. Curator skill writes guideline draft → MD verifies → entry moves into `guidelines/registry.json` with `verificationStatus: "verified"`.
2. Generator skill called with `guideline_id` + `variant_brief` → outputs case JSON to `cases/generated/{condition}/{case_id}.json`.
3. Schema validation runs in CI.
4. MD spot-checks 1 in N for clinical realism.
5. Promote to active roster.
