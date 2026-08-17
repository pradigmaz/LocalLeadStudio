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

## 2026-08-17 — lead card folders, disk-first inspection

- TASK: Prove whether a collected lead has a filesystem card usable without SQLite.
- STATE: A kept `CREATED` lead writes `lead_studio_data/runs/<run>/<name>_<source-id>/data.json` and `brief.md`; `ENRICHED`/old records do not automatically get a fresh folder.
- CHANGED: No app data or code changed. Working rule: inspect `data.json`, then `brief.md`; SQLite only if the folder is absent.
- VERIFIED: Temp save probe created and read both files; source fixture has 2 valid folders. Current `electron/portable-2026-08-17/lead_studio_data` has `app.db` but no `runs` folder, so its old cards are not disk-readable yet.
- NEXT: If needed, explicitly approve a one-time backfill from that old SQLite database into card folders; future newly created kept leads already create them.

## 2026-08-17 — Electron portable optimization

- TASK: Optimize Electron portable without changing lead logic, backend data, or delivery format.
- STATE: Complete; new standalone EXE is `electron/portable-2026-08-17-electron-optimized/Local Lead Studio 0.1.0.exe`.
- CHANGED: Single-instance lock focuses the existing window; all outbound `http/https` navigation is denied inside Electron and opened by the system browser; local backend navigation stays allowed.
- VERIFIED: Red/green Node selfcheck, JS syntax checks, clean diff check, Electron-builder, packaged-asar content check, and isolated double-launch smoke: one Electron main process plus one backend listener.
- NEXT: Keep the single-EXE format unless a separate unpacked/installer build is approved; first run necessarily expands the ~110 MB backend to Temp (~391 MB observed).

## 2026-08-17 — Settings visual clarity

- TASK: Make the Settings dialog compact, readable, and visually grouped without changing settings behavior.
- STATE: Complete; final portable is `electron/portable-2026-08-17-settings-clarity-final/Local Lead Studio 0.1.0.exe`.
- CHANGED: Dialog is width/height bounded; narrow view uses icon navigation; Sources groups input and save in one card; Database cards are constrained, responsive, and retain the danger distinction.
- VERIFIED: `frontend` lint/build, Electron selfcheck, final portable isolated-data startup, and manual Sources/Database visual smoke passed. SHA-256 `7177D3AC3A5C638DA687A0BCE53ED304DAE3D160039293EE0F972A1F1FF4B81A`.
- NEXT: No migration or README update needed; API, import/export/reset handlers, and stored data are unchanged.

## 2026-08-17 — Cities limited to selected regions

- TASK: Keep city search inside one or more selected regions, rather than returning same-named/global matches from all of Russia.
- STATE: Complete; final portable is `electron/portable-2026-08-17-region-filter-final/Local Lead Studio 0.1.0.exe`.
- CHANGED: The builder already supported multiple region checkboxes; it now searches the already loaded union of those regions, only uses country-wide search with no region selected, states the multi-select rule, and keeps selected cities when adding a region.
- VERIFIED: Red/green Node test for Voronezh/Bryansk scope, frontend lint/build, browser smoke (one Voronezh region + `брян` is empty; Voronezh + Bryansk returns Bryansk), Electron selfcheck, backend/resource inclusion, and portable SHA-256 `B0CE03B5FB398879DA9DA3D77A56C458ED6859B7A39AAD8DB0DCACC794B1DBF3`.
- NEXT: No database/schema migration or README change. The final EXE was not launched because a user-running portable already owns port 8765; it was not interrupted. FIAS/GAR is the future authoritative refresh source if the bundled city directory needs replacement.

## 2026-08-17 — clear collection parameters on first launch

- TASK: Make lead-card collection parameters understandable and empty by default.
- STATE: Complete; final portable is `electron/portable-2026-08-17-collection-options-rebuild/Local Lead Studio 0.1.0.exe`.
- CHANGED: First form starts with no optional card fields, no photo download, and no photo-only filter; the UI explains each field and separates data, limits, and photo actions. Empty `fields_to_parse` now clears optional saved data, while `None` preserves legacy full parsing; site/photo screening happens before the cleanup and retains the source-level site fact.
- VERIFIED: Red/green 3-test backend contract, full 9 Python tests, 3 Node tests, frontend lint/build, Python compile, Electron selfcheck, browser smoke of the unchecked first state, and packaged frontend/resource inspection. SHA-256 `541EB950E058527D25D226EA5F179C907C148D6CFC31E612B55F52BCC65A825A`.
- NEXT: To use it with existing data, place the EXE beside the same `lead_studio_data` folder; do not run two portable copies at once. Final EXE was structurally verified but not launched because the user-running instance owns port `8765`.

