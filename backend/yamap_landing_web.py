from __future__ import annotations
import json
import re
import sqlite3
import uuid
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from urllib.parse import quote
from urllib.request import Request, urlopen

from fastapi import FastAPI, HTTPException, Query, Request as FastAPIRequest
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional
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

ROOT = Path(__file__).parent.resolve()
PROJECT_ROOT = ROOT.parent
DATA_DIR = PROJECT_ROOT / "lead_studio_data"
LEGACY_DATA_DIR = ROOT / "lead_studio_data"
CONFIG_PATH = PROJECT_ROOT / "config.json"
LOCAL_CLIENT_HOSTS = {"127.0.0.1", "::1", "localhost"}
LOCAL_CORS_ORIGINS = ["http://127.0.0.1:5173", "http://localhost:5173"]
CONFIRM_HEADER = "X-LocalLead-Confirm"
REQUIRED_DB_TABLES = {"organizations", "leads", "runs", "run_results", "files", "lead_events"}
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
MAX_PHOTOS = CONFIG["parser"].get("max_photos", 12)
STREET_INDICATORS = set(CONFIG["parser"].get("street_indicators", []))
BUSINESS_INDICATORS = set(CONFIG["parser"].get("business_indicators", []))
COUNTRY_INDICATORS = CONFIG["parser"].get("country_indicators", ["россия", "russia"])

KNOWN_CITIES = []
for _cities in CONFIG["search"].get("regions", {}).values():
    KNOWN_CITIES.extend(_cities)


def get_db_repo() -> SQLiteRepo:
    return SQLiteRepo(DATA_DIR / "app.db")


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


def extract_city_region(address: str, query: str = "") -> tuple[str, str]:
    if not address:
        return "", ""
    parts = [p.strip() for p in address.split(",")]
    
    region = ""
    city = ""
    
    # 1. Identify region first
    for part in parts:
        pl = part.lower()
        if any(w in pl for w in ["область", "обл.", "край", "республика", "респ.", "автономный округ", "ао"]):
            region = part
            break
            
    # Street/house/neighborhood keywords to filter out parts when looking for a city (whole-word matching)
    
    # Common business nouns to skip brand/salon/studio names in addresses
    
    # 2. Scan parts for city candidates
    city_candidates = []
    for part in parts:
        pl = part.lower()
        if pl in COUNTRY_INDICATORS:
            continue
        if region and part == region:
            continue
        # Skip if it contains any digits (postcodes, house numbers, building blocks, etc.)
        if any(char.isdigit() for char in part):
            continue
        # Skip if it contains Latin letters (to filter out salon names / brands in address)
        if re.search(r'[a-zA-Z]', part):
            continue
            
        # Split part into words to match indicators exactly
        tokens = set(re.findall(r'[а-яё]+', pl))
        if tokens.intersection(STREET_INDICATORS) or tokens.intersection(BUSINESS_INDICATORS):
            continue
        city_candidates.append(part)
        
    if city_candidates:
        filtered_candidates = [c for c in city_candidates if "район" not in c.lower()]
        if filtered_candidates:
            city_indicators = ["город", "г.", "село", "поселок", "посёлок", "рабочий поселок", "рабочий посёлок", "деревня", "р.п.", "п.г.т.", "станица", "хутор"]
            for cand in filtered_candidates:
                if any(ind in cand.lower() for ind in city_indicators):
                    city = cand
                    break
            if not city:
                city = filtered_candidates[0]
        else:
            city = city_candidates[0]
            
    # Clean up prefixes and municipal structures
    if city:
        city_lower = city.lower()
        if "городской округ" in city_lower:
            city = city.replace("городской округ", "").replace("городской", "").replace("округ", "").strip()
        if "городское поселение" in city_lower:
            city = city.replace("городское поселение", "").replace("городское", "").replace("поселение", "").strip()
            
        city = re.sub(
            r'^(г\.|г\s|город\s|село\s|поселок\s|посёлок\s|рабочий\sпоселок\s|рабочий\sпосёлок\s|деревня\s|р\.п\.\s|п\.г\.т\.\s|станица\s|хутор\s)+', 
            '', 
            city, 
            flags=re.IGNORECASE
        ).strip()
        
    if region:
        region = re.sub(r'^(республика\s)+', '', region, flags=re.IGNORECASE).strip()
        
    # Fallback to search query and address for known cities
    if not city:
        combined = (query or "") + " " + (address or "")
        for c in KNOWN_CITIES:
            if re.search(r'\b' + re.escape(c) + r'\b', combined, re.IGNORECASE):
                city = c
                break
        if not city:
            combined_lower = combined.lower()
            for c in KNOWN_CITIES:
                if c.lower() in combined_lower:
                    city = c
                    break
                    
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
    return False


