---
name: medkit-demo-video
description: Produce or iterate on the hackathon submission demo video. Use when the user asks to "make the demo", "work on the video", "record a walkthrough", produce a Loom/OBS export, generate narration, or touch anything under `video/` or `docs/design-system.html`. This is the last-day polish skill — don't use it before the product functionality is locked.
---

# medkit — demo video skill

The submission video is weighted heavily in judging ("Demo: is it impressive and cool to watch?"). Don't wing this — follow Tharek's HTML-design-system + Remotion pattern that Anthropic themselves use for launch videos.

## When to invoke

- User says "make the demo video".
- Day of submission (Saturday or Sunday). Not before.
- If product bugs are still being fixed, suggest finishing those first — the video locks screen capture that'll have to be re-shot.

## The 90-second beat sheet

Timings from `spec.md`. Don't negotiate them down — 90 s is the sweet spot for judges scrubbing through a lot of submissions.

1. Patient walks into the polyclinic 3D scene (8 s).
2. Doctor starts a voice conversation (20 s) — show waveform + transcript overlay.
3. Order tests + results land (15 s).
4. The `medkit-attending` Managed Agent surfaces a `render_triage_badge` card in real time (15 s) — this is the most valuable shot, it demonstrates Managed Agents + custom tools + Opus 4.7 in one frame.
5. Submit diagnosis, agent grades with `render_case_grade` (12 s).
6. `/loop` verification log rolling by in a corner (5 s) — proves long-running work.
7. Final title card with team name + GitHub URL (5 s).

## Workflow

### 1. Extract the design system (first, once)

Point Claude Code at the running dev server and have it generate `docs/design-system.html` capturing:
- Colour palette (hex values from the app's actual styles — check `src/styles/*.css`).
- Typography scale (font family, sizes, weights).
- Card styles, buttons, badges, chips.
- Any distinctive backgrounds or glass effects from the polyclinic UI.

This HTML becomes the reference the video project imports.

### 2. Scaffold the Remotion project

Under `video/remotion/`:
- `package.json` with `@remotion/cli` and `remotion`.
- `src/Root.tsx` registering each beat as a `<Composition>`.
- `src/Beat1Arrival.tsx`, `src/Beat2Voice.tsx`, … one per scene.
- `src/shared/styles.ts` pulling from `docs/design-system.html` values (not imported HTML — just lift the tokens).

Do not add Remotion to the main `package.json`. It's a sibling project so its deps don't bloat the main app.

### 3. Record live footage

Use Loom, OBS, or Cap.so. Capture:
- Polyclinic scene from multiple angles.
- Voice conversation (screen + microphone).
- Managed Agent card rendering in `<ManagedAgentPanel>`.
- A long `/loop` run — even if you have to speed it up 10× in Remotion.

Raw captures go in `video/captures/` (gitignore this).

### 4. Assemble

Remotion composites the captures over the design-system background. Export as MP4 at 1080p → `video/final.mp4`.

### 5. Upload

YouTube (unlisted is fine) or a public Google Drive link. Paste the URL into the submission form.

## Narration

Short, first-person, no marketing voice. Script lives in `video/script.md`. Record separately and align in Remotion so you can re-record without re-rendering visuals.

Example line for Beat 4: *"As I work through the case, a Claude Managed Agent running Opus 4.7 watches in the background and grades my reasoning in real time — surfaced as a triage card, not a wall of text."*

## Don'ts

- Don't add a music track that drowns the narration.
- Don't show code in the video — judges are engineers; the repo speaks for itself.
- Don't use stock medical imagery. If you need a visual, use the app's own 3D scenes.
- Don't exceed 2 minutes. Over 90 s is already risky; over 120 s is where judges stop watching.
- Don't commit raw captures or the final MP4 — they bloat the repo. Link them from the submission form instead.

## What counts as "done"

- [ ] `video/final.mp4` renders end-to-end without crashing.
- [ ] All four Success Criteria from `spec.md` visible in the video.
- [ ] Upload URL pasted into the submission form.
- [ ] Team watched it through once at real speed before submitting.
