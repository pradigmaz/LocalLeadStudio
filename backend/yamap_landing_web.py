from __future__ import annotations
import json
import math
import random
import re
import shutil
import sqlite3
import subprocess
import uuid
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import Event
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from typing import Callable, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from fastapi import FastAPI, HTTPException, Query, Request as FastAPIRequest
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
import uvicorn

from yamap_landing_parser import (
    HEADERS,
    extract_state,
    feature_names,
    image_urls,
    links_from_item,
    render_brief,
    http_get_html,
)
import sys
sys.path.append(str(Path(__file__).parent.resolve()))
from lead_studio.adapters.sqlite_repo import SQLiteRepo
from lead_studio.job_manager import JobManager

ROOT = Path(__file__).parent.resolve()
PROJECT_ROOT = ROOT.parent
DATA_DIR = PROJECT_ROOT / "lead_studio_data"
LEGACY_DATA_DIR = ROOT / "lead_studio_data"
CONFIG_PATH = PROJECT_ROOT / "config.json"
YANDEX_GUARD_PATH = DATA_DIR / "yandex_request_guard.json"
LOCAL_CLIENT_HOSTS = {"127.0.0.1", "::1", "localhost"}
LOCAL_CORS_ORIGINS = ["http://127.0.0.1:5173", "http://localhost:5173"]
CONFIRM_HEADER = "X-LocalLead-Confirm"
REQUIRED_DB_TABLES = {"organizations", "leads", "runs", "run_results", "files", "lead_events"}
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


def require_no_active_run() -> None:
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


def data_file(name: str) -> Path:
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


def city_region_summary(region: dict) -> dict:
    cities = region.get("areas") if isinstance(region.get("areas"), list) else []
    return {
        "id": region.get("id", ""),
        "name": region.get("name", ""),
        "city_count": len(cities),
    }


def find_city_region(region_id: str) -> Optional[dict]:
    for region in load_cities_data().get("areas", []):
        if str(region.get("id", "")) == region_id:
            return region
    return None


def normalize_search_text(value: object) -> str:
    return re.sub(r"\s+", " ", str(value).lower().replace("ё", "е")).strip()


def strip_name_qualifier(value: object) -> str:
    return re.sub(r"\s*\([^)]*\)", "", str(value)).strip()


def is_low_value_locality(city: dict) -> bool:
    name = str(city.get("name", ""))
    if URBAN_TYPE_LOCALITY_RE.search(name):
        return False
    return bool(LOW_VALUE_LOCALITY_RE.search(name) or LOCALITY_QUALIFIER_RE.search(name))


def visible_city_rows(cities: list, include_small: bool) -> list:
    if include_small:
        return cities
    return [city for city in cities if not is_low_value_locality(city)]


def search_match_score(value: object, needle: str, *, ignore_qualifier: bool = False) -> Optional[tuple[int, int]]:
    searchable = strip_name_qualifier(value) if ignore_qualifier else value
    text = normalize_search_text(searchable)
    if not text or not needle:
        return None
    if text == needle:
        return (0, 0)
    if text.startswith(needle):
        return (10, len(text) - len(needle))

    for index, token in enumerate(re.split(r"[\s,().-]+", text)):
        if token.startswith(needle):
            return (20 + index, len(token) - len(needle))

    position = text.find(needle)
    if position >= 0:
        return (50 + position, len(text) - len(needle))
    return None


def search_city_regions(query: str, limit_regions: int, limit_cities: int, include_small: bool) -> dict:
    needle = normalize_search_text(query)
    if not needle:
        return {"areas": []}

    region_hits = []
    for region_index, region in enumerate(load_cities_data().get("areas", [])):
        region_name = str(region.get("name", ""))
        all_cities = region.get("areas") if isinstance(region.get("areas"), list) else []
        cities = visible_city_rows(all_cities, include_small)

        region_score = search_match_score(region_name, needle)
        matched_cities = []
        for city_index, city in enumerate(cities):
            city_score = search_match_score(city.get("name", ""), needle, ignore_qualifier=True)
            if not city_score:
                continue
            matched_cities.append((city_score, city_index, city))

        if not region_score and not matched_cities:
            continue

        matched_cities.sort(key=lambda item: (item[0][0], item[0][1], item[1]))
        rank_candidates = []
        if region_score:
            rank_candidates.append((region_score[0], 0, region_score[1], region_index))
        if matched_cities:
            best_city_score = matched_cities[0][0]
            rank_candidates.append((best_city_score[0], 1 if not region_score else 0, best_city_score[1], region_index))

        if matched_cities:
            result_cities = [city for _score, _index, city in matched_cities[:limit_cities]]
        elif cities:
            result_cities = cities[:limit_cities]
        else:
            result_cities = [{
                "id": region.get("id", ""),
                "name": region.get("name", ""),
                "parent_id": region.get("parent_id"),
            }]

        region_hits.append((min(rank_candidates), {
            "id": region.get("id", ""),
            "name": region.get("name", ""),
            "city_count": len(cities),
            "total_city_count": len(all_cities),
            "areas": result_cities,
        }))

    return {"areas": [region for _rank, region in sorted(region_hits)[:limit_regions]]}


