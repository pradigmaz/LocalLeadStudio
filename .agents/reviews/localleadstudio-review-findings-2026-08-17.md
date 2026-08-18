# Предсборочный аудит LeadStudio — 2026-08-17

- **Ревизия:** `a0417cc75585d73aab721523ae7b5fd36811538d` (`master` = `origin/master` на старте проверки).
- **Тип:** read-only review перед следующей portable-сборкой.
- **Статус:** `BLOCKED` до закрытия `P1` и `P2` ниже.
- **Владелец:** Main / критерии `zaikana-review`, Ponytail и Karpathy.

## Подтверждённые findings

### [P1] Сценарий сборки упаковывает старый frontend

**Где:** `README.md:131-136`, `backend/lls-backend.spec:6-10`, `electron/package.json:18-20`.

**Доказательство:** README сначала запускает PyInstaller backend, а frontend собирает только после этого. При этом spec уже на первом шаге копирует `../frontend/dist` в `frontend_dist`; Electron затем берёт именно готовый `backend/dist/lls-backend` как `extraResources`. Значит, если `dist` существует — в portable попадает его прежняя версия; если его нет — documented build не имеет нужного входа. `frontend/dist` игнорируется Git, поэтому порядок не воспроизводим из чистой рабочей копии.

**Пробел теста:** нет release-preflight, который доказывает, что хэш/набор файлов `frontend/dist` совпадает с `backend/dist/lls-backend/frontend_dist` до Electron packaging.

**Минимальное направление исправления:** один предсборочный шаг в порядке `frontend build -> PyInstaller backend -> Electron dist`, с проверкой наличия актуального `frontend_dist`; затем обновить README. Не собирать portable до этого.

### [P2] Восстановление сайта оставляет файловую карточку противоречивой

**Где:** `backend/lead_studio/website_repair.py:57-77`, `backend/lead_studio/card_files.py:35-44`, `backend/lead_studio/card_files.py:110-117`, `backend/lead_studio/card_files.py:172-187`.

**Доказательство:** ремонт переводит БД-лид `NEW_SITE -> REDESIGN`, но `sync_card_websites` записывает в `data.json` только `websites` и `has_site`; поле `lead_type` не синхронизируется. `brief_with_websites` обновляет только блок ссылок и не меняет строку `Статус сайта`. Изолированное воспроизведение на временной БД дало: `db_lead_type=REDESIGN`, `card_lead_type=NEW_SITE`, `card_has_site=True`, `brief_site_status=- Статус сайта: сайт не найден`.

**Пробел теста:** `backend/test_website_repair.py:117-126` проверяет URL и `has_site`, но не `data.json.lead_type` и не строку статуса сайта в `brief.md`.

**Минимальное направление исправления:** передавать канонический `lead_type` в карточечную синхронизацию и обновлять единую строку статуса сайта, не перегенерируя ручные заметки; добавить один регрессионный тест на оба файловых поля.

### [P2] Новый portable без проверки присоединяется к любому слушателю на `127.0.0.1:8765`

**Где:** `electron/main.js:26-31`, `electron/main.js:90-96`, `electron/selfcheck.js:7-54`.

**Доказательство:** `startBackend` проверяет только доступность TCP-порта и сразу возвращается; затем окно всегда загружает `http://127.0.0.1:8765`. Не проверяются принадлежность процесса, версия backend или ожидаемая папка данных. При запущенном старом portable либо другом локальном слушателе новый portable тихо покажет старый/чужой backend и будет работать с его данными.

**Пробел теста:** `selfcheck` проверяет доступность и тайм-аут порта, но не сценарий занятого порта с несовпадающим backend/release/data-dir.

**Минимальное направление исправления:** при занятом порте не переиспользовать неизвестный процесс: как минимум показать явную просьбу закрыть текущий LeadStudio; лучше — сверять небольшой локальный health/build/data-dir контракт и присоединяться только к совпадающему экземпляру.

