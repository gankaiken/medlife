# Current State Gap Analysis

## Already Implemented
- Guided consultation, history-taking, investigations, diagnosis, management, and debrief.
- Governed case registry with versioned case IDs, references, clinical-status labels, and known limitations.
- Learner authentication, SQLite persistence, autosave/resume, export, and progress summaries.
- Text AI Patient Mode with disclosure receipts and rule-based fallback.
- Browser E2E coverage for learner journeys, auth persistence, migration, and safety around AI fallbacks.

## Partially Implemented
- Curriculum alignment: candidate mapping data can now be represented, but educator confirmation is still pending.
- Pilot educator tooling: server-side reviewer roles and review records can exist, but the workspace is still pilot-scoped and lightweight.
- Accessibility: learner flow can be completed without 3D after this pass, but a full WCAG audit still needs manual review.
- Malaysian contextualisation: structured context fields can now be stored, but references and clinical review remain limited.

## Missing
- Official institutional integration such as Monash SSO, Moodle, ATLAS, or roster sync.
- Formal summative assessment validation and calibration against authorised faculty marking blueprints.
- Institution-scale cohort management, assignment release, and LMS-grade passback.
- Large reviewed case bank beyond the current pilot-scale set.

## Requires Clinical Input
- Safety-critical rules and escalation thresholds for each case.
- Malaysian-context wording, referral expectations, and resource assumptions.
- Review of contraindications, prescribing logic, and harm classification.

## Requires Monash Internal Documentation
- Official curriculum-theme names.
- Unit-level and rotation-level learning outcomes.
- Internal assessment blueprints and expected performance standards.
- Any formal statement of curriculum approval.

## Requires Legal/Privacy Review
- Student-data retention and deletion expectations for pilot deployments.
- Hosting and data-location approval.
- Terms for educator visibility of learner records and exports.

## Requires Ethics Review
- Whether the proposed pilot is education-only, quality improvement, or human-subject research.
- Final consent wording, withdrawal handling, and publication boundaries.

## Requires Technical Integration
- SSO, LMS launch, roster import, and institutional role mapping.
- Deidentified export handoff into approved research or analytics environments.

## Optional Future Enhancement
- Live voice once clinically and technically justified.
- Rich faculty dashboards and cohort-comparison tools.
- Broader case-authoring workflow with structured editorial stages.
