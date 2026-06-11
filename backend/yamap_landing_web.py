from __future__ import annotations
import json
import re
import sqlite3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import quote
from urllib.request import Request, urlopen

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
DEFAULT_CHAINS = (
    # Продукты / Супермаркеты
    "пятёрочка, пятерочка, магнит, перекресток, перекрёсток, дикси, чижик, лента, ашан, верный, вкусвилл, "
    "окей, о’кей, метро, metro, спар, spar, евроспар, eurospar, светофор, маяк, доброцен, монетка, "
    # Алкоголь / Сигареты
    "красное и белое, красное белое, кб, бристоль, ароматный мир, винлаб, "
    # Барбершопы
    "topgun, топган, oldboy, олдбой, borodach, бородач, супермен, бритва, britva, chop-chop, чоп-чоп, "
    "франт, frant, big bro, биг бро, барбаросса, barbarossa, "
    # Салоны красоты / Косметология / Лазер
    "точка красоты, персона, лазер лав, laser love, 4hands, сахар и воск, sahar&vosk, babor, пальчики, "
    "ма & ми, ma&mi, моне, mone, "
    # Фитнес / Спорт
    "world class, ворлд класс, x-fit, икс фит, alex fitness, ддх, ddx, spirit fitness, спирит, ссср фитнес, "
    # Аптеки
    "ригла, асна, 36.6, горздрав, столички, планета здоровья, вита, апрель, фармленд, неофарм, "
    # Медицина
    "медси, мать и дитя, инвитро, invitro, гемотест, gemotest, хеликс, helix, kdl, см-клиника, будь здоров, "
    # Кафе / Фастфуд / Пекарни
    "буханка, хлеб насущный, волконский, поль бейкери, шоколадница, кофе хауз, кофехауз, додо пицца, "
    "dodo pizza, додопицца, ташир пицца, ростикс, rostics, вкусно и точка, вкусно — и точка, доминос, "
    "domino's, cofix, one price coffee, даблби, doubleb, stars coffee, старбакс, starbucks, теремок, "
    "крошка картошка, бургер кинг, burger king, макдоналдс, mcdonalds, "
    # Ритейл / Техника
    "спортмастер, глория джинс, детский мир, dns, днс, эльдорадо, мвидео, м.видео, ситилинк, леруа мерлен, "
    "leroy merlin, лемана про, lemana pro, "
    # Маркетплейсы и Доставка
    "ozon, озон, wildberries, вайлдберриз, яндекс, сдэк, boxberry, avito, авито, dpd, "
    # Прочее
    "четыре лапы, бетховен, petshop, fit service, фит сервис, вилгуд, колесо.ру, vianor"
)


MAX_PHOTOS = 12

STREET_INDICATORS = {
    "улица", "ул", "проспект", "просп", "пр-кт", "пр", "переулок", "пер", "проезд", 
    "шоссе", "бульвар", "тупик", "набережная", "площадь", "пл", "дом", "д", "корпус", 
    "корп", "строение", "стр", "сооружение", "литера", "лит", "офис", "оф", "квартира", "кв", 
    "комната", "комн", "квартал", "кв-л", "микрорайон", "мкр", "мкрн", "гск", "снт", "днт", 
    "тракт", "аллея", "въезд", "спуск", "взвоз", "территория", "кордон", "массив", "жилой"
}

BUSINESS_INDICATORS = {
    "салон", "бьюти", "центр", "студия", "барбершоп", "парикмахерская", "косметология", 
    "отель", "магазин", "кафе", "ресторан", "фитнес", "клуб", "аптека", "клиника", "стоматология",
    "школа", "детский", "бассейн", "баня", "сауна", "автосервис", "шиномонтаж", "автомойка"
}

COUNTRY_INDICATORS = ["россия", "russia"]


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
        if pl in country_indicators:
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
        known_cities = [
            "Воронеж", "Рамонь", "Новая Усмань", "Семилуки", "Бобров", "Лиски",
            "Москва", "Химки", "Подольск", "Королев", "Мытищи", "Люберцы",
            "Краснодар", "Сочи", "Новороссийск", "Анапа", "Геленджик"
        ]
        combined = (query or "") + " " + (address or "")
        for c in known_cities:
            if re.search(r'\b' + re.escape(c) + r'\b', combined, re.IGNORECASE):
                city = c
                break
        if not city:
            combined_lower = combined.lower()
            for c in known_cities:
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


