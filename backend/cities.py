from __future__ import annotations
import re
from typing import Optional

from core import (
    load_cities_data,
    normalize_search_text,
    strip_name_qualifier,
    URBAN_TYPE_LOCALITY_RE,
    LOW_VALUE_LOCALITY_RE,
    LOCALITY_QUALIFIER_RE,
)


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