## 2026-08-17 20:31 — Борисоглебск: сайт Экспресс сервис Боравто

- TASK: Correct the false `Без сайта` card without rebuilding portable.
- STATE: Done; only the exact active portable data record changed.
- CHANGED: SQLite card now has `https://express-service.borauto.ru/`, lead type `REDESIGN`, and one `WEBSITE_REPAIRED` event; matching `data.json` and `brief.md` updated too.
- VERIFIED: Saved Yandex JSON contained `urls[0]`; live Maps and official site matched the business/address; isolated shared repair returned the site; `python -m unittest test_website_repair.py` passed (3/3).
- NEXT: Reopen/reload the card to see it. Do not bulk-repair the other 79 empty-site records without a separate request; future common portable build already contains the source-side repair.

## 2026-08-17 20:37 — Боравто: автосалон и автосервис

- TASK: Resolve two Maps cards that looked like separate no-site leads.
- STATE: Done; no merge, source edit, or portable build.
- CHANGED: One existing organization already links Yandex IDs `1021057551` (salon) and `201319200899` (service). Stored website, card `data.json`, and `brief.md` now use `https://borauto.ru/`; `NEW_SITE` became `REDESIGN`; lead status preserved.
- VERIFIED: Both live Maps cards share name/address; salon card exposes the site; official site exposes Borisoglebsk and service direction; source JSON parses the site; unit test 3/3 passed.
- NEXT: Reload the running app to see the card. Keep the two Yandex source IDs separate; do not bulk-repair other no-site cards without approval.

## 2026-08-17 20:57 — card-file lead status sync

- TASK: Make lead status readable from each saved card folder without SQLite.
- STATE: Complete in source; active portable data backfilled. No portable rebuild/restart.
- CHANGED: New `lead_studio/card_files.py`; new cards write `lead_status` plus `Статус лида` in `brief.md`; manual and automatic status changes sync the linked card; startup repairs legacy card files without overwriting manual brief notes.
- VERIFIED: Red/green `test_card_status_sync.py`; 14 Python regressions and compile pass. Active portable: 61 DB-linked folders, 61/61 JSON + brief status matches after recheck.
- NEXT: Current running old portable cannot sync later status changes until next approved rebuild/restart. DB leads without `data_folder` still have no file to inspect. Freshness filter is not built: live collection currently stores no review dates; await user definition of activity source/window.

## 2026-08-17 21:01 — freshness signal decision

- TASK: Decide whether stale Maps reviews should filter leads.
- STATE: Analysis only; no code, data, package, or settings changed.
- CHANGED: None. Recommended two evidence fields, not a hard reject: latest Maps review signals customer activity; latest public VK post signals business activity; unavailable source stays `не проверено`.
- VERIFIED: Live lead creation stores `reviews: []`; review dates currently exist only in the Excel-import path. Saved «Фея» card has a VK link but no stored review date, proving a review-date filter is unsupported and can falsely reject an active lead.
- NEXT: Await user confirmation of the dual-signal rule and freshness window before product design or implementation.

## 2026-08-17 21:13 — multi-source website prevention

- TASK: Prevent empty-site cards when one organization has several saved Yandex sources.
- STATE: Complete in source; no portable rebuild/restart and no bulk user-data repair.
- CHANGED: Union all recovered websites across linked Yandex payloads; update `NEW_SITE` to `REDESIGN`; sync existing `data.json` and only the website block in `brief.md`; re-sync saved cards after enrichment and at startup.
- VERIFIED: Red/green two-source organization/card test with preserved manual note; 15 Python tests, `compileall`, import smoke and `git diff --check` pass.
- NEXT: The running old portable receives this behavior only after the next approved build/restart. A site absent from every saved source remains unverified rather than guessed.

## 2026-08-17 21:25 — chain registry expansion

- TASK: Exclude confirmed Buntaro, Фенко and РЕТ network brands during future collection.
- STATE: Complete in source; no portable rebuild/restart and no saved-lead status migration.
- CHANGED: Added exact names and official domains to existing `config.json` chain lists; Cofix, Пятёрочка, Магнит and DNS were already present.
- VERIFIED: Official-browser evidence for the three brands; red/green `test_chain_registry.py`; 18 Python tests, JSON parse, `compileall` and `git diff --check` pass.
- NEXT: The active old portable only gets the registry after the next approved build/restart. Reclassifying existing leads is a separate user-data action.

## 2026-08-17 21:35 — contactable-lead filter and card cleanup

