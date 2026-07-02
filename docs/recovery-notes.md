# Recovery Notes

This cleanup normalized the repository into the intended top-level structure:

- `.claude/`
- `agent/`
- `backend/`
- `docs/`
- `loop/`
- `public/`
- `scripts/`
- `src/`

## What was fixed

- Root-level files were sorted into the folders they logically belong to.
- Many files were renamed based on their actual contents rather than their previous filenames.
- Root project files like `package.json`, `tsconfig.json`, `vite.config.ts`, `middleware.ts`, and `spec.md` were recreated in a clean form.
- Missing runtime layers under `src/game/`, `src/data/`, `src/voice/`, and `src/components/three/` were reconstructed so the frontend can compile again.
- The frontend build path was tightened so helper scripts no longer block `npm run build`.
- Misnamed archival artifacts in `docs/recovered/` were cleaned up and documented.

## Current state

- `npm run build` now passes.
- The repo is structurally coherent again.
- Some reconstructed modules are intentionally minimal foundations rather than fully restored original logic.

## What is still incomplete

The codebase is now buildable, but it still needs product-level hardening:

- richer case catalogs and guideline coverage
- deeper voice/runtime behavior beyond the minimal reconstructed conversation layer
- re-enabling and maintaining `scripts/test` and `scripts/verify` as first-class checks
- runtime/manual QA across the full encounter flow

## Recommended next pass

1. Enrich `src/data/` with more complete case, imaging, and medication content.
2. Strengthen `scripts/verify/` and bring verification back into routine development.
3. Expand the voice runtime from placeholder behavior to production-ready patient flow.
4. Run manual UX QA on the full encounter and debrief loop.
5. Tighten backend/frontend integration contracts.
