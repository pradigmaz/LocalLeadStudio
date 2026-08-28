from __future__ import annotations
import asyncio
import uuid
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, Request as FastAPIRequest
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
import uvicorn

from core import (
    DATA_DIR,
    BUNDLE_DIR,
    FROZEN,
    LOCAL_CORS_ORIGINS,
    MAX_QUERY_LINES,
    DEFAULT_YANDEX_DELAY_SECONDS,
    get_db_repo,
    require_local_request,
    validate_sqlite_database,
    load_cities_data,
    load_json_data,
    data_file,
)
from cities import (
    search_city_regions,
    find_city_region,
    visible_city_rows,
    city_region_summary,
)
from folders import find_lead_folder, open_folder_in_file_manager, delete_lead_folders
from guards import require_no_active_run
from lead_pipeline import JOB_MANAGER
from startup_maintenance import repair_websites_once, sync_card_files_once

import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.resolve()))
from lead_studio.lead_validation import validate_contact_status, validate_lead_status, validate_priority
from lead_studio.card_files import sync_lead_card_status


class RunJobRequest(BaseModel):
    queries: Optional[str] = None
    runName: Optional[str] = None
    outputDir: Optional[str] = None
    excludeChains: Optional[str] = None
    maxQueries: Optional[int] = MAX_QUERY_LINES
    maxPerQuery: Optional[int] = 10
    requestDelaySeconds: Optional[float] = DEFAULT_YANDEX_DELAY_SECONDS
    downloadPhotos: Optional[bool] = False
    skipWithSite: Optional[bool] = True
    keepSitesForRedesign: Optional[bool] = False
    minReviews: Optional[int] = 0
    requirePhotos: Optional[bool] = True
    # New fields for toggling parsed data
    fields_to_parse: Optional[list[str]] = None
    providerPriority: Optional[str] = None
    enabledProviders: Optional[list[str]] = None
    maxScanPerQuery: Optional[int] = None
    max_scan_multiplier: Optional[int] = None


class PreferencesRequest(BaseModel):
    provider_priority: Optional[str] = None
    enabled_providers: Optional[list[str]] = None
    max_scan_multiplier: Optional[int] = None
    twogis_mode: Optional[str] = None
    twogis_browser: Optional[str] = None
    twogis_browser_path: Optional[str] = None
    twogis_quiet_mode: Optional[bool] = None

class LeadEventCommentRequest(BaseModel):
    comment: str

class LeadUpdateRequest(BaseModel):
    lead_status: Optional[str] = None
    status: Optional[str] = None
    contact_status: Optional[str] = None
    priority: Optional[int] = None

@asynccontextmanager
async def lifespan(_: FastAPI):
    repo = get_db_repo()
    repair_websites_once(repo)
    maintenance = asyncio.create_task(asyncio.to_thread(sync_card_files_once, repo))
    yield
    await maintenance


