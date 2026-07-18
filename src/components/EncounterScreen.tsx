import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useActiveInteractable, interactionBus } from './three/interactions';
import {
  store,
  useGameState,
  POLYCLINIC_BED_INDEX,
} from '../game/store';
import {
  getExistingConversation,
  disposePatientConversation,
} from '../voice/conversationStore';
import { TopBar } from './primitives';
import { useRuntime, getInteractionModeLabel } from '../runtime/RuntimeProvider';
import { useEncounterSync } from '../runtime/EncounterSyncProvider';
import { useAuth } from '../runtime/AuthProvider';

const EncounterWorld = lazy(() =>
  import('./EncounterWorld').then((mod) => ({ default: mod.EncounterWorld })),
);
const ExamineOverlay = lazy(() =>
  import('./ExamineOverlay').then((mod) => ({ default: mod.ExamineOverlay })),
);
const DockedVoicePanel = lazy(() =>
  import('./DockedVoicePanel').then((mod) => ({ default: mod.DockedVoicePanel })),
);

function Crosshair() {
  const active = useActiveInteractable();
  const hot = !!active;
  const size = hot ? 18 : 8;
  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginTop: -size / 2,
        borderRadius: '50%',
        background: hot ? 'transparent' : 'rgba(255,255,255,0.88)',
        border: hot ? '2px solid rgba(94, 223, 199, 0.95)' : 'none',
        boxShadow: hot
          ? '0 0 16px rgba(94,223,199,0.62), 0 0 0 1px rgba(10, 24, 32, 0.28)'
          : '0 0 0 1px rgba(10, 24, 32, 0.28)',
        pointerEvents: 'none',
        transition: 'width 0.12s, height 0.12s, margin 0.12s, border 0.12s, box-shadow 0.12s',
      }}
    />
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        background: 'rgba(255,255,255,0.86)',
        padding: '2px 8px',
        borderRadius: 999,
        fontFamily: 'ui-monospace, monospace',
        fontSize: 11,
        border: '1px solid rgba(255,255,255,0.2)',
        margin: '0 2px',
        color: 'white',
      }}
    >
      {children}
    </span>
  );
}

function EncounterVital({
  label,
  value,
  meta,
}: {
  label: string;
  value: string;
  meta: string;
}) {
  return (
    <div className="encounter-vital">
      <span className="meta">{label}</span>
      <span className="value">{value}</span>
      <span className="meta">{meta}</span>
    </div>
  );
}

