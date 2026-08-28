from __future__ import annotations

import json
from typing import Any

from lead_studio.card_files import sync_all_lead_card_statuses, sync_all_organization_card_websites
from yamap_landing_parser import repair_missing_website_data


WEBSITE_REPAIR_KEY = "startup_website_repair_revision"
WEBSITE_REPAIR_REVISION = "website-repair-v1"
CARD_FILE_BACKFILL_KEY = "startup_card_file_backfill_revision"
CARD_FILE_BACKFILL_REVISION = "card-files-v1"


def repair_websites_once(repo: Any) -> bool:
    if _maintenance_is_complete(repo, WEBSITE_REPAIR_KEY, WEBSITE_REPAIR_REVISION):
        return False

    repair_missing_website_data(repo)
    _mark_maintenance_complete(repo, WEBSITE_REPAIR_KEY, WEBSITE_REPAIR_REVISION)
    return True


def sync_card_files_once(repo: Any) -> bool:
    if _maintenance_is_complete(repo, CARD_FILE_BACKFILL_KEY, CARD_FILE_BACKFILL_REVISION):
        return False

    sync_all_organization_card_websites(repo)
    sync_all_lead_card_statuses(repo)
    _mark_maintenance_complete(repo, CARD_FILE_BACKFILL_KEY, CARD_FILE_BACKFILL_REVISION)
    return True


def _maintenance_is_complete(repo: Any, key: str, revision: str) -> bool:
    with repo.get_connection() as conn:
        row = conn.execute(
            "SELECT value_json FROM app_settings WHERE key = ?",
            (key,),
        ).fetchone()
    if not row:
        return False
    try:
        return json.loads(row["value_json"]) == revision
    except (TypeError, ValueError):
        return False


def _mark_maintenance_complete(repo: Any, key: str, revision: str) -> None:
    with repo.get_connection() as conn:
        conn.execute(
            "INSERT INTO app_settings (key, value_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) "
            "ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP",
            (key, json.dumps(revision)),
        )