app = FastAPI(title="Local Lead Studio API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=LOCAL_CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1024)

@app.get("/api/leads")
def get_leads(
    request: FastAPIRequest,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    search: str = Query("", max_length=200),
    status: str = Query("ALL", max_length=20),
    lead_type: str = Query("ALL", max_length=20),
    city: str = Query("ALL", max_length=120),
    review_range: str = Query("ALL", max_length=20),
):
    require_local_request(request)
    if status != "ALL":
        validate_lead_status(status)
    if lead_type not in {"ALL", "NEW_SITE", "REDESIGN"}:
        raise HTTPException(status_code=400, detail="Invalid lead type")
    if review_range not in {"ALL", "0-10", "10-50", "50-100", "100+"}:
        raise HTTPException(status_code=400, detail="Invalid review range")
    repo = get_db_repo()
    return repo.get_leads_page(
        offset=offset,
        limit=limit,
        search=search,
        status=status,
        lead_type=lead_type,
        city=city,
        review_range=review_range,
    )

@app.get("/api/leads/{lead_id}/events")
def get_lead_events(lead_id: str, request: FastAPIRequest):
    require_local_request(request)
    repo = get_db_repo()
    with repo.get_connection() as conn:
        rows = conn.execute(
            "SELECT event_type, old_value, new_value, comment, created_at "
            "FROM lead_events WHERE lead_id = ? ORDER BY created_at DESC", 
            (lead_id,)
        ).fetchall()
        events = [dict(r) for r in rows]
    return {"events": events}


@app.post("/api/leads/{lead_id}/viewed")
def mark_lead_viewed(lead_id: str, request: FastAPIRequest):
    require_local_request(request, require_confirm=True)
    repo = get_db_repo()
    viewed_at = repo.mark_lead_viewed(lead_id)
    if viewed_at is None:
        raise HTTPException(status_code=404, detail="Lead not found")
    return {"success": True, "viewed_at": viewed_at}


@app.post("/api/leads/{lead_id}/open-folder")
def open_lead_folder(lead_id: str, request: FastAPIRequest):
    require_local_request(request, require_confirm=True)
    folder = find_lead_folder(lead_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Папка карточки не найдена. Запустите сбор заново или проверьте output-папку.")
    open_folder_in_file_manager(folder)
    return {"success": True, "path": str(folder)}


@app.get("/api/settings/export")
def export_db(request: FastAPIRequest):
    require_local_request(request)
    repo = get_db_repo()
    db_path = repo.db_path
    if not db_path.exists():
        raise HTTPException(status_code=404, detail="Database not found")
    return FileResponse(
        path=db_path,
        filename="app.db",
        media_type="application/octet-stream"
    )

@app.get("/api/settings/cities")
def get_cities(
    request: FastAPIRequest,
    summary: bool = False,
    region_id: Optional[str] = None,
    q: Optional[str] = None,
    include_small: bool = False,
    limit_regions: int = Query(default=80, ge=1, le=200),
    limit_cities: int = Query(default=200, ge=1, le=500),
):
    require_local_request(request)
    if q:
        return search_city_regions(q, limit_regions, limit_cities, include_small)

    if region_id:
        region = find_city_region(region_id)
        if not region:
            raise HTTPException(status_code=404, detail="Region not found")
        cities = region.get("areas") if isinstance(region.get("areas"), list) else []
        return {"areas": [{**region, "areas": visible_city_rows(cities, include_small)}]}

    if summary:
        return {
            "areas": [
                city_region_summary({**region, "areas": visible_city_rows(
                    region.get("areas") if isinstance(region.get("areas"), list) else [],
                    include_small,
                )})
                for region in load_cities_data().get("areas", [])
            ]
        }

    return load_cities_data()

@app.get("/api/settings/categories")
def get_categories(request: FastAPIRequest):
    require_local_request(request)
    return load_json_data(data_file("categories.json"), [])


@app.get("/api/settings/preferences")
def get_preferences(request: FastAPIRequest):
    require_local_request(request)
    return get_db_repo().get_preferences()


@app.post("/api/settings/preferences")
def save_preferences(preferences: PreferencesRequest, request: FastAPIRequest):
    require_local_request(request, require_confirm=True)
    return get_db_repo().save_preferences(preferences.model_dump(exclude_unset=True))


@app.post("/api/run")
def run_job_api(config: RunJobRequest, request: FastAPIRequest):
    require_local_request(request, require_confirm=True)
    try:
        return JOB_MANAGER.start(config.model_dump())
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc))


@app.get("/api/run/status")
def run_status_api(request: FastAPIRequest):
    require_local_request(request)
    return JOB_MANAGER.snapshot()


@app.post("/api/run/cancel")
def cancel_run_api(request: FastAPIRequest):
    require_local_request(request, require_confirm=True)
    return JOB_MANAGER.cancel()

@app.post("/api/leads/{lead_id}/events")
def add_lead_comment(lead_id: str, request: LeadEventCommentRequest, http_request: FastAPIRequest):
    require_local_request(http_request, require_confirm=True)
    comment = request.comment.strip()
    if not comment:
        raise HTTPException(status_code=400, detail="Comment is empty")
    repo = get_db_repo()
    with repo.get_connection() as conn:
        lead_row = conn.execute("SELECT id FROM leads WHERE id = ?", (lead_id,)).fetchone()
        if not lead_row:
            raise HTTPException(status_code=404, detail="Lead not found")
        conn.execute(
            "INSERT INTO lead_events (id, lead_id, event_type, comment) VALUES (?, ?, ?, ?)",
            (str(uuid.uuid4()), lead_id, "COMMENT", comment)
        )
    return {"success": True}

