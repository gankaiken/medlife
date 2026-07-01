import { useEffect } from 'react';
import { store, useScreen, useTweaks } from './game/store';
import { applyIntensity, applyPalette } from './styles/palettes';
import { SplashScreen } from './components/SplashScreen';
import { OnboardingScreen } from './components/OnboardingScreen';
import { HomeScreen } from './components/HomeScreen';
import { ModeSelectScreen } from './components/ModeSelectScreen';
import { GPRoomScreen } from './components/GPRoomScreen';
import { CaseLibraryScreen } from './components/CaseLibraryScreen';
import { BriefScreen } from './components/BriefScreen';
import { EncounterScreen } from './components/EncounterScreen';
import { EndConfirmScreen } from './components/EndConfirmScreen';
import { DebriefScreen } from './components/DebriefScreen';
import { HistoryScreen } from './components/HistoryScreen';
import { AgenticRoundsScreen } from './components/AgenticRoundsScreen';
import { AgentTopologyScreen } from './components/AgentTopologyScreen';
import { BackgroundMusic } from './components/BackgroundMusic';

export default function App() {
  const screen = useScreen();
  const tweaks = useTweaks();

  useEffect(() => {
    applyPalette(tweaks.palette);
  }, [tweaks.palette]);

  useEffect(() => {
    applyIntensity(tweaks.intensity);
  }, [tweaks.intensity]);

  // Minimal path-based route: /agentic-rounds boots straight into the
  // architecture page so the demo can deep-link to it.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const path = window.location.pathname.replace(/\/+$/, '');
    if (path === '/agentic-rounds') {
      store.setScreen('agenticRounds');
    } else if (path === '/agent-topology') {
      store.setScreen('agentTopology');
    }
  }, []);

  return (
    <div className="app">
      {screen === 'splash' && <SplashScreen />}
      {screen === 'onboarding' && <OnboardingScreen />}
      {screen === 'home' && <HomeScreen />}
      {screen === 'mode' && <ModeSelectScreen />}
      {screen === 'gpRoom' && <GPRoomScreen />}
      {screen === 'library' && <CaseLibraryScreen />}
      {screen === 'brief' && <BriefScreen />}
      {screen === 'encounter' && <EncounterScreen />}
      {screen === 'endConfirm' && <EndConfirmScreen />}
      {screen === 'debrief' && <DebriefScreen />}
      {screen === 'history' && <HistoryScreen />}
      {screen === 'agenticRounds' && <AgenticRoundsScreen />}
      {screen === 'agentTopology' && <AgentTopologyScreen />}
      <BackgroundMusic />
    </div>
  );
}
