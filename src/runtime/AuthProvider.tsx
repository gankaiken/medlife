import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  exportAccountData,
  fetchCurrentSession,
  fetchLearnerProgress,
  listServerEncounters,
  loginAccount,
  logoutAccount,
  migrateLocalAttempts,
  registerAccount,
  type AuthSession,
  type EncounterAttempt,
  type LearnerProgress,
} from '../agents/accountApi';
import { listEvalHistory } from '../data/evalHistory';

interface AuthContextValue {
  session: AuthSession | null;
  loading: boolean;
  error: string | null;
  sessionNotice: string | null;
  serverAttempts: EncounterAttempt[];
  progress: LearnerProgress | null;
  refresh: () => Promise<void>;
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
  refresh: async () => undefined,
  login: async () => undefined,
  register: async () => undefined,
  logout: async () => undefined,
  exportData: async () => undefined,
  migrateLocalHistory: async () => undefined,
  migrationAvailable: false,
});

async function loadAuthenticatedData(session: AuthSession | null) {
  if (!session?.authenticated) {
    return { attempts: [], progress: null as LearnerProgress | null };
  }
  const [attempts, progress] = await Promise.all([listServerEncounters(), fetchLearnerProgress()]);
  return { attempts, progress };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [serverAttempts, setServerAttempts] = useState<EncounterAttempt[]>([]);
  const [progress, setProgress] = useState<LearnerProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const wasAuthenticated = !!session?.authenticated;
      const nextSession = await fetchCurrentSession();
      setSession(nextSession);
      const data = await loadAuthenticatedData(nextSession);
      setServerAttempts(data.attempts);
      setProgress(data.progress);
      setError(null);
      setSessionNotice(wasAuthenticated && !nextSession.authenticated ? 'Your secure session expired. Please sign in again.' : null);
    } catch (err) {
      setSession({ authenticated: false, user: null, session_expires_at: null });
      setServerAttempts([]);
      setProgress(null);
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
      const imported = await migrateLocalAttempts(localEntries);
      setServerAttempts(imported);
      const nextProgress = await fetchLearnerProgress();
      setProgress(nextProgress);
      setError(null);
    } finally {
      setLoading(false);
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
      refresh,
      login,
      register,
      logout,
      exportData,
      migrateLocalHistory,
      migrationAvailable,
    }),
    [session, loading, error, sessionNotice, serverAttempts, progress, migrationAvailable],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