class Handler(BaseHTTPRequestHandler):
    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(200)
        self.end_headers()

    def send_json(self, payload: dict, status: int = 200) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        if self.path.startswith('/api/leads'):
            try:
                repo = get_db_repo()
                leads = repo.get_all_leads_view()
                self.send_json({"leads": leads})
            except Exception as e:
                import traceback
                traceback.print_exc()
                self.send_json({"error": str(e)}, 500)
            return
            
        if self.path.startswith('/api/leads/') and self.path.endswith('/events'):
            try:
                parts = self.path.split('/')
                if len(parts) < 4:
                    self.send_json({"error": "Invalid URL"}, 400)
                    return
                lead_id = parts[3]
                repo = get_db_repo()
                with repo.get_connection() as conn:
                    rows = conn.execute("SELECT event_type, old_value, new_value, comment, created_at FROM lead_events WHERE lead_id = ? ORDER BY created_at DESC", (lead_id,)).fetchall()
                    events = [dict(r) for r in rows]
                self.send_json({"events": events})
            except Exception as e:
                import traceback
                traceback.print_exc()
                self.send_json({"error": str(e)}, 500)
            return

        if self.path == '/api/settings/export':
            try:
                repo = get_db_repo()
                db_path = repo.db_path
                if not db_path.exists():
                    self.send_json({"error": "Database not found"}, 404)
                    return
                data = db_path.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "application/octet-stream")
                self.send_header("Content-Disposition", 'attachment; filename="app.db"')
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            except Exception as exc:
                import traceback
                traceback.print_exc()
                self.send_json({"error": str(exc)}, 500)
            return

    def do_POST(self) -> None:
        if self.path == '/api/run':
            try:
                length = int(self.headers.get("Content-Length") or 0)
                if not length:
                    self.send_json({"error": "Missing Content-Length"}, 400)
                    return
                config = json.loads(self.rfile.read(length).decode("utf-8"))
                self.send_json(run_job(config))
            except Exception as exc:  # noqa: BLE001
                self.send_json({"error": str(exc)}, 500)
            return

        if self.path.startswith('/api/leads/'):
            try:
                parts = self.path.split('/')
                # /api/leads/<id>/events
                if len(parts) >= 5 and parts[4] == 'events':
                    lead_id = parts[3]
                    length = int(self.headers.get("Content-Length") or 0)
                    body = json.loads(self.rfile.read(length).decode("utf-8"))
                    comment = body.get("comment", "").strip()
                    if comment:
                        import uuid
                        repo = get_db_repo()
                        with repo.get_connection() as conn:
                            conn.execute(
                                "INSERT INTO lead_events (id, lead_id, event_type, comment) VALUES (?, ?, ?, ?)",
                                (str(uuid.uuid4()), lead_id, "COMMENT", comment)
                            )
                    self.send_json({"success": True})
                    return

                # /api/leads/<id>
                if len(parts) >= 4:
                    lead_id = parts[3]
                    length = int(self.headers.get("Content-Length") or 0)
                    body = json.loads(self.rfile.read(length).decode("utf-8"))
                    
                    repo = get_db_repo()
                    
                    # We can update lead_status or contact_status or score or reason
                    with repo.get_connection() as conn:
                        update_fields = []
                        values = []
                        status_val = body.get("lead_status") or body.get("status")
                        if status_val:
                            old_status_row = conn.execute("SELECT lead_status FROM leads WHERE id = ?", (lead_id,)).fetchone()
                            old_status = old_status_row["lead_status"] if old_status_row else ""
                            
                            update_fields.append("lead_status = ?")
                            values.append(status_val)
                            
                            import uuid
                            conn.execute(
                                "INSERT INTO lead_events (id, lead_id, event_type, old_value, new_value, comment) VALUES (?, ?, ?, ?, ?, ?)",
                                (str(uuid.uuid4()), lead_id, "STATUS_CHANGE", old_status, status_val, "Изменение статуса вручную")
                            )
                            
                        if "contact_status" in body:
                            update_fields.append("contact_status = ?")
                            values.append(body["contact_status"])
                        if "priority" in body:
                            update_fields.append("priority = ?")
                            values.append(int(body["priority"]))
                        
                        if update_fields:
                            values.append(lead_id)
                            set_clause = ", ".join(update_fields)
                            conn.execute(f"UPDATE leads SET {set_clause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?", values)
                            
                    self.send_json({"success": True})
            except Exception as e:
                self.send_json({"error": str(e)}, 500)
            return

        if self.path == '/api/settings/clean_db':
            try:
                repo = get_db_repo()
                with repo.get_connection() as conn:
                    conn.execute("PRAGMA foreign_keys = ON")
                    # Clean up JUNK, CHAIN, REJECT leads
                    conn.execute("DELETE FROM leads WHERE lead_status IN ('JUNK', 'CHAIN', 'REJECT')")
                    conn.commit()
                self.send_json({"success": True})
            except Exception as exc:
                self.send_json({"error": f"Ошибка очистки: {str(exc)}"}, 500)
            return

        if self.path == '/api/settings/reset_db':
            try:
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
                self.send_json({"success": True})
            except Exception as exc:
                self.send_json({"error": f"Ошибка сброса: {str(exc)}"}, 500)
            return
        
        if self.path == '/api/settings/import':
            try:
                length = int(self.headers.get("Content-Length") or 0)
                if not length:
                    self.send_json({"error": "Missing file data"}, 400)
                    return
                data = self.rfile.read(length)
                repo = get_db_repo()
                repo.db_path.parent.mkdir(parents=True, exist_ok=True)
                repo.db_path.write_bytes(data)
                self.send_json({"success": True})
            except Exception as exc:
                self.send_json({"error": f"Ошибка импорта: {str(exc)}"}, 500)
            return

        self.send_response(404)
        self.end_headers()

    def do_DELETE(self) -> None:
        if self.path.startswith('/api/leads/'):
            try:
                parts = self.path.split('/')
                # /api/leads/<id>
                if len(parts) >= 4:
                    lead_id = parts[3]
                    repo = get_db_repo()
                    
                    with repo.get_connection() as conn:
                        # Find organization_id for the lead to delete it as well
                        org_row = conn.execute("SELECT organization_id FROM leads WHERE id = ?", (lead_id,)).fetchone()
                        if org_row:
                            org_id = org_row["organization_id"]
                            # Deleting from organizations will cascade delete the lead because of foreign keys
                            conn.execute("DELETE FROM organizations WHERE id = ?", (org_id,))
                        else:
                            # Just in case
                            conn.execute("DELETE FROM leads WHERE id = ?", (lead_id,))
                            
                    self.send_json({"success": True})
            except Exception as e:
                self.send_json({"error": str(e)}, 500)
            return
            
        self.send_response(404)
        self.end_headers()


def main() -> int:
    parser = __import__("argparse").ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"http://{args.host}:{args.port}")
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