def keep_lead(lead: dict, config: dict, chain_words: list[str]) -> tuple[bool, str]:
    if config.get("skipWithSite", True) and lead["has_site"] and not config.get("keepSitesForRedesign", True):
        return False, "есть сайт"
    if is_chain(lead, chain_words):
        return False, "сетевик"
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


def run_job(config: dict) -> dict:
    queries = [line.strip() for line in (config.get("queries") or "").splitlines() if line.strip()]
    run_name = slug(config.get("runName") or "yamap_run")
    output_dir = Path(config.get("outputDir") or DATA_DIR)
    if not output_dir.is_absolute():
        output_dir = PROJECT_ROOT / output_dir
    output_root = output_dir / "runs" / run_name
    output_root.mkdir(parents=True, exist_ok=True)
    chain_words = [part.strip().lower() for part in (config.get("excludeChains") or "").split(",")]
    max_per_query = int(config.get("maxPerQuery") or 10)
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
    
    for query in queries:
        for item in search_items(query, max_per_query):
            try:
                lead = lead_from_item(item, query)
                apply_fields_to_parse(lead, fields_to_parse)
                
                # Save to DB
                org_data = {
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
                
                org_id, is_new = repo.upsert_organization(org_data)
                
                lead_data = {
                    "lead_type": "REDESIGN" if lead["has_site"] else "NEW_SITE",
                    "lead_status": "NEW",
                    "reason": f"Парсинг: {query}"
                }
                
                # If organization already exists, keep its existing status instead of resetting.
                # create_or_get_lead will safely return existing if it exists.
                lead_db_id = repo.create_or_get_lead(org_id, lead_data)
                
                ok, reason = keep_lead(lead, config, chain_words)
                if ok:
                    # Download files / save output to disk
                    saved.append(save_lead(lead, output_root, bool(config.get("downloadPhotos"))))
                    repo.add_run_result(run_id, org_id, query, "SAVED", was_new=is_new)
                    stats["saved_count"] += 1
                else:
                    skipped.append({"query": query, "name": lead["name"], "reason": reason})
                    repo.add_run_result(run_id, org_id, query, "SKIPPED", skip_reason=reason, was_new=is_new)
                    stats["skipped_count"] += 1
                    
                    # If skip reason is network/junk related, auto mark it in DB
                    if "сетевик" in reason.lower():
                        repo.update_lead_status(lead_db_id, "CHAIN", "NEW", "Авторазметка при парсинге")
                    elif "мало отзывов" in reason.lower() or "нет фото" in reason.lower():
                        repo.update_lead_status(lead_db_id, "JUNK", "NEW", "Авторазметка при парсинге")
            except Exception as e:
                stats["error_count"] += 1
                print(f"Error processing item: {e}")

    repo.update_run_stats(run_id, stats)
    repo.finish_run(run_id)

    (output_root / "summary.json").write_text(
        json.dumps({"saved": saved, "skipped": skipped, "run_id": run_id}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return {"output": str(output_root), "saved": saved, "skipped": skipped, "run_id": run_id}


class RunJobRequest(BaseModel):
    queries: Optional[str] = None
    runName: Optional[str] = None
    outputDir: Optional[str] = None
    excludeChains: Optional[str] = None
    maxPerQuery: Optional[int] = 10
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
    return run_job(config.model_dump())

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
        update_fields = []
        values = []
        
        status_val = request.lead_status or request.status
        if status_val:
            old_status_row = conn.execute("SELECT lead_status FROM leads WHERE id = ?", (lead_id,)).fetchone()
            old_status = old_status_row["lead_status"] if old_status_row else ""
            
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

@app.post("/api/settings/clean_db")
def clean_db(request: FastAPIRequest):
    require_local_request(request, require_confirm=True)
    repo = get_db_repo()
    with repo.get_connection() as conn:
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("DELETE FROM leads WHERE lead_status IN ('JUNK', 'CHAIN', 'REJECT')")
        conn.commit()
    return {"success": True}

@app.post("/api/settings/reset_db")
def reset_db(request: FastAPIRequest):
    require_local_request(request, require_confirm=True)
    repo = get_db_repo()
    with repo.get_connection() as conn:
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("DELETE FROM lead_events")
        conn.execute("DELETE FROM run_results")
        conn.execute("DELETE FROM files")
        conn.execute("DELETE FROM leads")
        conn.execute("DELETE FROM organizations")
        conn.execute("DELETE FROM runs")
        conn.commit()
    return {"success": True}

@app.post("/api/settings/import")
async def import_db(request: FastAPIRequest):
    require_local_request(request, require_confirm=True)
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
    repo = get_db_repo()
    with repo.get_connection() as conn:
        org_row = conn.execute("SELECT organization_id FROM leads WHERE id = ?", (lead_id,)).fetchone()
        if org_row:
            org_id = org_row["organization_id"]
            conn.execute("DELETE FROM organizations WHERE id = ?", (org_id,))
        else:
            conn.execute("DELETE FROM leads WHERE id = ?", (lead_id,))
    return {"success": True}


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
