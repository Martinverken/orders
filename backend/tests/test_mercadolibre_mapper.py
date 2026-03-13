"""Tests for Mercado Libre order mapper."""
import pytest
from integrations.mercadolibre.mapper import to_order_create


class TestHappyPath:
    def test_flex_ready_to_ship(self, ml_order_raw, ml_shipment_raw):
        result = to_order_create(ml_order_raw, ml_shipment_raw)
        assert result is not None
        assert result.external_id == "99001"
        assert result.source == "mercadolibre"
        assert result.status == "ready_to_ship"
        assert result.product_name == "Polera Algodón"
        assert result.product_quantity == 1


class TestSkips:
    def test_fulfillment_skipped(self, ml_order_raw, ml_shipment_raw):
        ml_shipment_raw["logistic_type"] = "fulfillment"
        assert to_order_create(ml_order_raw, ml_shipment_raw) is None

    def test_delivered_returns_order(self, ml_order_raw, ml_shipment_raw):
        """Delivered ML orders are returned (not skipped) so the sync can archive them."""
        ml_shipment_raw["status"] = "delivered"
        result = to_order_create(ml_order_raw, ml_shipment_raw)
        assert result is not None
        assert result.status == "delivered"

    def test_no_delivery_date_skipped(self, ml_order_raw, ml_shipment_raw):
        ml_shipment_raw["shipping_option"] = {}
        assert to_order_create(ml_order_raw, ml_shipment_raw) is None


class TestStatusMapping:
    def test_flex_shipped_keeps_shipped(self, ml_order_raw, ml_shipment_raw):
        ml_shipment_raw["status"] = "shipped"
        result = to_order_create(ml_order_raw, ml_shipment_raw)
        assert result is not None
        assert result.status == "shipped"

    def test_ce_not_remapped(self, ml_order_raw, ml_shipment_raw):
        """Centro de Envíos shipped stays as shipped."""
        ml_shipment_raw["logistic_type"] = "cross_docking"
        ml_shipment_raw["status"] = "shipped"
        ml_shipment_raw["shipping_option"] = {
            "estimated_delivery_limit": {
                "date": "2026-03-10T23:59:00.000-0400",
            },
        }
        result = to_order_create(ml_order_raw, ml_shipment_raw)
        assert result is not None
        assert result.status == "shipped"
