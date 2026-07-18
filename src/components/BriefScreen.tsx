import { PatientFace, TopBar } from './primitives';
import { getCase, getPatientCase } from '../data/cases';
import { store, useStore, useTweaks } from '../game/store';
import { useAuth } from '../runtime/AuthProvider';

interface VitalCard {
  label: string;
  value: string;
  unit: string;
  color: string;
}

function buildVitals(p?: { hr: number; bp: string; spo2: number; temp: number; rr: number }): VitalCard[] {
  return [
    { label: 'HR', value: String(p?.hr ?? 88), unit: 'bpm', color: 'var(--rose)' },
    { label: 'BP', value: p?.bp ?? '120/80', unit: 'mmHg', color: 'var(--peach)' },
    { label: 'RR', value: String(p?.rr ?? 16), unit: '/min', color: 'var(--sky)' },
    { label: 'SpO2', value: String(p?.spo2 ?? 98), unit: '%', color: 'var(--mint)' },
    { label: 'Temp', value: (p?.temp ?? 36.7).toFixed(1), unit: '°C', color: 'var(--butter)' },
  ];
}

export function BriefScreen() {
  const tweaks = useTweaks();
  const { preferences } = useAuth();
  const caseId = useStore((s) => s.selectedCaseId);
  const c = getCase(caseId);
  const patient = getPatientCase(caseId);
  const vitals = buildVitals(patient?.vitals);
  const chiefComplaint = patient?.chiefComplaint ?? c.complaint;
  const arrivalBlurb = patient?.arrivalBlurb ?? 'Looks well. No acute distress.';
  const severityChip =
    patient?.severity === 'critical'
      ? { label: 'critical · resuscitate', tone: 'rose' }
      : patient?.severity === 'urgent'
        ? { label: 'urgent', tone: 'peach' }
        : { label: 'first presentation', tone: 'mint' };

  return (
    <div className="screen platform-screen" style={{ position: 'relative' }}>
      <TopBar here={3} steps={['Polyclinic', 'GP', 'Case', 'Brief']} />

      <div className="platform-container platform-grid brief" style={{ minHeight: 'calc(100vh - 67px)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="platform-hero">
            <div className="platform-label">Doorway brief</div>
            <h1 className="platform-title" style={{ fontSize: 42 }}>{c.name}</h1>
            <div className="platform-copy">
              {c.age} years · {c.sex === 'F' ? 'Female' : 'Male'} · {c.cond}. Enter with a focused plan, keep the consultation safe, and close with a clear explanation.
            </div>
            <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span className="chip butter">Case briefing</span>
              <span className="chip">{patient?.learningDesign.prebrief.expectedLearnerLevel ?? 'Clinical learner'}</span>
              <span className={`chip ${severityChip.tone}`}>{severityChip.label}</span>
            </div>
          </div>

          <div className="glass-card" style={{ padding: 22 }}>
            <div className="section-heading">
              <div className="title">Presenting problem</div>
            </div>
            <div
              style={{
                padding: '16px 18px',
                background: 'linear-gradient(135deg, rgba(214,236,255,0.28), rgba(255,255,255,0.94))',
                borderRadius: 22,
                border: '1px solid rgba(22,53,65,0.08)',
                fontSize: 18,
                fontWeight: 800,
                lineHeight: 1.45,
              }}
            >
              "{chiefComplaint}"
            </div>
            <div style={{ marginTop: 14, fontSize: 14, fontWeight: 700, color: 'var(--ink-2)', lineHeight: 1.55 }}>
              Bench impression: {arrivalBlurb}
            </div>
          </div>

          <div className="glass-card" style={{ padding: 22 }} data-testid="case-review-banner">
            <div className="section-heading">
              <div className="title">Governance and safeguards</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {patient?.status && (
                <span className={`chip ${patient.status === 'approved' ? 'mint' : 'butter'}`} data-testid="case-status-chip">
                  {patient.status.replace(/_/g, ' ')}
                </span>
              )}
              {patient?.approvalStatus && (
                <span className="chip" data-testid="case-approval-chip">
                  {patient.approvalStatus.replace(/_/g, ' ')}
                </span>
              )}
              {patient?.assessmentBlueprint.formativeLabels.map((label) => (
                <span key={label} className="chip">{label}</span>
              ))}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.55, color: 'var(--ink-2)' }}>
              {patient?.reviewBanner ?? patient?.learningDesign.recommendedUse}
            </div>
          </div>

          <div className="glass-card" style={{ padding: 22 }}>
            <div className="section-heading">
              <div className="title">Your task</div>
            </div>
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, fontWeight: 700, lineHeight: 1.7 }}>
              <li>Take a focused history.</li>
              <li>Examine or investigate only when it changes your reasoning.</li>
              <li>Agree on a safe plan, then reflect on your performance.</li>
            </ol>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="glass-card dark" style={{ padding: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div className="floaty">
                <PatientFace style={tweaks.avatarStyle} skin={c.skin} hair={c.hair} size={122} mood={c.mood} accessory={c.accessory} />
              </div>
              <div>
                <div className="platform-label">Waiting patient</div>
                <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1.05 }}>{c.name.split(' ')[0]}</div>
                <div style={{ marginTop: 6, fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.74)' }}>
                  currently waiting
                </div>
                <div style={{ marginTop: 10 }} className={`chip ${severityChip.tone}`}>
                  {severityChip.label}
                </div>
              </div>
            </div>
          </div>

          <div className="glass-card" style={{ padding: 22 }}>
            <div className="section-heading">
              <div className="title">Triage vitals</div>
            </div>
            <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              {vitals.map((v) => (
                <div key={v.label} className="metric-card" style={{ background: v.color }}>
                  <div className="big" style={{ fontSize: 26 }}>{v.value}</div>
                  <div className="sub">{v.label} · {v.unit}</div>
                </div>
              ))}
            </div>
          </div>

          {patient && (
            <div className="glass-card" style={{ padding: 22 }}>
              <div className="section-heading">
                <div className="title">Prebrief and access</div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.6, color: 'var(--ink-2)' }}>
                {patient.learningDesign.recommendedUse}
              </div>
              <ul style={{ margin: '12px 0 0', paddingLeft: 18, fontSize: 13, fontWeight: 700, lineHeight: 1.7 }}>
                {patient.learningDesign.prebrief.learningObjectives.map((item) => <li key={item}>{item}</li>)}
              </ul>
              <div style={{ marginTop: 14, fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', lineHeight: 1.55 }}>
                Stage recommendation: {patient.pilotReadiness.candidateStage.replace(/_/g, ' ')} · Your current stage: {preferences.learner_stage.replace(/_/g, ' ')}
              </div>
              <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', lineHeight: 1.55 }}>
                AI disclosure: {patient.learningDesign.prebrief.aiModeExplanation}
              </div>
              <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', lineHeight: 1.55 }}>
                Modality limits: {patient.assessmentBlueprint.modalityLimits.join(' ')}
              </div>
              <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', lineHeight: 1.55 }}>
                <span data-testid="brief-accessibility-path">
                  Accessibility path: {preferences.non_3d_mode || preferences.low_bandwidth_mode ? 'Non-3D / low-bandwidth mode will open the chart-first encounter.' : '3D encounter is available, but not required to complete the case.'}
                </span>
              </div>
            </div>
          )}

          <div className="glass-card" style={{ padding: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div className="platform-label" style={{ color: 'var(--ink-2)' }}>Time budget</div>
              <div style={{ fontSize: 30, fontWeight: 900, color: 'var(--teal-700)' }}>8:00</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: 10,
                    height: 30,
                    borderRadius: 999,
                    background: i < 6 ? 'var(--mint)' : 'var(--butter)',
                    border: '1px solid rgba(22,53,65,0.12)',
                  }}
                />
              ))}
            </div>
          </div>

          <button
            type="button"
            className="btn-plush primary breathe"
            style={{ fontSize: 22, padding: '18px 0' }}
            onClick={() => store.setScreen('encounter')}
            data-testid="enter-encounter"
          >
            Knock and enter
          </button>
        </div>
      </div>
    </div>
  );
}
