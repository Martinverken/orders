from database import get_supabase


class SettingsRepository:
    def __init__(self):
        self.db = get_supabase()
        self.table = "settings"

    def get(self, key: str) -> dict | None:
        """Return {"value": {...}, "updated_at": "..."} or None."""
        resp = self.db.table(self.table).select("value,updated_at").eq("key", key).maybe_single().execute()
        return resp.data if resp.data else None

    def set(self, key: str, value: dict) -> None:
        from datetime import datetime, timezone
        self.db.table(self.table).upsert({
            "key": key,
            "value": value,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
