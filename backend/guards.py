from __future__ import annotations
import json
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

from core import (
    YANDEX_GUARD_PATH,
    YANDEX_DAILY_SEARCH_LIMIT,
    YANDEX_COOLDOWN_HOURS,
)


def require_no_active_run() -> None:
    from lead_pipeline import JOB_MANAGER
    if JOB_MANAGER.is_running():
        raise HTTPException(status_code=409, detail="Сбор уже идёт. Дождитесь завершения или перезапустите приложение.")


def read_yandex_guard() -> dict:
    try:
        data = json.loads(YANDEX_GUARD_PATH.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        data = {}
    if data.get("date") != datetime.now(timezone.utc).date().isoformat():
        data = {"date": datetime.now(timezone.utc).date().isoformat(), "search_requests": 0}
    data.setdefault("search_requests", 0)
    data.setdefault("cooldown_until", "")
    return data


def write_yandex_guard(data: dict) -> None:
    YANDEX_GUARD_PATH.parent.mkdir(parents=True, exist_ok=True)
    YANDEX_GUARD_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def yandex_guard_status() -> dict:
    data = read_yandex_guard()
    remaining = max(0, YANDEX_DAILY_SEARCH_LIMIT - int(data.get("search_requests") or 0))
    return {
        "date": data["date"],
        "search_requests": data["search_requests"],
        "daily_limit": YANDEX_DAILY_SEARCH_LIMIT,
        "remaining": remaining,
        "cooldown_until": data.get("cooldown_until") or "",
    }


def require_yandex_request_slot() -> None:
    data = read_yandex_guard()
    cooldown_until = data.get("cooldown_until") or ""
    if cooldown_until:
        try:
            cooldown_dt = datetime.fromisoformat(cooldown_until)
        except ValueError:
            cooldown_dt = None
        if cooldown_dt and cooldown_dt > datetime.now(timezone.utc):
            raise RuntimeError(f"Yandex cooldown до {cooldown_until}. Сбор остановлен после признака блокировки.")
    if int(data.get("search_requests") or 0) >= YANDEX_DAILY_SEARCH_LIMIT:
        raise RuntimeError(f"Суточный лимит Яндекс-запросов достигнут: {YANDEX_DAILY_SEARCH_LIMIT}.")


def record_yandex_search_attempt() -> None:
    data = read_yandex_guard()
    data["search_requests"] = int(data.get("search_requests") or 0) + 1
    write_yandex_guard(data)


def record_yandex_cooldown(status_code: int) -> None:
    data = read_yandex_guard()
    cooldown_until = datetime.now(timezone.utc) + timedelta(hours=YANDEX_COOLDOWN_HOURS)
    data["cooldown_until"] = cooldown_until.isoformat()
    data["last_stop_code"] = status_code
    write_yandex_guard(data)
