import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');

function readJson<T>(relPath: string): T {
  return JSON.parse(readFileSync(resolve(ROOT, relPath), 'utf8')) as T;
}

test('Monash candidate curriculum profile keeps unnamed themes as placeholders', () => {
  const profile = readJson<{
    mapping_status: string;
    theme_placeholders: Array<{ label: string; status: string }>;
    internal_import_placeholders: Record<string, string>;
  }>('shared/curriculum/institution_profiles/monash_candidate.json');

  assert.equal(profile.mapping_status, 'candidate_public_source_mapping');
  assert.equal(profile.theme_placeholders.length, 4);
  for (const theme of profile.theme_placeholders) {
    assert.match(theme.label, /Unnamed public curriculum theme/i);
    assert.equal(theme.status, 'internal_document_required');
  }
  assert.equal(profile.internal_import_placeholders.official_theme_names, 'internal_document_required');
});

test('case curriculum mappings stay candidate-only and cover every learner case', () => {
  const mappings = readJson<{
    cases: Array<{
      case_id: string;
      mapping_version: string;
      monash_candidate_relationship: string;
      curriculum_review_status: string;
      clinical_review_status: string;
      confidence: string;
    }>;
  }>('shared/curriculum/case_curriculum_mappings.json');
  const catalog = readJson<{ cases: Array<{ case_id: string }> }>('shared/learner_case_catalog.json');

  assert.equal(mappings.cases.length, catalog.cases.length);
  assert.deepEqual(
    new Set(mappings.cases.map((item) => item.case_id)),
    new Set(catalog.cases.map((item) => item.case_id)),
  );

  for (const item of mappings.cases) {
    assert.ok(item.mapping_version.length > 0);
    assert.equal(item.monash_candidate_relationship, 'candidate_public_source_mapping');
    assert.equal(item.curriculum_review_status, 'academic_review_required');
    assert.equal(item.clinical_review_status, 'clinical_review_required');
    assert.match(item.confidence, /low|medium|high/);
  }
});
