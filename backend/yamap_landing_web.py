from __future__ import annotations
import json
import re
import sqlite3
import uuid
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import quote
from urllib.request import Request, urlopen

from fastapi import FastAPI, HTTPException, Request as FastAPIRequest
from fastapi.middleware.cors import CORSMiddleware
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
CONFIG_PATH = ROOT.parent / "config.json"
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
    return SQLiteRepo(ROOT / "lead_studio_data" / "app.db")


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
    output_root = ROOT / (config.get("outputDir") or "lead_studio_data") / "runs" / run_name
    output_root.mkdir(parents=True, exist_ok=True)
    chain_words = [part.strip().lower() for part in (config.get("excludeChains") or "").split(",")]
    max_per_query = int(config.get("maxPerQuery") or 10)
    
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
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
def export_db():
    repo = get_db_repo()
    db_path = repo.db_path
    if not db_path.exists():
        raise HTTPException(status_code=404, detail="Database not found")
    return FileResponse(
        path=db_path,
        filename="app.db",
        media_type="application/octet-stream"
    )

@app.post("/api/run")
def run_job_api(config: RunJobRequest):
    return run_job(config.model_dump())

@app.post("/api/leads/{lead_id}/events")
def add_lead_comment(lead_id: str, request: LeadEventCommentRequest):
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
def update_lead(lead_id: str, request: LeadUpdateRequest):
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
def clean_db():
    repo = get_db_repo()
    with repo.get_connection() as conn:
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("DELETE FROM leads WHERE lead_status IN ('JUNK', 'CHAIN', 'REJECT')")
        conn.commit()
    return {"success": True}

@app.post("/api/settings/reset_db")
def reset_db():
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
    data = await request.body()
    if not data:
        raise HTTPException(status_code=400, detail="Missing file data")
    repo = get_db_repo()
    repo.db_path.parent.mkdir(parents=True, exist_ok=True)
    repo.db_path.write_bytes(data)
    return {"success": True}

@app.delete("/api/leads/{lead_id}")
def delete_lead(lead_id: str):
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
