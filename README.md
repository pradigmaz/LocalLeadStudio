# Tehspec Course Tools

Локальный пайплайн для личной базы по курсу:

1. скачать доступное из авторизованной сессии видео;
2. транскрибировать локальной Whisper-совместимой моделью;
3. собрать Codex-facing заметки.

Инструменты не обходят оплату, DRM или закрытый доступ. Они работают только с
HTML урока, cookies или подписанным iframe URL, которые уже доступны владельцу
аккаунта.

## Проверка видео

```powershell
python .\tehspec_course_tools\download_lesson.py --iframe-url "<sign-player URL>" --dry-run
```

## Скачивание

```powershell
python .\tehspec_course_tools\download_lesson.py --iframe-url "<sign-player URL>"
```

Если урок открывается в обычном браузере и есть cookies.txt:

```powershell
python .\tehspec_course_tools\download_lesson.py --lesson-url "https://tehspec.tech/pl/teach/control/lesson/view?id=344156969&editMode=0" --cookies .\cookies.txt
```

## Транскрибация

`ffmpeg` уже найден в системе. Локальная `.venv` на Python 3.12 создана,
`faster-whisper` установлен.

```powershell
.\.venv\Scripts\python .\tehspec_course_tools\transcribe_local.py ".\course_knowledge\media\LESSON.mp4" --model small
```

CUDA-путь на этой машине сейчас требует системную библиотеку `cublas64_12.dll`,
поэтому проверенный режим - `--device cpu --compute-type int8`.

## Сборка заметок

```powershell
python .\tehspec_course_tools\build_codex_docs.py
```