export function EncounterScreen() {
  const state = useGameState();
  const patient = state.polyclinic.patient;
  const { capabilities, backendReachable } = useRuntime();
  const { syncState, pendingCount, retrySync } = useEncounterSync();
  const { preferences } = useAuth();

  const [voiceActive, setVoiceActive] = useState(true);
  const [pointerLocked, setPointerLocked] = useState(false);
  const [examineOpen, setExamineOpen] = useState(false);

  useEffect(() => {
    if (!patient) store.loadPolyclinicPatient(state.selectedCaseId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (document.pointerLockElement) document.exitPointerLock();
    };
  }, []);

  const examineOpenRef = useRef(false);
  examineOpenRef.current = examineOpen;

  useEffect(() => {
    const onChange = () => {
      const locked = !!document.pointerLockElement;
      setPointerLocked(locked);
      if (locked && examineOpenRef.current) {
        document.exitPointerLock();
      }
    };
    document.addEventListener('pointerlockchange', onChange);
    return () => document.removeEventListener('pointerlockchange', onChange);
  }, []);

  useEffect(() => {
    if (!examineOpen) return;
    if (document.pointerLockElement) document.exitPointerLock();
    interactionBus.setActive(null);
  }, [examineOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 't' && e.key !== 'T') return;
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return;
      if (examineOpen) return;
      e.preventDefault();
      setVoiceActive((prev) => {
        const next = !prev;
        if (prev && !next) disposePatientConversation(POLYCLINIC_BED_INDEX);
        return next;
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [examineOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'e' && e.key !== 'E') return;
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return;
      if (examineOpen) return;
      e.preventDefault();
      setExamineOpen(true);
      if (document.pointerLockElement) document.exitPointerLock();
      interactionBus.setActive(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [examineOpen]);

  const currentPatientCaseId = patient?.case.id ?? null;
  useEffect(() => {
    return () => {
      disposePatientConversation(POLYCLINIC_BED_INDEX);
    };
  }, [currentPatientCaseId]);

  useEffect(() => {
    if (patient) setVoiceActive(true);
    else setVoiceActive(false);
  }, [currentPatientCaseId, patient]);

  const openExamine = () => {
    if (document.pointerLockElement) document.exitPointerLock();
    interactionBus.setActive(null);
    setExamineOpen(true);
  };

  const handleInteract = (kind: 'desk' | 'bed' | 'triage', bedIndex?: number) => {
    if (kind === 'bed' && bedIndex === POLYCLINIC_BED_INDEX) {
      openExamine();
    }
  };

  const handleTalk = (bedIndex: number | null) => {
    if (bedIndex === POLYCLINIC_BED_INDEX) {
      setVoiceActive((prev) => {
        const next = !prev;
        if (prev && !next) disposePatientConversation(POLYCLINIC_BED_INDEX);
        return next;
      });
    } else if (bedIndex === null) {
      setVoiceActive((prev) => {
        if (prev) disposePatientConversation(POLYCLINIC_BED_INDEX);
        return false;
      });
    }
  };

  const endConsultation = async () => {
    const conv = getExistingConversation(POLYCLINIC_BED_INDEX);
    if (conv) {
      try {
        await conv.sayFarewell();
      } catch {
        // Continue even if voice fails.
      }
    }
    if (document.pointerLockElement) document.exitPointerLock();
    interactionBus.setActive(null);
    store.finishPolyclinicCase();
    disposePatientConversation(POLYCLINIC_BED_INDEX);
    store.setScreen('endConfirm');
  };

  const wrapForAssessment = () => {
    if (document.pointerLockElement) document.exitPointerLock();
    interactionBus.setActive(null);
    store.finishPolyclinicCase();
    disposePatientConversation(POLYCLINIC_BED_INDEX);
    store.setScreen('endConfirm');
  };

  const interactionMode = getInteractionModeLabel(capabilities, backendReachable);
  const accessibleMode = preferences.non_3d_mode || preferences.low_bandwidth_mode;
  const firstName = patient?.case.name.split(' ')[0] ?? 'Patient';
  const concernSummary =
    patient?.case.learningDesign.recommendedUse
    ?? 'Build a safe, focused consultation and close with a clear plan.';
  const keyObjectives = patient?.case.learningDesign.prebrief.learningObjectives.slice(0, 3) ?? [];
  const encounterChips = [
    interactionMode,
    preferences.reduced_motion_mode ? 'Reduced motion' : 'Live motion',
    voiceActive ? 'Voice link active' : 'Voice link paused',
  ];

  if (accessibleMode) {
    return (
      <div className="screen paper" style={{ overflowY: 'auto' }} data-testid="encounter-mode-non-3d">
        <TopBar here={4} steps={['Polyclinic', 'GP', 'Case', 'Brief', 'Encounter']} />
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '28px 36px 60px' }}>
          <div className="plush-lg" style={{ padding: 18, background: 'var(--cream-2)', marginBottom: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-2)' }}>
              Accessible encounter mode
            </div>
            <h1 style={{ fontSize: 34, marginTop: 8, marginBottom: 8 }}>
              Non-3D consultation
            </h1>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-2)', lineHeight: 1.55 }}>
              This chart-first mode keeps the same history, investigations, diagnosis, management, debrief, and reflection outcomes without requiring the 3D room.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              <span className="chip butter">{interactionMode}</span>
              <span className="chip">{preferences.low_bandwidth_mode ? 'Low bandwidth' : 'Standard bandwidth'}</span>
              <span className="chip">{preferences.reduced_motion_mode ? 'Reduced motion' : 'Animation allowed'}</span>
            </div>
            {(preferences.low_bandwidth_mode || preferences.non_3d_mode) && (
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', marginTop: 8 }} data-testid="low-bandwidth-encounter-note">
                accessibility-mode optimisation incomplete
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-plush mint"
              onClick={() => setExamineOpen(true)}
              data-testid="open-examination-accessible"
            >
              Open chart and examine
            </button>
            <button
              type="button"
              className="btn-plush butter"
              onClick={wrapForAssessment}
              data-testid="wrap-for-assessment-accessible"
            >
              Wrap up for assessment
            </button>
            <button
              type="button"
              className="btn-plush ghost"
              onClick={() => void endConsultation()}
              data-testid="end-consultation-accessible"
            >
              End consultation
            </button>
          </div>

          {patient && (
            <div className="plush" style={{ padding: 16, marginBottom: 18 }}>
              <div style={{ fontWeight: 900, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
                Case focus
              </div>
              <div style={{ fontSize: 14, fontWeight: 800 }}>{patient.case.chiefComplaint}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)', marginTop: 6 }}>
                Objectives: {patient.case.learningDesign.prebrief.learningObjectives.join(' ')}
              </div>
            </div>
          )}

          {examineOpen && patient && (
            <>
              {!preferences.low_bandwidth_mode && (
                <Suspense fallback={null}>
                  <DockedVoicePanel
                    patientName={patient.case.name}
                    patientLabel={`${patient.case.age}${patient.case.gender}`}
                  />
                </Suspense>
              )}
              <Suspense fallback={null}>
                <ExamineOverlay
                  onClose={() => setExamineOpen(false)}
                  onDispatch={async () => {
                    setExamineOpen(false);
                    await endConsultation();
                  }}
                />
              </Suspense>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="screen" style={{ background: 'var(--cream)', position: 'relative' }} data-testid="encounter-mode-3d">
      <TopBar here={4} steps={['Polyclinic', 'GP', 'Case', 'Brief', 'Encounter']} />

      <div className="encounter-shell" style={{ pointerEvents: examineOpen ? 'none' : undefined }}>
        <div className="encounter-canvas">
          <Suspense fallback={<div className="screen paper" style={{ display: 'grid', placeItems: 'center', minHeight: '100%' }}>Loading simulation bay...</div>}>
            <EncounterWorld
              voiceActive={voiceActive}
              examineOpen={examineOpen}
              onInteract={handleInteract}
              onTalk={handleTalk}
            />
          </Suspense>
        </div>

        {pointerLocked && <Crosshair />}

        <div className="encounter-frame">
          <aside className="encounter-rail">
            <div className="encounter-panel encounter-card dark">
              <div className="encounter-label">AI Patient</div>
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div className="encounter-big-number">{firstName}</div>
                  <div style={{ marginTop: 6, fontWeight: 700, fontSize: 14, color: 'rgba(255,255,255,0.76)' }}>
                    {patient ? `${patient.case.age} · ${patient.case.gender === 'F' ? 'Female' : 'Male'}` : 'Awaiting case'}
                  </div>
                </div>
                <span className={`chip ${patient?.case.severity === 'critical' ? 'rose' : patient?.case.severity === 'urgent' ? 'peach' : 'mint'}`}>
                  {patient?.case.severity ?? 'stable'}
                </span>
              </div>
              <p style={{ marginBottom: 0, marginTop: 14, fontSize: 14, lineHeight: 1.55, color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>
                {patient?.case.chiefComplaint ?? 'Open a case to start the consultation.'}
              </p>
            </div>

            <div className="encounter-panel encounter-card">
              <div className="encounter-label">Clinical Priorities</div>
              <div style={{ marginTop: 10, fontSize: 18, fontWeight: 900, lineHeight: 1.2 }}>
                {concernSummary}
              </div>
              <div className="encounter-badge-grid" style={{ marginTop: 14 }}>
                {keyObjectives.map((objective) => (
                  <span key={objective} className="chip">{objective}</span>
                ))}
              </div>
            </div>

            <div className="encounter-panel encounter-card">
              <div className="encounter-label">Actions</div>
              <div className="encounter-action-stack" style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="btn-plush mint"
                  onClick={(e) => {
                    e.stopPropagation();
                    openExamine();
                  }}
                  data-testid="open-examination"
                >
                  <span>Open chart and examine</span>
                </button>
                <button
                  type="button"
                  className="btn-plush butter"
                  onClick={(e) => {
                    e.stopPropagation();
                    wrapForAssessment();
                  }}
                  data-testid="wrap-for-assessment"
                >
                  <span>Wrap up for assessment</span>
                </button>
                <button
                  type="button"
                  className="btn-plush ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    void endConsultation();
                  }}
                  data-testid="end-consultation"
                >
                  <span>End consultation</span>
                </button>
              </div>
            </div>
          </aside>

          <section className="encounter-center-stack">
            <div className="encounter-panel encounter-card dark encounter-header-strip">
              <div>
                <div className="encounter-label">Medlife 2026 Simulation</div>
                <div className="title">Immersive consultation bay</div>
                <div className="support">
                  Use the room as your live patient context, then switch into the chart workspace for focused history, tests, diagnosis, and management.
                </div>
              </div>
              <div className="encounter-badge-grid">
                {encounterChips.map((item) => (
                  <span key={item} className="chip">{item}</span>
                ))}
              </div>
            </div>

            <div />

            <div className="encounter-panel encounter-bottom-bar">
              <div className="group">
                <div className="encounter-mini-card dark" style={{ pointerEvents: 'none' }}>
                  {pointerLocked ? (
                    <>
                      {interactionMode} · <Kbd>E</Kbd> examine · <Kbd>Esc</Kbd> release
                    </>
                  ) : (
                    <>
                      <span
                        className={voiceActive ? 'dot breathe' : 'dot'}
                        style={{ background: voiceActive ? 'var(--mint-deep)' : 'var(--ink-3)', marginRight: 8 }}
                      />
                      Click the room to look around. Use guided history or AI text to drive the patient transcript.
                    </>
                  )}
                </div>
                <span className={`chip ${syncState === 'pending_sync' ? 'peach' : syncState === 'saved' ? 'mint' : 'butter'}`} data-testid="sync-status">
                  {syncState === 'pending_sync' ? `Pending sync (${pendingCount})` : syncState === 'saved' ? 'Saved to server' : 'Local session'}
                </span>
                {syncState === 'pending_sync' && (
                  <button
                    type="button"
                    className="btn-plush ghost"
                    style={{ fontSize: 12, padding: '8px 12px' }}
                    onClick={() => void retrySync()}
                    data-testid="retry-sync-inline"
                  >
                    Retry sync
                  </button>
                )}
              </div>
            </div>
          </section>

          <aside className="encounter-rail encounter-right-rail">
            <div className="encounter-panel encounter-card dark">
              <div className="encounter-label">Live Vitals</div>
              <div className="encounter-vitals" style={{ marginTop: 12 }}>
                <EncounterVital label="HR" value={patient ? String(patient.case.vitals.hr) : '--'} meta="bpm" />
                <EncounterVital label="BP" value={patient?.case.vitals.bp ?? '--'} meta="mmHg" />
                <EncounterVital label="SpO2" value={patient ? `${patient.case.vitals.spo2}` : '--'} meta="percent" />
                <EncounterVital label="Temp" value={patient ? patient.case.vitals.temp.toFixed(1) : '--'} meta="celsius" />
                <EncounterVital label="RR" value={patient ? String(patient.case.vitals.rr) : '--'} meta="breaths/min" />
                <EncounterVital label="Mode" value={voiceActive ? 'Voice' : 'Quiet'} meta="conversation channel" />
              </div>
            </div>

            <div className="encounter-panel encounter-card">
              <div className="encounter-label">Encounter Notes</div>
              <div style={{ marginTop: 10, fontSize: 15, fontWeight: 800, lineHeight: 1.45 }}>
                {patient?.case.learningDesign.prebrief.aiModeExplanation
                  ?? 'Focus on safe questioning, targeted investigation, and a clear closing explanation.'}
              </div>
              <div className="encounter-subtle" style={{ marginTop: 10 }}>
                Non-3D mode remains available in learner preferences whenever a chart-first workflow is better.
              </div>
            </div>
          </aside>
        </div>
      </div>

      {examineOpen && patient && (
        <>
          <Suspense fallback={null}>
            <DockedVoicePanel
              patientName={patient.case.name}
              patientLabel={`${patient.case.age}${patient.case.gender}`}
            />
          </Suspense>
          <Suspense fallback={null}>
            <ExamineOverlay
              onClose={() => setExamineOpen(false)}
              onDispatch={async () => {
                setExamineOpen(false);

                const conv = getExistingConversation(POLYCLINIC_BED_INDEX);
                if (conv) {
                  try {
                    await conv.sayFarewell();
                  } catch {
                    // Continue even if voice fails.
                  }
                }

                if (document.pointerLockElement) document.exitPointerLock();
                interactionBus.setActive(null);
                store.finishPolyclinicCase();
                disposePatientConversation(POLYCLINIC_BED_INDEX);

                const nextId = store.pickNextCaseId();
                if (nextId) {
                  store.acceptNextPatient(nextId);
                } else {
                  store.setScreen('endConfirm');
                }
              }}
            />
          </Suspense>
        </>
      )}
    </div>
  );
}
