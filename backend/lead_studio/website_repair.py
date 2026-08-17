from __future__ import annotations

import json
import uuid
from collections.abc import Callable
from typing import Any

from lead_filters import lead_type_for
from lead_studio.card_files import sync_organization_card_websites


LinkExtractor = Callable[[dict[str, Any], dict[str, Any]], tuple[list[str], list[str]]]


def repair_missing_website_data(repo: Any, extract_links: LinkExtractor) -> int:
    repaired_organizations: list[str] = []
    with repo.get_connection() as conn:
        rows = conn.execute(
            """
            SELECT o.id, s.raw_json
            FROM organizations o
            JOIN organization_sources s ON s.organization_id = o.id AND s.source = 'yandex'
            WHERE COALESCE(o.websites_json, '') IN ('', '[]', '{}')
            ORDER BY o.id, s.source_org_id
            """
        ).fetchall()
        sources_by_organization: dict[str, list[str]] = {}
        for row in rows:
            sources_by_organization.setdefault(row["id"], []).append(row["raw_json"])

        for organization_id, raw_sources in sources_by_organization.items():
            websites: list[str] = []
            for raw_json in raw_sources:
                try:
                    item = json.loads(raw_json or "{}")
                except (TypeError, json.JSONDecodeError):
                    continue
                if not isinstance(item, dict):
                    continue
                recovered, _ = extract_links(item, {})
                websites.extend(recovered)

            websites = sorted(set(websites))
            if not websites:
                continue
            updated = conn.execute(
                """
                UPDATE organizations
                SET websites_json = ?
                WHERE id = ? AND COALESCE(websites_json, '') IN ('', '[]', '{}')
                """,
                (json.dumps(websites, ensure_ascii=False), organization_id),
            )
            if updated.rowcount != 1:
                continue

            if lead_type_for({"websites": websites}) == "REDESIGN":
                leads = conn.execute(
                    "SELECT id FROM leads WHERE organization_id = ? AND lead_type = 'NEW_SITE'",
                    (organization_id,),
                ).fetchall()
                for lead in leads:
                    conn.execute(
                        "UPDATE leads SET lead_type = 'REDESIGN', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                        (lead["id"],),
                    )
                    conn.execute(
                        """
                        INSERT INTO lead_events (id, lead_id, event_type, old_value, new_value, comment)
                        VALUES (?, ?, 'WEBSITE_REPAIRED', 'NEW_SITE', 'REDESIGN', 'Сайт восстановлен из сохранённых данных Яндекс')
                        """,
                        (str(uuid.uuid4()), lead["id"]),
                    )
            repaired_organizations.append(organization_id)

    for organization_id in repaired_organizations:
        sync_organization_card_websites(repo, organization_id)
    return len(repaired_organizations)
