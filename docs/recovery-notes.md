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

## What is still incomplete

This snapshot was not only messy; parts of it were content-swapped. Some modules referenced by the frontend were not recoverable from the current tree, including parts of:

- `src/game/*`
- `src/data/*`
- `src/voice/*`
- some state/store utilities

That means the repo is now much cleaner structurally, but it is not yet guaranteed to build or run end-to-end.

## Recommended next pass

1. Reconstruct `src/game/store.ts` and `src/game/types.ts`.
2. Reconstruct the missing `src/data/*` modules.
3. Reconstruct the missing `src/voice/*` runtime files.
4. Run `npm install`, `npm run build`, `npm test`, and `npm run verify`.
5. Repair any import paths that still point to unrecovered modules.
