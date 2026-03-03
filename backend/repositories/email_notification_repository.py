from database import get_supabase
from models.email_notification import EmailNotification, EmailNotificationCreate


class EmailNotificationRepository:
    def __init__(self):
        self.db = get_supabase()
        self.table = "email_notifications"

    def create(self, data: EmailNotificationCreate) -> EmailNotification:
        result = self.db.table(self.table).insert(data.model_dump()).execute()
        return EmailNotification(**result.data[0])

    def get_recent(self, limit: int = 10) -> list[EmailNotification]:
        result = (
            self.db.table(self.table)
            .select("*")
            .order("sent_at", desc=True)
            .limit(limit)
            .execute()
        )
        return [EmailNotification(**r) for r in (result.data or [])]
