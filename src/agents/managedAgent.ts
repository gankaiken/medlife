/**
 * Round 1 contract wrapper for the debrief backend.
 *
 * Older repository snapshots referenced a larger Managed Sessions / SSE
 * surface. The current frontend no longer depends on that contract.
 * Instead, one completed encounter is posted to `/agent/debrief`, and the
 * backend returns either an AI-generated or rule-based structured
 * evaluation.
 */

export {
  fetchHealth,
  fetchRuntimeCapabilities,
  generateDebrief,
  type DebriefResponse,
  type RuntimeCapabilities,
  type AssessmentEngine,
} from './debriefApi';
