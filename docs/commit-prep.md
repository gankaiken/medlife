# Medlife Commit Prep

This repository still shows a large working tree because the Medkit to
Medlife rename touched many files at once.

## What belongs in the Medlife recovery commit

- branding rename from `medkit` to `medlife`
- reconstructed frontend runtime under `src/game/`, `src/data/`, and `src/voice/`
- missing `src/components/three/` support files
- cleaned root docs and repo structure docs
- `public/medlife.mp3` replacing the old audio asset name
- updated `package.json`, `tsconfig.json`, and working frontend build path

## What is mostly rename/history noise

- deleted `.claude/commands/medkit-*` and new `.claude/commands/medlife-*`
- deleted `.claude/skills/medkit-*` and new `.claude/skills/medlife-*`
- deleted `public/medkit.mp3` after replacement with `public/medlife.mp3`
- recovered reference files under `docs/recovered/`

## Recommended commit grouping

1. `chore: rename medkit repository assets to medlife`
2. `feat: reconstruct medlife frontend runtime modules`
3. `docs: refresh recovery notes and repo structure`

## Sanity checks already completed

- `npm run build` passes
- local Medlife dev server responded with HTTP `200`
- generated artifacts like `dist/` were removed from the working tree

## Before final commit

- skim `git status --short`
- stage related files in groups if you want cleaner history
- keep `docs/recovered/` as archival material, not runtime source
