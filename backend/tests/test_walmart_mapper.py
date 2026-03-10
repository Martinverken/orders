"""Tests for Walmart order mapper."""
import pytest
from integrations.walmart.mapper import to_order_create, to_order_creates


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


class TestMultiBulto:
    def test_single_line_no_split(self, walmart_raw):
        results = to_order_creates(walmart_raw)
        assert len(results) == 1
        assert results[0].external_id == "WM-001"

    def test_multi_line_different_tracking_splits(self, walmart_raw):
        walmart_raw["orderLines"]["orderLine"] = [
            {
                "lineNumber": "1",
                "item": {"productName": "Item A"},
                "orderLineQuantity": {"amount": "1"},
                "orderLineStatuses": [{"status": "Created", "trackingInfo": {"trackingNumber": "TRK-001"}}],
            },
            {
                "lineNumber": "2",
                "item": {"productName": "Item B"},
                "orderLineQuantity": {"amount": "2"},
                "orderLineStatuses": [{"status": "Created", "trackingInfo": {"trackingNumber": "TRK-002"}}],
            },
        ]
        results = to_order_creates(walmart_raw)
        assert len(results) == 2
        assert results[0].external_id == "WM-001-0"
        assert results[1].external_id == "WM-001-1"
        assert results[0].product_name == "Item A"
        assert results[1].product_name == "Item B"
        assert results[0].raw_data["_line_index"] == 0
        assert results[1].raw_data["_line_index"] == 1

    def test_multi_line_same_tracking_no_split(self, walmart_raw):
        walmart_raw["orderLines"]["orderLine"] = [
            {
                "lineNumber": "1",
                "item": {"productName": "Item A"},
                "orderLineStatuses": [{"status": "Created", "trackingInfo": {"trackingNumber": "TRK-001"}}],
            },
            {
                "lineNumber": "2",
                "item": {"productName": "Item B"},
                "orderLineStatuses": [{"status": "Created", "trackingInfo": {"trackingNumber": "TRK-001"}}],
            },
        ]
        results = to_order_creates(walmart_raw)
        assert len(results) == 1
        assert results[0].external_id == "WM-001"
