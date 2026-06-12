from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterable, Protocol


class ProviderBlockedError(RuntimeError):
    def __init__(self, source: str, message: str):
        super().__init__(message)
        self.source = source


@dataclass
class ProviderCandidate:
    source: str
    source_org_id: str
    source_url: str
    name: str
    category: str = ""
    address: str = ""
    city: str = ""
    region: str = ""
    coordinates: Any = None
    rating: float | None = None
    rating_count: int = 0
    review_count: int = 0
    phones: list[dict[str, str]] = field(default_factory=list)
    websites: list[str] = field(default_factory=list)
    socials: list[str] = field(default_factory=list)
    hours: str = ""
    features: list[str] = field(default_factory=list)
    photos: list[Any] = field(default_factory=list)
    raw: dict[str, Any] = field(default_factory=dict)

    @property
    def has_site(self) -> bool:
        return bool(self.websites)

    def to_lead(self, query: str) -> dict[str, Any]:
        source_url_key = f"{self.source}_url"
        return {
            "id": self.source_org_id,
            "source": self.source,
            "query": query,
            "name": self.name,
            "category": self.category,
            "address": self.address,
            "city": self.city,
            "region": self.region,
            "coordinates": self.coordinates or [],
            "rating": self.rating if self.rating is not None else "",
            "rating_count": self.rating_count,
            "review_count": self.review_count,
            "phones": self.phones,
            "websites": self.websites,
            "socials": self.socials,
            "hours": self.hours,
            "features": self.features,
            "photos": self.photos,
            "reviews": [],
            "source_url": self.source_url,
            source_url_key: self.source_url,
            "yandex_url": self.source_url if self.source == "yandex" else "",
            "has_site": self.has_site,
            "fetch_error": "",
            "source_row": self.raw,
        }


class LeadProvider(Protocol):
    source: str

    def search(self, query: str, max_scan: int) -> Iterable[ProviderCandidate]:
        ...
