from __future__ import annotations
import json
import re
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
    http_get_html,
)
from lead_studio.card_files import render_card_brief

from core import (
    COUNTRY_INDICATORS,
    STREET_INDICATORS,
    STREET_FALLBACK_TOKENS,
    BUSINESS_INDICATORS,
    KNOWN_CITIES,
    MAX_PHOTOS,
)


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
    lead.setdefault("lead_status", "NEW")
    folder = output_root / f"{slug(lead['name'])}_{slug(lead['id'], 'noid')}"
    folder.mkdir(parents=True, exist_ok=True)
    if download:
        lead["downloaded_photos"] = download_photos(lead, folder)
    (folder / "data.json").write_text(json.dumps(lead, ensure_ascii=False, indent=2), encoding="utf-8")
    (folder / "brief.md").write_text(render_card_brief(lead), encoding="utf-8-sig")
    angle = "новый сайт" if lead.get("lead_type") == "NEW_SITE" or not lead["has_site"] else "редизайн сайта"
    return {"name": lead["name"], "folder": str(folder), "photos": len(lead["photos"]), "site": ", ".join(lead["websites"]), "angle": angle}
