from repositories.order_repository import OrderRepository
from repositories.sync_log_repository import SyncLogRepository
from models.order import OrderSummary


class OrderService:
    def __init__(self):
        self.order_repo = OrderRepository()
        self.sync_log_repo = SyncLogRepository()

    def get_dashboard_summary(
        self,
        source=None,
        status=None,
        urgency=None,
        product_name=None,
        logistics_operator=None,
        city=None,
        commune=None,
        order_number=None,
        perspective="bodega",
    ) -> OrderSummary:
        counts = self.order_repo.get_summary_counts(
            source=source,
            status=status,
            urgency=urgency,
            product_name=product_name,
            logistics_operator=logistics_operator,
            city=city,
            commune=commune,
            order_number=order_number,
            perspective=perspective,
        )
        last_sync = self.sync_log_repo.get_last_sync()
        return OrderSummary(
            total_orders=counts["total"],
            overdue_count=counts["overdue"],
            due_today_count=counts["due_today"],
            delivered_today_count=counts["delivered_today"],
            tomorrow_count=counts["tomorrow"],
            two_or_more_days_count=counts["two_or_more_days"],
            on_time_count=counts["on_time"],
            last_sync_at=last_sync.started_at if last_sync else None,
            sources=["falabella", "mercadolibre"],
            breakdown=counts.get("breakdown"),
        )
