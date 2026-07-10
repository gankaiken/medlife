import { useEffect, useState } from 'react';
import type { CaseEvaluationInput } from './customTools';
import type { DebriefRequest } from './debriefRequest';
import {
  generateDebrief,
  type AssessmentEngine,
} from './debriefApi';

export type DebriefStatus =
  | 'idle'
  | 'starting'
  | 'loading'
  | 'got-evaluation'
  | 'error'
  | 'aborted';

export interface UseAttendingDebriefResult {
  status: DebriefStatus;
  encounterId: string | null;
  evaluation: CaseEvaluationInput | null;
  engine: AssessmentEngine | null;
  warnings: string[];
  error: string | null;
  partialNarration: string;
  reset: () => void;
}

interface Options {
  enabled?: boolean;
}

export function useAttendingDebrief(
  request: DebriefRequest | null,
  opts: Options = {},
): UseAttendingDebriefResult {
  const enabled = opts.enabled !== false;
  const [status, setStatus] = useState<DebriefStatus>('idle');
  const [encounterId, setEncounterId] = useState<string | null>(null);
  const [evaluation, setEvaluation] = useState<CaseEvaluationInput | null>(null);
  const [engine, setEngine] = useState<AssessmentEngine | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !request) return;
    let cancelled = false;
    setStatus('starting');
    setEncounterId(request.encounter_id);
    setEvaluation(null);
    setEngine(null);
    setWarnings([]);
    setError(null);

    void (async () => {
      try {
        setStatus('loading');
        const response = await generateDebrief(request);
        if (cancelled) return;
        if (response.encounter_id !== request.encounter_id) {
          setStatus('error');
          setError('Assessment response did not match the completed encounter.');
          return;
        }
        setEvaluation(response.evaluation);
        setEngine(response.engine);
        setWarnings(response.warnings);
        setStatus('got-evaluation');
      } catch (e) {
        if (cancelled) return;
        setStatus('error');
        setError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, request]);

  return {
    status,
    encounterId,
    evaluation,
    engine,
    warnings,
    error,
    partialNarration: '',
    reset: () => {
      setStatus('idle');
      setEncounterId(null);
      setEvaluation(null);
      setEngine(null);
      setWarnings([]);
      setError(null);
    },
  };
}
