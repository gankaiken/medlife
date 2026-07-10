import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  fetchHealth,
  fetchRuntimeCapabilities,
  type RuntimeCapabilities,
} from '../agents/debriefApi';
export { getInteractionModeLabel } from './mode';

interface RuntimeContextValue {
  capabilities: RuntimeCapabilities;
  backendReachable: boolean;
  loading: boolean;
  lastError: string | null;
  refresh: () => Promise<void>;
}

const DEFAULT_CAPABILITIES: RuntimeCapabilities = {
  backend_available: false,
  ai_debrief_available: false,
  guided_mode_available: true,
  text_ai_patient_available: false,
  voice_backend_configured: false,
  voice_frontend_supported: false,
  live_voice_usable: false,
  ehr_demo_available: false,
  triage_available: false,
  persistence_mode: 'local_storage',
};

const RuntimeContext = createContext<RuntimeContextValue>({
  capabilities: DEFAULT_CAPABILITIES,
  backendReachable: false,
  loading: true,
  lastError: null,
  refresh: async () => undefined,
});

export function RuntimeProvider({ children }: { children: ReactNode }) {
  const [capabilities, setCapabilities] = useState<RuntimeCapabilities>(DEFAULT_CAPABILITIES);
  const [backendReachable, setBackendReachable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const [health, caps] = await Promise.all([fetchHealth(), fetchRuntimeCapabilities()]);
      setCapabilities({ ...health, ...caps });
      setBackendReachable(true);
      setLastError(null);
    } catch (error) {
      setCapabilities(DEFAULT_CAPABILITIES);
      setBackendReachable(false);
      setLastError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const value = useMemo(
    () => ({ capabilities, backendReachable, loading, lastError, refresh }),
    [capabilities, backendReachable, loading, lastError],
  );

  return <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>;
}

export function useRuntime() {
  return useContext(RuntimeContext);
}