def require_local_request(request: FastAPIRequest, require_confirm: bool = False) -> None:
    host = request.client.host if request.client else ""
    if host not in LOCAL_CLIENT_HOSTS:
        raise HTTPException(status_code=403, detail="Local requests only")
    if require_confirm and request.headers.get(CONFIRM_HEADER) != "1":
        raise HTTPException(status_code=400, detail="Missing local confirmation header")


def validate_sqlite_database(db_path: Path) -> None:
    with sqlite3.connect(db_path) as conn:
        rows = conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall()
    tables = {row[0] for row in rows}
    missing = sorted(REQUIRED_DB_TABLES - tables)
    if missing:
        raise HTTPException(status_code=400, detail=f"Invalid Local Lead Studio DB, missing tables: {', '.join(missing)}")


def search_items(query: str, limit: int) -> list[dict]:
    url = f"https://yandex.ru/maps/?text={quote(query)}"
    state = extract_state(http_get_html(url))
    items = []
    seen = set()
    for entry in state.get("stack") or []:
        for item in ((entry.get("results") or {}).get("items")) or []:
            item_id = item.get("id")
            if item.get("type") == "business" and item_id and item_id not in seen:
                seen.add(item_id)
                items.append(item)
    return items[:limit]


def find_region_part(parts: list[str]) -> str:
    for part in parts:
        pl = part.lower()
        if any(w in pl for w in ["область", "обл.", "край", "республика", "респ.", "автономный округ", "ао"]):
            return part
    return ""


def city_candidate_parts(parts: list[str], region: str) -> list[str]:
    candidates = []
    for part in parts:
        pl = part.lower()
        if pl in COUNTRY_INDICATORS:
            continue
        if region and part == region:
            continue
        if any(char.isdigit() for char in part):
            continue
        if re.search(r'[a-zA-Z]', part):
            continue

        tokens = set(re.findall(r'[а-яё]+', pl))
        if tokens.intersection(STREET_INDICATORS) or tokens.intersection(STREET_FALLBACK_TOKENS) or tokens.intersection(BUSINESS_INDICATORS):
            continue
        candidates.append(part)
    return candidates


def choose_city_candidate(candidates: list[str]) -> str:
    if not candidates:
        return ""
    filtered_candidates = [c for c in candidates if "район" not in c.lower()]
    if filtered_candidates:
        city_indicators = ["город", "г.", "село", "поселок", "посёлок", "рабочий поселок", "рабочий посёлок", "деревня", "р.п.", "п.г.т.", "станица", "хутор"]
        for cand in filtered_candidates:
            if any(ind in cand.lower() for ind in city_indicators):
                return cand
        return filtered_candidates[0]
    return candidates[0]


def clean_city_name(city: str) -> str:
    if not city:
        return ""
    city_lower = city.lower()
    if "городской округ" in city_lower:
        city = city.replace("городской округ", "").replace("городской", "").replace("округ", "").strip()
    if "городское поселение" in city_lower:
        city = city.replace("городское поселение", "").replace("городское", "").replace("поселение", "").strip()

    return re.sub(
        r'^(поселок\sгородского\sтипа\s|посёлок\sгородского\sтипа\s|рабочий\sпоселок\s|рабочий\sпосёлок\s|'
        r'р\.п\.\s|п\.г\.т\.\s|пгт\s|г\.|г\s|город\s|село\s|деревня\s|поселок\s|посёлок\s|станица\s|'
        r'хутор\s|аул\s|кишлак\s|улус\s|кордон\s|починок\s|разъезд\s|станция\s)+',
        '',
        city,
        flags=re.IGNORECASE,
    ).strip()


def fallback_known_city(address: str, query: str) -> str:
    combined = (query or "") + " " + (address or "")
    for city in KNOWN_CITIES:
        if re.search(r'\b' + re.escape(city) + r'\b', combined, re.IGNORECASE):
            return city
    return ""


def extract_city_region(address: str, query: str = "") -> tuple[str, str]:
    if not address:
        return "", ""

    parts = [p.strip() for p in address.split(",")]
    region = find_region_part(parts)
    city = clean_city_name(choose_city_candidate(city_candidate_parts(parts, region)))

    if region:
        region = re.sub(r'^(республика\s)+', '', region, flags=re.IGNORECASE).strip()

    if not city:
        city = fallback_known_city(address, query)

    return city, region


