from fastapi import APIRouter, Body, HTTPException
from repositories.settings_repository import SettingsRepository
from integrations.mercadolibre.mapper import reload_ce_schedule

router = APIRouter(prefix="/api/settings", tags=["settings"])
settings_repo = SettingsRepository()

_WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


@router.get("/ce-schedule")
def get_ce_schedule():
    data = settings_repo.get("ml_ce_schedule")
    return {"success": True, "data": data}


@router.put("/ce-schedule")
def update_ce_schedule(body: dict = Body(...)):
    import re
    time_pattern = re.compile(r"^\d{2}:\d{2}$")
    date_pattern = re.compile(r"^\d{4}-\d{2}-\d{2}$")
    cleaned = {}
    # Weekday keys (backward compat)
    for day in _WEEKDAYS:
        val = body.get(day, "")
        if val and not time_pattern.match(val):
            raise HTTPException(status_code=422, detail=f"Invalid time format for {day}: {val!r}")
        if val:
            cleaned[day] = val
    # ISO date keys ("2026-03-09")
    for key, val in body.items():
        if date_pattern.match(key):
            if val and not time_pattern.match(val):
                raise HTTPException(status_code=422, detail=f"Invalid time format for {key}: {val!r}")
            if val:
                cleaned[key] = val
    settings_repo.set("ml_ce_schedule", cleaned)
    reload_ce_schedule(cleaned)
    return {"success": True, "data": cleaned}
