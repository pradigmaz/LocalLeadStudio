from __future__ import annotations

import threading
import traceback
import uuid
from datetime import datetime, timezone
from typing import Any, Callable


JobRunner = Callable[[dict[str, Any], Callable[[dict[str, Any]], None], threading.Event], dict[str, Any]]
ACTIVE_STATUSES = {"RUNNING", "CANCEL_REQUESTED"}


class JobManager:
    def __init__(self, runner: JobRunner):
        self._runner = runner
        self._lock = threading.Lock()
        self._job: dict[str, Any] | None = None
        self._cancel_event: threading.Event | None = None

    def is_running(self) -> bool:
        with self._lock:
            return bool(self._job and self._job.get("status") in ACTIVE_STATUSES)

    def start(self, config: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            if self._job and self._job.get("status") in ACTIVE_STATUSES:
                raise RuntimeError("Сбор уже запущен")

            job_id = str(uuid.uuid4())
            cancel_event = threading.Event()
            self._cancel_event = cancel_event
            self._job = {
                "id": job_id,
                "status": "RUNNING",
                "started_at": now_iso(),
                "finished_at": None,
                "current_query": "",
                "query_index": 0,
                "query_total": 0,
                "saved_count": 0,
                "skipped_count": 0,
                "duplicate_count": 0,
                "error_count": 0,
                "result": None,
                "error": None,
            }

        thread = threading.Thread(target=self._run, args=(job_id, config, cancel_event), daemon=True)
        thread.start()
        return self.snapshot()

    def cancel(self) -> dict[str, Any]:
        with self._lock:
            if self._cancel_event and self._job and self._job.get("status") == "RUNNING":
                self._cancel_event.set()
                self._job["status"] = "CANCEL_REQUESTED"
        return self.snapshot()

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return dict(self._job or {"status": "IDLE"})

    def update(self, patch: dict[str, Any]) -> None:
        with self._lock:
            if not self._job:
                return
            self._job.update(patch)

    def _run(self, job_id: str, config: dict[str, Any], cancel_event: threading.Event) -> None:
        try:
            result = self._runner(config, self.update, cancel_event)
            final_status = result.get("_job_status") or ("CANCELLED" if cancel_event.is_set() else "FINISHED")
            self.update({"status": final_status, "finished_at": now_iso(), "result": result})
        except Exception as exc:  # noqa: BLE001 - store root cause for local UI diagnostics
            self.update({
                "status": "FAILED",
                "finished_at": now_iso(),
                "error": str(exc),
                "traceback": traceback.format_exc(limit=6),
            })

        with self._lock:
            if self._job and self._job.get("id") == job_id:
                self._cancel_event = None


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
