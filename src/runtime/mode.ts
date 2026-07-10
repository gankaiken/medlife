import type { RuntimeCapabilities } from '../agents/debriefApi';

export function getInteractionModeLabel(
  capabilities: RuntimeCapabilities,
  backendReachable: boolean,
): string {
  if (!backendReachable || !capabilities.backend_available) return 'Offline/demo fallback mode';
  if (capabilities.live_voice_usable) return 'Live voice mode';
  if (capabilities.text_ai_patient_available) return 'Text AI mode';
  return 'Guided scripted mode';
}

export function getDebriefModeLabel(
  capabilities: RuntimeCapabilities,
  backendReachable: boolean,
): string {
  if (!backendReachable || !capabilities.backend_available) return 'Offline/demo fallback mode';
  return capabilities.ai_debrief_available ? 'Text AI mode' : 'Rule-based assessment mode';
}
