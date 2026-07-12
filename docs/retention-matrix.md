# Medlife Retention Matrix

This document separates current technical behavior from proposed policy. Proposed periods are not approved policy yet.

| Data class | Implemented technical behavior | Proposed policy | Awaiting organisational approval |
| --- | --- | --- | --- |
| User accounts | Persist in SQLite until manually removed by an operator. | Retain while learner account is active. | Yes |
| Active sessions | Persist until logout, revoke-all, expiry, or manual database cleanup. | Remove expired rows on a routine maintenance schedule. | Yes |
| Revoked sessions | Remain in SQLite after revocation. | Purge after a short operational window such as 30-90 days. | Yes |
| Draft encounters | Persist until completed or manually deleted. | Review and age out abandoned drafts after a defined support period. | Yes |
| Completed encounters | Persist in SQLite and appear in learner history/export. | Retain according to programme requirements, not indefinite by default. | Yes |
| Transcript events | Persist as encounter-event rows. | Match encounter retention unless a shorter transcript policy is approved. | Yes |
| Disclosure receipts | Persist with the encounter for evidence integrity. | Match encounter retention. | Yes |
| Assessments | Persist with completed encounters. | Match encounter retention. | Yes |
| Migrated attempts | Persist after import and are labeled as legacy evidence. | Keep while linked encounter is retained. | Yes |
| Security audit events | Persist in SQLite with non-secret metadata only. | Purge on an operational retention schedule such as 30-180 days. | Yes |
| Rate-limit records | In-memory only and lost on process restart. | Keep ephemeral only unless a shared limiter is approved later. | No |
| SQLite backups | Persist wherever operators store backup files. | Time-box backups and encrypt them before any production use. | Yes |

Notes:

- Implemented behavior today: no self-service account deletion flow exists.
- Implemented behavior today: exports exclude password hashes, session hashes, CSRF values, and audit internals.
- Proposed policy values above are suggestions for review, not approved legal or institutional commitments.
