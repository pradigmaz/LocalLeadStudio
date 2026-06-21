<div align="center">

# 🎯 Local Lead Studio

**Поиск клиентов для техспеца: карточки бизнесов из Яндекс.Карт и 2GIS → чистая база лидов → готовность к сделке.**

![Platform](https://img.shields.io/badge/platform-Windows%20x64-0078D6?logo=windows)
![Python](https://img.shields.io/badge/Python-3.x-3776AB?logo=python&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white)
![Status](https://img.shields.io/badge/mode-local%20only-success)

</div>

---

Приоритет — бизнесы **без сайта** (кандидаты на новый сайт). Те, у кого сайт есть, можно собирать отдельно как редизайн. Работает локально, на одной машине. Не публичный сервис.

## ✨ Возможности

- 🔎 Поиск по городам и нишам — **Яндекс.Карты** + **2GIS**.
- 🧹 Фильтры: сетевики, мин. отзывы, наличие фото, «есть сайт / нет сайта».
- ♻️ Дедупликация: повторный сбор не плодит дубли и не сбивает ручной статус.
- 🗂 Карточка лида: телефоны, сайты, соцсети, фото, история, папка с данными.
- 📊 Скоринг и статусы: `NEW → POTENTIAL → IN_PROGRESS → PROCESSED` (+ `REJECT` / `CHAIN`).
- ⚡ Аудит сайта без браузера — `scripts/site_audit.py` (Google PageSpeed / Lighthouse).
- 🖥 Портативная десктоп-версия (Electron) — Python на машине не нужен.

## 🚀 Быстрый старт

### Портативная версия (без установки)

Готовый `.exe` ничего не ставит в систему и не требует Python:

```text
electron/dist/Local Lead Studio 0.1.0.exe   ← двойной клик
```

> Данные хранятся рядом с `.exe` — в папке `lead_studio_data`.

### Из исходников (без сборки)

> Требуется **Python 3.x** и **Node.js**. `run.bat` сам поставит зависимости при первом запуске и откроет браузер.

```cmd
run.bat
```

Данные пишутся рядом — в `LocalLeadStudio\lead_studio_data`.

| Сервис   | Адрес                        |
| :------- | :--------------------------- |
| 🖼 UI     | `http://localhost:5173`      |
| 🔌 API    | `http://127.0.0.1:8765`      |
| 📖 Docs   | `http://127.0.0.1:8765/docs` |

## 📖 Как пользоваться

1. Слева задай регион, город и ниши (или ручной список запросов).
2. Проверь лимиты: число карточек, паузу, мин. отзывов, фото.
3. Запусти сбор, следи за статусом.
4. Разбери таблицу лидов; в карточке — контакты, фото, история, папка.
5. Помечай статусы вручную — повторный сбор их не откатит.

## 🗃 Структура проекта

```text
backend/
  yamap_landing_web.py     точка входа FastAPI (app, роуты, main)
  core.py                  пути, конфиг, репозиторий, общие хелперы
  guards.py                локальная защита + лимиты Яндекса
  folders.py               папки лидов
  cities.py                справочник городов/регионов
  leads.py                 извлечение и сохранение лида
  lead_filters.py          фильтры отбора (keep_lead, is_chain, гео)
  lead_pipeline.py         оркестрация сбора, провайдеры, job
  yamap_landing_parser.py  парсер Яндекс.Карт
  lead_studio/             SQLite-репозиторий, провайдеры (yandex, 2gis)
frontend/                  React + Vite + Tailwind + shadcn
electron/                  десктоп-обёртка (окно над локальным сервером)
scripts/site_audit.py      аудит сайта без браузера (PageSpeed)
```

## 🌐 Источники и браузеры

| Источник | Как работает | Требования |
| :------- | :----------- | :--------- |
| **Яндекс.Карты** | парсинг публичной страницы (не API), самолимит ~80/день + паузы | — |
| **2GIS** | через установленный браузер | Chrome / Edge / Яндекс / Opera / Brave / Vivaldi / Firefox |

> Без браузера 2GIS не работает; Яндекс работает всегда.

## 📦 Сборка портативной версии

Нужны Python, Node и `pyinstaller` (`pip install pyinstaller`):

```cmd
:: 1. backend → self-contained exe
cd backend && python -m PyInstaller --noconfirm --clean lls-backend.spec && cd ..
:: 2. фронт
cd frontend && npm run build && cd ..
:: 3. портативный .exe
cd electron && npm install && npm run dist
:: 4. убрать build-мусор, оставить только .exe
cd .. && clean.bat
```

Результат — `electron/dist/Local Lead Studio 0.1.0.exe` (Windows x64, ~100 МБ, Python не нужен).

## 🛠 Разработка

```cmd
:: frontend
cd frontend && npx tsc -p tsconfig.app.json --noEmit && npm run lint && npm run build
:: backend
cd backend && python -m py_compile yamap_landing_web.py core.py lead_pipeline.py
```

## 🔒 Данные и приватность

- БД, выгрузки, фото → папка `lead_studio_data` рядом с парсером (в dev — в корне проекта, в portable — рядом с `.exe`). В git не коммитятся.
- Только публичные данные карточек. Чужие фото/отзывы не публиковать без согласия.

## ⚠️ Ограничения

- Локальный инструмент; backend слушает только `localhost`.
- 2GIS зависит от установленного браузера.
- Портативный `.exe` — Windows x64; первый запуск медленнее (распаковка во временную папку).
- Подписи кода нет — SmartScreen может предупредить при первом запуске.
