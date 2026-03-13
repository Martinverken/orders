"""Shared fixtures for all mapper tests."""
import pytest
from datetime import datetime


# ── Falabella ────────────────────────────────────────────────────────────────

@pytest.fixture
def falabella_raw():
    """Minimal valid Falabella order (regular, pending)."""
    return {
        "OrderId": "12345",
        "CreatedAt": "2026-03-09 10:00:00",
        "Statuses": [{"Status": "pending"}],
        "PromisedShippingTime": "2026-03-12 23:59:00",
        "ShippingProviderType": "regular",
        "_items": [{"Name": "Zapatilla Running", "Quantity": 2}],
    }


# ── Mercado Libre ────────────────────────────────────────────────────────────

@pytest.fixture
def ml_order_raw():
    """Minimal valid ML order (paid, Flex)."""
    return {
        "id": 99001,
        "status": "paid",
        "date_created": "2026-03-09T10:00:00.000-0400",
        "date_last_updated": "2026-03-09T10:05:00.000-0400",
        "order_items": [
            {"item": {"title": "Polera Algodón", "seller_sku": "POL-001"}, "quantity": 1}
        ],
        "shipping": {"logistic_type": "self_service"},
    }


@pytest.fixture
def ml_shipment_raw():
    """Minimal valid ML shipment (Flex, ready_to_ship)."""
    return {
        "id": 55001,
        "status": "ready_to_ship",
        "logistic_type": "self_service",
        "shipping_option": {
            "estimated_delivery_limit": {
                "date": "2026-03-10T23:59:00.000-0400",
            },
        },
    }


# ── Walmart ──────────────────────────────────────────────────────────────────

@pytest.fixture
def walmart_raw():
    """Minimal valid Walmart order (Created)."""
    return {
        "purchaseOrderId": "WM-001",
        "orderDate": 1894276800000,  # 2030-01-11 epoch ms (UTC)
        "shippingInfo": {
            "estimatedShipDate": 1894622400000,  # 2030-01-15 epoch ms (UTC)
            "methodCode": "Standard",
        },
        "orderLines": {
            "orderLine": [
                {
                    "lineNumber": "1",
                    "item": {"productName": "Silla Gamer"},
                    "orderLineQuantity": {"amount": "1"},
                    "orderLineStatuses": [{"status": "Created"}],
                }
            ]
        },
    }


# ── Paris ────────────────────────────────────────────────────────────────────

@pytest.fixture
def paris_raw():
    """Minimal valid Paris order (pending)."""
    return {
        "id": "PAR-001",
        "createdAt": "2030-01-11T10:00:00",
        "subOrders": [
            {
                "id": 1,
                "status": {"id": 1, "name": "pending"},
                "dispatchDate": "2030-01-15",
                "items": [{"name": "Cojín Decorativo"}],
            }
        ],
    }


# ── Shopify ──────────────────────────────────────────────────────────────────

@pytest.fixture
def shopify_raw():
    """Minimal valid Shopify order (paid, ebox+welivery, weekday before cutoff)."""
    return {
        "id": 7001,
        "name": "#1001",
        "financial_status": "paid",
        "tags": "ebox, welivery",
        "created_at": "2026-03-10T10:00:00-04:00",  # Tuesday 10am Santiago
        "line_items": [
            {"title": "Pack Vitaminas", "quantity": 3}
        ],
    }
