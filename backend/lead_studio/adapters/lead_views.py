from __future__ import annotations

import json
import sqlite3
from typing import Any, Dict, List


LEAD_VIEW_COLUMNS = """
    l.id as id, l.lead_type, l.lead_status, l.contact_status, l.priority, l.score, l.reason, l.viewed_at,
    o.id as organization_id, o.source_org_id, o.name, o.category, o.address, o.city, o.region, o.rating, o.review_count,
    o.websites_json, o.phones_json, o.socials_json, o.source_url, o.data_folder, o.photos_json
"""


def get_leads_page(
    conn: sqlite3.Connection,
    offset: int = 0,
    limit: int = 50,
    search: str = "",
    status: str = "ALL",
    lead_type: str = "ALL",
    city: str = "ALL",
    review_range: str = "ALL",
) -> Dict[str, Any]:
    offset = max(0, int(offset))
    limit = min(max(1, int(limit)), 100)
    conditions: list[str] = []
    params: list[Any] = []

    search = search.strip()
    if search:
        conditions.append(
            "(unicode_casefold(o.name) LIKE ? OR unicode_casefold(o.address) LIKE ? OR unicode_casefold(o.category) LIKE ?)"
        )
        params.extend([f"%{search.casefold()}%"] * 3)
    if status != "ALL":
        conditions.append("l.lead_status = ?")
        params.append(status)
    if lead_type != "ALL":
        conditions.append("l.lead_type = ?")
        params.append(lead_type)
    if city != "ALL":
        conditions.append("o.city = ?")
        params.append(city)

    review_conditions = {
        "0-10": ("COALESCE(o.review_count, 0) <= ?", [10]),
        "10-50": ("COALESCE(o.review_count, 0) > ? AND COALESCE(o.review_count, 0) <= ?", [10, 50]),
        "50-100": ("COALESCE(o.review_count, 0) > ? AND COALESCE(o.review_count, 0) <= ?", [50, 100]),
        "100+": ("COALESCE(o.review_count, 0) > ?", [100]),
    }
    if review_range in review_conditions:
        review_condition, review_params = review_conditions[review_range]
        conditions.append(review_condition)
        params.extend(review_params)

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    from_clause = "FROM leads l JOIN organizations o ON l.organization_id = o.id"
    if search:
        conn.create_function("unicode_casefold", 1, lambda value: str(value or "").casefold())
    total = conn.execute(f"SELECT COUNT(*) {from_clause} {where_clause}", params).fetchone()[0]
    rows = conn.execute(
        f"SELECT {LEAD_VIEW_COLUMNS} {from_clause} {where_clause} "
        "ORDER BY "
        "CASE WHEN l.priority > 0 THEN 0 ELSE 1 END, "
        "CASE WHEN l.priority > 0 THEN l.priority ELSE 0 END, "
        "CASE WHEN l.lead_type = 'NEW_SITE' THEN 0 ELSE 1 END, "
        "l.created_at DESC, l.id DESC LIMIT ? OFFSET ?",
        [*params, limit, offset],
    ).fetchall()
    status_counts = {
        row["lead_status"]: row["count"]
        for row in conn.execute("SELECT lead_status, COUNT(*) AS count FROM leads GROUP BY lead_status").fetchall()
    }
    cities = [
        row["city"]
        for row in conn.execute(
            "SELECT DISTINCT city FROM organizations WHERE city IS NOT NULL AND city != '' ORDER BY city COLLATE NOCASE"
        ).fetchall()
    ]
    return {
        "leads": lead_view_results(conn, rows),
        "total": total,
        "total_leads": conn.execute("SELECT COUNT(*) FROM leads").fetchone()[0],
        "status_counts": status_counts,
        "cities": cities,
    }


def lead_view_results(conn: sqlite3.Connection, rows: List[sqlite3.Row]) -> List[Dict[str, Any]]:
    results = [dict(row) for row in rows]
    sources_by_organization = organization_sources_by_organization(conn, [row["organization_id"] for row in results])
    for result in results:
        result["websites"] = json.loads(result.pop("websites_json") or "[]")
        result["phones"] = json.loads(result.pop("phones_json") or "[]")
        result["social_links"] = json.loads(result.pop("socials_json") or "[]")
        result["photos"] = json.loads(result.pop("photos_json") or "[]")
        result["sources"] = sources_by_organization.get(result["organization_id"], [])
    return results


def organization_sources_by_organization(
    conn: sqlite3.Connection,
    organization_ids: List[str],
) -> Dict[str, List[Dict[str, Any]]]:
    unique_ids = list(dict.fromkeys(organization_ids))
    if not unique_ids:
        return {}
    placeholders = ", ".join("?" for _ in unique_ids)
    rows = conn.execute(
        "SELECT organization_id, source, source_org_id, source_url, first_seen_at, last_seen_at "
        f"FROM organization_sources WHERE organization_id IN ({placeholders}) ORDER BY first_seen_at ASC",
        unique_ids,
    ).fetchall()
    sources = {organization_id: [] for organization_id in unique_ids}
    for row in rows:
        source = dict(row)
        sources[source.pop("organization_id")].append(source)
    return sources
