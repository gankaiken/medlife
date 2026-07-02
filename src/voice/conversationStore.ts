import type { PatientCase } from '../game/types';
import { PatientConversation } from './conversation';

const conversations = new Map<number, PatientConversation>();

export function getOrCreatePatientConversation(
  bedIndex: number,
  patient: PatientCase,
  listeners?: Parameters<PatientConversation['setListeners']>[0],
): PatientConversation {
  let conv = conversations.get(bedIndex);
  if (!conv) {
    conv = new PatientConversation(patient);
    conversations.set(bedIndex, conv);
  }
  conv.setListeners(listeners ?? null);
  return conv;
}

export function getExistingConversation(bedIndex: number): PatientConversation | null {
  return conversations.get(bedIndex) ?? null;
}

export function disposePatientConversation(bedIndex: number): void {
  const conv = conversations.get(bedIndex);
  if (!conv) return;
  conv.dispose();
  conversations.delete(bedIndex);
}
