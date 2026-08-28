import sqlite3
import json
import logging
import contextlib
import re
import uuid
from pathlib import Path
from urllib.parse import urlparse
from typing import Any, Dict, List, Optional

from lead_studio.adapters.lead_views import LEAD_VIEW_COLUMNS, get_leads_page as query_leads_page, lead_view_results

logger = logging.getLogger(__name__)

SCHEMA = """
CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    source_org_id TEXT,
    dedupe_key TEXT,
    name TEXT NOT NULL,
    category TEXT,
    address TEXT,
    city TEXT,
    region TEXT,
    coordinates_json TEXT,
    rating REAL,
    rating_count INTEGER,
    review_count INTEGER,
    phones_json TEXT,
    websites_json TEXT,
    socials_json TEXT,
    hours TEXT,
    features_json TEXT,
    source_url TEXT,
    data_folder TEXT,
    photos_json TEXT,
    first_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_parsed_at TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_org_source_id ON organizations(source, source_org_id) WHERE source_org_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_dedupe ON organizations(dedupe_key) WHERE dedupe_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS organization_sources (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    source TEXT NOT NULL,
    source_org_id TEXT NOT NULL,
    source_url TEXT,
    raw_json TEXT,
    first_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source, source_org_id),
    FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    lead_type TEXT,
    lead_status TEXT DEFAULT 'NEW',
    contact_status TEXT DEFAULT 'NOT_CONTACTED',
    priority INTEGER DEFAULT 0,
    score INTEGER DEFAULT 0,
    reason TEXT,
    notes TEXT,
    next_action TEXT,
    offer_type TEXT,
    assigned_to TEXT,
    viewed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_org ON leads(organization_id);

CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    region TEXT,
    cities_json TEXT,
    niches_json TEXT,
    queries_json TEXT,
    filters_json TEXT,
    status TEXT DEFAULT 'STARTED',
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMP,
    saved_count INTEGER DEFAULT 0,
    updated_count INTEGER DEFAULT 0,
    duplicate_count INTEGER DEFAULT 0,
    skipped_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    scan_count INTEGER DEFAULT 0,
    created_count INTEGER DEFAULT 0,
    enriched_count INTEGER DEFAULT 0,
    existing_count INTEGER DEFAULT 0,
    output_folder TEXT
);

CREATE TABLE IF NOT EXISTS run_results (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    query TEXT,
    result_status TEXT,
    skip_reason TEXT,
    was_new BOOLEAN DEFAULT 0,
    was_updated BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (run_id) REFERENCES runs (id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    file_type TEXT NOT NULL,
    local_path TEXT NOT NULL,
    source_url TEXT,
    title TEXT,
    hash TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS lead_events (
    id TEXT PRIMARY KEY,
    lead_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lead_id) REFERENCES leads (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""

SCALAR_FILL_ONLY_FIELDS = [
    "name", "category", "address", "city", "region", "coordinates_json",
    "rating", "rating_count", "review_count", "hours"
]
JSON_LIST_FIELDS = ["phones_json", "websites_json", "socials_json", "features_json", "photos_json"]
RUN_STAT_COLUMNS = {
    "saved_count",
    "updated_count",
    "duplicate_count",
    "skipped_count",
    "error_count",
    "scan_count",
    "created_count",
    "enriched_count",
    "existing_count",
}
ORGANIZATION_SOURCES_BACKFILL_KEY = "organization_sources_backfill_revision"
ORGANIZATION_SOURCES_BACKFILL_REVISION = "v1"

class SQLiteRepo:
    def __init__(self, db_path: str | Path):
        self.db_path = Path(db_path)
        self._init_db()

    @contextlib.contextmanager
    def get_connection(self):
        conn = sqlite3.connect(self.db_path, timeout=10.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _init_db(self):
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self.get_connection() as conn:
            conn.executescript(SCHEMA)
            self._add_column_if_missing(conn, "organizations", "photos_json", "TEXT")
            self._add_column_if_missing(conn, "leads", "viewed_at", "TIMESTAMP")
            self._add_column_if_missing(conn, "runs", "scan_count", "INTEGER DEFAULT 0")
            self._add_column_if_missing(conn, "runs", "created_count", "INTEGER DEFAULT 0")
            self._add_column_if_missing(conn, "runs", "enriched_count", "INTEGER DEFAULT 0")
            self._add_column_if_missing(conn, "runs", "existing_count", "INTEGER DEFAULT 0")
            self._migrate_run_results_history(conn)
            self._backfill_organization_sources_once(conn)

    def _add_column_if_missing(self, conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
        columns = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
        if column not in columns:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")

    def _migrate_run_results_history(self, conn: sqlite3.Connection) -> None:
        columns = conn.execute("PRAGMA table_info(run_results)").fetchall()
        pk_columns = [row["name"] for row in columns if row["pk"]]
        if pk_columns == ["id"]:
            return

        conn.execute("ALTER TABLE run_results RENAME TO run_results_old")
        conn.execute(
            """
            CREATE TABLE run_results (
                id TEXT PRIMARY KEY,
                run_id TEXT NOT NULL,
                organization_id TEXT NOT NULL,
                query TEXT,
                result_status TEXT,
                skip_reason TEXT,
                was_new BOOLEAN DEFAULT 0,
                was_updated BOOLEAN DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (run_id) REFERENCES runs (id) ON DELETE CASCADE,
                FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
            )
            """
        )
        old_rows = conn.execute(
            "SELECT run_id, organization_id, query, result_status, skip_reason, was_new, was_updated, created_at "
            "FROM run_results_old"
        ).fetchall()
        for row in old_rows:
            conn.execute(
                "INSERT INTO run_results "
                "(id, run_id, organization_id, query, result_status, skip_reason, was_new, was_updated, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    str(uuid.uuid4()),
                    row["run_id"],
                    row["organization_id"],
                    row["query"],
                    row["result_status"],
                    row["skip_reason"],
                    row["was_new"],
                    row["was_updated"],
                    row["created_at"],
                ),
            )
        conn.execute("DROP TABLE run_results_old")

    def _backfill_organization_sources_once(self, conn: sqlite3.Connection) -> None:
        row = conn.execute(
            "SELECT value_json FROM app_settings WHERE key = ?",
            (ORGANIZATION_SOURCES_BACKFILL_KEY,),
        ).fetchone()
        if row and row["value_json"] == json.dumps(ORGANIZATION_SOURCES_BACKFILL_REVISION):
            return

        self._backfill_organization_sources(conn)
        conn.execute(
            "INSERT INTO app_settings (key, value_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) "
            "ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP",
            (ORGANIZATION_SOURCES_BACKFILL_KEY, json.dumps(ORGANIZATION_SOURCES_BACKFILL_REVISION)),
        )

    def _backfill_organization_sources(self, conn: sqlite3.Connection) -> None:
        org_columns = {row["name"] for row in conn.execute("PRAGMA table_info(organizations)").fetchall()}
        source_url_expr = "source_url" if "source_url" in org_columns else "'' AS source_url"
        rows = conn.execute(
            f"SELECT id, source, source_org_id, {source_url_expr} FROM organizations "
            "WHERE source_org_id IS NOT NULL AND source_org_id != ''"
        ).fetchall()
        for row in rows:
            conn.execute(
                "INSERT OR IGNORE INTO organization_sources "
                "(id, organization_id, source, source_org_id, source_url, raw_json) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (
                    str(uuid.uuid4()),
                    row["id"],
                    row["source"] or "yandex",
                    row["source_org_id"],
                    row["source_url"],
                    "{}",
                ),
            )

    def merge_organization(self, org_data: Dict[str, Any], lead_data: Dict[str, Any]) -> Dict[str, Any]:
        source = org_data.get("source", "yandex")
        source_org_id = str(org_data.get("source_org_id") or "")
        if not source_org_id:
            source_org_id = self._dedupe_key(org_data) or str(uuid.uuid4())
            org_data["source_org_id"] = source_org_id
        org_data["dedupe_key"] = self._dedupe_key(org_data) or None
        org_data["raw_json"] = org_data.get("raw_json") or "{}"

        with self.get_connection() as conn:
            existing = self._find_existing_organization(conn, org_data)
            if existing:
                org_id = existing["id"]
                changed_fields = self._merge_existing_organization(conn, org_id, existing, org_data)
                self._upsert_organization_source(conn, org_id, org_data)
                lead_id = self._create_or_get_lead_conn(conn, org_id, lead_data)
                return {
                    "organization_id": org_id,
                    "lead_id": lead_id,
                    "action": "ENRICHED" if changed_fields else "EXISTING_NO_CHANGES",
                    "changed_fields": changed_fields,
                }

            org_id = str(uuid.uuid4())
            fields = [
                "id", "source", "source_org_id", "dedupe_key", "name", "category",
                "address", "city", "region", "coordinates_json", "rating",
                "rating_count", "review_count", "phones_json", "websites_json",
                "socials_json", "hours", "features_json", "source_url", "data_folder", "photos_json"
            ]
            placeholders = ", ".join(["?"] * len(fields))
            values = [org_id] + [org_data.get(f) for f in fields if f != "id"]
            conn.execute(f"INSERT INTO organizations ({', '.join(fields)}) VALUES ({placeholders})", values)
            self._upsert_organization_source(conn, org_id, org_data)
            lead_id = self._create_or_get_lead_conn(conn, org_id, lead_data)
            return {
                "organization_id": org_id,
                "lead_id": lead_id,
                "action": "CREATED",
                "changed_fields": fields[1:],
            }

    def find_existing_organization(self, org_data: Dict[str, Any]) -> Optional[sqlite3.Row]:
        with self.get_connection() as conn:
            return self._find_existing_organization(conn, org_data)

    def _find_existing_organization(self, conn: sqlite3.Connection, org_data: Dict[str, Any]) -> Optional[sqlite3.Row]:
        source = org_data.get("source", "yandex")
        source_org_id = org_data.get("source_org_id")
        if source_org_id:
            row = conn.execute(
                "SELECT o.* FROM organization_sources s JOIN organizations o ON o.id = s.organization_id "
                "WHERE s.source = ? AND s.source_org_id = ?",
                (source, source_org_id),
            ).fetchone()
            if row:
                return row
            row = conn.execute(
                "SELECT * FROM organizations WHERE source = ? AND source_org_id = ?",
                (source, source_org_id),
            ).fetchone()
            if row:
                return row

        dedupe_key = org_data.get("dedupe_key")
        if dedupe_key:
            row = conn.execute("SELECT * FROM organizations WHERE dedupe_key = ?", (dedupe_key,)).fetchone()
            if row:
                return row

        return self._find_by_phone_or_domain(conn, org_data)

    def _find_by_phone_or_domain(self, conn: sqlite3.Connection, org_data: Dict[str, Any]) -> Optional[sqlite3.Row]:
        phones = self._phone_keys(org_data.get("phones_json"))
        domains = self._domain_keys(org_data.get("websites_json"))
        if not phones and not domains:
            return None

        rows = conn.execute("SELECT * FROM organizations").fetchall()
        for row in rows:
            if phones and phones.intersection(self._phone_keys(row["phones_json"])):
                return row
            if domains and domains.intersection(self._domain_keys(row["websites_json"])):
                return row
        return None

    def _merge_existing_organization(
        self,
        conn: sqlite3.Connection,
        org_id: str,
        existing: sqlite3.Row,
        org_data: Dict[str, Any],
    ) -> list[str]:
        updates: dict[str, Any] = {}
        changed_fields: list[str] = []

        for field in SCALAR_FILL_ONLY_FIELDS:
            next_value = org_data.get(field)
            if self._is_empty(existing[field]) and not self._is_empty(next_value):
                updates[field] = next_value
                changed_fields.append(field)

        for field in JSON_LIST_FIELDS:
            merged = self._merge_json_lists(existing[field], org_data.get(field))
            if merged != (existing[field] or "[]"):
                updates[field] = merged
                changed_fields.append(field)

        if org_data.get("last_parsed_at"):
            updates["last_parsed_at"] = org_data["last_parsed_at"]

        set_parts = [f"{field} = ?" for field in updates]
        set_parts.append("last_seen_at = CURRENT_TIMESTAMP")
        values = list(updates.values())
        values.append(org_id)
        conn.execute(f"UPDATE organizations SET {', '.join(set_parts)} WHERE id = ?", values)
        return changed_fields

    def _upsert_organization_source(self, conn: sqlite3.Connection, org_id: str, org_data: Dict[str, Any]) -> None:
        source = org_data.get("source", "yandex")
        source_org_id = str(org_data.get("source_org_id") or "")
        if not source_org_id:
            return
        existing = conn.execute(
            "SELECT id FROM organization_sources WHERE source = ? AND source_org_id = ?",
            (source, source_org_id),
        ).fetchone()
        if existing:
            conn.execute(
                "UPDATE organization_sources SET organization_id = ?, source_url = ?, raw_json = ?, "
                "last_seen_at = CURRENT_TIMESTAMP WHERE id = ?",
                (org_id, org_data.get("source_url"), org_data.get("raw_json") or "{}", existing["id"]),
            )
            return
        conn.execute(
            "INSERT INTO organization_sources (id, organization_id, source, source_org_id, source_url, raw_json) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (
                str(uuid.uuid4()),
                org_id,
                source,
                source_org_id,
                org_data.get("source_url"),
                org_data.get("raw_json") or "{}",
            ),
        )

    def _create_or_get_lead_conn(self, conn: sqlite3.Connection, org_id: str, lead_data: Dict[str, Any]) -> str:
        existing = conn.execute("SELECT id FROM leads WHERE organization_id = ?", (org_id,)).fetchone()
        if existing:
            return existing["id"]

        lead_id = str(uuid.uuid4())
        fields = ["id", "organization_id", "lead_type", "lead_status", "contact_status", "score", "reason"]
        placeholders = ", ".join(["?"] * len(fields))
        values = [
            lead_id,
            org_id,
            lead_data.get("lead_type") or "NEW_SITE",
            lead_data.get("lead_status") or "NEW",
            lead_data.get("contact_status") or "NOT_CONTACTED",
            lead_data.get("score") or 0,
            lead_data.get("reason"),
        ]

        conn.execute(f"INSERT INTO leads ({', '.join(fields)}) VALUES ({placeholders})", values)
        return lead_id

    @staticmethod
    def _is_empty(value: Any) -> bool:
        return value is None or value == "" or value == "[]" or value == "{}"

    @staticmethod
    def _json_list(value: Any) -> list[Any]:
        if value in (None, ""):
            return []
        if isinstance(value, list):
            return value
        try:
            parsed = json.loads(value)
        except (TypeError, ValueError):
            return []
        return parsed if isinstance(parsed, list) else []

    def _merge_json_lists(self, existing: Any, incoming: Any) -> str:
        result: list[Any] = []
        seen: set[str] = set()
        for item in [*self._json_list(existing), *self._json_list(incoming)]:
            key = self._item_key(item)
            if not key or key in seen:
                continue
            seen.add(key)
            result.append(item)
        return json.dumps(result, ensure_ascii=False)

    @staticmethod
    def _item_key(item: Any) -> str:
        if isinstance(item, dict):
            if item.get("number"):
                digits = re.sub(r"\D+", "", str(item["number"]))
                return digits[-10:] if len(digits) >= 7 else digits
            for field in ("url", "href", "src", "template"):
                if item.get(field):
                    return SQLiteRepo._url_key(item[field])
            return json.dumps(item, ensure_ascii=False, sort_keys=True).lower()
        raw = str(item)
        digits = re.sub(r"\D+", "", raw)
        if len(digits) >= 7:
            return digits[-10:]
        if "://" in raw or "." in raw:
            return SQLiteRepo._url_key(raw)
        return re.sub(r"\s+", "", raw.lower())

    @staticmethod
    def _url_key(value: Any) -> str:
        parsed = urlparse(str(value).strip().lower())
        host = (parsed.netloc or parsed.path).split("/")[0]
        host = host[4:] if host.startswith("www.") else host
        path = parsed.path.strip("/")
        return f"{host}/{path}".rstrip("/")

    @staticmethod
    def _normalize(value: Any) -> str:
        return re.sub(r"\s+", " ", re.sub(r"[^\w\sА-Яа-яЁё]", " ", str(value or "").lower().replace("ё", "е"))).strip()

    def _dedupe_key(self, org_data: Dict[str, Any]) -> str:
        return self.dedupe_key_for(org_data.get("name"), org_data.get("address"))

    @classmethod
    def dedupe_key_for(cls, name: Any, address: Any) -> str:
        if cls._is_empty(name) or cls._is_empty(address):
            return ""
        return f"{cls._normalize(name)}_{cls._normalize(address)}"

    def _phone_keys(self, value: Any) -> set[str]:
        keys = set()
        for item in self._json_list(value):
            raw = item.get("number") if isinstance(item, dict) else item
            digits = re.sub(r"\D+", "", str(raw or ""))
            if len(digits) >= 7:
                keys.add(digits[-10:])
        return keys

    def _domain_keys(self, value: Any) -> set[str]:
        keys = set()
        for raw in self._json_list(value):
            parsed = urlparse(str(raw if not isinstance(raw, dict) else raw.get("url") or ""))
            host = (parsed.netloc or parsed.path).lower().split("/")[0]
            host = host[4:] if host.startswith("www.") else host
            if "." in host:
                keys.add(host)
        return keys

    def update_lead_status(self, lead_id: str, status: str, old_status: str, comment: str = ""):
        with self.get_connection() as conn:
            conn.execute("UPDATE leads SET lead_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (status, lead_id))
            conn.execute(
                "INSERT INTO lead_events (id, lead_id, event_type, old_value, new_value, comment) VALUES (?, ?, ?, ?, ?, ?)",
                (str(uuid.uuid4()), lead_id, "STATUS_CHANGE", old_status, status, comment)
            )

    def get_lead_status(self, lead_id: str) -> Optional[str]:
        with self.get_connection() as conn:
            row = conn.execute("SELECT lead_status FROM leads WHERE id = ?", (lead_id,)).fetchone()
            return row["lead_status"] if row else None

    def mark_lead_viewed(self, lead_id: str) -> Optional[str]:
        with self.get_connection() as conn:
            row = conn.execute("SELECT viewed_at FROM leads WHERE id = ?", (lead_id,)).fetchone()
            if not row:
                return None
            if row["viewed_at"]:
                return row["viewed_at"]
            conn.execute(
                "UPDATE leads SET viewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (lead_id,),
            )
            viewed_row = conn.execute("SELECT viewed_at FROM leads WHERE id = ?", (lead_id,)).fetchone()
            return viewed_row["viewed_at"] if viewed_row else None

    def create_run(self, run_data: Dict[str, Any]) -> str:
        run_id = str(uuid.uuid4())
        fields = ["id", "name", "region", "cities_json", "niches_json", "queries_json", "filters_json", "output_folder"]
        placeholders = ", ".join(["?"] * len(fields))
        values = [run_id] + [run_data.get(f) for f in fields[1:]]
        
        with self.get_connection() as conn:
            conn.execute(f"INSERT INTO runs ({', '.join(fields)}) VALUES ({placeholders})", values)
        return run_id

    def update_run_stats(self, run_id: str, stats: Dict[str, int]):
        safe_stats = {key: value for key, value in stats.items() if key in RUN_STAT_COLUMNS}
        if not safe_stats:
            return
        set_clause = ", ".join(f"{k} = ?" for k in safe_stats.keys())
        values = list(safe_stats.values()) + [run_id]
        with self.get_connection() as conn:
            conn.execute(f"UPDATE runs SET {set_clause} WHERE id = ?", values)

    def finish_run(self, run_id: str, status: str = "FINISHED"):
        with self.get_connection() as conn:
            conn.execute("UPDATE runs SET status = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?", (status, run_id))

    def add_run_result(self, run_id: str, org_id: str, query: str, result_status: str, skip_reason: str = "", was_new: bool = False, was_updated: bool = False):
        with self.get_connection() as conn:
            conn.execute(
                "INSERT INTO run_results (id, run_id, organization_id, query, result_status, skip_reason, was_new, was_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (str(uuid.uuid4()), run_id, org_id, query, result_status, skip_reason, was_new, was_updated)
            )
            
    def get_all_leads_view(self) -> List[Dict[str, Any]]:
        query = f"SELECT {LEAD_VIEW_COLUMNS} FROM leads l JOIN organizations o ON l.organization_id = o.id ORDER BY l.created_at DESC"
        with self.get_connection() as conn:
            rows = conn.execute(query).fetchall()
            return lead_view_results(conn, rows)

    def get_leads_page(
        self,
        offset: int = 0,
        limit: int = 50,
        search: str = "",
        status: str = "ALL",
        lead_type: str = "ALL",
        city: str = "ALL",
        review_range: str = "ALL",
    ) -> Dict[str, Any]:
        with self.get_connection() as conn:
            return query_leads_page(
                conn,
                offset=offset,
                limit=limit,
                search=search,
                status=status,
                lead_type=lead_type,
                city=city,
                review_range=review_range,
            )

    def get_preferences(self) -> Dict[str, Any]:
        defaults = {
            "provider_priority": "yandex",
            "enabled_providers": ["yandex"],
            "max_scan_multiplier": 5,
            "twogis_mode": "browser",
            "twogis_browser": "auto",
            "twogis_browser_path": "",
            "twogis_quiet_mode": True,
        }
        with self.get_connection() as conn:
            row = conn.execute("SELECT value_json FROM app_settings WHERE key = 'preferences'").fetchone()
            if not row:
                return defaults
            try:
                stored = json.loads(row["value_json"])
            except (TypeError, ValueError):
                stored = {}
            preferences = {**defaults, **stored}
            preferences["provider_priority"] = "yandex"
            preferences["enabled_providers"] = ["yandex"]
            return preferences

    def save_preferences(self, preferences: Dict[str, Any]) -> Dict[str, Any]:
        current = self.get_preferences()
        next_value = {**current, **preferences}
        next_value["provider_priority"] = "yandex"
        next_value["enabled_providers"] = ["yandex"]
        valid_browsers = {
            "auto", "chrome", "edge", "yandex", "opera", "opera_gx",
            "brave", "vivaldi", "firefox", "safari", "custom",
        }
        if next_value.get("twogis_browser") not in valid_browsers:
            next_value["twogis_browser"] = "auto"
        next_value["twogis_browser_path"] = str(next_value.get("twogis_browser_path") or "")
        next_value["twogis_quiet_mode"] = bool(next_value.get("twogis_quiet_mode", True))
        with self.get_connection() as conn:
            conn.execute(
                "INSERT INTO app_settings (key, value_json, updated_at) VALUES ('preferences', ?, CURRENT_TIMESTAMP) "
                "ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP",
                (json.dumps(next_value, ensure_ascii=False),),
            )
        return next_value