def lead_from_item(item: dict, query: str) -> dict:
    row = {"Ссылка на карточку": f"https://yandex.ru/maps/org/{item.get('id', '')}"}
    websites, socials = links_from_item(item, row)
    rating = item.get("ratingData") or {}
    categories = item.get("categories") or []
    phones = item.get("phones") or []
    address = item.get("address", "")
    city, region = extract_city_region(address, query)
        
    features = feature_names(item)
    
    desc = item.get("description", "") or item.get("shortDescription", "")
    if desc:
        features.insert(0, f"Описание: {desc}")
        
    emails = item.get("emails") or []
    for email in emails:
        val = email.get("email") if isinstance(email, dict) else str(email)
        if val:
            features.insert(0, f"Email: {val}")
            
    actions = item.get("actions") or []
    for action in actions:
        if action.get("type") == "booking" and action.get("url"):
            features.append(f"Бронь/Запись: {action['url']}")
            
    return {
        "id": item.get("id", ""),
        "query": query,
        "name": item.get("title", ""),
        "category": ", ".join(c.get("name", "") for c in categories if c.get("name")),
        "address": address,
        "city": city,
        "region": region,
        "coordinates": item.get("coordinates") or [],
        "rating": rating.get("ratingValue", ""),
        "rating_count": rating.get("ratingCount", ""),
        "review_count": rating.get("reviewCount", ""),
        "phones": [{"number": p.get("number", ""), "info": p.get("info", "")} for p in phones],
        "websites": websites,
        "socials": socials,
        "hours": item.get("workingTimeText", ""),
        "features": features,
        "photos": image_urls(item, MAX_PHOTOS),
        "reviews": [],
        "yandex_url": row["Ссылка на карточку"],
        "has_site": bool(websites),
        "fetch_error": "",
        "source_row": {},
    }


def slug(value: str, fallback: str = "lead") -> str:
    value = re.sub(r"[^0-9A-Za-zА-Яа-яЁё_-]+", "_", value).strip("_")
    return value[:80] or fallback


def normalize_filter_text(value: object) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\sА-Яа-яЁё]", " ", str(value or "").lower().replace("ё", "е"))).strip()


def strip_locality_type(value: object) -> str:
    text = str(value or "").strip()
    text = re.sub(
        r"^(поселок\sгородского\sтипа\s|посёлок\sгородского\sтипа\s|рабочий\sпоселок\s|рабочий\sпосёлок\s|"
        r"пгт\s|п\.г\.т\.\s|р\.п\.\s|г\.|г\s|город\s|село\s|деревня\s|поселок\s|посёлок\s|станица\s|"
        r"хутор\s|аул\s|кишлак\s|улус\s|кордон\s|починок\s|разъезд\s|станция\s)+",
        "",
        text,
        flags=re.IGNORECASE,
    )
    return normalize_filter_text(text)


def target_city_key(value: object) -> str:
    return strip_locality_type(strip_name_qualifier(value))


@lru_cache(maxsize=1)
def city_coordinate_index() -> tuple[tuple[str, float, float], ...]:
    items: list[tuple[str, float, float]] = []
    for region in load_cities_data().get("areas", []):
        cities = region.get("areas") if isinstance(region.get("areas"), list) else []
        for city in cities:
            key = target_city_key(city.get("name"))
            if not key:
                continue
            try:
                lat = float(city.get("lat"))
                lng = float(city.get("lng"))
            except (TypeError, ValueError):
                continue
            items.append((key, lat, lng))
    return tuple(sorted(items, key=lambda item: len(item[0]), reverse=True))


def target_city_from_query(query: object) -> tuple[str, float, float] | None:
    normalized_query = normalize_filter_text(query)
    if not normalized_query:
        return None
    for city_key, lat, lng in city_coordinate_index():
        if re.search(rf"\b{re.escape(city_key)}\b", normalized_query):
            return city_key, lat, lng
    return None


def locality_matches_target(city_key: str, target_key: str) -> bool:
    city_stem = city_key.rstrip("ь")
    target_stem = target_key.rstrip("ь")
    return (
        city_key == target_key
        or city_key.startswith(target_stem)
        or target_key.startswith(city_stem)
    )


def distance_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius_km = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lng2 - lng1)
    a = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    )
    return radius_km * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def is_outside_target_city(lead: dict) -> bool:
    target = target_city_from_query(lead.get("query"))
    if not target:
        return False
    target_key, target_lat, target_lng = target

    city_key = target_city_key(lead.get("city"))
    if city_key and not locality_matches_target(city_key, target_key):
        return True

    coords = lead.get("coordinates") or []
    if len(coords) < 2:
        return False
    try:
        lng = float(coords[0])
        lat = float(coords[1])
    except (TypeError, ValueError):
        return False
    return distance_km(target_lat, target_lng, lat, lng) > TARGET_CITY_RADIUS_KM


def is_low_value_locality_address(lead: dict) -> bool:
    for part in str(lead.get("address") or "").split(","):
        part = part.strip()
        if not part:
            continue
        if URBAN_TYPE_LOCALITY_RE.search(part):
            return False
        if LOW_VALUE_LOCALITY_RE.search(part):
            return strip_locality_type(part) not in KNOWN_CITY_KEYS
    return False


