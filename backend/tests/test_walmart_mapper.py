"""Tests for Walmart order mapper."""
import pytest
from integrations.walmart.mapper import to_order_create


class TestHappyPath:
    def test_created_order(self, walmart_raw):
        result = to_order_create(walmart_raw)
        assert result is not None
        assert result.external_id == "WM-001"
        assert result.source == "walmart"
        assert result.status == "pending"
        assert result.product_name == "Silla Gamer"
        assert result.product_quantity == 1

    def test_acknowledged_order(self, walmart_raw):
        walmart_raw["orderLines"]["orderLine"][0]["orderLineStatuses"] = [
            {"status": "Acknowledged"}
        ]
        result = to_order_create(walmart_raw)
        assert result is not None
        assert result.status == "ready_to_ship"


class TestSkips:
    def test_delivered_skipped(self, walmart_raw):
        walmart_raw["orderLines"]["orderLine"][0]["orderLineStatuses"] = [
            {"status": "Delivered"}
        ]
        assert to_order_create(walmart_raw) is None

    def test_cancelled_skipped(self, walmart_raw):
        walmart_raw["orderLines"]["orderLine"][0]["orderLineStatuses"] = [
            {"status": "Canceled"}
        ]
        assert to_order_create(walmart_raw) is None

    def test_no_ship_date_skipped(self, walmart_raw):
        walmart_raw["shippingInfo"] = {}
        assert to_order_create(walmart_raw) is None

    def test_no_purchase_order_id_skipped(self, walmart_raw):
        walmart_raw["purchaseOrderId"] = None
        assert to_order_create(walmart_raw) is None


class TestMultiLine:
    def test_least_advanced_status_wins(self, walmart_raw):
        """With Created + Shipped lines, result should be pending (least advanced)."""
        walmart_raw["orderLines"]["orderLine"] = [
            {
                "lineNumber": "1",
                "item": {"productName": "Item A"},
                "orderLineStatuses": [{"status": "Shipped"}],
            },
            {
                "lineNumber": "2",
                "item": {"productName": "Item B"},
                "orderLineStatuses": [{"status": "Created"}],
            },
        ]
        result = to_order_create(walmart_raw)
        assert result is not None
        assert result.status == "pending"
