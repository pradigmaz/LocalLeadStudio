# Handoff

## 2026-08-17 — portable data and external links

- TASK: Hide 2GIS, make portable card folders stable, and send card links to the system browser.
- STATE: Complete in commit `98d1fae`.
- CHANGED: New jobs are Yandex-only; default card output resolves to portable `lead_studio_data/runs`; known pre-portable card root remains readable; `target="_blank"` uses Electron `shell.openExternal` and denies an internal window.
- VERIFIED: Electron selfcheck, 3 portable-policy tests, Python compile, frontend build, rendered Yandex-only UI, and packaged `app.asar` helper check all passed.
- NEXT: To reuse an existing database, keep the new portable EXE beside the same `lead_studio_data` folder and run one instance at a time. Do not auto-migrate or overwrite old data.

## 2026-08-17 — restore missing websites from saved Yandex data

- TASK: Correct cards that had a real site in saved Yandex data but were classified as "no site".
- STATE: Verified and ready for commit; the real database was not changed during testing.
- CHANGED: Parse direct business URLs and VK `away` links, keep booking/social domains out of websites, and repair only empty website fields from stored Yandex JSON at backend startup.
- VERIFIED: 6 unit tests, syntax check, frontend build, Electron selfcheck, rebuilt portable, and an isolated old-DB smoke test: 127 organizations repaired, including Сгоряча, Скоро Пицца, and Fresh Сервис Юг.
- NEXT: Run `Local Lead Studio 0.1.0 site repair.exe` beside the existing `lead_studio_data`; the one-time repair is idempotent.

## 2026-08-17 — platform icons for social links

- TASK: Replace the generic social-link badge in a lead card with a recognizable platform icon.
- STATE: Complete; test servers used only copied databases and are stopped.
- CHANGED: Hostname mapping covers VK, WhatsApp, Telegram, MAX, YouTube, Instagram, Facebook, Viber (including `viber.click`), OK, TikTok, X, and a safe generic fallback.
- VERIFIED: Node domain test, frontend lint/build, Electron selfcheck, source UI, and the final packaged backend card with Telegram/VK/WhatsApp; console was clean.
- NEXT: Build frontend, then PyInstaller, then Electron whenever portable UI assets change; the backend bundle owns `frontend_dist`.
