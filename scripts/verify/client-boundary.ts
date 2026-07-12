import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import caseRegistry from '../../shared/patient_case_registry.json' with { type: 'json' };

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const target = join(dir, entry);
    const stat = statSync(target);
    if (stat.isDirectory()) results.push(...walk(target));
    else results.push(target);
  }
  return results;
}

function collectSensitiveSentinels(): string[] {
  const sentinels = new Set<string>();
  const sensitivePattern = /microcytosis|ferritin|infiltrate|crp|focal neurology|hidden|rubric/i;
  for (const item of caseRegistry.cases) {
    for (const finding of item.clinician_only.investigation_findings) {
      if (sensitivePattern.test(finding)) sentinels.add(finding);
    }
    for (const finding of item.clinician_only.examination_findings) {
      if (sensitivePattern.test(finding)) sentinels.add(finding);
    }
    for (const note of item.clinician_only.hidden_notes) sentinels.add(note);
    for (const term of item.clinician_only.forbidden_terms) {
      if (sensitivePattern.test(term)) sentinels.add(term);
    }
  }
  return Array.from(sentinels).filter(Boolean);
}

export function verifyClientBoundary(options: { sourceOnly?: boolean } = {}): Array<{ file: string; sentinel: string }> {
  const targets = options.sourceOnly
    ? ['src', 'public', 'shared/learner_case_catalog.json']
    : ['src', 'public', 'shared/learner_case_catalog.json', 'dist'];
  const files = targets.flatMap((target) => {
    if (!existsSync(target)) return [];
    return statSync(target).isDirectory() ? walk(target) : [target];
  });
  const sentinels = collectSensitiveSentinels();
  const violations: Array<{ file: string; sentinel: string }> = [];

  for (const file of files) {
    const body = readFileSync(file, 'utf8');
    for (const sentinel of sentinels) {
      if (body.includes(sentinel)) {
        violations.push({ file, sentinel });
      }
    }
  }

  return violations;
}

if ((process.argv[1] ?? '').includes('client-boundary.ts')) {
  const violations = verifyClientBoundary({ sourceOnly: process.argv.includes('--source-only') });
  if (violations.length > 0) {
    console.error('FAIL verify:client-boundary');
    for (const violation of violations) {
      console.error(`  ${violation.file} leaked sentinel: ${violation.sentinel}`);
    }
    process.exit(1);
  }
  console.log('PASS verify:client-boundary');
}
