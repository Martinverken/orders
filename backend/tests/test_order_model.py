"""Tests for compute_urgency in models.order."""
import pytest
from datetime import datetime, date, timedelta
from zoneinfo import ZoneInfo
from models.order import compute_urgency, OrderUrgency

_SANTIAGO = ZoneInfo("America/Santiago")
_TODAY = date(2026, 3, 9)


@pytest.fixture(autouse=True)
def freeze_today(monkeypatch):
    """Pin _today_santiago() to a fixed date for all tests."""
    monkeypatch.setattr("models.order._today_santiago", lambda: _TODAY)


def _dt(d: date) -> datetime:
    return datetime(d.year, d.month, d.day, 23, 59, tzinfo=_SANTIAGO)


class TestOverdue:
    def test_pending_past_date(self):
        assert compute_urgency(_dt(_TODAY - timedelta(days=1)), "pending") == OrderUrgency.OVERDUE

    def test_shipped_past_date(self):
        assert compute_urgency(_dt(_TODAY - timedelta(days=1)), "shipped") == OrderUrgency.OVERDUE

    def test_ready_to_ship_past_date(self):
        assert compute_urgency(_dt(_TODAY - timedelta(days=1)), "ready_to_ship") == OrderUrgency.OVERDUE


class TestDueToday:
    def test_pending_today(self):
        assert compute_urgency(_dt(_TODAY), "pending") == OrderUrgency.DUE_TODAY

    def test_ready_to_ship_today(self):
        assert compute_urgency(_dt(_TODAY), "ready_to_ship") == OrderUrgency.DUE_TODAY


class TestDeliveredToday:
    def test_shipped_today(self):
        assert compute_urgency(_dt(_TODAY), "shipped") == OrderUrgency.DELIVERED_TODAY

    def test_delivered_today(self):
        assert compute_urgency(_dt(_TODAY), "delivered") == OrderUrgency.DELIVERED_TODAY


class TestTomorrow:
    def test_pending_tomorrow(self):
        assert compute_urgency(_dt(_TODAY + timedelta(days=1)), "pending") == OrderUrgency.TOMORROW


class TestTwoOrMoreDays:
    def test_pending_day_after_tomorrow(self):
        assert compute_urgency(_dt(_TODAY + timedelta(days=2)), "pending") == OrderUrgency.TWO_OR_MORE_DAYS


class TestOnTime:
    def test_shipped_future(self):
        assert compute_urgency(_dt(_TODAY + timedelta(days=1)), "shipped") == OrderUrgency.ON_TIME

    def test_unknown_status(self):
        assert compute_urgency(_dt(_TODAY), "unknown") == OrderUrgency.ON_TIME
