import { useEffect, useMemo, useState } from 'react';
import {
  createPilotAttemptScore,
  createPilotAttemptReview,
  createPilotCaseReview,
  exportPilotResearchData,
  fetchPilotAnalytics,
  listPilotAttemptReviews,
  listPilotAttemptScores,
  listPilotAttempts,
  listPilotCaseReviews,
  type PilotAnalytics,
  type PilotAttempt,
  type PilotReview,
} from '../agents/accountApi';
import { PATIENT_CASES } from '../data/learnerCases';
import { store } from '../game/store';
import { useAuth } from '../runtime/AuthProvider';
import { TopBar } from './primitives';

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '3px solid var(--line)',
  borderRadius: 12,
  padding: '10px 12px',
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 700,
  background: 'white',
  color: 'var(--ink)',
};

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="plush" style={{ padding: 14, background: 'white' }}>
      <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--ink-2)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{value}</div>
    </div>
  );
}

export function EducatorWorkspaceScreen() {
  const { session } = useAuth();
  const [attempts, setAttempts] = useState<PilotAttempt[]>([]);
  const [analytics, setAnalytics] = useState<PilotAnalytics | null>(null);
  const [selectedEncounterId, setSelectedEncounterId] = useState<string>('');
  const [attemptReviews, setAttemptReviews] = useState<PilotReview[]>([]);
  const [attemptScores, setAttemptScores] = useState<PilotReview[]>([]);
  const [educatorComment, setEducatorComment] = useState('');
  const [agreementLabel, setAgreementLabel] = useState<'agree' | 'partially_agree' | 'disagree'>('agree');
  const [safetyConcernLevel, setSafetyConcernLevel] = useState<'none' | 'minor_omission' | 'important_omission' | 'safety_critical_omission' | 'potentially_harmful_action'>('none');
  const [rubricVersion, setRubricVersion] = useState('medlife-formative-rubric-v1');
  const [overallCategory, setOverallCategory] = useState('');
  const [overallScore, setOverallScore] = useState('');
  const [domainScoreDataGathering, setDomainScoreDataGathering] = useState('');
  const [domainScoreClinical, setDomainScoreClinical] = useState('');
  const [domainScoreCommunication, setDomainScoreCommunication] = useState('');
  const [missedHistoryConcepts, setMissedHistoryConcepts] = useState('');
  const [safetyFindings, setSafetyFindings] = useState('');
  const [investigationEvaluation, setInvestigationEvaluation] = useState('Appropriate for pilot-level formative review.');
  const [diagnosisEvaluation, setDiagnosisEvaluation] = useState('Reasonable working diagnosis based on available evidence.');
  const [communicationEvaluation, setCommunicationEvaluation] = useState('Communication remained respectful and understandable.');
  const [independentComment, setIndependentComment] = useState('');
  const [confidenceLabel, setConfidenceLabel] = useState<'low' | 'medium' | 'high'>('medium');
  const [reviewMinutes, setReviewMinutes] = useState('10');
  const [caseId, setCaseId] = useState(PATIENT_CASES[0]?.id ?? 'case-headache-001');
  const [caseReviewType, setCaseReviewType] = useState<'clinical' | 'curriculum' | 'simulation' | 'ai'>('curriculum');
  const [caseDecision, setCaseDecision] = useState<'request_revision' | 'candidate_public_source_mapping' | 'academic_review_required' | 'academically_reviewed' | 'curriculum_approved' | 'clinically_reviewed' | 'pilot_ready_pending_other_reviews'>('academic_review_required');
  const [caseComments, setCaseComments] = useState('');
  const [caseFixtureLabel, setCaseFixtureLabel] = useState('development_test_fixture');
  const [caseReviews, setCaseReviews] = useState<PilotReview[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWorkspace = async () => {
    if (!session?.authenticated || session.user?.role === 'learner') return;
    setBusy(true);
    setError(null);
    try {
      const canReviewCases = session.user?.role === 'clinical_reviewer' || session.user?.role === 'curriculum_reviewer' || session.user?.role === 'pilot_admin';
      const [nextAttempts, nextAnalytics, nextCaseReviews] = await Promise.all([
        listPilotAttempts(),
        fetchPilotAnalytics(),
        canReviewCases ? listPilotCaseReviews(caseId) : Promise.resolve([]),
      ]);
      setAttempts(nextAttempts);
      setAnalytics(nextAnalytics);
      setCaseReviews(nextCaseReviews);
      if (!selectedEncounterId && nextAttempts[0]) {
        setSelectedEncounterId(String(nextAttempts[0].id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void loadWorkspace();
  }, [session?.authenticated, session?.user?.role, caseId]);

  useEffect(() => {
    if (!selectedEncounterId || !session?.authenticated) {
      setAttemptReviews([]);
      setAttemptScores([]);
      return;
    }
    void Promise.all([listPilotAttemptReviews(selectedEncounterId), listPilotAttemptScores(selectedEncounterId)])
      .then(([reviews, scores]) => {
        setAttemptReviews(reviews);
        setAttemptScores(scores);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [selectedEncounterId, session?.authenticated]);

  const selectedAttempt = useMemo(
    () => attempts.find((item) => String(item.id) === selectedEncounterId) ?? null,
    [attempts, selectedEncounterId],
  );

  if (!session?.authenticated || session.user?.role === 'learner') {
    return (
      <div className="screen paper">
        <TopBar here={0} steps={['Educator']} />
        <div style={{ maxWidth: 780, margin: '0 auto', padding: '28px 36px' }}>
          <div className="plush" style={{ padding: 20, background: 'var(--cream-2)' }}>
            <h1 style={{ fontSize: 32, marginBottom: 8 }}>Educator workspace unavailable</h1>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-2)', lineHeight: 1.5 }}>
              This pilot console is only available to authorised reviewer roles configured on the backend.
            </div>
            <button
              type="button"
              className="btn-plush ghost"
              style={{ marginTop: 14 }}
              onClick={() => store.setScreen('home')}
            >
              Back to dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen" style={{ background: 'var(--cream)', overflowY: 'auto' }}>
      <TopBar here={0} steps={['Pilot workspace']} />
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '28px 36px 60px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--ink-2)' }}>
              Controlled pilot review
            </div>
            <h1 style={{ fontSize: 40, lineHeight: 1.05, marginTop: 6 }}>Educator and reviewer workspace</h1>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-2)', marginTop: 6, maxWidth: 760 }}>
              This console supports formative review, candidate curriculum checks, and case-governance logging. It does not create official Monash approval.
            </div>
          </div>
          <button type="button" className="btn-plush ghost" onClick={() => store.setScreen('home')}>
            Back to dashboard
          </button>
        </div>

        {error && (
          <div className="plush" style={{ padding: 14, background: 'var(--rose)', marginTop: 18 }}>
            <div style={{ fontWeight: 800 }}>{error}</div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 18 }} data-testid="pilot-analytics-cards">
          <StatCard label="Attempts" value={String(analytics?.attempt_count ?? attempts.length)} />
          <StatCard label="Completed" value={String(analytics?.completed_attempt_count ?? 0)} />
          <StatCard label="Reviews" value={String(analytics?.review_count ?? 0)} />
          <StatCard label="Small sample" value={analytics?.small_sample_warning ? 'Yes' : 'No'} />
        </div>
        <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: 'var(--ink-2)' }}>
          Agreement sample: {String(analytics?.agreement_metrics?.sample_size ?? 0)}. Small fixture or pilot samples are not treated as proof of educational validity.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20, marginTop: 20 }}>
          <div className="plush" style={{ padding: 16 }} data-testid="pilot-attempt-list">
            <div style={{ fontWeight: 900, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
              Learner attempts
            </div>
            {busy && attempts.length === 0 ? (
              <div style={{ fontWeight: 700, color: 'var(--ink-2)' }}>Loading pilot attempts…</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {attempts.map((attempt) => (
                  <button
                    key={String(attempt.id)}
                    type="button"
                    className="btn-plush ghost"
                    style={{
                      textAlign: 'left',
                      justifyContent: 'flex-start',
                      padding: '12px 14px',
                      background: selectedEncounterId === String(attempt.id) ? 'var(--butter)' : 'white',
                    }}
                    onClick={() => setSelectedEncounterId(String(attempt.id))}
                  >
                    <div>
                      <div style={{ fontWeight: 900 }}>{String(attempt.case_name ?? attempt.case_id)}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>
                        Learner: {String(attempt.learner_display_name ?? 'Unknown')} · {String(attempt.status ?? 'unknown')}
                      </div>
                    </div>
                  </button>
                ))}
                {attempts.length === 0 && <div style={{ fontWeight: 700, color: 'var(--ink-2)' }}>No attempts available yet.</div>}
              </div>
            )}
          </div>

          <div className="plush" style={{ padding: 16 }} data-testid="pilot-attempt-review-panel">
            <div style={{ fontWeight: 900, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
              Attempt review
            </div>
            {selectedAttempt ? (
              <>
                <div style={{ background: 'white', border: '3px solid var(--line)', borderRadius: 14, padding: 12, marginBottom: 12 }}>
                  <div style={{ fontWeight: 900 }}>{String(selectedAttempt.case_name ?? selectedAttempt.case_id)}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', marginTop: 4 }}>
                    {String(selectedAttempt.learner_display_name ?? 'Learner')} · {String(selectedAttempt.assessment_engine_value ?? 'unknown engine')}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', marginTop: 4 }}>
                    Case version: {String(selectedAttempt.case_version ?? 'unknown')} · Integrity: {String(selectedAttempt.integrity_status ?? 'unknown')}
                  </div>
                </div>

                <textarea
                  aria-label="Educator review comment"
                  value={educatorComment}
                  onChange={(event) => setEducatorComment(event.target.value)}
                  rows={6}
                  placeholder="Educator comment"
                  style={{ ...inputStyle, resize: 'vertical', marginBottom: 10 }}
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <select aria-label="Agreement with automated feedback" value={agreementLabel} onChange={(event) => setAgreementLabel(event.target.value as typeof agreementLabel)} style={inputStyle}>
                    <option value="agree">Agree with automated feedback</option>
                    <option value="partially_agree">Partially agree</option>
                    <option value="disagree">Disagree</option>
                  </select>
                  <select aria-label="Safety concern level" value={safetyConcernLevel} onChange={(event) => setSafetyConcernLevel(event.target.value as typeof safetyConcernLevel)} style={inputStyle}>
                    <option value="none">No safety concern</option>
                    <option value="minor_omission">Minor omission</option>
                    <option value="important_omission">Important omission</option>
                    <option value="safety_critical_omission">Safety-critical omission</option>
                    <option value="potentially_harmful_action">Potentially harmful action</option>
                  </select>
                </div>
                <button
                  type="button"
                  className="btn-plush primary"
                  disabled={!educatorComment.trim()}
                  data-testid="save-educator-review"
                  onClick={() => {
                    void createPilotAttemptReview(String(selectedAttempt.id), {
                      educator_comment: educatorComment.trim(),
                      agreement_label: agreementLabel,
                      safety_concern_level: safetyConcernLevel,
                      reviewed_status: 'educator_reviewed',
                    }).then(async () => {
                      setEducatorComment('');
                      setAttemptReviews(await listPilotAttemptReviews(String(selectedAttempt.id)));
                      await loadWorkspace();
                    }).catch((err) => setError(err instanceof Error ? err.message : String(err)));
                  }}
                >
                  Save educator review
                </button>

                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {attemptReviews.map((review) => (
                    <div key={String(review.id)} style={{ background: 'var(--cream-2)', border: '2.5px solid var(--line)', borderRadius: 12, padding: 10 }}>
                      <div style={{ fontWeight: 900 }}>{String(review.reviewer_display_name ?? review.reviewer_role ?? 'Reviewer')}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', marginTop: 2 }}>
                        {String(review.reviewed_status ?? 'review_logged')} · {String(review.agreement_label ?? 'n/a')} · {String(review.safety_concern_level ?? 'none')}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, marginTop: 6, whiteSpace: 'pre-wrap' }}>
                        {String(review.educator_comment ?? '')}
                      </div>
                    </div>
                  ))}
                  {attemptReviews.length === 0 && <div style={{ fontWeight: 700, color: 'var(--ink-2)' }}>No educator reviews recorded for this attempt yet.</div>}
                </div>

                <div style={{ marginTop: 18, paddingTop: 14, borderTop: '3px solid var(--line)' }}>
                  <div style={{ fontWeight: 900, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
                    Independent educator scoring
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <input aria-label="Rubric version" value={rubricVersion} onChange={(event) => setRubricVersion(event.target.value)} placeholder="Rubric version" style={inputStyle} />
                    <input aria-label="Overall category" value={overallCategory} onChange={(event) => setOverallCategory(event.target.value)} placeholder="Overall category" style={inputStyle} />
                    <input aria-label="Overall score" value={overallScore} onChange={(event) => setOverallScore(event.target.value)} placeholder="Overall score" style={inputStyle} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <input aria-label="Data gathering verdict" value={domainScoreDataGathering} onChange={(event) => setDomainScoreDataGathering(event.target.value)} placeholder="Data gathering verdict" style={inputStyle} />
                    <input aria-label="Clinical management verdict" value={domainScoreClinical} onChange={(event) => setDomainScoreClinical(event.target.value)} placeholder="Clinical management verdict" style={inputStyle} />
                    <input aria-label="Communication verdict" value={domainScoreCommunication} onChange={(event) => setDomainScoreCommunication(event.target.value)} placeholder="Communication verdict" style={inputStyle} />
                  </div>
                  <textarea aria-label="Missed history concepts" value={missedHistoryConcepts} onChange={(event) => setMissedHistoryConcepts(event.target.value)} rows={2} placeholder="Missed history concepts, comma separated" style={{ ...inputStyle, resize: 'vertical', marginBottom: 10 }} />
                  <textarea aria-label="Safety findings" value={safetyFindings} onChange={(event) => setSafetyFindings(event.target.value)} rows={2} placeholder="Safety findings, comma separated" style={{ ...inputStyle, resize: 'vertical', marginBottom: 10 }} />
                  <textarea aria-label="Investigation evaluation" value={investigationEvaluation} onChange={(event) => setInvestigationEvaluation(event.target.value)} rows={2} placeholder="Investigation evaluation" style={{ ...inputStyle, resize: 'vertical', marginBottom: 10 }} />
                  <textarea aria-label="Diagnosis evaluation" value={diagnosisEvaluation} onChange={(event) => setDiagnosisEvaluation(event.target.value)} rows={2} placeholder="Diagnosis evaluation" style={{ ...inputStyle, resize: 'vertical', marginBottom: 10 }} />
                  <textarea aria-label="Communication evaluation" value={communicationEvaluation} onChange={(event) => setCommunicationEvaluation(event.target.value)} rows={2} placeholder="Communication evaluation" style={{ ...inputStyle, resize: 'vertical', marginBottom: 10 }} />
                  <textarea aria-label="Independent educator feedback" value={independentComment} onChange={(event) => setIndependentComment(event.target.value)} rows={4} placeholder="Independent educator feedback" style={{ ...inputStyle, resize: 'vertical', marginBottom: 10 }} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <select aria-label="Educator confidence label" value={confidenceLabel} onChange={(event) => setConfidenceLabel(event.target.value as typeof confidenceLabel)} style={inputStyle}>
                      <option value="low">Low confidence</option>
                      <option value="medium">Medium confidence</option>
                      <option value="high">High confidence</option>
                    </select>
                    <input aria-label="Review minutes" value={reviewMinutes} onChange={(event) => setReviewMinutes(event.target.value)} placeholder="Review minutes" style={inputStyle} />
                  </div>
                  <button
                    type="button"
                    className="btn-plush primary"
                    disabled={!independentComment.trim()}
                    data-testid="save-independent-score"
                    onClick={() => {
                      void createPilotAttemptScore(String(selectedAttempt.id), {
                        rubric_version: rubricVersion.trim(),
                        review_mode: 'independent',
                        overall_score: Number.isFinite(Number(overallScore)) ? Number(overallScore) : null,
                        overall_category: overallCategory.trim(),
                        domain_scores: {
                          data_gathering: { verdict: domainScoreDataGathering.trim() },
                          clinical_management: { verdict: domainScoreClinical.trim() },
                          interpersonal: { verdict: domainScoreCommunication.trim() },
                        },
                        safety_findings: safetyFindings.split(',').map((item) => item.trim()).filter(Boolean),
                        missed_history_concepts: missedHistoryConcepts.split(',').map((item) => item.trim()).filter(Boolean),
                        investigation_evaluation: investigationEvaluation.trim(),
                        diagnosis_evaluation: diagnosisEvaluation.trim(),
                        communication_evaluation: communicationEvaluation.trim(),
                        educator_comment: independentComment.trim(),
                        confidence_label: confidenceLabel,
                        review_minutes: Number(reviewMinutes) || 0,
                        submit_status: 'submitted',
                      }).then(async () => {
                        setIndependentComment('');
                        setAttemptScores(await listPilotAttemptScores(String(selectedAttempt.id)));
                        await loadWorkspace();
                      }).catch((err) => setError(err instanceof Error ? err.message : String(err)));
                    }}
                  >
                    Save independent score
                  </button>
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {attemptScores.map((score) => (
                      <div key={String(score.id)} style={{ background: 'white', border: '2px solid var(--line)', borderRadius: 12, padding: 10 }} data-testid={`educator-score-${String(score.id)}`}>
                        <div style={{ fontWeight: 900 }}>{String(score.reviewer_display_name ?? score.reviewer_role ?? 'Reviewer')}</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>
                          Independent score Â· {String(score.overall_category ?? 'n/a')} Â· rubric {String(score.rubric_version ?? 'n/a')}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, marginTop: 6, whiteSpace: 'pre-wrap' }}>
                          {String(score.educator_comment ?? '')}
                        </div>
                      </div>
                    ))}
                    {attemptScores.length === 0 && <div style={{ fontWeight: 700, color: 'var(--ink-2)' }}>No independent educator scores recorded yet.</div>}
                  </div>
                </div>
              </>
            ) : (
              <div style={{ fontWeight: 700, color: 'var(--ink-2)' }}>Select an attempt to review it.</div>
            )}
          </div>
        </div>

        <div className="plush" style={{ padding: 16, marginTop: 20 }} data-testid="case-review-workflow">
          <div style={{ fontWeight: 900, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
            Case review workflow
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <select aria-label="Case review case" value={caseId} onChange={(event) => setCaseId(event.target.value)} style={inputStyle} data-testid="case-review-case-select">
              {PATIENT_CASES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <select aria-label="Case review type" value={caseReviewType} onChange={(event) => setCaseReviewType(event.target.value as typeof caseReviewType)} style={inputStyle} data-testid="case-review-type-select">
              <option value="clinical">Clinical review</option>
              <option value="curriculum">Curriculum review</option>
              <option value="simulation">Simulation review</option>
              <option value="ai">AI review</option>
            </select>
            <select aria-label="Case review decision" value={caseDecision} onChange={(event) => setCaseDecision(event.target.value as typeof caseDecision)} style={inputStyle} data-testid="case-review-decision-select">
              <option value="request_revision">Request revision</option>
              <option value="candidate_public_source_mapping">Candidate public-source mapping</option>
              <option value="academic_review_required">Academic review required</option>
              <option value="academically_reviewed">Academically reviewed</option>
              <option value="curriculum_approved">Curriculum approved</option>
              <option value="clinically_reviewed">Clinically reviewed</option>
              <option value="pilot_ready_pending_other_reviews">Pilot ready pending other reviews</option>
            </select>
          </div>
          <textarea
            aria-label="Case review comments"
            value={caseComments}
            onChange={(event) => setCaseComments(event.target.value)}
            rows={5}
            placeholder="Review comments"
            data-testid="case-review-comments"
            style={{ ...inputStyle, resize: 'vertical', marginTop: 10 }}
          />
          <input
            aria-label="Case review fixture label"
            value={caseFixtureLabel}
            onChange={(event) => setCaseFixtureLabel(event.target.value)}
            placeholder="Fixture label for development review records"
            data-testid="case-review-fixture-label"
            style={{ ...inputStyle, marginTop: 10 }}
          />
          <button
            type="button"
            className="btn-plush primary"
            style={{ marginTop: 10 }}
            disabled={!caseComments.trim()}
            data-testid="save-case-review"
            onClick={() => {
              const selectedCase = PATIENT_CASES.find((item) => item.id === caseId);
              void createPilotCaseReview(caseId, {
                review_type: caseReviewType,
                decision: caseDecision,
                comments: caseComments.trim(),
                mapping_version: selectedCase?.curriculumAlignment.mappingVersion ?? null,
                next_review_date: null,
                fixture_label: caseFixtureLabel.trim() || null,
              }).then(async () => {
                setCaseComments('');
                setCaseReviews(await listPilotCaseReviews(caseId));
              }).catch((err) => setError(err instanceof Error ? err.message : String(err)));
            }}
          >
            Save case review
          </button>

          <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ background: 'white', border: '3px solid var(--line)', borderRadius: 14, padding: 12 }} data-testid="selected-case-readiness">
              <div style={{ fontWeight: 900, marginBottom: 8 }}>Selected case readiness</div>
              {(() => {
                const selectedCase = PATIENT_CASES.find((item) => item.id === caseId);
                if (!selectedCase) return null;
                return (
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)', lineHeight: 1.5 }}>
                    <span data-testid="readiness-stage">Stage: {selectedCase.pilotReadiness.candidateStage.replace(/_/g, ' ')}</span>
                    <br />
                    <span data-testid="readiness-curriculum-status">Curriculum status: {selectedCase.pilotReadiness.curriculumReviewStatus.replace(/_/g, ' ')}</span>
                    <br />
                    <span data-testid="readiness-clinical-status">Clinical status: {selectedCase.pilotReadiness.clinicalReviewStatus.replace(/_/g, ' ')}</span>
                    <br />
                    <span data-testid="readiness-simulation-status">Simulation status: {selectedCase.pilotReadiness.simulationReviewStatus.replace(/_/g, ' ')}</span>
                    <br />
                    <span data-testid="readiness-ai-status">AI status: {selectedCase.pilotReadiness.aiReviewStatus.replace(/_/g, ' ')}</span>
                    <br />
                    <span data-testid="readiness-pilot-status">Pilot ready: {selectedCase.pilotReadiness.pilotReadyStatus.replace(/_/g, ' ')}</span>
                  </div>
                );
              })()}
            </div>
            <div style={{ background: 'white', border: '3px solid var(--line)', borderRadius: 14, padding: 12 }} data-testid="case-review-log">
              <div style={{ fontWeight: 900, marginBottom: 8 }}>Recorded review log</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {caseReviews.map((review) => (
                  <div key={String(review.id)} style={{ background: 'var(--cream)', border: '2px solid var(--line)', borderRadius: 10, padding: 8 }} data-testid={`case-review-record-${String(review.id)}`}>
                    <div style={{ fontWeight: 800 }}>{String(review.review_type ?? 'review')}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>
                      {String(review.decision ?? '')} · {String(review.reviewer_display_name ?? review.reviewer_role ?? '')}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>
                      Mapping {String(review.mapping_version ?? 'n/a')} Â· Case version {String(review.case_version ?? 'n/a')}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>
                      Institution {String(review.institution_profile_version ?? 'n/a')} Â· Source registry {String(review.source_registry_version ?? 'n/a')}
                    </div>
                    {review.fixture_label && (
                      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink-2)' }}>
                        Fixture: {String(review.fixture_label)}
                      </div>
                    )}
                  </div>
                ))}
                {caseReviews.length === 0 && <div style={{ fontWeight: 700, color: 'var(--ink-2)' }}>No case reviews recorded yet.</div>}
              </div>
            </div>
          </div>
        </div>

        {session.user?.role === 'pilot_admin' && (
          <div className="plush" style={{ padding: 16, marginTop: 20 }} data-testid="research-export-panel">
            <div style={{ fontWeight: 900, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
              Deidentified research export
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-2)', lineHeight: 1.5, marginBottom: 10 }}>
              Export is pseudonymised and limited to consented learners who have not withdrawn. It is not anonymous and it is not described as ethics approval.
            </div>
            <button
              type="button"
              className="btn-plush primary"
              data-testid="download-research-export"
              onClick={() => {
                void exportPilotResearchData().then((result) => {
                  const url = URL.createObjectURL(result.blob);
                  const anchor = document.createElement('a');
                  anchor.href = url;
                  anchor.download = result.filename || 'medlife-deidentified-export.json';
                  document.body.appendChild(anchor);
                  anchor.click();
                  anchor.remove();
                  URL.revokeObjectURL(url);
                }).catch((err) => setError(err instanceof Error ? err.message : String(err)));
              }}
            >
              Download deidentified export
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