def is_chain(lead: dict, chain_words: list[str]) -> bool:
    name = (lead["name"] or "").lower()
    # Normalize punctuation to spaces for whole-word comparison
    name_clean = re.sub(r'[^\w\sА-Яа-яЁё]', ' ', name)
    words_in_name = name_clean.split()
    
    for word in chain_words:
        word = word.strip().lower()
        if not word:
            continue
        if " " in word:
            # Multi-word brand: check substring match
            if word in name:
                return True
        else:
            # Single-word brand: match only whole words to prevent substring false positives
            if word in words_in_name:
                return True
    websites = " ".join(str(site).lower() for site in lead.get("websites", []))
    if websites and any(domain and domain in websites for domain in CHAIN_DOMAINS):
        return True
    return False


def is_excluded_popular_place(lead: dict) -> bool:
    name = normalize_filter_text(lead.get("name"))
    city = normalize_filter_text(lead.get("city"))
    query = normalize_filter_text(lead.get("query"))
    city_keys = {city, query}
    city_keys.update(part for part in query.split() if part)
    for key in ("*", *city_keys):
        for item in EXCLUDED_POPULAR_PLACES.get(key, []):
            blocked_name = normalize_filter_text(item)
            if blocked_name and blocked_name in name:
                return True
    return False


def popular_place_review_limit(lead: dict) -> int:
    city = normalize_filter_text(lead.get("city"))
    query = normalize_filter_text(lead.get("query"))
    if city in POPULAR_PLACE_CITY_REVIEW_LIMITS:
        return POPULAR_PLACE_CITY_REVIEW_LIMITS[city]
    for city_name, limit in POPULAR_PLACE_CITY_REVIEW_LIMITS.items():
        if city_name and city_name in query:
            return limit
    return POPULAR_PLACE_MIN_REVIEWS


def is_high_profile_redesign(lead: dict) -> bool:
    if not lead.get("has_site"):
        return False
    category = normalize_filter_text(lead.get("category"))
    category_words = set(category.split())
    category_match = False
    for item in POPULAR_PLACE_CATEGORIES:
        pattern = normalize_filter_text(item)
        if " " in pattern and pattern in category:
            category_match = True
        elif pattern in category_words:
            category_match = True
    if not category_match:
        return False
    review_limit = popular_place_review_limit(lead)
    rating_limit = max(POPULAR_PLACE_MIN_RATING_COUNT, review_limit * 2)
    reviews = int(float(lead.get("review_count") or 0))
    ratings = int(float(lead.get("rating_count") or 0))
    return reviews >= review_limit or ratings >= rating_limit


def keep_lead(lead: dict, config: dict, chain_words: list[str]) -> tuple[bool, str]:
    if config.get("skipWithSite", True) and lead["has_site"] and not config.get("keepSitesForRedesign", True):
        return False, "есть сайт"
    if is_chain(lead, chain_words):
        return False, "сетевик"
    if is_outside_target_city(lead):
        return False, "вне выбранного города"
    if is_low_value_locality_address(lead):
        return False, "село/деревня вне целевого города"
    if is_excluded_popular_place(lead):
        return False, "популярное место города"
    if is_high_profile_redesign(lead):
        return False, "слишком популярное место для редизайна"
    min_reviews = int(config.get("minReviews") or 0)
    if int(float(lead["review_count"] or 0)) < min_reviews:
        return False, "мало отзывов"
    if config.get("requirePhotos", True) and not lead["photos"]:
        return False, "нет фото"
    return True, ""


def apply_fields_to_parse(lead: dict, fields_to_parse: list[str] | None) -> None:
    if not fields_to_parse:
        return
    fields = set(fields_to_parse)
    if "sites" not in fields:
        lead["websites"] = []
        lead["has_site"] = False
    if "socials" not in fields:
        lead["socials"] = []
    if "phones" not in fields:
        lead["phones"] = []
    if "photos" not in fields:
        lead["photos"] = []


def download_photos(lead: dict, folder: Path) -> int:
    photo_dir = folder / "photos"
    photo_dir.mkdir(exist_ok=True)
    
    def download_single(index: int, photo: dict) -> bool:
        try:
            request = Request(photo["url"], headers=HEADERS)
            with urlopen(request, timeout=10) as response:
                data = response.read()
            (photo_dir / f"{index:02}.jpg").write_bytes(data)
            return True
        except Exception as exc:  # noqa: BLE001
            photo["download_error"] = str(exc)
            return False

    with ThreadPoolExecutor(max_workers=5) as executor:
        results = executor.map(lambda arg: download_single(*arg), enumerate(lead["photos"], 1))
    
    return sum(results)


def save_lead(lead: dict, output_root: Path, download: bool) -> dict:
    folder = output_root / f"{slug(lead['name'])}_{slug(lead['id'], 'noid')}"
    folder.mkdir(parents=True, exist_ok=True)
    if download:
        lead["downloaded_photos"] = download_photos(lead, folder)
    (folder / "data.json").write_text(json.dumps(lead, ensure_ascii=False, indent=2), encoding="utf-8")
    (folder / "brief.md").write_text(render_brief(lead), encoding="utf-8-sig")
    return {"name": lead["name"], "folder": str(folder), "photos": len(lead["photos"]), "site": ", ".join(lead["websites"]), "angle": "редизайн сайта" if lead["has_site"] else "новый сайт"}


