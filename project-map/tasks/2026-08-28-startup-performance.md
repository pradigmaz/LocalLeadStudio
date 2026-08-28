---
title: Startup performance for portable database
status: ready_for_user_check
created: 2026-08-28
---

# Startup performance for portable database

## Objective

Make the portable app visibly responsive while opening an existing local SQLite database, without moving or rewriting user data.

## Scope

- Replace the native white Electron window with a local loading screen while the backend starts.
- Remove whole-database/card-folder reconciliation from the HTTP readiness path.
- Run legacy maintenance only once per database and retain per-item card synchronization.
- Load leads in pages with server-side table filters instead of materializing the full list in the renderer.

## Non-scope

- Changing the database engine, data path, schema, browser routing, or lead-selection rules.
- Deleting, rebuilding, or replacing the user's existing database.

## Acceptance checks

1. Electron loads a packaged local loading screen before it waits for port `8765`.
2. FastAPI yields readiness before optional startup maintenance finishes.
3. The same database does not repeat full repair/card/source scans after successful maintenance.
4. Existing per-lead status and website synchronization stays intact.
5. The table starts with 50 matching leads, keeps exact filters and summary counts, and exposes a next-page action.
6. Backend tests, frontend/electron checks, packaging checks, and a portable smoke test pass.

## Evidence

- The active database is about 15 MB with 353 leads, but startup scans 222 card folders and repairs 157 missing-web-site candidates before Uvicorn binds the port.
- `electron/main.js` currently displays the `BrowserWindow` before `waitForPort(PORT)` finishes.
- FastAPI lifespan work runs before the application accepts requests.
- `/api/leads` previously returned every lead and queried source rows once per lead; the table then filtered the complete payload in the renderer.

## Progress log

- 2026-08-28: user approved the performance repair. Root-cause tracing and initial source/test mapping are complete; red regression checks are next.
- 2026-08-28: implemented one-time startup maintenance, a visible Electron loading screen, and server-side lead pagination. Full backend suite (36), frontend suite (17), lint/build, Electron self-check, package preflight, and isolated packaged-backend page smoke passed. Portable artifact is ready for the user's runtime check.
