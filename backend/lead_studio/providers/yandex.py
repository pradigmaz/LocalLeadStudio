from __future__ import annotations

from collections.abc import Callable, Iterable
from typing import Any

from .base import ProviderCandidate


class YandexProvider:
    source = "yandex"

    def __init__(
        self,
        search_items: Callable[[str, int], list[dict[str, Any]]],
        lead_from_item: Callable[[dict[str, Any], str], dict[str, Any]],
    ):
        self._search_items = search_items
        self._lead_from_item = lead_from_item

    def search(self, query: str, max_scan: int) -> Iterable[ProviderCandidate]:
        for item in self._search_items(query, max_scan):
            lead = self._lead_from_item(item, query)
            yield ProviderCandidate(
                source="yandex",
                source_org_id=str(lead.get("id") or ""),
                source_url=str(lead.get("yandex_url") or lead.get("source_url") or ""),
                name=str(lead.get("name") or ""),
                category=str(lead.get("category") or ""),
                address=str(lead.get("address") or ""),
                city=str(lead.get("city") or ""),
                region=str(lead.get("region") or ""),
                coordinates=lead.get("coordinates") or [],
                rating=float(lead["rating"]) if lead.get("rating") not in ("", None) else None,
                rating_count=int(float(lead.get("rating_count") or 0)),
                review_count=int(float(lead.get("review_count") or 0)),
                phones=lead.get("phones") or [],
                websites=lead.get("websites") or [],
                socials=lead.get("socials") or [],
                hours=str(lead.get("hours") or ""),
                features=lead.get("features") or [],
                photos=lead.get("photos") or [],
                raw=item,
            )