def is_lead_folder(path: Path) -> bool:
    return path.is_dir() and (path / "brief.md").exists() and (path / "data.json").exists()


def lead_folder_roots() -> tuple[Path, ...]:
    return (DATA_DIR / "runs", LEGACY_DATA_DIR / "runs", PROJECT_ROOT.parent / "yamap_landing_runs")


def is_safe_lead_folder(path: Path) -> bool:
    try:
        resolved = path.resolve()
        if not is_lead_folder(resolved):
            return False
        return any(resolved.is_relative_to(root.resolve()) for root in lead_folder_roots() if root.exists())
    except OSError:
        return False


def delete_lead_folders(paths: list[str]) -> int:
    deleted = 0
    for raw_path in paths:
        if not raw_path:
            continue
        folder = Path(raw_path)
        if not is_safe_lead_folder(folder):
            continue
        shutil.rmtree(folder.resolve())
        deleted += 1
    return deleted


def find_lead_folder(lead_id: str) -> Path | None:
    repo = get_db_repo()
    with repo.get_connection() as conn:
        row = conn.execute(
            """
            SELECT o.source_org_id, o.data_folder
            FROM leads l
            JOIN organizations o ON l.organization_id = o.id
            WHERE l.id = ?
            """,
            (lead_id,),
        ).fetchone()

    if not row:
        return None

    data_folder = str(row["data_folder"] or "").strip()
    if data_folder:
        folder = Path(data_folder).resolve()
        if is_lead_folder(folder):
            return folder

    source_org_id = str(row["source_org_id"] or "").strip()
    if not source_org_id:
        return None

    for root in lead_folder_roots():
        if not root.exists():
            continue
        for folder in root.glob(f"*/*_{source_org_id}"):
            resolved = folder.resolve()
            if is_lead_folder(resolved):
                return resolved
    return None


def open_folder_in_file_manager(path: Path) -> None:
    if sys.platform == "win32":
        subprocess.Popen(["explorer", str(path)])
    elif sys.platform == "darwin":
        subprocess.Popen(["open", str(path)])
    else:
        subprocess.Popen(["xdg-open", str(path)])


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


def organization_data_from_lead(lead: dict) -> dict:
    return {
        "source": "yandex",
        "source_org_id": str(lead["id"]),
        "dedupe_key": f"{lead['name']}_{lead['address']}".lower(),
        "name": lead["name"],
        "category": lead["category"],
        "address": lead["address"],
        "city": lead["city"],
        "region": lead["region"],
        "coordinates_json": json.dumps(lead["coordinates"], ensure_ascii=False),
        "rating": float(lead["rating"]) if lead["rating"] else None,
        "rating_count": int(lead["rating_count"]) if lead["rating_count"] else 0,
        "review_count": int(lead["review_count"]) if lead["review_count"] else 0,
        "phones_json": json.dumps(lead["phones"], ensure_ascii=False),
        "websites_json": json.dumps(lead["websites"], ensure_ascii=False),
        "socials_json": json.dumps(lead["socials"], ensure_ascii=False),
        "hours": lead["hours"],
        "features_json": json.dumps(lead["features"], ensure_ascii=False),
        "source_url": lead["yandex_url"],
        "photos_json": json.dumps(lead["photos"], ensure_ascii=False)
    }


def auto_mark_skipped_lead(repo: SQLiteRepo, lead_db_id: str, reason: str) -> None:
    current_status = repo.get_lead_status(lead_db_id)
    if current_status != "NEW":
        return

    reason_lower = reason.lower()
    if "сетевик" in reason_lower:
        repo.update_lead_status(lead_db_id, "CHAIN", current_status, "Авторазметка при парсинге")
    elif "мало отзывов" in reason_lower or "нет фото" in reason_lower:
        repo.update_lead_status(lead_db_id, "JUNK", current_status, "Авторазметка при парсинге")
    elif "популярное место" in reason_lower or "село/деревня" in reason_lower or "вне выбранного города" in reason_lower:
        repo.update_lead_status(lead_db_id, "REJECT", current_status, "Авторазметка при парсинге")


