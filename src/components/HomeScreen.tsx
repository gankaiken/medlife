import { useEffect, useState } from 'react';
import { PatientFace, TopBar } from './primitives';
import { store, useTweaks } from '../game/store';
import {
  listEvalHistory,
  deleteEvalHistory,
  getEvalHistoryHealth,
  saveEvalHistory,
  type EvalHistoryEntry,
} from '../data/evalHistory';
import { useRuntime, getInteractionModeLabel } from '../runtime/RuntimeProvider';
import { getDebriefModeLabel } from '../runtime/mode';
import { useAuth } from '../runtime/AuthProvider';
import { useEncounterSync } from '../runtime/EncounterSyncProvider';
import { deleteServerEncounter, mapServerAttemptToEvalHistoryEntry, type EncounterAttempt } from '../agents/accountApi';

const VERDICT_COLOR: Record<EvalHistoryEntry['verdict'], string> = {
  excellent: 'var(--mint)',
  good: 'var(--mint)',
  satisfactory: 'var(--butter)',
  borderline: 'var(--peach)',
  'clear-fail': 'var(--rose)',
};

const VERDICT_LABEL: Record<EvalHistoryEntry['verdict'], string> = {
  excellent: 'Excellent',
  good: 'Good',
  satisfactory: 'Satisfactory',
  borderline: 'Borderline',
  'clear-fail': 'Clear fail',
};

function relativeDate(value: number | string): string {
  const ms = typeof value === 'number' ? value : new Date(value).getTime();
  const diffMs = Date.now() - ms;
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface StatProps {
  big: string;
  sub: string;
  out?: string;
}

function Stat({ big, sub, out }: StatProps) {
  return (
    <div
      style={{
        background: 'white',
        border: '3px solid var(--line)',
        borderRadius: 14,
        padding: 12,
        boxShadow: 'var(--plush-tiny)',
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 32, lineHeight: 1, color: 'var(--ink)' }}>
        {big}
        <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>{out}</span>
      </div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: 'var(--ink-2)',
          textTransform: 'uppercase',
          letterSpacing: '.06em',
          marginTop: 4,
        }}
      >
        {sub}
      </div>
    </div>
  );
}

const VERDICT_SCORE: Record<EvalHistoryEntry['verdict'], number> = {
  'clear-fail': 1,
  borderline: 2,
  satisfactory: 3,
  good: 4,
  excellent: 5,
};

const DOMAIN_META = [
  { key: 'data_gathering' as const, label: 'Data Gathering', color: 'var(--peach)', deep: 'var(--peach-deep)' },
  { key: 'clinical_management' as const, label: 'Clinical Management', color: 'var(--mint)', deep: 'var(--mint-deep)' },
  { key: 'interpersonal' as const, label: 'Interpersonal', color: 'var(--sky)', deep: 'var(--sky-deep)' },
];

interface TrainingStats {
  count: number;
  avgRating: number;
  domains: { key: 'data_gathering' | 'clinical_management' | 'interpersonal'; label: string; pct: number; color: string; deep: string }[];
  weakest: { label: string; pct: number; deep: string } | null;
  streakDays: number;
}

