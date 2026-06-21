from __future__ import annotations
import json
import os
import re
import sqlite3
import sys
import time
from pathlib import Path
from threading import Event
from functools import lru_cache

from fastapi import HTTPException, Request as FastAPIRequest

sys.path.append(str(Path(__file__).parent.resolve()))
from lead_studio.adapters.sqlite_repo import SQLiteRepo

ROOT = Path(__file__).parent.resolve()
PROJECT_ROOT = ROOT.parent
LEGACY_DATA_DIR = ROOT / "lead_studio_data"
# Frozen (PyInstaller): read-only ассеты из бандла. Данные — рядом с .exe
# (или путь из LLS_DATA_DIR, который задаёт лаунчер/Electron).
FROZEN = getattr(sys, "frozen", False)
_DATA_OVERRIDE = os.environ.get("LLS_DATA_DIR")
if FROZEN:
    BUNDLE_DIR = Path(getattr(sys, "_MEIPASS", ROOT))
    DATA_DIR = Path(_DATA_OVERRIDE) if _DATA_OVERRIDE else Path(sys.executable).parent / "lead_studio_data"
    CONFIG_PATH = BUNDLE_DIR / "config.json"
else:
    BUNDLE_DIR = ROOT
    DATA_DIR = Path(_DATA_OVERRIDE) if _DATA_OVERRIDE else PROJECT_ROOT / "lead_studio_data"
    CONFIG_PATH = PROJECT_ROOT / "config.json"
DATA_DIR.mkdir(parents=True, exist_ok=True)
YANDEX_GUARD_PATH = DATA_DIR / "yandex_request_guard.json"
LOCAL_CLIENT_HOSTS = {"127.0.0.1", "::1", "localhost"}
LOCAL_CORS_ORIGINS = ["http://127.0.0.1:5173", "http://localhost:5173"]
CONFIRM_HEADER = "X-LocalLead-Confirm"
REQUIRED_DB_TABLES = {"organizations", "leads", "runs", "run_results", "files", "lead_events"}
REQUIRED_DB_COLUMNS = {
    "organizations": {"id", "source", "source_org_id", "name"},
    "leads": {"id", "organization_id"},
    "runs": {"id", "name"},
    "run_results": {"id", "run_id", "organization_id"},
    "files": {"id", "organization_id", "file_type", "local_path"},
    "lead_events": {"id", "lead_id", "event_type"},
}
MAX_QUERY_LINES = 40
MAX_PER_QUERY = 10
YANDEX_DAILY_SEARCH_LIMIT = 80
YANDEX_COOLDOWN_HOURS = 24
DEFAULT_YANDEX_DELAY_SECONDS = 8.0
MAX_YANDEX_DELAY_SECONDS = 60.0
YANDEX_JITTER_SECONDS = 4.0
YANDEX_STOP_CODES = {403, 429}
TARGET_CITY_RADIUS_KM = 18.0
STREET_FALLBACK_TOKENS = {
    "аллея",
    "бул",
    "бульвар",
    "дорога",
    "линия",
    "наб",
    "набережная",
    "пер",
    "переулок",
    "пл",
    "площадь",
    "пр",
    "проезд",
    "проспект",
    "тракт",
    "тупик",
    "шоссе",
}
LOW_VALUE_LOCALITY_RE = re.compile(
    r"\b(село|деревня|пос[её]лок|хутор|аул|кишлак|улус|кордон|починок|разъезд|станция)\b",
    re.IGNORECASE,
)
URBAN_TYPE_LOCALITY_RE = re.compile(
    r"\b(пгт|пос[её]лок городского типа|рабочий пос[её]лок)\b",
    re.IGNORECASE,
)
LOCALITY_QUALIFIER_RE = re.compile(
    r"\([^)]*(район|область|край|республика|округ|муницип|поселение)[^)]*\)",
    re.IGNORECASE,
)
try:
    CONFIG = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
except Exception:
    CONFIG = {"search": {"regions": {}}, "parser": {"default_chains": [], "max_photos": 12, "street_indicators": [], "business_indicators": [], "country_indicators": []}}

