import { useEffect, useMemo, useState } from 'react';
import { TopBar } from './primitives';
import { store } from '../game/store';
import {
  listEvalHistory,
  deleteEvalHistory,
  getEvalHistoryHealth,
  type EvalHistoryEntry,
  saveEvalHistory,
} from '../data/evalHistory';
import { useAuth } from '../runtime/AuthProvider';
import { useEncounterSync } from '../runtime/EncounterSyncProvider';
import { deleteServerEncounter, mapServerAttemptToEvalHistoryEntry } from '../agents/accountApi';

const VERDICT_COLOR: Record<string, string> = {
  excellent: 'var(--mint)',
  good: 'var(--mint)',
  satisfactory: 'var(--butter)',
  borderline: 'var(--peach)',
  'clear-fail': 'var(--rose)',
};

const ENGINE_LABEL: Record<EvalHistoryEntry['engine'], string> = {
  ai: 'AI debrief',
  rule_based: 'Rule-based assessment',
  saved: 'Saved review',
  unavailable: 'Unavailable',
};

function formatDate(value: string): string {
  const date = new Date(value);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function HistoryScreen() {
  const { session, serverAttempts, refresh: refreshAuth } = useAuth();
  const { hydrateFromServerAttempt } = useEncounterSync();
  const [history, setHistory] = useState<EvalHistoryEntry[]>([]);
  const [healthMessage, setHealthMessage] = useState<string | null>(null);
  const [healthStatus, setHealthStatus] = useState<'ok' | 'empty' | 'partially_recovered' | 'corrupted'>('empty');

  const refresh = () => {
    const local = listEvalHistory();
    const remote = session?.authenticated
      ? serverAttempts
          .map((item) => mapServerAttemptToEvalHistoryEntry(item))
          .filter((item): item is EvalHistoryEntry => item !== null)
      : [];
    setHistory(session?.authenticated ? remote : local);
    const health = getEvalHistoryHealth();
    setHealthMessage(health.message);
    setHealthStatus(health.status);
  };

  useEffect(() => {
    refresh();
  }, [session?.authenticated, serverAttempts]);

  const summary = useMemo(() => {
    const total = history.length;
    const byEngine = history.reduce<Record<string, number>>((acc, item) => {
      acc[item.engine] = (acc[item.engine] ?? 0) + 1;
      return acc;
    }, {});
    return { total, byEngine };
  }, [history]);

  return (
    <div className="screen" style={{ background: 'var(--cream)', overflowY: 'auto' }}>
      <TopBar here={1} steps={['Profile', 'History']} />
      <div style={{ padding: '28px 36px', maxWidth: 1080, margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginBottom: 18,
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h1 style={{ fontSize: 36, marginBottom: 4 }}>Training history</h1>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-2)' }}>
              {session?.authenticated
                ? 'Signed-in history comes from server-stored learner records. Anonymous/local attempts stay separate until you import them.'
                : 'Every completed attempt saved from the shared local review log used by Home and Debrief.'}
            </div>
          </div>
          <button
            type="button"
            className="btn-plush ghost"
            style={{ fontSize: 13, padding: '8px 14px' }}
            onClick={() => store.setScreen('home')}
            data-testid="history-back-home"
          >
            Back to dashboard
          </button>
        </div>

        {healthMessage && (
          <div
            className="plush"
            style={{
              padding: 14,
              marginBottom: 18,
              background: healthStatus === 'corrupted' ? 'var(--rose)' : 'var(--butter)',
            }}
            data-testid="history-recovery-banner"
          >
            <div style={{ fontWeight: 900, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.06em' }}>
              Saved history notice
            </div>
            <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700 }}>{healthMessage}</div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
          <span className="chip butter">{summary.total} attempt{summary.total === 1 ? '' : 's'}</span>
          <span className="chip">{summary.byEngine.ai ?? 0} AI</span>
          <span className="chip">{summary.byEngine.rule_based ?? 0} rule-based</span>
          <span className="chip">{session?.authenticated ? 'Server records' : 'Local records'}</span>
        </div>

        {session?.authenticated && serverAttempts.some((item) => item.status === 'in_progress') && (
          <div className="plush" style={{ padding: 16, marginBottom: 18 }} data-testid="history-in-progress">
            <div style={{ fontWeight: 900, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
              In-progress encounters
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {serverAttempts.filter((item) => item.status === 'in_progress').map((item) => (
                <div key={String(item.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'var(--cream)', border: '2.5px solid var(--line)', borderRadius: 12, padding: '10px 12px' }}>
                  <div>
                    <div style={{ fontWeight: 800 }}>{String(item.case_name ?? item.case_id)}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>{formatDate(String(item.last_activity_at))}</div>
                  </div>
                  <button type="button" className="btn-plush ghost" onClick={() => hydrateFromServerAttempt(item)} data-testid={`history-resume-${String(item.id)}`}>
                    Resume
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {history.length === 0 ? (
          <div className="plush" style={{ padding: 24, textAlign: 'center' }} data-testid="history-empty">
            <div style={{ fontSize: 20, fontWeight: 900 }}>No saved attempts yet</div>
            <div style={{ marginTop: 6, fontSize: 14, fontWeight: 600, color: 'var(--ink-2)' }}>
              Finish a case and your debrief will appear here automatically.
            </div>
          </div>
        ) : (
          <div className="plush" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="history-attempts">
            {history.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '46px 1fr 150px 160px 30px',
                  gap: 12,
                  alignItems: 'center',
                  padding: '10px 12px',
                  background: 'white',
                  border: '2.5px solid var(--line)',
                  borderRadius: 14,
                  boxShadow: '0 2px 0 var(--line)',
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    background: VERDICT_COLOR[item.verdict] ?? 'var(--cream-2)',
                    border: '2.5px solid var(--line)',
                    boxShadow: '0 2px 0 var(--line)',
                  }}
                />
                <div
                  className="tap"
                  onClick={() => {
                    const server = session?.authenticated
                      ? serverAttempts.find((attempt) => String(attempt.id) === item.id)
                      : null;
                    const mapped = server ? mapServerAttemptToEvalHistoryEntry(server) : item;
                    if (mapped) {
                      saveEvalHistory(mapped);
                      store.viewEvalHistory(mapped.id);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      const server = session?.authenticated
                        ? serverAttempts.find((attempt) => String(attempt.id) === item.id)
                        : null;
                      const mapped = server ? mapServerAttemptToEvalHistoryEntry(server) : item;
                      if (mapped) {
                        saveEvalHistory(mapped);
                        store.viewEvalHistory(mapped.id);
                      }
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open history attempt ${item.caseName}`}
                  style={{ cursor: 'pointer' }}
                  data-testid={`history-attempt-${item.id}`}
                >
                  <div style={{ fontWeight: 900, fontSize: 15 }}>
                    {item.caseName} <span style={{ fontWeight: 700, color: 'var(--ink-2)' }}>· {item.caseAge}{item.caseGender}</span>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>
                    {item.diagnosisLabel}
                  </div>
                </div>
                <span className="chip" style={{ background: VERDICT_COLOR[item.verdict] ?? 'white', justifySelf: 'start' }}>
                  {item.verdict}
                </span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800 }}>{ENGINE_LABEL[item.engine]}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-2)' }}>{formatDate(item.savedAt)}</div>
                </div>
                <button
                  type="button"
                  title="Delete attempt"
                  onClick={() => {
                    void (async () => {
                      if (session?.authenticated) {
                        await deleteServerEncounter(item.id);
                        await refreshAuth();
                      } else {
                        deleteEvalHistory(item.id);
                      }
                      refresh();
                    })();
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--ink-2)',
                    cursor: 'pointer',
                    fontSize: 16,
                    fontWeight: 900,
                    fontFamily: 'inherit',
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