def process_search_item(
    item: dict,
    query: str,
    config: dict,
    repo: SQLiteRepo,
    run_id: str,
    output_root: Path,
    chain_words: list[str],
    fields_to_parse: list[str] | None,
    seen_item_ids: set[str],
    saved: list[dict],
    skipped: list[dict],
    stats: dict,
) -> None:
    item_id = str(item.get("id") or "")
    if item_id and item_id in seen_item_ids:
        stats["duplicate_count"] += 1
        skipped.append({"query": query, "name": item.get("title", ""), "reason": "дубль в текущем запуске"})
        return
    if item_id:
        seen_item_ids.add(item_id)

    try:
        lead = lead_from_item(item, query)
        apply_fields_to_parse(lead, fields_to_parse)

        if is_chain(lead, chain_words):
            skipped.append({"query": query, "name": lead["name"], "reason": "сетевик"})
            stats["skipped_count"] += 1
            return

        org_id, is_new = repo.upsert_organization(organization_data_from_lead(lead))
        lead_db_id = repo.create_or_get_lead(org_id, {
            "lead_type": "REDESIGN" if lead["has_site"] else "NEW_SITE",
            "lead_status": "NEW",
            "reason": f"Парсинг: {query}"
        })

        ok, reason = keep_lead(lead, config, chain_words)
        if ok:
            saved_lead = save_lead(lead, output_root, bool(config.get("downloadPhotos")))
            saved.append(saved_lead)
            with repo.get_connection() as conn:
                conn.execute("UPDATE organizations SET data_folder = ? WHERE id = ?", (saved_lead["folder"], org_id))
            repo.add_run_result(run_id, org_id, query, "SAVED", was_new=is_new)
            stats["saved_count"] += 1
            return

        skipped.append({"query": query, "name": lead["name"], "reason": reason})
        repo.add_run_result(run_id, org_id, query, "SKIPPED", skip_reason=reason, was_new=is_new)
        stats["skipped_count"] += 1
        auto_mark_skipped_lead(repo, lead_db_id, reason)
    except Exception as exc:
        stats["error_count"] += 1
        print(f"Error processing item: {exc}")


