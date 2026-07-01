---
name: medkit-patient-generator
description: Generate a new PatientCase (ER or polyclinic) from a chief complaint plus a correct diagnosis. Use whenever the user asks to "add a new patient", "author a case", "write a [condition] patient", or when expanding the case library under src/data/patients.ts or src/data/polyclinicPatients.ts. Also use for one-off ad-hoc cases tied to a specific teaching point.
---

# medkit — patient case generator

Every new `PatientCase` must pass `npm run verify`. That verification catches the mistakes this skill exists to prevent: dangling test/treatment/diagnosis IDs, critical treatments that aren't in the acceptable list, correct diagnosis missing from `diagnosisOptions`.

## The required shape

From `src/game/types.ts`:

```ts
interface PatientCase {
  id: string;                        // unique across ALL cases (ER + polyclinic)
  name: string;
  age: number;
  gender: 'M' | 'F';
  severity: 'critical' | 'urgent' | 'stable';
  arrivalBlurb: string;              // one-line doorway scene
  chiefComplaint: string;            // what the patient says in their voice
  vitals: { hr, bp, spo2, temp, rr };
  anamnesis: Array<{ id, question, answer, relevant }>;
  testResults: Array<{ testId, result, abnormal }>;
  correctDiagnosisId: string;        // MUST be in diagnosisOptions
  diagnosisOptions: string[];        // 4-6 including the correct one + realistic distractors
  acceptableTreatmentIds: string[];
  criticalTreatmentIds: string[];    // MUST be a subset of acceptableTreatmentIds
}
```

## Hard rules (verification will catch these — don't ship violations)

- Every `testResults[].testId` exists in `src/data/tests.ts` → `TESTS`.
- Every treatment ID in `acceptableTreatmentIds` / `criticalTreatmentIds` exists in `src/data/treatments.ts` → `TREATMENTS`.
- `criticalTreatmentIds ⊆ acceptableTreatmentIds`.
- `correctDiagnosisId ∈ diagnosisOptions`.
- Case ID is globally unique.
- `severity === 'stable'` → none of: HR>130, SpO2<88, SBP<80 (the stable-check rule in `scripts/verify/triage-priority.ts`).

## Authoring rhythm

1. Pick the diagnosis and the teaching point first. "What should the trainee learn from this case?"
2. Pick the chief complaint in patient language, not medical language. "My chest has been hurting since breakfast" — not "substernal pressure radiating to the left arm".
3. Write 5–8 anamnesis Q/A pairs. Mark 2 as `relevant: false` distractors — cases where every answer is relevant teach nothing about history-taking.
4. Pick 4–6 tests that would be reasonable; include at least one normal/negative test so the trainee learns that ruling-out matters.
5. Fill `diagnosisOptions` with the correct one and 3–5 realistic-for-this-presentation distractors.
6. `criticalTreatmentIds` is the *time-sensitive* minimum (e.g. aspirin + cath lab for STEMI); `acceptableTreatmentIds` is the full reasonable set including supportive care.
7. Run `npm run verify`. Iterate until PASS.

## Polyclinic vs ER

- **ER cases** go in `src/data/patients.ts` → `PATIENT_CASES`. They have deadlines, triage zones, and critical treatments.
- **Polyclinic cases** go in `src/data/polyclinicPatients.ts` → `POLYCLINIC_CASES[clinicId]`. No deadlines; tests resolve instantly; prescriptions grade via `src/data/medications.ts` (the med must have the correct diagnosis in its `indications`).

Before writing a polyclinic case, check `src/data/medications.ts` — if no medication has this diagnosis in `indications`, the trainee can't score any prescription points. Either add a medication entry or pick a different condition.

## Don'ts

- Don't invent test IDs or treatment IDs. If the case needs a test that isn't in `TESTS`, add the test to `src/data/tests.ts` first.
- Don't set `severity: 'critical'` on a case whose vitals are all normal AND whose chief complaint isn't time-sensitive — triage verification is loose for critical on purpose, but reviewers still notice.
- Don't include brand names or doses in the chief complaint ("I take my 10mg Lisinopril"). Keep it in a patient voice.
