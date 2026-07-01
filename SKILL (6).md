{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "rubric-brief.schema.json",
  "title": "RubricBrief",
  "description": "Optional input that biases the medkit-rubric-author skill. The case_id is the only required field — everything else nudges the rubric toward a particular teaching emphasis.",
  "type": "object",
  "additionalProperties": false,
  "required": ["case_id"],
  "properties": {
    "case_id": {
      "type": "string",
      "description": "The id of an existing case in src/data/polyclinicPatients.ts or src/data/patients.ts. e.g. 'im-003'."
    },
    "emphasis": {
      "type": "string",
      "enum": [
        "balanced",
        "history-taking",
        "clinical-management",
        "interpersonal",
        "red-flag-pickup",
        "shared-decision-making"
      ],
      "default": "balanced",
      "description": "Which domain or skill the rubric should weight more heavily. Affects the spread of `weight` values, not which criteria appear."
    },
    "expected_global_for_competent_doctor": {
      "type": "string",
      "enum": ["satisfactory", "good", "excellent"],
      "default": "good",
      "description": "Calibration target. The rubric should be tuned so a competent doctor lands at this band."
    },
    "must_cite_recIds": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Optional allowlist — only cite from these recIds even if other recs are available. Use when scoping a rubric to a specific guideline subset."
    },
    "drop_recIds": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Optional blocklist — never cite these recIds even if they look applicable. Use to keep a rubric narrow."
    },
    "criterion_count_target": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "data_gathering":      { "type": "integer", "minimum": 3, "maximum": 10 },
        "clinical_management": { "type": "integer", "minimum": 3, "maximum": 8 },
        "interpersonal":       { "type": "integer", "minimum": 2, "maximum": 6 }
      },
      "description": "Optional target counts per domain. Defaults: 5–8 / 4–6 / 3–5."
    },
    "include_safety_netting": {
      "type": "boolean",
      "default": true,
      "description": "Set false only when the case has no realistic escalation pathway (e.g. asymptomatic incidental finding with no red flags)."
    },
    "frameworks_to_use": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": ["PLAB2", "RCGP", "NURSE", "SEGUE", "ICE", "SOCRATES", "OS-12"]
      },
      "description": "Optional whitelist of framework tags. If omitted, the author picks per-criterion."
    },
    "notes": {
      "type": "string",
      "description": "Free-form note for the author — e.g. 'this case was added for cauda equina red-flag pickup; weight that hard'."
    }
  }
}