- TASK: Hide the card's source/query block and skip future leads without a usable social or messenger channel.
- STATE: Complete in source; no portable rebuild/restart or existing-lead migration.
- CHANGED: Removed the visible provenance block; added a hard pre-merge contact check; booking/directory links do not qualify; socials and messengers are an always-on required parameter even when optional card fields are empty.
- VERIFIED: Red/green no-contact and booking-only persistence tests; 19 Python tests, Python compile, frontend lint/build and social-platform test pass. Rendered portable UI: NOT_EVALUATED because no new runtime was launched.
- NEXT: The active old portable receives the behavior only after the next approved build/restart. Existing leads stay unchanged unless a separate migration is requested.

## 2026-08-17 22:05 — large lead-photo viewer

- TASK: Make lead-card photos larger and allow switching through every saved photo.
- STATE: Complete in source; no portable rebuild/restart or user-data change.
- CHANGED: Existing `urlTemplate` now supplies `XXL_height` only in the viewer; thumbnails stay `L_height`. Replaced the one-photo custom portal with the project Dialog, accessible thumbnail buttons, previous/next buttons, ←/→ navigation and a photo counter. Added focused Node tests for rendition selection and circular navigation.
- VERIFIED: Red/green gallery test; 5 frontend Node tests, lint and production build pass. Browser probe: `L_height` 333×500, `XXL_height` 683×1024. Temporary Vite stopped; running portable backend on 8765 remained untouched.
- NEXT: The running old portable receives this UI only in a later user-approved build/restart. Rendered interaction against a real lead remains unverified because the live backend returned an empty base; no test lead was created.

## 2026-08-17 22:15 — required social contact label

- TASK: Make the collection form state that socials and messengers are required, not an omitted optional checkbox.
- STATE: Complete in source; no portable rebuild/restart.
- CHANGED: The form now shows a distinct `Соцсети и мессенджеры — Обязательно` row and calls the remaining choices additional data. Collection logic remains the existing pre-merge hard check.
- VERIFIED: Frontend lint and production build pass.
- NEXT: The active portable receives the wording in the next approved build/restart.

## 2026-08-17 22:07 — technical storefronts as new-site leads

- TASK: Include thin `*.clients.site` storefronts in future `NEW_SITE` collection.
- STATE: Done in source; no portable rebuild/restart, live data or status migration.
- CHANGED: Shared `lead_type_for` classifies no URL/all `*.clients.site` as `NEW_SITE`; any normal host means `REDESIGN`. Pipeline, default site filter, high-profile screen, saved `data.json`/brief and website repair use it.
- VERIFIED: Red→green: storefront was skipped and repair changed it to `REDESIGN`; now 11 focused + 22 full Python tests pass. `compileall` and `git diff --check` pass.
- NEXT: Behavior reaches the user-running portable in the next approved build. Existing saved leads stay untouched.
- ARCH: URL-host rule only; no visual judgement, crawl, config/UI or schema change. Mixed hosts stay `REDESIGN`.

## 2026-08-17 — Yandex Business site label

- TASK: Make `*.clients.site` visible as a Yandex Business site, not an unnamed URL or "Без сайта".
- STATE: Done in source; no portable rebuild, database change or lead-status change.
- CHANGED: Added hostname-only `isYandexBusinessSite`; every matching URL in the lead card now shows `Сайт на Яндекс Бизнесе`.
- VERIFIED: Red→green focused Node test; 7 frontend Node tests, `npm run lint`, `npm run build`, and `git diff --check` pass.
- NEXT: Visible in the next user-approved portable build/restart. Rendered live-card check skipped to avoid changing a real lead's viewed state.
- ARCH: `*.clients.site` marks the Yandex Business platform only; lead type remains `NEW_SITE`, while a normal or mixed domain remains `REDESIGN`.

## 2026-08-17 — Tilda hosted-site classification

- TASK: Put `*.tilda.ws` into the same new-site lead branch as Yandex Business hosted sites.
- STATE: Done in source; no portable rebuild, data migration or existing-lead mutation.
- CHANGED: Added `tilda.ws` to shared thin-site hosts; Tilda-only/all-platform leads become `NEW_SITE`, while any normal domain remains `REDESIGN`. Card shows `Сайт на Tilda` next to the URL.
- VERIFIED: Red→green backend classification and frontend hostname tests; 23 Python tests, `compileall`, 9 frontend Node tests, lint, build, and `git diff --check` pass.
- NEXT: Visible in the next user-approved portable build/restart. Existing saved lead types stay unchanged.
- ARCH: Hosted suffix means platform provenance, not a quality verdict; no URL crawl or visual scoring.
