import sqlite3
import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

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
    output_folder TEXT
);

CREATE TABLE IF NOT EXISTS run_results (
    run_id TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    query TEXT,
    result_status TEXT,
    skip_reason TEXT,
    was_new BOOLEAN DEFAULT 0,
    was_updated BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (run_id, organization_id),
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
"""

class SQLiteRepo:
    def __init__(self, db_path: str | Path):
        self.db_path = Path(db_path)
        self._init_db()

    def get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def _init_db(self):
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self.get_connection() as conn:
            conn.executescript(SCHEMA)
            # Safe migration: add photos_json if it doesn't exist
            try:
                conn.execute("ALTER TABLE organizations ADD COLUMN photos_json TEXT")
            except sqlite3.OperationalError:
                pass

    def upsert_organization(self, org_data: Dict[str, Any]) -> Tuple[str, bool]:
        """
        Upserts an organization. Returns (id, is_new).
        """
        import uuid
        
        # Determine dedupe target
        source = org_data.get("source", "yandex")
        source_org_id = org_data.get("source_org_id")
        dedupe_key = org_data.get("dedupe_key")
        
        with self.get_connection() as conn:
            # Check if exists
            existing = None
            if source_org_id:
                existing = conn.execute(
                    "SELECT id FROM organizations WHERE source = ? AND source_org_id = ?",
                    (source, source_org_id)
                ).fetchone()
            elif dedupe_key:
                existing = conn.execute(
                    "SELECT id FROM organizations WHERE dedupe_key = ?",
                    (dedupe_key,)
                ).fetchone()
            
            if existing:
                org_id = existing["id"]
                # Update changing fields
                update_fields = [
                    "name", "category", "address", "city", "region", 
                    "coordinates_json", "rating", "rating_count", "review_count",
                    "phones_json", "websites_json", "socials_json", "hours", "features_json",
                    "source_url", "data_folder", "photos_json", "last_seen_at"
                ]
                
                set_clause = ", ".join(f"{f} = ?" for f in update_fields)
                values = [org_data.get(f) for f in update_fields]
                
                # Explicitly update last_seen_at to CURRENT_TIMESTAMP
                set_clause = set_clause.replace("last_seen_at = ?", "last_seen_at = CURRENT_TIMESTAMP")
                values.pop() # Remove last_seen_at from values
                
                if org_data.get("last_parsed_at"):
                    set_clause += ", last_parsed_at = ?"
                    values.append(org_data["last_parsed_at"])
                    
                values.append(org_id)
                
                conn.execute(f"UPDATE organizations SET {set_clause} WHERE id = ?", values)
                return org_id, False
            else:
                # Insert new
                org_id = str(uuid.uuid4())
                fields = [
                    "id", "source", "source_org_id", "dedupe_key", "name", "category", 
                    "address", "city", "region", "coordinates_json", "rating", 
                    "rating_count", "review_count", "phones_json", "websites_json", 
                    "socials_json", "hours", "features_json", "source_url", "data_folder", "photos_json"
                ]
                if org_data.get("last_parsed_at"):
                    fields.append("last_parsed_at")
                    
                placeholders = ", ".join(["?"] * len(fields))
                values = [org_id] + [org_data.get(f) for f in fields if f != "id"]
                
                conn.execute(f"INSERT INTO organizations ({', '.join(fields)}) VALUES ({placeholders})", values)
                return org_id, True

    def create_or_get_lead(self, org_id: str, lead_data: Dict[str, Any]) -> str:
        with self.get_connection() as conn:
            existing = conn.execute("SELECT id FROM leads WHERE organization_id = ?", (org_id,)).fetchone()
            if existing:
                return existing["id"]
            
            import uuid
            lead_id = str(uuid.uuid4())
            fields = ["id", "organization_id", "lead_type", "lead_status", "contact_status", "score", "reason"]
            placeholders = ", ".join(["?"] * len(fields))
            values = [lead_id, org_id] + [lead_data.get(f) for f in fields[2:]]
            
            conn.execute(f"INSERT INTO leads ({', '.join(fields)}) VALUES ({placeholders})", values)
            return lead_id

    def update_lead_status(self, lead_id: str, status: str, old_status: str, comment: str = ""):
        import uuid
        with self.get_connection() as conn:
            conn.execute("UPDATE leads SET lead_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (status, lead_id))
            conn.execute(
                "INSERT INTO lead_events (id, lead_id, event_type, old_value, new_value, comment) VALUES (?, ?, ?, ?, ?, ?)",
                (str(uuid.uuid4()), lead_id, "STATUS_CHANGE", old_status, status, comment)
            )

    def create_run(self, run_data: Dict[str, Any]) -> str:
        import uuid
        run_id = str(uuid.uuid4())
        fields = ["id", "name", "region", "cities_json", "niches_json", "queries_json", "filters_json", "output_folder"]
        placeholders = ", ".join(["?"] * len(fields))
        values = [run_id] + [run_data.get(f) for f in fields[1:]]
        
        with self.get_connection() as conn:
            conn.execute(f"INSERT INTO runs ({', '.join(fields)}) VALUES ({placeholders})", values)
        return run_id

    def update_run_stats(self, run_id: str, stats: Dict[str, int]):
        set_clause = ", ".join(f"{k} = ?" for k in stats.keys())
        values = list(stats.values()) + [run_id]
        with self.get_connection() as conn:
            conn.execute(f"UPDATE runs SET {set_clause} WHERE id = ?", values)

    def finish_run(self, run_id: str):
        with self.get_connection() as conn:
            conn.execute("UPDATE runs SET status = 'FINISHED', finished_at = CURRENT_TIMESTAMP WHERE id = ?", (run_id,))

    def add_run_result(self, run_id: str, org_id: str, query: str, result_status: str, skip_reason: str = "", was_new: bool = False, was_updated: bool = False):
        with self.get_connection() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO run_results (run_id, organization_id, query, result_status, skip_reason, was_new, was_updated) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (run_id, org_id, query, result_status, skip_reason, was_new, was_updated)
            )
            
    def get_all_leads_view(self) -> List[Dict[str, Any]]:
        query = """
        SELECT l.id as id, l.lead_type, l.lead_status, l.contact_status, l.priority, l.score, l.reason,
               o.source_org_id, o.name, o.category, o.address, o.city, o.rating, o.review_count, 
               o.websites_json, o.phones_json, o.socials_json, o.source_url, o.data_folder, o.photos_json
        FROM leads l
        JOIN organizations o ON l.organization_id = o.id
        ORDER BY l.created_at DESC
        """
        with self.get_connection() as conn:
            rows = conn.execute(query).fetchall()
            results = []
            for r in rows:
                d = dict(r)
                d["websites"] = json.loads(d.pop("websites_json") or "[]")
                d["phones"] = json.loads(d.pop("phones_json") or "[]")
                d["social_links"] = json.loads(d.pop("socials_json") or "[]")
                d["photos"] = json.loads(d.pop("photos_json") or "[]")
                results.append(d)
            return results