@app.post("/api/leads/{lead_id}")
def update_lead(lead_id: str, request: LeadUpdateRequest, http_request: FastAPIRequest):
    require_local_request(http_request, require_confirm=True)
    repo = get_db_repo()
    with repo.get_connection() as conn:
        lead_row = conn.execute("SELECT id, lead_status FROM leads WHERE id = ?", (lead_id,)).fetchone()
        if not lead_row:
            raise HTTPException(status_code=404, detail="Lead not found")

        update_fields = []
        values = []
        
        status_val = request.lead_status or request.status
        if status_val:
            validate_lead_status(status_val)
            old_status = lead_row["lead_status"]
            update_fields.append("lead_status = ?")
            values.append(status_val)
            
            conn.execute(
                "INSERT INTO lead_events (id, lead_id, event_type, old_value, new_value, comment) VALUES (?, ?, ?, ?, ?, ?)",
                (str(uuid.uuid4()), lead_id, "STATUS_CHANGE", old_status, status_val, "Изменение статуса вручную")
            )
            
        if request.contact_status is not None:
            validate_contact_status(request.contact_status)
            update_fields.append("contact_status = ?")
            values.append(request.contact_status)
        if request.priority is not None:
            validate_priority(request.priority)
            update_fields.append("priority = ?")
            values.append(request.priority)
        
        if update_fields:
            values.append(lead_id)
            set_clause = ", ".join(update_fields)
            conn.execute(f"UPDATE leads SET {set_clause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?", values)

    if status_val:
        sync_lead_card_status(repo, lead_id, status_val)
    return {"success": True}

@app.post("/api/settings/reset_db")
def reset_db(request: FastAPIRequest):
    require_local_request(request, require_confirm=True)
    require_no_active_run()
    repo = get_db_repo()
    with repo.get_connection() as conn:
        folder_rows = conn.execute("SELECT data_folder FROM organizations WHERE data_folder IS NOT NULL").fetchall()
        deleted_folders = delete_lead_folders([str(row["data_folder"] or "") for row in folder_rows])
        conn.execute("DELETE FROM lead_events")
        conn.execute("DELETE FROM run_results")
        conn.execute("DELETE FROM files")
        conn.execute("DELETE FROM leads")
        conn.execute("DELETE FROM organizations")
        conn.execute("DELETE FROM runs")
        conn.commit()
    return {"success": True, "deleted_folders": deleted_folders}

@app.post("/api/settings/import")
async def import_db(request: FastAPIRequest):
    require_local_request(request, require_confirm=True)
    require_no_active_run()
    data = await request.body()
    if not data:
        raise HTTPException(status_code=400, detail="Missing file data")

    if len(data) < 16 or data[:16] != b"SQLite format 3\x00":
        raise HTTPException(status_code=400, detail="Invalid file format (Not a SQLite database)")

    def _do_import(payload: bytes) -> None:
        db_path = DATA_DIR / "app.db"
        db_path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = db_path.with_name(f".{db_path.name}.{uuid.uuid4().hex}.tmp")
        try:
            temp_path.write_bytes(payload)
            validate_sqlite_database(temp_path)
            temp_path.replace(db_path)
        finally:
            if temp_path.exists():
                temp_path.unlink()

    try:
        await asyncio.to_thread(_do_import, data)
    except HTTPException:
        raise
    except PermissionError:
        raise HTTPException(status_code=500, detail="Файл базы данных заблокирован. Закройте другие программы (например, DBeaver), использующие БД.")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    return {"success": True}

@app.delete("/api/leads/{lead_id}")
def delete_lead(lead_id: str, request: FastAPIRequest):
    require_local_request(request, require_confirm=True)
    require_no_active_run()
    repo = get_db_repo()
    with repo.get_connection() as conn:
        org_row = conn.execute(
            """
            SELECT l.organization_id, o.data_folder
            FROM leads l
            JOIN organizations o ON l.organization_id = o.id
            WHERE l.id = ?
            """,
            (lead_id,),
        ).fetchone()
        deleted_folders = 0
        if org_row:
            org_id = org_row["organization_id"]
            deleted_folders = delete_lead_folders([str(org_row["data_folder"] or "")])
            conn.execute("DELETE FROM organizations WHERE id = ?", (org_id,))
        else:
            conn.execute("DELETE FROM leads WHERE id = ?", (lead_id,))
    return {"success": True, "deleted_folders": deleted_folders}


# Отдаём собранный фронт с того же origin, что и API — для Electron/прод.
# frozen: dist бандлится в BUNDLE_DIR/frontend_dist; dev: frontend/dist, может отсутствовать.
_FRONTEND_DIST = (BUNDLE_DIR / "frontend_dist") if FROZEN else (Path(__file__).resolve().parent.parent / "frontend" / "dist")
if _FRONTEND_DIST.is_dir():
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=str(_FRONTEND_DIST), html=True), name="ui")


def main() -> int:
    # PyInstaller windowed (console=False): sys.stdout/stderr == None -> print/uvicorn-логи падают.
    # Подменяем заглушкой, чтобы окно консоли не нужно было вовсе.
    import io
    if sys.stdout is None:
        sys.stdout = io.StringIO()
    if sys.stderr is None:
        sys.stderr = io.StringIO()
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    print(f"Starting FastAPI server on http://{args.host}:{args.port}")
    uvicorn.run(app, host=args.host, port=args.port, reload=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