DEFAULT_CHAINS = tuple(CONFIG["parser"].get("default_chains", []))
CHAIN_DOMAINS = tuple(CONFIG["parser"].get("chain_domains", []))
POPULAR_PLACE_CATEGORIES = tuple(CONFIG["parser"].get("popular_place_categories", []))
POPULAR_PLACE_MIN_REVIEWS = int(CONFIG["parser"].get("popular_place_min_reviews", 300))
POPULAR_PLACE_MIN_RATING_COUNT = int(CONFIG["parser"].get("popular_place_min_rating_count", 700))
POPULAR_PLACE_CITY_REVIEW_LIMITS = {
    re.sub(r"\s+", " ", re.sub(r"[^\w\sА-Яа-яЁё]", " ", str(city or "").lower())).strip(): int(limit)
    for city, limit in CONFIG["parser"].get("popular_place_city_review_limits", {}).items()
}
EXCLUDED_POPULAR_PLACES = CONFIG["parser"].get("excluded_popular_places", {})
MAX_PHOTOS = CONFIG["parser"].get("max_photos", 12)
STREET_INDICATORS = set(CONFIG["parser"].get("street_indicators", []))
BUSINESS_INDICATORS = set(CONFIG["parser"].get("business_indicators", []))
COUNTRY_INDICATORS = CONFIG["parser"].get("country_indicators", ["россия", "russia"])

KNOWN_CITIES = []
for _cities in CONFIG["search"].get("regions", {}).values():
    KNOWN_CITIES.extend(_cities)
KNOWN_CITY_KEYS = {
    re.sub(r"\s+", " ", re.sub(r"[^\w\sА-Яа-яЁё]", " ", city.lower())).strip()
    for city in KNOWN_CITIES
}


def get_db_repo() -> SQLiteRepo:
    return SQLiteRepo(DATA_DIR / "app.db")


def data_file(name: str) -> Path:
    if FROZEN:
        return BUNDLE_DIR / name
    path = DATA_DIR / name
    return path if path.exists() else LEGACY_DATA_DIR / name


@lru_cache(maxsize=16)
def read_json_file(path: str, mtime_ns: int) -> object:
    del mtime_ns
    return json.loads(Path(path).read_text(encoding="utf-8"))


def load_json_data(path: Path, fallback: object) -> object:
    if not path.exists():
        return fallback
    try:
        return read_json_file(str(path), path.stat().st_mtime_ns)
    except Exception:
        return fallback


def load_cities_data() -> dict:
    data = load_json_data(data_file("cities.json"), {"areas": []})
    return data if isinstance(data, dict) else {"areas": []}


def normalize_search_text(value: object) -> str:
    return re.sub(r"\s+", " ", str(value).lower().replace("ё", "е")).strip()


def strip_name_qualifier(value: object) -> str:
    return re.sub(r"\s*\([^)]*\)", "", str(value)).strip()


def require_local_request(request: FastAPIRequest, require_confirm: bool = False) -> None:
    host = request.client.host if request.client else ""
    if host not in LOCAL_CLIENT_HOSTS:
        raise HTTPException(status_code=403, detail="Local requests only")
    if require_confirm and request.headers.get(CONFIRM_HEADER) != "1":
        raise HTTPException(status_code=400, detail="Missing local confirmation header")


def validate_sqlite_database(db_path: Path) -> None:
    with sqlite3.connect(db_path) as conn:
        check = conn.execute("PRAGMA quick_check").fetchone()
        if not check or check[0] != "ok":
            raise HTTPException(status_code=400, detail="Invalid SQLite database integrity check")
        rows = conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall()
        tables = {row[0] for row in rows}
        missing = sorted(REQUIRED_DB_TABLES - tables)
        if missing:
            raise HTTPException(status_code=400, detail=f"Invalid Local Lead Studio DB, missing tables: {', '.join(missing)}")
        missing_columns = []
        for table, required_columns in REQUIRED_DB_COLUMNS.items():
            columns = {row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
            missing_columns.extend(f"{table}.{column}" for column in sorted(required_columns - columns))
        if missing_columns:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid Local Lead Studio DB, missing columns: {', '.join(missing_columns)}",
            )
    try:
        SQLiteRepo(db_path)
    except sqlite3.DatabaseError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid Local Lead Studio DB schema: {exc}") from exc


def normalize_queries(value: str) -> list[str]:
    queries, seen = [], set()
    for line in value.splitlines():
        query = re.sub(r"\s+", " ", line).strip()
        if not query:
            continue
        key = query.lower()
        if key in seen:
            continue
        seen.add(key)
        queries.append(query)
    return queries


def clamp_int(value: object, default: int, minimum: int, maximum: int) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        number = default
    return max(minimum, min(maximum, number))


def clamp_float(value: object, default: float, minimum: float, maximum: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        number = default
    return max(minimum, min(maximum, number))


def sleep_with_cancel(seconds: float, cancel_event: Event | None) -> bool:
    deadline = time.monotonic() + seconds
    while True:
        if cancel_event and cancel_event.is_set():
            return False
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return True
        time.sleep(min(remaining, 0.25))
