# Accessibility Audit

Automated accessibility coverage is complete for the current pilot-readiness surfaces, and keyboard-only regression coverage is present in the real-browser suite. This document records software-side evidence only. It does not claim WCAG certification, and it does not replace human screen-reader, zoom, forced-colours, mobile, or specialist accessibility review.

| Surface | Automated scan | Keyboard evidence | Serious | Critical | Fixed | Exception | Manual review required | Result |
| ------- | -------------- | ----------------- | ------: | -------: | ----: | --------- | ---------------------- | ------ |
| Home | Yes | Yes | 0 | 0 | 0 | None | Screen reader, 200% zoom, forced colours, mobile, specialist review | Pass |
| Case library | Yes | Yes | 0 | 0 | 0 | None | Screen reader, 200% zoom, forced colours, mobile, specialist review | Pass |
| Prebrief | Yes | Yes | 0 | 0 | 0 | None | Screen reader, 200% zoom, forced colours, mobile, specialist review | Pass |
| Non-3D encounter | Yes | Yes | 0 | 0 | 0 | None | Screen reader, 200% zoom, forced colours, mobile, specialist review | Pass |
| Guided consultation | Yes | Yes | 0 | 0 | 0 | None | Screen reader, 200% zoom, forced colours, mobile, specialist review | Pass |
| Text AI consultation | Yes | Yes | 0 | 0 | 0 | None | Screen reader, 200% zoom, forced colours, mobile, specialist review | Pass |
| Investigation | Yes | Yes | 0 | 0 | 0 | None | Screen reader, 200% zoom, forced colours, mobile, specialist review | Pass |
| Diagnosis | Yes | Yes | 0 | 0 | 0 | None | Screen reader, 200% zoom, forced colours, mobile, specialist review | Pass |
| Debrief | Yes | Yes | 0 | 0 | 0 | None | Screen reader, 200% zoom, forced colours, mobile, specialist review | Pass |
| Reflection | Yes | Yes | 0 | 0 | 0 | None | Screen reader, 200% zoom, forced colours, mobile, specialist review | Pass |
| History | Yes | Yes | 0 | 0 | 0 | None | Screen reader, 200% zoom, forced colours, mobile, specialist review | Pass |
| Consent | Yes | Yes | 0 | 0 | 0 | None | Screen reader, 200% zoom, forced colours, mobile, specialist review | Pass |
| Educator workspace | Yes | Yes | 0 | 0 | 0 | None | Screen reader, 200% zoom, forced colours, mobile, specialist review | Pass |
| Curriculum review | Yes | Yes | 0 | 0 | 0 | None | Screen reader, 200% zoom, forced colours, mobile, specialist review | Pass |
| Clinical review | Yes | Yes | 0 | 0 | 0 | None | Screen reader, 200% zoom, forced colours, mobile, specialist review | Pass |
| Research export | Yes | Yes | 0 | 0 | 0 | None | Screen reader, 200% zoom, forced colours, mobile, specialist review | Pass |

## Coverage Basis

- Automated scan groups:
  - `accessibility learner foundation group covers home, case library, and prebrief`
  - `accessibility clinical workflow group covers non-3d encounter through management controls`
  - `accessibility history and debrief group covers live, historical, unavailable, and error states`
  - `accessibility educator and review group covers attempt review and reviewer workflows`
  - `accessibility consent and export group covers research consent, analytics, and export surfaces`
- Keyboard evidence:
  - Enter/Space activation is exercised for core learner and history navigation flows.
  - Preference toggles, learner-stage selection, case opening, history reopening, and non-3D workflow completion are covered in browser tests.
- Automated threshold:
  - No unresolved serious automated violations remained in the grouped scans.
  - No unresolved critical automated violations remained in the grouped scans.

## Manual Accessibility Limitations

- Human screen-reader testing remains outstanding.
- Manual 200% zoom verification remains outstanding.
- Forced-colours or high-contrast manual verification remains outstanding.
- Mobile manual accessibility evaluation remains outstanding.
- Specialist accessibility review remains outstanding.

## Status

- Automated accessibility coverage completed.
- Keyboard coverage completed.
- Manual screen-reader work remains outstanding.
- No WCAG certification is claimed.
