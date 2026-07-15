import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  exportAccountData,
  fetchAccountPreferences,
  fetchCurrentSession,
  fetchLearnerProgress,
  listServerEncounters,
  loginAccount,
  logoutAccount,
  migrateLocalAttempts,
  registerAccount,
  updateAccountPreferences,
  type AuthSession,
  type EncounterAttempt,
  type LearnerProgress,
  type UserPreferences,
} from '../agents/accountApi';
import { listEvalHistory } from '../data/evalHistory';

const LOCAL_PREFERENCES_KEY = 'medlife.preferences.v1';

const DEFAULT_PREFERENCES: UserPreferences = {
  learner_stage: 'transition_to_clinical_learning',
  non_3d_mode: false,
  low_bandwidth_mode: false,
  reduced_motion_mode: false,
  background_audio_enabled: true,
  educational_notice_acknowledged_at: null,
  research_participation_status: 'not_answered',
  research_consent_version: null,
  research_consented_at: null,
  research_withdrawn_at: null,
  deidentified_research_id: null,
  updated_at: new Date(0).toISOString(),
};

function readLocalPreferences(): UserPreferences {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(LOCAL_PREFERENCES_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    return { ...DEFAULT_PREFERENCES, ...(JSON.parse(raw) as Partial<UserPreferences>) };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function writeLocalPreferences(next: UserPreferences): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LOCAL_PREFERENCES_KEY, JSON.stringify(next));
}

type PreferenceUpdate = Partial<
  Omit<
    UserPreferences,
    'updated_at' | 'research_consent_version' | 'research_consented_at' | 'research_withdrawn_at' | 'deidentified_research_id'
  >
>;

interface AuthContextValue {
  session: AuthSession | null;
  loading: boolean;
  error: string | null;
  sessionNotice: string | null;
  serverAttempts: EncounterAttempt[];
  progress: LearnerProgress | null;
  preferences: UserPreferences;
  refresh: () => Promise<void>;
  savePreferences: (input: PreferenceUpdate) => Promise<void>;
  login: (input: { email: string; password: string }) => Promise<void>;
  register: (input: { email: string; display_name: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  exportData: () => Promise<void>;
  migrateLocalHistory: () => Promise<void>;
  migrationAvailable: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  loading: true,
  error: null,
  sessionNotice: null,
  serverAttempts: [],
  progress: null,
  preferences: DEFAULT_PREFERENCES,
  refresh: async () => undefined,
  savePreferences: async () => undefined,
  login: async () => undefined,
  register: async () => undefined,
  logout: async () => undefined,
  exportData: async () => undefined,
  migrateLocalHistory: async () => undefined,
  migrationAvailable: false,
});

async function loadAuthenticatedData(session: AuthSession | null) {
  if (!session?.authenticated) {
    return { attempts: [], progress: null as LearnerProgress | null, preferences: readLocalPreferences() };
  }
  const [attempts, progress, preferences] = await Promise.all([
    listServerEncounters(),
    fetchLearnerProgress(),
    fetchAccountPreferences(),
  ]);
  writeLocalPreferences(preferences);
  return { attempts, progress, preferences };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [serverAttempts, setServerAttempts] = useState<EncounterAttempt[]>([]);
  const [progress, setProgress] = useState<LearnerProgress | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences>(readLocalPreferences);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const preferencesRef = useRef(preferences);
  const preferenceSaveChainRef = useRef<Promise<void>>(Promise.resolve());
  const preferenceRevisionRef = useRef(0);

  useEffect(() => {
    preferencesRef.current = preferences;
  }, [preferences]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.reducedMotion = preferences.reduced_motion_mode ? 'true' : 'false';
  }, [preferences.reduced_motion_mode]);

