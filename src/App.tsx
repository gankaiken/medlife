import { lazy, Suspense, useEffect } from 'react';
import { store, useGameState, useScreen, useTweaks } from './game/store';
import { applyIntensity, applyPalette } from './styles/palettes';
import { SplashScreen } from './components/SplashScreen';
import { OnboardingScreen } from './components/OnboardingScreen';
import { HomeScreen } from './components/HomeScreen';
import { ModeSelectScreen } from './components/ModeSelectScreen';
import { GPRoomScreen } from './components/GPRoomScreen';
import { CaseLibraryScreen } from './components/CaseLibraryScreen';
import { BriefScreen } from './components/BriefScreen';
import { EndConfirmScreen } from './components/EndConfirmScreen';
import { DebriefScreen } from './components/DebriefScreen';
import { HistoryScreen } from './components/HistoryScreen';
import { EducatorWorkspaceScreen } from './components/EducatorWorkspaceScreen';
import { AgenticRoundsScreen } from './components/AgenticRoundsScreen';
import { AgentTopologyScreen } from './components/AgentTopologyScreen';
import { BackgroundMusic } from './components/BackgroundMusic';
import { RuntimeProvider, useRuntime } from './runtime/RuntimeProvider';
import { AuthProvider, useAuth } from './runtime/AuthProvider';
import { EncounterSyncProvider } from './runtime/EncounterSyncProvider';

const EncounterScreen = lazy(() =>
  import('./components/EncounterScreen').then((mod) => ({ default: mod.EncounterScreen })),
);

function parseAppLocation(pathname: string) {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  const historicalMatch = normalized.match(/^\/history\/([^/]+)\/debrief$/);
  if (historicalMatch) {
    return { screen: 'debrief' as const, encounterId: decodeURIComponent(historicalMatch[1]) };
  }
  if (normalized === '/history') {
    return { screen: 'history' as const, encounterId: null };
  }
  if (normalized === '/agentic-rounds') {
    return { screen: 'agenticRounds' as const, encounterId: null };
  }
  if (normalized === '/agent-topology') {
    return { screen: 'agentTopology' as const, encounterId: null };
  }
  return { screen: null, encounterId: null };
}

function desiredPathForState(screen: ReturnType<typeof useScreen>, viewedEvalHistoryId: string | null) {
  if (screen === 'debrief' && viewedEvalHistoryId) {
    return `/history/${encodeURIComponent(viewedEvalHistoryId)}/debrief`;
  }
  if (screen === 'history') {
    return '/history';
  }
  if (screen === 'agenticRounds') {
    return '/agentic-rounds';
  }
  if (screen === 'agentTopology') {
    return '/agent-topology';
  }
  return '/';
}

function AppShell() {
  const screen = useScreen();
  const { viewedEvalHistoryId } = useGameState();
  const tweaks = useTweaks();
  const { loading: runtimeLoading } = useRuntime();
  const { loading: authLoading } = useAuth();
  const appReady = !runtimeLoading && !authLoading;

  useEffect(() => {
    applyPalette(tweaks.palette);
  }, [tweaks.palette]);

  useEffect(() => {
    applyIntensity(tweaks.intensity);
  }, [tweaks.intensity]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const applyLocation = () => {
      const route = parseAppLocation(window.location.pathname);
      if (route.screen === 'debrief' && route.encounterId) {
        store.viewEvalHistory(route.encounterId);
      } else if (route.screen === 'history') {
        store.openHistory();
      } else if (route.screen === 'agenticRounds') {
        store.setScreen('agenticRounds');
      } else if (route.screen === 'agentTopology') {
        store.setScreen('agentTopology');
      }
    };
    applyLocation();
    window.addEventListener('popstate', applyLocation);
    return () => window.removeEventListener('popstate', applyLocation);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const nextPath = desiredPathForState(screen, viewedEvalHistoryId);
    const currentPath = window.location.pathname || '/';
    if (currentPath !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }
  }, [screen, viewedEvalHistoryId]);

  return (
    <div className="app" data-screen={screen}>
      {appReady && (
        <div
          data-testid="app-ready"
          data-screen={screen}
          style={{ display: 'none' }}
        />
      )}
      {screen === 'splash' && <SplashScreen />}
      {screen === 'onboarding' && <OnboardingScreen />}
      {screen === 'home' && <HomeScreen />}
      {screen === 'mode' && <ModeSelectScreen />}
      {screen === 'gpRoom' && <GPRoomScreen />}
      {screen === 'library' && <CaseLibraryScreen />}
      {screen === 'brief' && <BriefScreen />}
      {screen === 'encounter' && (
        <Suspense fallback={<div className="screen paper" style={{ display: 'grid', placeItems: 'center' }}>Loading encounter...</div>}>
          <EncounterScreen />
        </Suspense>
      )}
      {screen === 'endConfirm' && <EndConfirmScreen />}
      {screen === 'debrief' && <DebriefScreen />}
      {screen === 'history' && <HistoryScreen />}
      {screen === 'educatorWorkspace' && <EducatorWorkspaceScreen />}
      {screen === 'agenticRounds' && <AgenticRoundsScreen />}
      {screen === 'agentTopology' && <AgentTopologyScreen />}
      <BackgroundMusic />
    </div>
  );
}

export default function App() {
  return (
    <RuntimeProvider>
      <AuthProvider>
        <EncounterSyncProvider>
          <AppShell />
        </EncounterSyncProvider>
      </AuthProvider>
    </RuntimeProvider>
  );
}