def run_job(
    config: dict,
    progress_callback: Callable[[dict], None] | None = None,
    cancel_event: Event | None = None,
) -> dict:
    raw_queries = normalize_queries(config.get("queries") or "")
    query_limit = clamp_int(config.get("maxQueries"), MAX_QUERY_LINES, 1, MAX_QUERY_LINES)
    queries = raw_queries[:query_limit]
    run_name = slug(config.get("runName") or "yamap_run")
    output_dir = Path(config.get("outputDir") or DATA_DIR)
    if not output_dir.is_absolute():
        output_dir = PROJECT_ROOT / output_dir
    output_root = output_dir / "runs" / run_name
    output_root.mkdir(parents=True, exist_ok=True)
    user_chain_words = [part.strip().lower() for part in (config.get("excludeChains") or "").split(",")]
    chain_words = [word for word in dict.fromkeys([*DEFAULT_CHAINS, *user_chain_words]) if word]
    max_per_query = clamp_int(config.get("maxPerQuery"), 10, 1, MAX_PER_QUERY)
    request_delay = clamp_float(
        config.get("requestDelaySeconds"),
        DEFAULT_YANDEX_DELAY_SECONDS,
        DEFAULT_YANDEX_DELAY_SECONDS,
        MAX_YANDEX_DELAY_SECONDS,
    )
    fields_to_parse = config.get("fields_to_parse")
    
    # Initialize DB Repo
    repo = get_db_repo()
    
    # Track the run
    run_id = repo.create_run({
        "name": config.get("runName") or "yamap_run",
        "region": "",
        "queries_json": json.dumps(queries, ensure_ascii=False),
        "filters_json": json.dumps(config, ensure_ascii=False),
        "output_folder": str(output_root)
    })
    
    saved, skipped = [], []
    stats = {"saved_count": 0, "skipped_count": 0, "duplicate_count": 0, "error_count": 0}
    status = "FINISHED"
    rate_limit_error = ""

    if progress_callback:
        progress_callback({"query_total": len(queries), "query_index": 0})

    seen_item_ids = set()
    last_request_at = 0.0
    for query_index, query in enumerate(queries, 1):
        if cancel_event and cancel_event.is_set():
            status = "CANCELLED"
            break
        if progress_callback:
            progress_callback({"current_query": query, "query_index": query_index, **stats})

        elapsed = time.monotonic() - last_request_at
        wait_time = request_delay + random.uniform(0, YANDEX_JITTER_SECONDS) - elapsed
        if last_request_at and wait_time > 0 and not sleep_with_cancel(wait_time, cancel_event):
            status = "CANCELLED"
            break

        try:
            require_yandex_request_slot()
            record_yandex_search_attempt()
            items = search_items(query, max_per_query)
            last_request_at = time.monotonic()
        except RuntimeError as exc:
            stats["error_count"] += 1
            status = "RATE_LIMITED"
            rate_limit_error = str(exc)
            break
        except HTTPError as exc:
            stats["error_count"] += 1
            if exc.code in YANDEX_STOP_CODES:
                record_yandex_cooldown(exc.code)
                status = "RATE_LIMITED"
                rate_limit_error = f"Яндекс вернул HTTP {exc.code}; сбор остановлен, чтобы не усиливать блокировку"
                break
            skipped.append({"query": query, "name": "", "reason": f"HTTP {exc.code}"})
            continue
        except (URLError, TimeoutError, ValueError) as exc:
            stats["error_count"] += 1
            skipped.append({"query": query, "name": "", "reason": f"Ошибка запроса: {exc}"})
            continue

        for item in items:
            if cancel_event and cancel_event.is_set():
                status = "CANCELLED"
                break
            process_search_item(
                item=item,
                query=query,
                config=config,
                repo=repo,
                run_id=run_id,
                output_root=output_root,
                chain_words=chain_words,
                fields_to_parse=fields_to_parse,
                seen_item_ids=seen_item_ids,
                saved=saved,
                skipped=skipped,
                stats=stats,
            )
        if status == "CANCELLED":
            break
        if progress_callback:
            progress_callback(stats)

    repo.update_run_stats(run_id, stats)
    repo.finish_run(run_id, status)

    (output_root / "summary.json").write_text(
        json.dumps({
            "saved": saved,
            "skipped": skipped,
            "run_id": run_id,
            "status": status,
            "error": rate_limit_error,
            "query_limit_applied": len(raw_queries) > len(queries),
            "yandex_guard": yandex_guard_status(),
        }, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return {
        "output": str(output_root),
        "saved": saved,
        "skipped": skipped,
        "run_id": run_id,
        "status": status,
        "error": rate_limit_error,
        "query_count": len(queries),
        "yandex_guard": yandex_guard_status(),
        "_job_status": status,
    }


JOB_MANAGER = JobManager(run_job)


class RunJobRequest(BaseModel):
    queries: Optional[str] = None
    runName: Optional[str] = None
    outputDir: Optional[str] = None
    excludeChains: Optional[str] = None
    maxQueries: Optional[int] = MAX_QUERY_LINES
    maxPerQuery: Optional[int] = 10
    requestDelaySeconds: Optional[float] = DEFAULT_YANDEX_DELAY_SECONDS
    downloadPhotos: Optional[bool] = False
    skipWithSite: Optional[bool] = True
    keepSitesForRedesign: Optional[bool] = True
    minReviews: Optional[int] = 0
    requirePhotos: Optional[bool] = True
    # New fields for toggling parsed data
    fields_to_parse: Optional[list[str]] = None

class LeadEventCommentRequest(BaseModel):
    comment: str

class LeadUpdateRequest(BaseModel):
    lead_status: Optional[str] = None
    status: Optional[str] = None
    contact_status: Optional[str] = None
    priority: Optional[int] = None

app = FastAPI(title="Local Lead Studio API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=LOCAL_CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1024)

@app.get("/api/leads")
def get_leads():
    repo = get_db_repo()
    leads = repo.get_all_leads_view()
    return {"leads": leads}

@app.get("/api/leads/{lead_id}/events")
def get_lead_events(lead_id: str):
    repo = get_db_repo()
    with repo.get_connection() as conn:
        rows = conn.execute(
            "SELECT event_type, old_value, new_value, comment, created_at "
            "FROM lead_events WHERE lead_id = ? ORDER BY created_at DESC", 
            (lead_id,)
        ).fetchall()
        events = [dict(r) for r in rows]
    return {"events": events}


@app.post("/api/leads/{lead_id}/viewed")
def mark_lead_viewed(lead_id: str, request: FastAPIRequest):
    require_local_request(request)
    repo = get_db_repo()
    viewed_at = repo.mark_lead_viewed(lead_id)
    if viewed_at is None:
        raise HTTPException(status_code=404, detail="Lead not found")
    return {"success": True, "viewed_at": viewed_at}


@app.post("/api/leads/{lead_id}/open-folder")
def open_lead_folder(lead_id: str, request: FastAPIRequest):
    require_local_request(request)
    folder = find_lead_folder(lead_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Папка карточки не найдена. Запустите сбор заново или проверьте output-папку.")
    open_folder_in_file_manager(folder)
    return {"success": True, "path": str(folder)}


@app.get("/api/settings/export")
def export_db(request: FastAPIRequest):
    require_local_request(request)
    repo = get_db_repo()
    db_path = repo.db_path
    if not db_path.exists():
        raise HTTPException(status_code=404, detail="Database not found")
    return FileResponse(
        path=db_path,
        filename="app.db",
        media_type="application/octet-stream"
    )

@app.get("/api/settings/cities")
def get_cities(
    summary: bool = False,
    region_id: Optional[str] = None,
    q: Optional[str] = None,
    include_small: bool = False,
    limit_regions: int = Query(default=80, ge=1, le=200),
    limit_cities: int = Query(default=200, ge=1, le=500),
):
    if q:
        return search_city_regions(q, limit_regions, limit_cities, include_small)

    if region_id:
        region = find_city_region(region_id)
        if not region:
            raise HTTPException(status_code=404, detail="Region not found")
        cities = region.get("areas") if isinstance(region.get("areas"), list) else []
        return {"areas": [{**region, "areas": visible_city_rows(cities, include_small)}]}

    if summary:
        return {
            "areas": [
                city_region_summary({**region, "areas": visible_city_rows(
                    region.get("areas") if isinstance(region.get("areas"), list) else [],
                    include_small,
                )})
                for region in load_cities_data().get("areas", [])
            ]
        }

    return load_cities_data()

@app.get("/api/settings/categories")
def get_categories():
    return load_json_data(data_file("categories.json"), [])

@app.post("/api/run")
def run_job_api(config: RunJobRequest, request: FastAPIRequest):
    require_local_request(request)
    try:
        return JOB_MANAGER.start(config.model_dump())
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc))


@app.get("/api/run/status")
def run_status_api(request: FastAPIRequest):
    require_local_request(request)
    return JOB_MANAGER.snapshot()


@app.post("/api/run/cancel")
def cancel_run_api(request: FastAPIRequest):
    require_local_request(request)
    return JOB_MANAGER.cancel()

@app.post("/api/leads/{lead_id}/events")
def add_lead_comment(lead_id: str, request: LeadEventCommentRequest, http_request: FastAPIRequest):
    require_local_request(http_request)
    comment = request.comment.strip()
    if comment:
        repo = get_db_repo()
        with repo.get_connection() as conn:
            conn.execute(
                "INSERT INTO lead_events (id, lead_id, event_type, comment) VALUES (?, ?, ?, ?)",
                (str(uuid.uuid4()), lead_id, "COMMENT", comment)
            )
    return {"success": True}

@app.post("/api/leads/{lead_id}")
def update_lead(lead_id: str, request: LeadUpdateRequest, http_request: FastAPIRequest):
    require_local_request(http_request)
    repo = get_db_repo()
    with repo.get_connection() as conn:
        lead_row = conn.execute("SELECT id, lead_status FROM leads WHERE id = ?", (lead_id,)).fetchone()
        if not lead_row:
            raise HTTPException(status_code=404, detail="Lead not found")

        update_fields = []
        values = []
        
        status_val = request.lead_status or request.status
        if status_val:
            old_status = lead_row["lead_status"]
            update_fields.append("lead_status = ?")
            values.append(status_val)
            
            conn.execute(
                "INSERT INTO lead_events (id, lead_id, event_type, old_value, new_value, comment) VALUES (?, ?, ?, ?, ?, ?)",
                (str(uuid.uuid4()), lead_id, "STATUS_CHANGE", old_status, status_val, "Изменение статуса вручную")
            )
            
        if request.contact_status is not None:
            update_fields.append("contact_status = ?")
            values.append(request.contact_status)
        if request.priority is not None:
            update_fields.append("priority = ?")
            values.append(request.priority)
        
        if update_fields:
            values.append(lead_id)
            set_clause = ", ".join(update_fields)
            conn.execute(f"UPDATE leads SET {set_clause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?", values)
            
    return {"success": True}

@app.post("/api/settings/reset_db")
def reset_db(request: FastAPIRequest):
    require_local_request(request, require_confirm=True)
    require_no_active_run()
    repo = get_db_repo()
    with repo.get_connection() as conn:
        conn.execute("PRAGMA foreign_keys = ON")
        folder_rows = conn.execute("SELECT data_folder FROM organizations WHERE data_folder IS NOT NULL").fetchall()
        deleted_folders = delete_lead_folders([str(row["data_folder"] or "") for row in folder_rows])
        conn.execute("DELETE FROM lead_events")
        conn.execute("DELETE FROM run_results")
        conn.execute("DELETE FROM files")
        conn.execute("DELETE FROM leads")
        conn.execute("DELETE FROM organizations")
        conn.execute("DELETE FROM runs")
        conn.commit()
    return {"success": True, "deleted_folders": deleted_folders}

@app.post("/api/settings/import")
async def import_db(request: FastAPIRequest):
    require_local_request(request, require_confirm=True)
    require_no_active_run()
    data = await request.body()
    if not data:
        raise HTTPException(status_code=400, detail="Missing file data")

    if len(data) < 16 or data[:16] != b"SQLite format 3\x00":
        raise HTTPException(status_code=400, detail="Invalid file format (Not a SQLite database)")

    try:
        db_path = DATA_DIR / "app.db"
        db_path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = db_path.with_name(f".{db_path.name}.{uuid.uuid4().hex}.tmp")
        try:
            temp_path.write_bytes(data)
            validate_sqlite_database(temp_path)
            temp_path.replace(db_path)
        finally:
            if temp_path.exists():
                temp_path.unlink()
    except PermissionError:
        raise HTTPException(status_code=500, detail="Файл базы данных заблокирован. Закройте другие программы (например, DBeaver), использующие БД.")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    return {"success": True}

@app.delete("/api/leads/{lead_id}")
def delete_lead(lead_id: str, request: FastAPIRequest):
    require_local_request(request, require_confirm=True)
    require_no_active_run()
    repo = get_db_repo()
    with repo.get_connection() as conn:
        org_row = conn.execute(
            """
            SELECT l.organization_id, o.data_folder
            FROM leads l
            JOIN organizations o ON l.organization_id = o.id
            WHERE l.id = ?
            """,
            (lead_id,),
        ).fetchone()
        deleted_folders = 0
        if org_row:
            org_id = org_row["organization_id"]
            deleted_folders = delete_lead_folders([str(org_row["data_folder"] or "")])
            conn.execute("DELETE FROM organizations WHERE id = ?", (org_id,))
        else:
            conn.execute("DELETE FROM leads WHERE id = ?", (lead_id,))
    return {"success": True, "deleted_folders": deleted_folders}


def main() -> int:
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    print(f"Starting FastAPI server on http://{args.host}:{args.port}")
    uvicorn.run("yamap_landing_web:app", host=args.host, port=args.port, reload=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
