# Local Lead Studio

Локальный инструмент для поиска клиентов в Яндекс.Картах.

Идея простая: собрать организации по городам и нишам, быстро убрать сетевиков/мусор, сохранить карточки и руками довести нормальные лиды до статуса.

## Быстрый запуск

```cmd
cd /d D:\всё по техничке\LocalLeadStudio
python -m pip install -r backend\requirements.txt
cd frontend
npm install
cd ..
run.bat
```

Открыть:

```text
http://localhost:5173/
```

Что поднимается:

- UI: `http://localhost:5173/`
- API: `http://127.0.0.1:8765/`
- API docs: `http://127.0.0.1:8765/docs`

## Как работать

1. Собери запросы в левой панели: регионы, города, ниши или ручной список.
2. Проверь лимиты: сколько организаций брать, пауза между запросами, минимум отзывов, фото.
3. Запусти сбор.
4. Следи за статусом job.
5. Разбери таблицу лидов:
   - `NEW` — новый;
   - `POTENTIAL` — годный;
   - `IN_PROGRESS` — в работе;
   - `PROCESSED` — отработан;
   - `REJECT`, `JUNK`, `CHAIN` — мусор, неликвид, сетевик.
6. В карточке лида смотри сайты, телефоны, соцсети, фото, историю и папку с данными.

## Что делает фильтр

Парсер не просто складывает всё подряд. Он помечает или пропускает:

- сетевиков по словам и доменам из `config.json`;
- организации без фото, если включён `requirePhotos`;
- точки с малым числом отзывов;
- слишком популярные рестораны/кафе/бары;
- мелкие населённые пункты;
- организации вне выбранного города;
- дубли внутри одного запуска.

Важное правило: повторный сбор не должен сбивать ручной статус. Если лид уже `POTENTIAL` или `IN_PROGRESS`, авторазметка его не откатывает.

## Где лежат данные

```text
lead_studio_data/app.db      SQLite база
lead_studio_data/runs/       результаты запусков и папки карточек
config.json                  правила парсера, сетевики, пороги, категории
```

`lead_studio_data/` не коммитится.

## Структура проекта

```text
backend/
  yamap_landing_web.py              FastAPI, API, запуск парсера
  yamap_landing_parser.py           извлечение данных из Яндекс.Карт
  lead_studio/adapters/sqlite_repo.py
  lead_studio/job_manager.py

frontend/src/
  components/search/                конструктор поиска и статус сбора
  components/leads/                 таблица и карточка лида
  components/settings/              база, blacklist, presets
  lib/
  types/
```

## Разработка

Frontend:

```cmd
cd frontend
npx tsc -p tsconfig.app.json --noEmit
npm run lint
npm run build
```

Backend:

```cmd
python -m py_compile backend\yamap_landing_web.py backend\yamap_landing_parser.py backend\lead_studio\adapters\sqlite_repo.py backend\lead_studio\job_manager.py
```

Запуск backend отдельно:

```cmd
python backend\yamap_landing_web.py --host 127.0.0.1 --port 8765
```

## Операционные правила

- Backend рассчитан на localhost.
- CORS открыт только для `localhost:5173` и `127.0.0.1:5173`.
- Удаление лида, импорт базы и сброс базы требуют header `X-LocalLead-Confirm: 1`.
- Не коммитить `.db`, `lead_studio_data/`, логи, screenshots, `dist/`, `node_modules/`.
- Если Яндекс начинает ограничивать запросы, сбор останавливается через guard.

## Известные ограничения

- Это локальный рабочий инструмент, не публичный сервис.
- Playwright в проекте не установлен.
- `npm run build` может показывать warning про chunk больше 500 kB.
