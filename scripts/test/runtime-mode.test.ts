import test from 'node:test';
import assert from 'node:assert/strict';
import { getDebriefModeLabel, getInteractionModeLabel } from '../../src/runtime/mode.ts';
import { getDiagnosisSelectionMessage } from '../../src/components/diagnosisState.ts';

test('interaction mode falls back to offline when backend is unreachable', () => {
  const label = getInteractionModeLabel(
    {
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
    },
    false,
  );
  assert.equal(label, 'Offline/demo fallback mode');
});

test('interaction mode stays guided when backend is reachable and no live AI patient is exposed', () => {
  const label = getInteractionModeLabel(
    {
      backend_available: true,
      ai_debrief_available: true,
      guided_mode_available: true,
      text_ai_patient_available: false,
      voice_backend_configured: true,
      voice_frontend_supported: false,
      live_voice_usable: false,
      ehr_demo_available: true,
      triage_available: true,
      persistence_mode: 'local_storage',
    },
    true,
  );
  assert.equal(label, 'Guided scripted mode');
});

test('interaction mode only advertises live voice when learner-facing voice is usable', () => {
  const label = getInteractionModeLabel(
    {
      backend_available: true,
      ai_debrief_available: true,
      guided_mode_available: true,
      text_ai_patient_available: false,
      voice_backend_configured: true,
      voice_frontend_supported: true,
      live_voice_usable: true,
      ehr_demo_available: false,
      triage_available: false,
      persistence_mode: 'local_storage',
    },
    true,
  );
  assert.equal(label, 'Live voice mode');
});

test('debrief mode label reports text AI when backend AI is available', () => {
  const label = getDebriefModeLabel(
    {
      backend_available: true,
      ai_debrief_available: true,
      guided_mode_available: true,
      text_ai_patient_available: false,
      voice_backend_configured: false,
      voice_frontend_supported: false,
      live_voice_usable: false,
      ehr_demo_available: true,
      triage_available: true,
      persistence_mode: 'local_storage',
    },
    true,
  );
  assert.equal(label, 'Text AI mode');
});

test('debrief mode label reports fallback mode when backend AI is unavailable', () => {
  const label = getDebriefModeLabel(
    {
      backend_available: true,
      ai_debrief_available: false,
      guided_mode_available: true,
      text_ai_patient_available: false,
      voice_backend_configured: false,
      voice_frontend_supported: false,
      live_voice_usable: false,
      ehr_demo_available: false,
      triage_available: false,
      persistence_mode: 'local_storage',
    },
    true,
  );
  assert.equal(label, 'Rule-based assessment mode');
});

test('diagnosis selection message does not reveal correctness', () => {
  const message = getDiagnosisSelectionMessage('Tension headache');
  assert.match(message, /Diagnosis locked in:/);
  assert.doesNotMatch(message, /correct diagnosis|spot on|not quite/i);
});
