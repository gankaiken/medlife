/**
 * Rubric + registry citation integrity check.
 */

import { POLYCLINIC_CASES } from '../../src/data/polyclinicPatients.ts';
import { PATIENT_CASES } from '../../src/data/patients.ts';
import { getRecommendation } from '../../src/data/guidelines.ts';
import { deriveAutoRubric, getRubricFor } from '../../src/data/autoRubric.ts';
import type { PatientCase, RubricCriterion } from '../../src/game/types.ts';

type Violation = { case: string; rule: string; detail: string };

function allCases(): PatientCase[] {
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

export function verifyRubricCitations(): Violation[] {
  const violations: Violation[] = [];
  const cases = allCases();

  for (const c of cases) {
    if (!c.rubric) continue;
    const refs: Array<{ where: string; ref?: string | null }> = [];
    const collect = (cr: RubricCriterion, where: string) =>
      refs.push({ where: `${where}/${cr.criterion_id}`, ref: cr.guideline_ref });
    for (const cr of c.rubric.data_gathering) collect(cr, 'data_gathering');
    for (const cr of c.rubric.clinical_management) collect(cr, 'clinical_management');
    for (const cr of c.rubric.interpersonal) collect(cr, 'interpersonal');
    if (c.rubric.safety_netting?.guideline_ref) {
      refs.push({ where: 'safety_netting', ref: c.rubric.safety_netting.guideline_ref });
    }
    for (const r of refs) {
      if (!r.ref) continue;
      if (!getRecommendation(r.ref)) {
        violations.push({
          case: c.id,
          rule: 'rubric cites unresolved guideline_ref',
          detail: `${r.where} -> "${r.ref}"`,
        });
      }
    }
  }

  for (const c of cases) {
    if (c.rubric) continue;
    if (c.criticalTreatmentIds.length === 0) continue;
    const auto = deriveAutoRubric(c);
    if (auto.clinical_management.length === 0) {
      violations.push({
        case: c.id,
        rule: 'auto-rubric produced no clinical_management criteria',
        detail: `criticalTreatmentIds=${c.criticalTreatmentIds.length}`,
      });
    }
  }

  for (const c of cases.filter((item) => item.rubric)) {
    const r = getRubricFor(c);
    if (r !== c.rubric) {
      violations.push({
        case: c.id,
        rule: 'getRubricFor returned a different rubric than authored',
        detail: '',
      });
    }
  }

  return violations;
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  const v = verifyRubricCitations();
  if (v.length === 0) {
    console.log('PASS  rubric-citations');
  } else {
    console.log(`FAIL  rubric-citations  (${v.length})`);
    for (const x of v) console.log(`      [${x.case}] ${x.rule}: ${x.detail}`);
    process.exit(1);
  }
}
