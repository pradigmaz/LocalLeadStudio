---
status: completed
last_updated: 2026-08-28
---

# Portable build bootstrap

## Status

Complete in source; no new portable artifact was generated.

## Objective

Provide one Windows command that builds the current portable executable after checking Python and Node, without installing project dependencies globally.

## Scope / Non-scope

- In: a root `build-portable.bat`, narrow policy test, and README replacement for the old manual build steps.
- Out: rebuilding or publishing a release, changing app behaviour, deleting old releases or user data, installing Python or Node automatically, supporting Linux/macOS launch or release paths.

## Project & Feature Decision

- Decision: `BUILD_MINIMUM` for a small deterministic build workflow.
- Existing alternatives: the final `electron` `npm run dist` script and manual README commands.
- Why not use them: they do not bootstrap the full release sequence and the documented PyInstaller installation is global.
- Selected outcome: one local build script reusing the existing PyInstaller spec and Electron `dist` command.

## Checklist

- [x] Inspect existing source launcher, release preflight, package scripts, and previous portable-release evidence.
- [x] Verify official Python and Node download pages.
- [x] Add `build-portable.bat` with local virtualenv, local Node modules, and project-local caches.
- [x] Add a narrow policy test and replace the manual README recipe.
- [x] Run static, Python, frontend, and Electron checks that do not overwrite a release artifact.

## Evidence

- `electron/package.json`: `npm run dist` is only `release-preflight` plus `electron-builder --win portable`.
- `backend/lls-backend.spec`: bundles `../frontend/dist` into the backend, so frontend build must precede PyInstaller.
- Obsidian portable-release workflow: frontend lint/test/build → PyInstaller → Electron portable.
- Context7: `npm ci` is a clean lockfile install; `NPM_CONFIG_CACHE` and `ELECTRON_BUILDER_CACHE` support local cache paths.

## Commands Run

- Existing portable script and launcher inspection.
- Official Python/Node page inspection in the in-app browser.
- `python backend/test_portable_policy.py` — 4/4 passed.
- `npm run lint` and `npm run test:social-platform` in `frontend` — passed.
- `npm run check` in `electron` — passed.
- README validator and whitespace/file-size checks — passed.

## Assumptions

- Python 3.10+ and Node 18+ are installed by the user on the build machine and available in `PATH` after installer restart.
- A portable release is built only on Windows and remains an intentional artifact-generation action.

## Dependencies / Blockers

- No blocker. Actual artifact build is intentionally deferred: it may download tools and replace generated release output.

## Progress Log

- 2026-08-28: found that the repo has the final packaging command but not the requested full bootstrap; selected a one-file orchestration script.

## Files / Areas

- `build-portable.bat`
- `README.md`
- `backend/test_portable_policy.py`
- `electron/package.json` and `backend/lls-backend.spec` are read-only contracts.

## Decisions

- Reuse the existing `npm run dist`; do not add another packager.
- Install `PyInstaller` through `backend/venv` rather than system `pip`.
- Keep caches under the project rather than default user-profile cache locations.

## Changes

- Added `build-portable.bat`: checks Python/Node, keeps package and cache paths local, then runs frontend lint/test/build, PyInstaller, and the existing Electron distribution command.
- Updated `run.bat` to open official prerequisite pages when Python or npm is absent.
- Removed the unsupported `run.sh` launcher and Linux/macOS README instructions.
- Added a narrow portable-builder policy test, updated the Windows README procedure, and ignored `.cache/`.

## Validation / Re-check

The script's policy, command order, syntax, file-size limit, frontend lint/test, Electron self-check, and README all pass. Full packaging is not run without an explicit request to generate an artifact.

## Review / Fix

Changed-surface review found no issue in the bounded script, test, documentation, launcher, or ignore-rule changes.

## Docs / Release Notes

Replaced the manual portable-build commands with the supported one-command Windows procedure and removed unsupported Linux/macOS launch instructions.

## Risks / Residual Risks

- First build needs network access to download declared Python and npm dependencies.
- Python and Node themselves are machine-level prerequisites; only project packages and caches are kept local.
- End-to-end artifact generation is `NOT_EVALUATED` because it would replace/create release artifacts and download tools.

## Next Actions

Run `build-portable.bat` only when a fresh portable artifact is explicitly needed.

## Final Status

Complete in source; generated portable artifact not rebuilt.
