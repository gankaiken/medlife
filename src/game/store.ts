import { useSyncExternalStore } from 'react';
import { CASES } from '../data/cases.ts';
import { getPatientCase } from '../data/patients.ts';
import { CLINIC_IDS, type ClinicId } from './clinic.ts';
import type {
  ActivePatient,
  EncounterTranscriptTurn,
  EndConfirmChecks,
  GameState,
  Prescription,
  Screen,
  Tweaks,
} from './types.ts';

export const POLYCLINIC_BED_INDEX = 0;

const DEFAULT_TWEAKS: Tweaks = {
  avatarStyle: 'cute',
  palette: 'medlife',
  intensity: 'cozy',
};

const DEFAULT_END_CONFIRM: EndConfirmChecks = {
  sum: false,
  safe: false,
  ice: false,
};

const initialCaseId = CASES[0]?.id ?? 'case-headache-001';

function createEncounterId(caseId: string): string {
  const cryptoRef = globalThis.crypto;
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    return `enc-${caseId}-${cryptoRef.randomUUID()}`;
  }
  return `enc-${caseId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildInitialState(): GameState {
  return {
    screen: 'splash',
    onboardingStep: 0,
    selectedCaseId: initialCaseId,
    viewedEvalHistoryId: null,
    endConfirm: DEFAULT_END_CONFIRM,
    tweaks: DEFAULT_TWEAKS,
    lastEncounter: null,
    polyclinic: {
      clinic: 'all-specialties',
      patient: null,
    },
  };
}

let state: GameState = buildInitialState();

export function resetGameStateForTests(): void {
  state = buildInitialState();
  emit();
}

const listeners = new Set<() => void>();

function emit(): void {
  for (const cb of listeners) cb();
}

function setState(updater: (prev: GameState) => GameState): void {
  state = updater(state);
  emit();
}

function buildActivePatient(caseId: string): ActivePatient | null {
  const c = getPatientCase(caseId);
  if (!c) return null;
  return {
    encounterId: createEncounterId(caseId),
    bedIndex: POLYCLINIC_BED_INDEX,
    arrivedAt: Date.now(),
    case: c,
    askedQuestionIds: [],
    orderedTestIds: [],
    completedTestIds: [],
    viewedResultIds: [],
    testOrderedAt: {},
    givenTreatmentIds: [],
    prescriptions: [],
    submittedDiagnosisId: null,
    transcript: [],
    completedAt: null,
    endConfirm: null,
  };
}

function nextCaseIdForClinic(clinic: ClinicId, currentCaseId?: string): string | null {
  const pool = clinic === 'all-specialties'
    ? CASES
    : CASES.filter((item) => item.clinic === clinic);
  if (pool.length === 0) return null;
  if (!currentCaseId) return pool[0].id;
  const idx = pool.findIndex((item) => item.id === currentCaseId);
  return pool[(idx + 1 + pool.length) % pool.length]?.id ?? pool[0].id;
}

export const store = {
  subscribe(cb: () => void): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },

  getState(): GameState {
    return state;
  },

  setScreen(screen: Screen): void {
    setState((prev) => ({ ...prev, screen }));
  },

  beginFromSplash(): void {
    setState((prev) => ({ ...prev, screen: 'onboarding' }));
  },

  setOnboardingStep(step: number): void {
    setState((prev) => ({ ...prev, onboardingStep: Math.max(0, step) }));
  },

  finishOnboarding(): void {
    setState((prev) => ({ ...prev, screen: 'home' }));
  },

  setPolyclinicClinic(clinic: ClinicId): void {
    const fallbackCaseId = nextCaseIdForClinic(clinic) ?? prevSelectedCaseId();
    setState((prev) => ({
      ...prev,
      selectedCaseId: fallbackCaseId,
      polyclinic: { ...prev.polyclinic, clinic },
    }));
  },

  selectCase(caseId: string): void {
    setState((prev) => ({
      ...prev,
      selectedCaseId: caseId,
      screen: 'brief',
      viewedEvalHistoryId: null,
    }));
  },

  pickNextCaseId(): string | null {
    return nextCaseIdForClinic(state.polyclinic.clinic, state.selectedCaseId);
  },

  acceptNextPatient(caseId?: string): void {
    const nextId = caseId ?? this.pickNextCaseId() ?? state.selectedCaseId;
    const patient = buildActivePatient(nextId);
    setState((prev) => ({
      ...prev,
      selectedCaseId: nextId,
      polyclinic: { ...prev.polyclinic, patient },
      endConfirm: DEFAULT_END_CONFIRM,
      viewedEvalHistoryId: null,
      screen: 'brief',
    }));
  },

  loadPolyclinicPatient(caseId?: string | null): void {
    const nextId = caseId ?? state.selectedCaseId;
    const patient = buildActivePatient(nextId);
    if (!patient) return;
    setState((prev) => ({
      ...prev,
      selectedCaseId: nextId,
      polyclinic: { ...prev.polyclinic, patient },
    }));
  },

  askPolyclinicQuestion(questionId: string): void {
    mutatePatient((patient) => {
      if (!patient.askedQuestionIds.includes(questionId)) {
        patient.askedQuestionIds = [...patient.askedQuestionIds, questionId];
      }
    });
  },

  orderPolyclinicTest(testId: string): void {
    mutatePatient((patient) => {
      if (!patient.orderedTestIds.includes(testId)) {
        patient.orderedTestIds = [...patient.orderedTestIds, testId];
      }
      if (!patient.completedTestIds.includes(testId)) {
        patient.completedTestIds = [...patient.completedTestIds, testId];
      }
      patient.testOrderedAt = { ...patient.testOrderedAt, [testId]: Date.now() };
    });
  },

  submitPolyclinicDiagnosis(diagnosisId: string): void {
    mutatePatient((patient) => {
      patient.submittedDiagnosisId = diagnosisId;
    });
  },

  addPolyclinicPrescription(prescription: Prescription): void {
    mutatePatient((patient) => {
      patient.prescriptions = [...patient.prescriptions, prescription];
    });
  },

  markResultViewed(testId: string): void {
    mutatePatient((patient) => {
      if (!patient.viewedResultIds.includes(testId)) {
        patient.viewedResultIds = [...patient.viewedResultIds, testId];
      }
    });
  },

  setPatientTranscript(transcript: EncounterTranscriptTurn[]): void {
    mutatePatient((patient) => {
      patient.transcript = transcript.slice();
    });
  },

  finishPolyclinicCase(): void {
    const completedAt = Date.now();
    setState((prev) => ({
      ...prev,
      lastEncounter: prev.polyclinic.patient
        ? {
            ...prev.polyclinic.patient,
            viewedResultIds: [...prev.polyclinic.patient.viewedResultIds],
            transcript: prev.polyclinic.patient.transcript.slice(),
            prescriptions: [...prev.polyclinic.patient.prescriptions],
            askedQuestionIds: [...prev.polyclinic.patient.askedQuestionIds],
            orderedTestIds: [...prev.polyclinic.patient.orderedTestIds],
            completedTestIds: [...prev.polyclinic.patient.completedTestIds],
            givenTreatmentIds: [...prev.polyclinic.patient.givenTreatmentIds],
            testOrderedAt: { ...prev.polyclinic.patient.testOrderedAt },
            completedAt,
            endConfirm: { ...prev.endConfirm },
          }
        : null,
      polyclinic: { ...prev.polyclinic, patient: null },
    }));
  },

  toggleEndConfirm(id: keyof EndConfirmChecks): void {
    setState((prev) => ({
      ...prev,
      endConfirm: { ...prev.endConfirm, [id]: !prev.endConfirm[id] },
    }));
  },

  viewEvalHistory(id: string): void {
    setState((prev) => ({
      ...prev,
      viewedEvalHistoryId: id,
      screen: 'debrief',
    }));
  },

  clearViewedEval(): void {
    setState((prev) => ({ ...prev, viewedEvalHistoryId: null }));
  },
};

function prevSelectedCaseId(): string {
  return CASES.find((item) => CLINIC_IDS.includes(item.clinic))?.id ?? initialCaseId;
}

function mutatePatient(mutator: (patient: ActivePatient) => void): void {
  const current = state.polyclinic.patient;
  if (!current) return;
  const draft: ActivePatient = {
    ...current,
    askedQuestionIds: [...current.askedQuestionIds],
    orderedTestIds: [...current.orderedTestIds],
    completedTestIds: [...current.completedTestIds],
    viewedResultIds: [...current.viewedResultIds],
    testOrderedAt: { ...current.testOrderedAt },
    givenTreatmentIds: [...current.givenTreatmentIds],
    prescriptions: [...current.prescriptions],
    transcript: current.transcript.slice(),
    completedAt: current.completedAt ?? null,
    endConfirm: current.endConfirm ? { ...current.endConfirm } : null,
  };
  mutator(draft);
  setState((prev) => ({
    ...prev,
    polyclinic: { ...prev.polyclinic, patient: draft },
  }));
}

export function useStore<T>(selector: (snapshot: GameState) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState()),
  );
}

export function useGameState(): GameState {
  return useStore((snapshot) => snapshot);
}

export function useScreen(): Screen {
  return useStore((snapshot) => snapshot.screen);
}

export function useTweaks(): Tweaks {
  return useStore((snapshot) => snapshot.tweaks);
}