  const refresh = async () => {
    setLoading(true);
    try {
      const wasAuthenticated = !!session?.authenticated;
      const nextSession = await fetchCurrentSession();
      setSession(nextSession);
      const data = await loadAuthenticatedData(nextSession);
      setServerAttempts(data.attempts);
      setProgress(data.progress);
      setPreferences(data.preferences);
      setError(null);
      setSessionNotice(wasAuthenticated && !nextSession.authenticated ? 'Your secure session expired. Please sign in again.' : null);
    } catch (err) {
      setSession({ authenticated: false, user: null, session_expires_at: null });
      setServerAttempts([]);
      setProgress(null);
      setPreferences(readLocalPreferences());
      setError(err instanceof Error ? err.message : String(err));
      setSessionNotice(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const login = async (input: { email: string; password: string }) => {
    setLoading(true);
    try {
      const nextSession = await loginAccount(input);
      setSession(nextSession);
      const data = await loadAuthenticatedData(nextSession);
      setServerAttempts(data.attempts);
      setProgress(data.progress);
      setPreferences(data.preferences);
      setError(null);
      setSessionNotice(null);
    } finally {
      setLoading(false);
    }
  };

  const register = async (input: { email: string; display_name: string; password: string }) => {
    setLoading(true);
    try {
      const nextSession = await registerAccount(input);
      setSession(nextSession);
      const data = await loadAuthenticatedData(nextSession);
      setServerAttempts(data.attempts);
      setProgress(data.progress);
      setPreferences(data.preferences);
      setError(null);
      setSessionNotice(null);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await logoutAccount();
      setSession({ authenticated: false, user: null, session_expires_at: null });
      setServerAttempts([]);
      setProgress(null);
      setPreferences(readLocalPreferences());
      setError(null);
      setSessionNotice(null);
    } finally {
      setLoading(false);
    }
  };

  const exportData = async () => {
    const result = await exportAccountData();
    const url = URL.createObjectURL(result.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = result.filename || 'medlife-export.json';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const migrateLocalHistory = async () => {
    const localEntries = listEvalHistory();
    if (localEntries.length === 0) return;
    setLoading(true);
    try {
      await migrateLocalAttempts(localEntries);
      const [nextAttempts, nextProgress] = await Promise.all([
        listServerEncounters(),
        fetchLearnerProgress(),
      ]);
      setServerAttempts(nextAttempts);
      setProgress(nextProgress);
      setError(null);
    } finally {
      setLoading(false);
    }
  };

  const savePreferences = async (input: PreferenceUpdate) => {
    const nextRevision = preferenceRevisionRef.current + 1;
    preferenceRevisionRef.current = nextRevision;
    const optimistic: UserPreferences = {
      ...preferencesRef.current,
      ...input,
      updated_at: new Date().toISOString(),
    };
    writeLocalPreferences(optimistic);
    preferencesRef.current = optimistic;
    setPreferences(optimistic);
    if (session?.authenticated) {
      const requestRevision = nextRevision;
      const request = preferenceSaveChainRef.current.then(async () => {
        const latest = preferencesRef.current;
        const updated = await updateAccountPreferences({
          learner_stage: latest.learner_stage,
          non_3d_mode: latest.non_3d_mode,
          low_bandwidth_mode: latest.low_bandwidth_mode,
          reduced_motion_mode: latest.reduced_motion_mode,
          background_audio_enabled: latest.background_audio_enabled,
          educational_notice_acknowledged_at: latest.educational_notice_acknowledged_at ?? null,
          research_participation_status: latest.research_participation_status,
        });
        if (requestRevision !== preferenceRevisionRef.current) {
          return;
        }
        writeLocalPreferences(updated);
        preferencesRef.current = updated;
        setPreferences(updated);
      });
      preferenceSaveChainRef.current = request.catch(() => undefined);
      await request;
      return;
    }
  };

  const migrationAvailable = useMemo(() => {
    return !!session?.authenticated && listEvalHistory().length > 0;
  }, [session?.authenticated]);

  const value = useMemo(
    () => ({
      session,
      loading,
      error,
      sessionNotice,
      serverAttempts,
      progress,
      preferences,
      refresh,
      savePreferences,
      login,
      register,
      logout,
      exportData,
      migrateLocalHistory,
      migrationAvailable,
    }),
    [session, loading, error, sessionNotice, serverAttempts, progress, preferences, migrationAvailable],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
