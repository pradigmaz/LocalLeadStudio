from __future__ import annotations

from fastapi import HTTPException

LEAD_STATUSES = {"NEW", "POTENTIAL", "IN_PROGRESS", "PROCESSED", "REJECT", "JUNK", "CHAIN"}
CONTACT_STATUSES = {"NOT_CONTACTED", "CONTACTED", "RESPONDED", "NO_RESPONSE", "DECLINED"}
MIN_PRIORITY = 0
MAX_PRIORITY = 5


def validate_lead_status(status: str) -> None:
    if status not in LEAD_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid lead status")


def validate_contact_status(status: str) -> None:
    if status not in CONTACT_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid contact status")


def validate_priority(priority: int) -> None:
    if priority < MIN_PRIORITY or priority > MAX_PRIORITY:
        raise HTTPException(status_code=400, detail="Invalid priority")
