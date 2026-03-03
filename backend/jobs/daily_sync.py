import asyncio
import logging
from datetime import date

from services.sync_service import SyncService
from services.email_service import send_daily_report
from repositories.order_repository import OrderRepository
from repositories.email_notification_repository import EmailNotificationRepository
from models.email_notification import EmailNotificationCreate
from config import get_settings

logger = logging.getLogger(__name__)


async def run_daily_sync_and_notify():
    """
    Main daily job:
    1. Sync all integrations
    2. Classify overdue / due today
    3. Send email report
    4. Log notification
    """
    logger.info("=== Starting daily sync job ===")
    settings = get_settings()

    # Step 1: Sync
    sync_service = SyncService()
    results = await sync_service.run_full_sync()
    for r in results:
        logger.info(f"[{r.source}] fetched={r.orders_fetched} upserted={r.orders_upserted} error={r.error}")

    # Step 2: Classify from DB
    order_repo = OrderRepository()
    overdue_orders = order_repo.get_overdue()
    due_today_orders = order_repo.get_due_today()
    logger.info(f"Overdue: {len(overdue_orders)}, Due today: {len(due_today_orders)}")

    # Step 3: Send email (only if there are relevant orders)
    today = date.today()
    email_result = send_daily_report(overdue_orders, due_today_orders, today)

    # Step 4: Log notification
    email_repo = EmailNotificationRepository()
    email_repo.create(
        EmailNotificationCreate(
            recipient=", ".join(settings.email_recipients_list),
            subject=email_result.get("subject", ""),
            overdue_count=len(overdue_orders),
            due_today_count=len(due_today_orders),
            status="sent" if email_result["success"] else "error",
            resend_id=email_result.get("id"),
            error_message=email_result.get("error"),
        )
    )
    logger.info("=== Daily sync job complete ===")


def run_daily_sync_sync():
    """Synchronous wrapper for APScheduler (which doesn't run async jobs directly)."""
    asyncio.run(run_daily_sync_and_notify())


async def run_sync_only():
    """Sync all integrations without sending email. Used for frequent polling."""
    logger.info("=== Starting scheduled sync ===")
    sync_service = SyncService()
    results = await sync_service.run_full_sync()
    for r in results:
        logger.info(f"[{r.source}] fetched={r.orders_fetched} upserted={r.orders_upserted} error={r.error}")
    logger.info("=== Scheduled sync complete ===")


def run_sync_only_sync():
    """Synchronous wrapper for APScheduler."""
    asyncio.run(run_sync_only())
