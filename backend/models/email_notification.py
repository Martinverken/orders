from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class EmailNotificationCreate(BaseModel):
    recipient: str
    subject: str
    overdue_count: int = 0
    due_today_count: int = 0
    status: str                    # 'sent' | 'error'
    resend_id: Optional[str] = None
    error_message: Optional[str] = None


class EmailNotification(EmailNotificationCreate):
    id: str
    sent_at: datetime
