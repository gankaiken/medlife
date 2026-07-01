---
name: medkit-interview
description: Interview the developer before building a feature or sharpening the hackathon pitch. Use when the user says "/medkit-interview", has a vague goal, or when the request could be interpreted two or more ways. Do NOT use for concrete bug fixes or typo-level edits.
---

# medkit — interview skill

When the developer's ask is vague, don't jump to code. Ask them 4–6 questions, wait for answers, then propose a one-paragraph plan and wait for approval.

## Good questions to ask (pick 4–6, adapt to the ask)

1. Who is the player at this moment? Med student on their first shift, an attending reviewing a trainee, or the trainee themselves?
2. Is this an ER (timed, critical) scenario or a polyclinic (outpatient, no deadline) scenario? They live on separate state branches in `src/game/store.ts`.
3. Does the feature need a Claude call? If so, which bucket — fast patient-persona (Haiku 4.5) or careful clinical reasoning (Opus 4.7)?
4. Is this feature visible in the submission demo video? If yes, we budget for polish; if no, keep it minimal.
5. Should this show up as a custom-tool rendered card from the Managed Agent, or as inline UI driven by the game store?
6. What's the failure mode we care most about — wrong answer, slow response, or ugly UI?
7. What's explicitly out of scope? (Write it down so the scope doesn't creep.)

## After the answers

Respond with:
- **One-paragraph plan** summarizing what you heard and what you'll build.
- **Files to touch** (specific paths).
- **What you'll NOT do** — bullet list.
- **"Approve or redirect?"**

Only start editing code after the user approves.

## When to skip this skill

- The request is a concrete bug fix with an error message.
- The request is a one-line typo or rename.
- The user says "just do it" or "no questions".
