# Local Lead Studio

Локальная панель для агентского поиска лидов в Яндекс.Картах: собрать организации, отфильтровать мусор, сохранить карточки и вручную довести лид до решения.

Проект не SaaS и не публичный crawler. Это локальный рабочий инструмент: React UI + FastAPI backend + SQLite в папке проекта.

## Быстрый старт

```cmd
cd /d D:\всё по техничке\LocalLeadStudio
python -m pip install -r backend\requirements.txt
cd frontend
npm install
cd ..
run.bat
```

Открой:

```text
http://localhost:5173/
```

`run.bat` запускает `npm run dev`, а тот поднимает:

- frontend: `http://localhost:5173/`
- backend: `http://127.0.0.1:8765/`

## Основной сценарий

1. В левой панели выбери регионы, города и ниши.
2. Проверь лимиты: `maxPerQuery`, пауза между запросами, минимум отзывов, обязательность фото.
3. Запусти сбор.
4. Следи за прогрессом и ошибками в блоке статуса.
5. Открывай лиды в таблице.
6. Меняй статус, приоритет, добавляй заметки.
7. При необходимости открывай папку карточки или Яндекс.Карты.

## Возможности

- Конструктор запросов по регионам, городам и нишам.
- Ручной список запросов с очисткой дублей.
- Один активный job сбора, статус job и отмена.
- Защита от слишком частых запросов к Яндексу.
- Фильтр сетевиков по словам и доменам.
- Фильтр популярных мест, малых населённых пунктов, лидов без фото и лидов ниже порога отзывов.
- Дедупликация организаций внутри запуска по Yandex organization id.
- Сохранение карточек в `lead_studio_data/runs/`.
- SQLite база лидов, организаций, запусков и истории.
- Статусы лида: `NEW`, `POTENTIAL`, `IN_PROGRESS`, `PROCESSED`, `REJECT`, `JUNK`, `CHAIN`.
- Ручной статус не перетирается повторным парсингом.
- Экспорт, импорт и сброс локальной базы.

## Архитектура

```text
frontend/                       React + TypeScript + Vite
backend/yamap_landing_web.py    FastAPI app, API routes, parser orchestration
backend/yamap_landing_parser.py low-level Yandex Maps extraction
backend/lead_studio/            SQLite repository and job manager
config.json                     parser rules, chains, categories, thresholds
lead_studio_data/               local DB and generated run data
```

Главные frontend-зоны:

```text
frontend/src/components/search/     search builder and run status
frontend/src/components/leads/      leads table and lead modal sections
frontend/src/components/settings/   blacklist, presets, database actions
frontend/src/types/                 shared frontend types
```

## Данные

Основная база:

```text
lead_studio_data/app.db
```

Сгенерированные карточки:

```text
lead_studio_data/runs/
```

Эти данные локальные и не должны попадать в git. `.gitignore` уже закрывает базу, run data, backend logs, screenshots и test-results.

## Фильтрация и авторазметка

Parser сначала превращает организацию Яндекса в lead, затем применяет правила:

- сетевик -> skip / `CHAIN`;
- мало отзывов -> `JUNK`;
- нет фото при включённом `requirePhotos` -> `JUNK`;
- популярное место -> `REJECT`;
- малый населённый пункт или город вне выбора -> `REJECT`.

Авторазметка меняет только `NEW` лиды. Если лид уже вручную переведён в `POTENTIAL`, `IN_PROGRESS`, `PROCESSED` или другой статус, повторный сбор не должен его откатить.

## Настройки

`config.json` хранит:

- стартовые регионы и ниши;
- HTTP headers для запросов;
- домены соцсетей и онлайн-записи;
- слова и домены сетевиков;
- пороги популярных мест;
- словари для разбора адресов.

UI дополнительно использует `localStorage` для blacklist и presets.

## API

| Method | Path | Назначение |
|---|---|---|
| `GET` | `/api/leads` | список лидов |
| `POST` | `/api/leads/{lead_id}` | обновить статус, приоритет или contact status |
| `DELETE` | `/api/leads/{lead_id}` | удалить лид |
| `GET` | `/api/leads/{lead_id}/events` | история лида |
| `POST` | `/api/leads/{lead_id}/events` | добавить комментарий |
| `POST` | `/api/leads/{lead_id}/viewed` | отметить просмотр |
| `POST` | `/api/leads/{lead_id}/open-folder` | открыть папку карточки |
| `POST` | `/api/run` | старт сбора |
| `GET` | `/api/run/status` | статус сбора |
| `POST` | `/api/run/cancel` | отмена сбора |
| `GET` | `/api/settings/cities` | регионы и города |
| `GET` | `/api/settings/categories` | категории |
| `GET` | `/api/settings/export` | экспорт SQLite |
| `POST` | `/api/settings/import` | импорт SQLite |
| `POST` | `/api/settings/reset_db` | сброс SQLite |

Mutating endpoints разрешены только локальным запросам. Опасные операции требуют header:

```text
X-LocalLead-Confirm: 1
```

## Команды разработки

Frontend:

```cmd
cd frontend
npx tsc -p tsconfig.app.json --noEmit
npm run lint
npm run build
```

Backend syntax check:

```cmd
python -m py_compile backend\yamap_landing_web.py backend\yamap_landing_parser.py backend\lead_studio\adapters\sqlite_repo.py backend\lead_studio\job_manager.py
```

Backend вручную:

```cmd
python backend\yamap_landing_web.py --host 127.0.0.1 --port 8765
```

## Безопасность и ограничения

- Backend рассчитан на localhost.
- CORS открыт только для `localhost:5173` и `127.0.0.1:5173`.
- SQLite импорт, сброс и удаление требуют confirm header.
- Яндекс может ограничивать частые запросы; при rate-limit признаках сбор останавливается.
- Playwright в проекте не установлен.
- `npm run build` может показывать Vite warning о chunk больше 500 kB.

## Перед коммитом

Минимум:

```cmd
python -m py_compile backend\yamap_landing_web.py backend\yamap_landing_parser.py backend\lead_studio\adapters\sqlite_repo.py backend\lead_studio\job_manager.py
cd frontend
npx tsc -p tsconfig.app.json --noEmit
npm run lint
npm run build
```

Не коммитить:

- `lead_studio_data/`
- `.db`, `.sqlite`
- backend logs
- frontend screenshots
- `frontend/test-results/`
- `frontend/dist/`
- `node_modules/`

## License

Not specified.