## Проверки

- `python -m unittest discover -p 'test*.py'` из `backend`: **23/23 OK**.
- `python -m compileall -q .` из `backend`: **OK**.
- `npm run lint`, 9 focused Node-тестов и `npm run build` из `frontend`: **OK**.
- `npm run check` из `electron`: **selfcheck ok**.
- `git diff --check HEAD~18..HEAD`: **OK**.
- Изолированное воспроизведение website-repair выполнено в `TemporaryDirectory`; пользовательские база и папки лидов не затрагивались.

## Ponytail / Karpathy / правила

- **Ponytail:** в проверенном release surface нет подтверждённого безопасного удаления или новой зависимости; текущие файлы уже разнесены по UI/API helper-ам. `net: -0 lines possible`. Нужны узкие исправления корректности, а не рефакторинг.
- **Karpathy:** общий `lead_type_for` и карточечные helper-ы уже существуют, поэтому исправление должно идти через них; найденная проблема — неполная передача канонического состояния в файл, а не повод заводить ещё один слой.
- **Границы безопасности:** в проверенном исходнике нет `eval`, `new Function`, `dangerouslySetInnerHTML` или неограниченного shell-вызова по пользовательскому вводу. Открытие папки проходит allowlist корней в `backend/folders.py`.

## review_scope

Electron lifecycle/external navigation/portable resources; FastAPI local routes, SQLite, file-card sync, pipeline output; frontend API/state/lead card/search; 18 последних коммитов.

## not_reviewed

Реальный запуск нового portable, Windows SmartScreen и содержимое будущего `app.asar`/PyInstaller bundle: пользователь запретил сборку на этом шаге. Внешние CVE/advisory проверки зависимостей также не запускались.

## specialist_gaps

Независимый `zaikana-review` был прерван без компактного отчёта; его вывод не использован как доказательство. Findings выше подтверждены основной проверкой исходника и локальными тестами.

## residual_risk

После исправлений нужен один clean-release smoke: свежий `frontend/dist` внутри backend bundle, запуск при свободном и занятом `8765`, а также repair сайта на временной карточке с ручной заметкой.

## finding_labels

`P1` — 1; `P2` — 2; `P0/P3/Nit/Optional/FYI` — 0.

## Resolution — 2026-08-17

- **P1 fixed in source:** release order is now `frontend build → PyInstaller backend → Electron dist`; `electron/release-preflight.js` compares the full current `frontend/dist` tree with the PyInstaller `frontend_dist` before `electron-builder` can start.
- **P2 fixed in source (card files):** website synchronization receives the canonical SQLite `lead_type`, writes it to `data.json`, and refreshes the single `Статус сайта` line in `brief.md` while retaining manual notes.
- **P2 fixed in source (port):** an occupied `127.0.0.1:8765` is no longer reused; the Electron window shows an explicit close-the-other-app message.
- **Verification:** red→green website-repair regression; Electron selfcheck covers preflight comparison and the occupied-port message. Full checks: 23 Python tests, frontend lint, Node social test, frontend production build, Electron syntax/selfcheck, `git diff --check`.
- **Not evaluated:** a newly packaged portable, SmartScreen, and a live occupied-port GUI smoke. Current `node release-preflight.js` correctly blocks because `backend/dist/lls-backend/frontend_dist` has not been built in this task.

## Release validation — 2026-08-18

- PyInstaller 6.21 placed the onedir data under `_internal/frontend_dist`; preflight now resolves that current layout and retains a root-level fallback for older bundles. Red→green selfcheck and live preflight pass.
- New portable was built to `electron/portable-2026-08-18-audit-fixes/`; the unpacked/debug intermediates were removed after inspection, leaving only the `.exe`.
- Free-port smoke of a temporary copy returned HTTP 200 from the bundled UI; the temporary process tree was stopped and `8765` was verified free. SmartScreen/signature acceptance and occupied-port GUI rendering remain not evaluated.
