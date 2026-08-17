# Handoff

## 2026-08-17 — portable data and external links

- TASK: Hide 2GIS, make portable card folders stable, and send card links to the system browser.
- STATE: Complete in commit `98d1fae`.
- CHANGED: New jobs are Yandex-only; default card output resolves to portable `lead_studio_data/runs`; known pre-portable card root remains readable; `target="_blank"` uses Electron `shell.openExternal` and denies an internal window.
- VERIFIED: Electron selfcheck, 3 portable-policy tests, Python compile, frontend build, rendered Yandex-only UI, and packaged `app.asar` helper check all passed.
- NEXT: To reuse an existing database, keep the new portable EXE beside the same `lead_studio_data` folder and run one instance at a time. Do not auto-migrate or overwrite old data.
