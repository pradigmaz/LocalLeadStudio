# 🚨 ВНИМАНИЕ АГЕНТАМ: АРХИТЕКТУРА LOCAL LEAD STUDIO 🚨

Не ломай структуру! Этот проект разделен на кастомный React-фронтенд и Python API бэкенд. 

## Запуск проекта
Единственный правильный способ запуска проекта — скрипт `run.bat` в корне.
Он использует `concurrently` (через `frontend/package.json`) для одновременного запуска:
1. Vite Dev Server (React) на порту `5173`
2. Python API Backend (`yamap_landing_web.py`) на порту `8765`

## Структура (Чистый парсер)
- `frontend/` — кастомный React-интерфейс (Vite, Tailwind, TypeScript). Это то, что видит пользователь.
- `lead_studio/` — новая архитектура Python (чистая архитектура, SQLite репозитории).
- `yamap_landing_web.py` — ТОЛЬКО API бэкенд. Он слушает фронтенд и отдает ему данные.
- `yamap_landing_parser.py` — ядро парсинга (зависимость бэкенда).

## Мусор (Игнорируется в Git)
- `course_scripts/` и `legacy_parser_mvp/` — старые или сторонние скрипты. Они не относятся к чистому парсеру и не пойдут в сборку Electron.

При внесении изменений для Electron сборки, работай только с связкой `frontend` и `yamap_landing_web.py`.
