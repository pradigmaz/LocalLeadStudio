from __future__ import annotations
import shutil
import subprocess
import sys
from pathlib import Path

from core import DATA_DIR, LEGACY_DATA_DIR, PROJECT_ROOT, get_db_repo


def is_lead_folder(path: Path) -> bool:
    return path.is_dir() and (path / "brief.md").exists() and (path / "data.json").exists()


def lead_folder_roots() -> tuple[Path, ...]:
    return (
        DATA_DIR / "runs",
        LEGACY_DATA_DIR / "runs",
        PROJECT_ROOT / "lead_studio_data" / "runs",  # pre-portable card folders
        PROJECT_ROOT.parent / "yamap_landing_runs",
    )


def is_safe_lead_folder(path: Path) -> bool:
    try:
        resolved = path.resolve()
        if not is_lead_folder(resolved):
            return False
        return any(resolved.is_relative_to(root.resolve()) for root in lead_folder_roots() if root.exists())
    except OSError:
        return False


def delete_lead_folders(paths: list[str]) -> int:
    deleted = 0
    for raw_path in paths:
        if not raw_path:
            continue
        folder = Path(raw_path)
        if not is_safe_lead_folder(folder):
            continue
        shutil.rmtree(folder.resolve())
        deleted += 1
    return deleted


def find_lead_folder(lead_id: str) -> Path | None:
    repo = get_db_repo()
    with repo.get_connection() as conn:
        row = conn.execute(
            """
            SELECT o.source_org_id, o.data_folder
            FROM leads l
            JOIN organizations o ON l.organization_id = o.id
            WHERE l.id = ?
            """,
            (lead_id,),
        ).fetchone()

    if not row:
        return None

    data_folder = str(row["data_folder"] or "").strip()
    if data_folder:
        folder = Path(data_folder).resolve()
        if is_safe_lead_folder(folder):
            return folder

    source_org_id = str(row["source_org_id"] or "").strip()
    if not source_org_id:
        return None

    for root in lead_folder_roots():
        if not root.exists():
            continue
        for folder in root.glob(f"*/*_{source_org_id}"):
            resolved = folder.resolve()
            if is_lead_folder(resolved):
                return resolved
    return None


def open_folder_in_file_manager(path: Path) -> None:
    if sys.platform == "win32":
        subprocess.Popen(["explorer", str(path)])
    elif sys.platform == "darwin":
        subprocess.Popen(["open", str(path)])
    else:
        subprocess.Popen(["xdg-open", str(path)])