function computeStats(history: EvalHistoryEntry[]): TrainingStats {
  const count = history.length;
  if (count === 0) {
    return {
      count: 0,
      avgRating: 0,
      domains: DOMAIN_META.map((d) => ({ ...d, pct: 0 })),
      weakest: null,
      streakDays: 0,
    };
  }

  const avgRating = history.reduce((sum, e) => sum + (VERDICT_SCORE[e.verdict] ?? 0), 0) / count;

  const domains = DOMAIN_META.map((d) => {
    const ratios = history
      .map((e) => {
        const ds = e.evaluation.domain_scores[d.key];
        return ds && ds.max > 0 ? ds.raw / ds.max : null;
      })
      .filter((r): r is number => r !== null);
    const pct =
      ratios.length > 0
        ? Math.round((ratios.reduce((a, b) => a + b, 0) / ratios.length) * 100)
        : 0;
    return { ...d, pct };
  });

  const weakestDomain = domains.reduce((min, d) => (d.pct < min.pct ? d : min), domains[0]);
  const weakest = { label: weakestDomain.label, pct: weakestDomain.pct, deep: weakestDomain.deep };

  const days = new Set(history.map((e) => new Date(e.savedAt).toISOString().slice(0, 10)));
  let streakDays = 0;
  const cursor = new Date();
  for (;;) {
    const key = cursor.toISOString().slice(0, 10);
    if (days.has(key)) {
      streakDays += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

  return { count, avgRating, domains, weakest, streakDays };
}

const authInputStyle: React.CSSProperties = {
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

export function HomeScreen() {
  const tweaks = useTweaks();
  const { capabilities, backendReachable } = useRuntime();
  const { session, serverAttempts, progress, login, register, logout, exportData, migrateLocalHistory, migrationAvailable, loading: authLoading, sessionNotice, refresh: refreshAuth } = useAuth();
  const { syncState, pendingCount, retrySync, hydrateFromServerAttempt } = useEncounterSync();
  const [history, setHistory] = useState<EvalHistoryEntry[]>([]);
  const [historyHealth, setHistoryHealth] = useState(getEvalHistoryHealth());
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authError, setAuthError] = useState<string | null>(null);

  const refresh = () => {
    const local = listEvalHistory();
    const remote = session?.authenticated
      ? serverAttempts
          .map((attempt) => mapServerAttemptToEvalHistoryEntry(attempt))
          .filter((item): item is EvalHistoryEntry => item !== null)
      : [];
    setHistory(session?.authenticated ? remote : local);
    setHistoryHealth(getEvalHistoryHealth());
  };

  useEffect(() => {
    refresh();
  }, [session?.authenticated, serverAttempts]);

  const onDelete = async (id: string) => {
    if (session?.authenticated) {
      await deleteServerEncounter(id);
      await refreshAuth();
      return;
    }
    deleteEvalHistory(id);
    refresh();
  };

  const stats = computeStats(history);
  const interactionMode = getInteractionModeLabel(capabilities, backendReachable);
  const debriefMode = getDebriefModeLabel(capabilities, backendReachable);
  const inProgress = session?.authenticated
    ? serverAttempts.filter((attempt) => attempt.status === 'in_progress')
    : [];

  const submitAuth = async () => {
    setAuthError(null);
    try {
      if (authMode === 'login') {
        await login({ email, password });
      } else {
        await register({ email, password, display_name: displayName || 'Medlife learner' });
      }
      setPassword('');
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      setAuthError(
        raw === 'invalid email or password'
          ? 'Sign-in failed. Check your email and password and try again.'
          : raw === 'registration unavailable'
            ? 'That account could not be created with the current details.'
            : raw === 'too many login attempts'
              ? 'Too many sign-in attempts just now. Please pause and try again shortly.'
              : raw,
      );
    }
  };

  const openReview = (entry: EvalHistoryEntry) => {
    saveEvalHistory(entry);
    store.viewEvalHistory(entry.id);
  };

  return (
    <div
      className="screen"
      style={{
        background:
          'radial-gradient(circle at top right, rgba(208,235,255,0.45), transparent 26%), linear-gradient(180deg, #eef6f8 0%, #e4f0f3 48%, #dcebee 100%)',
      }}
    >
      <TopBar here={0} steps={['Profile']} />

      <div
        style={{
          padding: '28px 36px',
          minHeight: 'calc(100vh - 67px)',
          display: 'grid',
          gridTemplateColumns: '1.4fr 1fr',
          gap: 24,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <span className="chip mint">{interactionMode}</span>
              <span className="chip sky">{debriefMode}</span>
              <span className="chip">{backendReachable ? 'Backend reachable' : 'Backend unavailable'}</span>
              <span className="chip">{session?.authenticated ? 'Signed in' : 'Signed out'}</span>
              <span className={`chip ${syncState === 'pending_sync' ? 'peach' : syncState === 'saved' ? 'mint' : 'butter'}`}>
                {syncState === 'pending_sync' ? `Pending sync ${pendingCount}` : syncState === 'saved' ? 'Server saved' : 'Local cache'}
              </span>
              <span className="chip">
                {capabilities.voice_backend_configured ? 'Voice backend configured' : 'Voice backend unavailable'}
              </span>
              <span className="chip butter">
                {capabilities.ai_debrief_available ? 'AI debrief available' : 'Rule-based fallback only'}
              </span>
            </div>
            <div
              style={{
                fontWeight: 800,
                fontSize: 12,
                color: 'var(--ink-3)',
                textTransform: 'uppercase',
                letterSpacing: '.12em',
              }}
            >
              {stats.count === 0 ? 'Orientation mode' : 'Student dashboard'}
            </div>
            <h1 style={{ fontSize: 44, lineHeight: 1.05, marginTop: 4 }}>
              {stats.count === 0 ? 'Start your Medlife training shift.' : 'Welcome back to clinical practice.'}
            </h1>
            <div style={{ fontSize: 16, color: 'var(--ink-2)', fontWeight: 600, marginTop: 6 }}>
              {stats.count === 0
                ? 'Choose an outpatient pathway, meet your first patient, and build your case log one encounter at a time.'
                : 'Track your reviews, revisit weak domains, and keep sharpening your clinical reasoning.'}
            </div>
          </div>

          <div className="plush" style={{ padding: 14, background: 'var(--cream-2)' }} data-testid="education-disclaimer">
            <div style={{ fontWeight: 900, fontSize: 12, letterSpacing: '.06em', textTransform: 'uppercase' }}>
              Educational use
            </div>
            <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: 'var(--ink-2)', lineHeight: 1.45 }}>
              Medlife is a clinical education simulator. Cases are synthetic or educational, and any AI feedback may be imperfect.
              It does not provide medical advice or replace qualified supervision.
            </div>
          </div>

          <div className="plush" style={{ padding: 16, background: session?.authenticated ? 'var(--mint)' : 'white' }} data-testid="auth-panel">
            {session?.authenticated ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 18 }}>{session.user?.display_name}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)' }}>{session.user?.email}</div>
                  <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700 }}>
                    Server-backed history and progress are active for this learner account.
                  </div>
                  <div style={{ marginTop: 4, fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>
                    Export is available. Account deletion is still unavailable in this training build.
                  </div>
                  {sessionNotice && <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700, color: 'var(--rose-deep)' }}>{sessionNotice}</div>}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {migrationAvailable && (
                    <button
                      type="button"
                      className="btn-plush ghost"
                      onClick={() => {
                        if (window.confirm('Import your anonymous local Medlife history into this account? Imported records keep their legacy integrity labels.')) {
                          void migrateLocalHistory();
                        }
                      }}
                      data-testid="migrate-local-history"
                    >
                      Import local history
                    </button>
                  )}
                  <button type="button" className="btn-plush ghost" onClick={() => void exportData()} data-testid="export-account-data">
                    Export data
                  </button>
                  {syncState === 'pending_sync' && (
                    <button type="button" className="btn-plush ghost" onClick={() => void retrySync()} data-testid="retry-sync">
                      Retry sync ({pendingCount})
                    </button>
                  )}
                  <button type="button" className="btn-plush ghost" onClick={() => void logout()} data-testid="logout-button">
                    Log out
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span className={`chip ${authMode === 'login' ? 'butter' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setAuthMode('login')}>Login</span>
                  <span className={`chip ${authMode === 'register' ? 'butter' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setAuthMode('register')}>Register</span>
                  <span className="chip">Signed-out local mode stays available</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: authMode === 'register' ? '1fr 1fr 1fr auto' : '1fr 1fr auto', gap: 8 }}>
                  {authMode === 'register' && (
                    <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name" data-testid="register-display-name" style={authInputStyle} />
                  )}
                  <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" data-testid="auth-email" style={authInputStyle} />
                  <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" data-testid="auth-password" style={authInputStyle} />
                  <button type="button" className="btn-plush primary" onClick={() => void submitAuth()} disabled={authLoading} data-testid={authMode === 'login' ? 'login-button' : 'register-button'}>
                    {authMode === 'login' ? 'Login' : 'Create account'}
                  </button>
                </div>
                {sessionNotice && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--rose-deep)' }}>{sessionNotice}</div>}
                {authError && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--rose-deep)' }}>{authError}</div>}
              </div>
            )}
          </div>

          {historyHealth.message && (
            <div
              className="plush"
              style={{
                padding: 14,
                background: historyHealth.status === 'corrupted' ? 'var(--rose)' : 'var(--butter)',
              }}
              data-testid="history-recovery-banner"
            >
              <div style={{ fontWeight: 900, fontSize: 12, letterSpacing: '.06em', textTransform: 'uppercase' }}>
                Saved history notice
              </div>
              <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700 }}>{historyHealth.message}</div>
            </div>
          )}

          {stats.count === 0 ? (
            <div
              className="plush-lg"
              style={{
                background: 'var(--cream-2)',
                padding: 18,
                position: 'relative',
                transform: 'rotate(-0.6deg)',
              }}
            >
              <div style={{ position: 'absolute', top: -12, left: 22 }} className="chip butter">
                First session
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 18,
                  alignItems: 'center',
                  background: 'white',
                  borderRadius: 18,
                  border: '3px dashed rgba(43,30,22,0.25)',
                  padding: 16,
                }}
              >
                <div className="floaty" style={{ opacity: 0.6 }}>
                  <PatientFace style={tweaks.avatarStyle} skin="#E8B68F" hair="#3B2A1F" size={120} mood="neutral" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 900, fontSize: 22 }}>No case selected yet</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-2)', marginTop: 2 }}>
                    Pick a training room and your first clinic patient will be ready for assessment.
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-plush primary"
                  style={{ fontSize: 15, padding: '14px 18px' }}
                  onClick={() => store.setScreen('mode')}
                  data-testid="start-session"
                >
                  Start session
                </button>
              </div>
            </div>
          ) : (
            <div className="plush-lg" style={{ background: 'var(--peach)', padding: 18, position: 'relative', transform: 'rotate(-0.6deg)' }}>
              <div style={{ position: 'absolute', top: -12, left: 22 }} className="chip butter">
                Continue revision
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 18,
                  alignItems: 'center',
                  background: 'white',
                  borderRadius: 18,
                  border: '3px solid var(--line)',
                  padding: 16,
                }}
              >
                <div className="floaty">
                  <PatientFace
                    style={tweaks.avatarStyle}
                    skin={history[0].caseGender === 'F' ? '#F0C4A8' : '#E8B68F'}
                    hair="#3B2A1F"
                    size={120}
                    mood="neutral"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 900, fontSize: 22 }}>
                    {history[0].caseName}, {history[0].caseAge}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-2)', marginTop: 2 }}>
                    {history[0].diagnosisLabel}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                    <span className="chip" style={{ background: VERDICT_COLOR[history[0].verdict] }}>
                      {VERDICT_LABEL[history[0].verdict]}
                    </span>
                    <span className="chip">
                      {history[0].engine === 'ai' ? 'AI debrief' : history[0].engine === 'rule_based' ? 'Rule-based assessment' : 'Saved review'}
                    </span>
                    <span className="chip">last review - {relativeDate(history[0].savedAt)}</span>
                    {stats.weakest && (
                      <span className="chip butter">focus - {stats.weakest.label.toLowerCase()}</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-plush primary"
                  style={{ fontSize: 15, padding: '14px 18px' }}
                  onClick={() => openReview(history[0])}
                  data-testid="open-latest-review"
                >
                  Open review
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            className="btn-plush mint"
            style={{ fontSize: 22, padding: '18px 0', alignSelf: 'stretch' }}
            onClick={() => store.setScreen('mode')}
            data-testid="start-new-case"
          >
            Start a new case
          </button>

          {session?.authenticated && inProgress.length > 0 && (
            <div className="plush" style={{ padding: 16 }} data-testid="resume-attempts">
              <div
                style={{
                  fontWeight: 800,
                  fontSize: 12,
                  color: 'var(--ink-2)',
                  letterSpacing: '.06em',
                  textTransform: 'uppercase',
                  marginBottom: 10,
                }}
              >
                Resume saved encounters
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {inProgress.map((attempt) => (
                  <div
                    key={String(attempt.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      background: 'var(--cream)',
                      border: '2.5px solid var(--line)',
                      borderRadius: 12,
                      padding: '10px 12px',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 800 }}>{String(attempt.case_name ?? attempt.case_id)}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>
                        Last activity {relativeDate(String(attempt.last_activity_at))}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn-plush ghost"
                      onClick={() => hydrateFromServerAttempt(attempt)}
                      data-testid={`resume-attempt-${String(attempt.id)}`}
                    >
                      Resume
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            className="btn-plush ghost"
            style={{
              fontSize: 14,
              padding: '12px 16px',
              alignSelf: 'stretch',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.history.pushState({}, '', '/agentic-rounds');
              }
              store.setScreen('agenticRounds');
            }}
            title="Architecture notes for the simulator grading flow"
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="chip butter" style={{ fontSize: 10 }}>Prototype</span>
              <span style={{ fontWeight: 800 }}>Architecture notes</span>
              <span style={{ fontWeight: 600, color: 'var(--ink-2)' }}>· how the simulator grades you</span>
            </span>
            <span style={{ fontWeight: 800, color: 'var(--ink-2)' }}>→</span>
          </button>

          <button
            type="button"
            className="btn-plush ghost"
            style={{
              fontSize: 14,
              padding: '12px 16px',
              alignSelf: 'stretch',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.history.pushState({}, '', '/agent-topology');
              }
              store.setScreen('agentTopology');
            }}
            title="Prototype topology view for the debrief architecture"
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="chip peach" style={{ fontSize: 10 }}>Planned</span>
              <span style={{ fontWeight: 800 }}>Topology view</span>
              <span style={{ fontWeight: 600, color: 'var(--ink-2)' }}>· prototype debrief internals</span>
            </span>
            <span style={{ fontWeight: 800, color: 'var(--ink-2)' }}>→</span>
          </button>

          <div className="plush" style={{ padding: 16 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  fontWeight: 800,
                  fontSize: 12,
                  color: 'var(--ink-2)',
                  letterSpacing: '.06em',
                  textTransform: 'uppercase',
                }}
              >
                Recent cases
              </div>
              <span
                style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', cursor: 'pointer' }}
                onClick={() => store.setScreen('history')}
                data-testid="open-history"
              >
                see all →
              </span>
            </div>
            {history.length === 0 ? (
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--ink-2)',
                  background: 'var(--cream)',
                  border: '2.5px dashed rgba(43,30,22,0.2)',
                  borderRadius: 12,
                  padding: '14px 16px',
                  textAlign: 'center',
                }}
              >
                No reviews yet - finish an encounter to see your debrief here.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-testid="recent-attempts">
                {history.slice(0, 6).map((r) => {
                  const color = VERDICT_COLOR[r.verdict];
                  return (
                    <div
                      key={r.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '40px 1fr 110px 80px 28px',
                        gap: 12,
                        alignItems: 'center',
                        padding: '8px 12px',
                        background: 'var(--cream)',
                        border: '2.5px solid var(--line)',
                        borderRadius: 12,
                        boxShadow: '0 2px 0 var(--line)',
                      }}
                    >
                      <div
                        className="tap"
                        onClick={() => openReview(r)}
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          background: color,
                          border: '2.5px solid var(--line)',
                          boxShadow: '0 2px 0 var(--line)',
                          cursor: 'pointer',
                        }}
                      />
                      <div className="tap" onClick={() => openReview(r)} style={{ cursor: 'pointer' }}>
                        <div style={{ fontWeight: 800, fontSize: 14 }}>
                          {r.caseName} <span style={{ fontWeight: 600, color: 'var(--ink-2)' }}>· {r.caseAge}{r.caseGender}</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--ink-2)', fontWeight: 700 }}>
                          {r.diagnosisLabel}
                        </div>
                      </div>
                      <span
                        className="tap chip"
                        onClick={() => openReview(r)}
                        style={{ background: color, fontSize: 11, cursor: 'pointer' }}
                      >
                        {VERDICT_LABEL[r.verdict]}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--ink-2)', fontWeight: 700 }}>
                        {relativeDate(r.savedAt)}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Delete review for ${r.caseName}?`)) {
                            void onDelete(r.id);
                          }
                        }}
                        title="Delete this review"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          fontSize: 16,
                          fontWeight: 800,
                          color: 'var(--ink-2)',
                          cursor: 'pointer',
                          padding: 4,
                          fontFamily: 'inherit',
                        }}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="plush" style={{ padding: 16, background: 'var(--butter)' }}>
            <div
              style={{
                fontWeight: 800,
                fontSize: 11,
                color: 'var(--ink-2)',
                letterSpacing: '.06em',
                textTransform: 'uppercase',
                marginBottom: 10,
              }}
            >
              Your training
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Stat big={stats.count > 0 ? String(stats.count) : '-'} sub="cases done" />
              <Stat
                big={session?.authenticated && progress ? String(progress.attempts_completed) : stats.count > 0 ? stats.avgRating.toFixed(1) : '-'}
                sub={session?.authenticated && progress ? 'server attempts' : 'avg rating'}
                out={session?.authenticated && progress ? '' : stats.count > 0 ? ' / 5' : ''}
              />
            </div>
            <div
              style={{
                marginTop: 12,
                background: 'white',
                border: '3px solid var(--line)',
                borderRadius: 14,
                padding: 12,
                boxShadow: 'var(--plush-tiny)',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: 'var(--ink-2)',
                  textTransform: 'uppercase',
                  letterSpacing: '.06em',
                }}
              >
                Weakest domain
              </div>
              <div style={{ fontSize: 18, fontWeight: 900, marginTop: 2 }}>
                {stats.weakest ? stats.weakest.label : '-'}
              </div>
              <div
                style={{
                  marginTop: 8,
                  height: 12,
                  background: 'var(--cream)',
                  borderRadius: 8,
                  border: '2px solid var(--line)',
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: `${stats.weakest?.pct ?? 0}%`,
                    background: stats.weakest?.deep ?? 'var(--peach-deep)',
                  }}
                />
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--ink-2)',
                }}
              >
                <span>
                  {stats.weakest ? `${stats.weakest.label} · ${stats.weakest.pct}%` : 'No reviews yet'}
                </span>
                <span>focus area</span>
              </div>
            </div>
          </div>

          <div className="plush" style={{ padding: 16 }}>
            <div
              style={{
                fontWeight: 800,
                fontSize: 11,
                color: 'var(--ink-2)',
                letterSpacing: '.06em',
                textTransform: 'uppercase',
                marginBottom: 10,
              }}
            >
              Domain progress
            </div>
            {stats.count === 0 ? (
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>
                Domain breakdown unlocks after your first saved debrief.
              </div>
            ) : (
              stats.domains.map((d) => (
                <div key={d.label} style={{ marginBottom: 10 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 12,
                      fontWeight: 800,
                      marginBottom: 4,
                    }}
                  >
                    <span>{d.label}</span>
                    <span>{d.pct}%</span>
                  </div>
                  <div
                    style={{
                      height: 14,
                      background: 'var(--cream)',
                      borderRadius: 8,
                      border: '2.5px solid var(--line)',
                      overflow: 'hidden',
                      position: 'relative',
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        width: `${d.pct}%`,
                        background: d.color,
                        borderRight: '2.5px solid var(--line)',
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>

          <div
            className="plush"
            style={{ padding: 14, background: 'var(--mint)', display: 'flex', alignItems: 'center', gap: 12 }}
          >
            <div style={{ fontSize: 22, fontWeight: 900 }} className="floaty">
              Log
            </div>
            <div>
              <div style={{ fontWeight: 900, fontSize: 14 }}>
                {stats.streakDays === 0
                  ? 'Streak: -'
                  : `Streak: ${stats.streakDays} ${stats.streakDays === 1 ? 'day' : 'days'}`}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>
                {stats.streakDays === 0
                  ? 'Finish your first case to start a streak.'
                  : 'One more case today keeps it alive.'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
