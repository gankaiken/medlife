import caseRegistry from '../shared/patient_case_registry.json' with { type: 'json' };

type Registry = typeof caseRegistry;

function fail(message: string): never {
  console.error(`FAIL validate:cases - ${message}`);
  process.exit(1);
}

function validateRegistry(registry: Registry): void {
  if (registry.schema_version !== 'medlife.case-registry.v1') {
    fail(`unsupported schema_version: ${registry.schema_version}`);
  }

  const seenCaseVersions = new Set<string>();

  for (const item of registry.cases) {
    const key = `${item.case_id}@${item.case_version}`;
    if (seenCaseVersions.has(key)) fail(`duplicate case/version: ${key}`);
    seenCaseVersions.add(key);

    if (!item.authorship.author?.trim()) fail(`${key} missing author`);
    if (item.status === 'approved') {
      if (!item.authorship.clinical_reviewer || !item.authorship.reviewer_role) {
        fail(`${key} approved case missing reviewer metadata`);
      }
      if (item.approval_status !== 'clinically_reviewed') {
        fail(`${key} approved case must use clinically_reviewed approval_status`);
      }
    }

    if (!item.references.length) fail(`${key} missing references`);
    if (!item.review_notes.length) fail(`${key} missing review notes`);

    const factIds = new Set<string>();
    const historyDomainIds = new Set<string>();
    for (const fact of item.patient_visible.facts) {
      if (factIds.has(fact.fact_id)) fail(`${key} duplicate fact id ${fact.fact_id}`);
      factIds.add(fact.fact_id);
      historyDomainIds.add(fact.history_domain_id);
      if (!fact.match_terms.length) fail(`${key} fact ${fact.fact_id} missing match_terms`);
      if (!fact.verification_anchors.length) fail(`${key} fact ${fact.fact_id} missing verification_anchors`);
    }

    if (!item.clinician_only.management_expectations.acceptable_treatment_ids.length) {
      fail(`${key} missing acceptable treatment ids`);
    }
    for (const criticalId of item.clinician_only.management_expectations.critical_treatment_ids) {
      if (!item.clinician_only.management_expectations.acceptable_treatment_ids.includes(criticalId)) {
        fail(`${key} critical treatment not in acceptable set: ${criticalId}`);
      }
    }

    if (!item.clinician_only.correct_diagnosis_id.trim()) {
      fail(`${key} missing correct diagnosis id`);
    }
    if (!item.clinician_only.forbidden_terms.length) {
      fail(`${key} missing forbidden leak terms`);
    }
    if (!Object.values(item.clinician_only.rubric).flat().length) {
      fail(`${key} missing rubric criteria`);
    }

    const missingDomains = item.patient_visible.facts.filter(
      (fact) => !historyDomainIds.has(fact.history_domain_id),
    );
    if (missingDomains.length > 0) {
      fail(`${key} contains orphan history domains`);
    }
  }
}

validateRegistry(caseRegistry);
console.log(`PASS validate:cases - ${caseRegistry.cases.length} governed cases validated`);
