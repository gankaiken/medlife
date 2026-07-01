{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Variant brief",
  "description": "Inputs to the case-generator skill. Defines which slice of the disease space we want a case for. 5–10 distinct variants per condition is the target.",
  "type": "object",
  "required": ["age_band", "duration", "control_quality", "compliance"],
  "properties": {
    "age_band": {
      "enum": ["paediatric", "young_adult", "middle_age", "elderly"],
      "description": "paediatric <18, young_adult 18-39, middle_age 40-64, elderly 65+"
    },
    "duration": {
      "enum": ["first_presentation", "recent_dx_under_1y", "established_1to5y", "established_5to10y", "established_over_10y"]
    },
    "control_quality": {
      "enum": ["well_controlled", "moderate", "poor"],
      "description": "Only meaningful for chronic conditions; for acute encounters set to whatever fits or omit"
    },
    "compliance": {
      "enum": ["good", "moderate", "poor"],
      "description": "Patient's adherence to prior recommendations / medications"
    },
    "comorbidities": {
      "type": "array",
      "items": { "type": "string" },
      "description": "ICD-10 or condition slug list — e.g. ['type-2-diabetes', 'ckd-stage-3']"
    },
    "complication": {
      "type": "string",
      "description": "Optional: a layered complication driving the consultation. E.g. 'superimposed-aki', 'medication-overuse-headache', 'pregnancy', 'none'"
    },
    "presenting_complaint_severity": {
      "enum": ["mild", "moderate", "severe"],
      "description": "Drives urgency. Severe in GP scope often means we should suggest ED referral."
    },
    "tone": {
      "enum": ["stoic", "anxious", "talkative", "minimising", "pleasant", "guarded"],
      "description": "Patient demeanor — propagates into hidden.personality"
    },
    "locale": {
      "type": "string",
      "default": "TR",
      "description": "ISO country code — drives demographics, names, and any locale-specific guideline preference"
    }
  }
}
