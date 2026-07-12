/**
 * Verify cross-references between the static data files. Run on every change
 * to src/data/* to catch dangling IDs before they hit the game loop.
 */

import { PATIENT_CASES } from '../../src/data/patients.ts';
import { POLYCLINIC_CASES } from '../../src/data/polyclinicPatients.ts';
import { TESTS } from '../../src/data/tests.ts';
import { TREATMENTS } from '../../src/data/treatments.ts';
import { MEDICATIONS } from '../../src/data/medications.ts';
import { computeDiagnosisDigest } from '../../src/agents/disclosureReceipts.ts';
import type { PatientCase } from '../../src/game/types.ts';

type Violation = { case: string; rule: string; detail: string };

function collectAllCases(): PatientCase[] {
  const byId = new Map<string, PatientCase>();
  for (const c of PATIENT_CASES) {
    byId.set(c.id, c);
  }
  for (const [specialty, cases] of Object.entries(POLYCLINIC_CASES)) {
    if (specialty === 'all-specialties') continue;
    for (const c of cases) {
      byId.set(c.id, c);
    }
  }
  return Array.from(byId.values());
}

export function verifyDataIntegrity(): Violation[] {
  const violations: Violation[] = [];
  const testIds = new Set(TESTS.map((t) => t.id));
  const treatmentIds = new Set(TREATMENTS.map((t) => t.id));
  const cases = collectAllCases();
  const caseIds = new Map<string, number>();
  const knownDiagnoses = new Set<string>();

  for (const c of cases) {
    caseIds.set(c.id, (caseIds.get(c.id) ?? 0) + 1);
    for (const opt of c.diagnosisOptions) knownDiagnoses.add(opt);

    for (const tr of c.testResults) {
      if (!testIds.has(tr.testId)) {
        violations.push({ case: c.id, rule: 'testResults.testId unknown', detail: tr.testId });
      }
    }

    for (const tx of c.assessmentCompatibility.acceptableTreatmentIds) {
      if (!treatmentIds.has(tx)) {
        violations.push({
          case: c.id,
          rule: 'acceptableTreatmentIds references unknown treatment',
          detail: tx,
        });
      }
    }

    for (const tx of c.assessmentCompatibility.criticalTreatmentIds) {
      if (!treatmentIds.has(tx)) {
        violations.push({
          case: c.id,
          rule: 'criticalTreatmentIds references unknown treatment',
          detail: tx,
        });
      }
      if (!c.assessmentCompatibility.acceptableTreatmentIds.includes(tx)) {
        violations.push({
          case: c.id,
          rule: 'criticalTreatmentIds not subset of acceptableTreatmentIds',
          detail: tx,
        });
      }
    }

    const matchingDiagnosis = c.diagnosisOptions.find(
      (diagnosisId) => computeDiagnosisDigest(diagnosisId) === c.assessmentCompatibility.correctDiagnosisDigest,
    );
    if (!matchingDiagnosis) {
      violations.push({
        case: c.id,
        rule: 'correct diagnosis digest not represented in diagnosisOptions',
        detail: c.assessmentCompatibility.correctDiagnosisDigest,
      });
    }
  }

  for (const [id, count] of caseIds) {
    if (count > 1) {
      violations.push({ case: id, rule: 'duplicate case id', detail: `${count} occurrences` });
    }
  }

  for (const med of MEDICATIONS) {
    for (const dx of med.indications ?? []) {
      if (!knownDiagnoses.has(dx)) {
        violations.push({
          case: `med:${med.id}`,
          rule: 'medication indication references unknown diagnosis',
          detail: dx,
        });
      }
    }
  }

  return violations;
}
