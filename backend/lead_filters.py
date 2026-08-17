from __future__ import annotations
import math
import re
from functools import lru_cache
from urllib.parse import urlparse

from core import (
    load_cities_data,
    strip_name_qualifier,
    CHAIN_DOMAINS,
    EXCLUDED_POPULAR_PLACES,
    POPULAR_PLACE_CATEGORIES,
    POPULAR_PLACE_MIN_REVIEWS,
    POPULAR_PLACE_MIN_RATING_COUNT,
    POPULAR_PLACE_CITY_REVIEW_LIMITS,
    TARGET_CITY_RADIUS_KM,
    URBAN_TYPE_LOCALITY_RE,
    LOW_VALUE_LOCALITY_RE,
    KNOWN_CITY_KEYS,
)

NON_CONTACT_SOCIAL_DOMAINS = (
    "yclients.com",
    "dikidi.net",
    "dikidi.ru",
    "prodoctorov.ru",
    "zoon.ru",
    "nethouse.ru",
    "taplink.cc",
)

THIN_SITE_HOST_SUFFIXES = ("clients.site", "tilda.ws")


def normalize_filter_text(value: object) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\sА-Яа-яЁё]", " ", str(value or "").lower().replace("ё", "е"))).strip()


def link_host(value: object) -> str:
    link = str(value or "").strip()
    if not link:
        return ""
    parsed = urlparse(link if "://" in link or link.startswith("//") else f"https://{link.lstrip('/')}")
    return (parsed.hostname or "").lower().rstrip(".")


def is_thin_site(website: object) -> bool:
    host = link_host(website)
    return any(host == suffix or host.endswith(f".{suffix}") for suffix in THIN_SITE_HOST_SUFFIXES)


def lead_type_for(lead: dict) -> str:
    websites = [website for website in lead.get("websites") or [] if str(website or "").strip()]
    return "NEW_SITE" if not websites or all(is_thin_site(website) for website in websites) else "REDESIGN"


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
    name = lead["name"] or ""
    name_clean = normalize_filter_text(name)
    words_in_name = name_clean.split()
    
    for word in chain_words:
        raw_word = str(word or "").strip()
        word_clean = normalize_filter_text(raw_word)
        if not word_clean:
            continue
        if " " in word_clean:
            if word_clean in name_clean:
                return True
        else:
            if word_clean in words_in_name:
                return True
    websites = " ".join(str(site).lower() for site in lead.get("websites", []))
    if websites and any(domain and domain in websites for domain in CHAIN_DOMAINS):
        return True
    return False


def has_contactable_social(lead: dict) -> bool:
    for value in lead.get("socials") or []:
        host = link_host(value)
        if host and not any(host == domain or host.endswith(f".{domain}") for domain in NON_CONTACT_SOCIAL_DOMAINS):
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
    if lead_type_for(lead) != "REDESIGN":
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
    # Приоритет — бизнесы без полноценного сайта. Тех, у кого он есть, по умолчанию пропускаем;
    # для охоты на редизайн включить keepSitesForRedesign.
    if config.get("skipWithSite", True) and lead_type_for(lead) == "REDESIGN" and not config.get("keepSitesForRedesign", False):
        return False, "есть сайт"
    if is_chain(lead, chain_words):
        return False, "сетевик"
    if not has_contactable_social(lead):
        return False, "нет соцсетей или мессенджеров"
    if is_outside_target_city(lead):
        return False, "вне выбранного города"
    if is_low_value_locality_address(lead):
        return False, "село/деревня вне целевого города"
    if is_excluded_popular_place(lead):
        return False, "популярное место города"
    # При охоте на редизайн (keepSitesForRedesign) популярные места с сайтом — целевые лиды,
    # а не мусор: не режем их, пусть идут вниз списка как REDESIGN.
    if not config.get("keepSitesForRedesign", False) and is_high_profile_redesign(lead):
        return False, "слишком популярное место для редизайна"
    min_reviews = int(config.get("minReviews") or 0)
    if int(float(lead["review_count"] or 0)) < min_reviews:
        return False, "мало отзывов"
    if config.get("requirePhotos", True) and lead.get("source", "yandex") != "2gis" and not lead["photos"]:
        return False, "нет фото"
    return True, ""


def apply_fields_to_parse(lead: dict, fields_to_parse: list[str] | None) -> None:
    if fields_to_parse is None:
        return
    fields = set(fields_to_parse)
    if "sites" not in fields:
        lead["websites"] = []
    if "phones" not in fields:
        lead["phones"] = []
    if "photos" not in fields:
        lead["photos"] = []
