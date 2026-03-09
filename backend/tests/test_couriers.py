"""Tests for courier cost calculation logic."""
import math
import pytest
from shipping.couriers import quote_rapiboy, quote_welivery, quote_starken, quote_all


class TestRapiboy:
    def test_standard_delivery(self):
        q = quote_rapiboy(weight_kg=5.0, sum_sides_cm=100.0, commune="Providencia")
        assert q.available is True
        assert q.price == 2856  # 2400 * 1.19
        assert q.price_net == 2400

    def test_exceeds_weight(self):
        q = quote_rapiboy(weight_kg=25.0, sum_sides_cm=100.0, commune="Santiago")
        assert q.available is False
        assert "20" in q.reason

    def test_exceeds_dimensions(self):
        q = quote_rapiboy(weight_kg=5.0, sum_sides_cm=200.0, commune="Santiago")
        assert q.available is False
        assert "180" in q.reason

    def test_outside_flex_zone(self):
        q = quote_rapiboy(weight_kg=5.0, sum_sides_cm=100.0, commune="Valparaíso")
        assert q.available is False
        assert "fuera de zona" in q.reason

    def test_at_exact_limits(self):
        q = quote_rapiboy(weight_kg=20.0, sum_sides_cm=180.0, commune="Santiago")
        assert q.available is True


class TestWelivery:
    def test_normal_urban(self):
        q = quote_welivery(weight_kg=5.0, sum_sides_cm=100.0, commune="Providencia")
        assert q.available is True
        assert q.price == 2450
        assert q.tier == "Normal"

    def test_xl_urban(self):
        q = quote_welivery(weight_kg=22.0, sum_sides_cm=180.0, commune="Santiago")
        assert q.available is True
        assert q.price == 4300
        assert q.tier == "XL"

    def test_2xl_urban(self):
        q = quote_welivery(weight_kg=28.0, sum_sides_cm=220.0, commune="Ñuñoa")
        assert q.available is True
        assert q.price == 10000
        assert q.tier == "2 XL"

    def test_6xl_urban(self):
        q = quote_welivery(weight_kg=48.0, sum_sides_cm=430.0, commune="Macul")
        assert q.available is True
        assert q.price == 30000
        assert q.tier == "6 XL"

    def test_rural_colina(self):
        q = quote_welivery(weight_kg=5.0, sum_sides_cm=100.0, commune="Colina")
        assert q.available is True
        assert q.price == 4600
        assert q.tier == "Rural"

    def test_rural_padre_hurtado_xl(self):
        q = quote_welivery(weight_kg=22.0, sum_sides_cm=180.0, commune="Padre Hurtado")
        assert q.available is True
        assert q.price == 6500
        assert q.tier == "XL Rural"

    def test_exceeds_max(self):
        q = quote_welivery(weight_kg=55.0, sum_sides_cm=460.0, commune="Santiago")
        assert q.available is False

    def test_outside_flex_zone(self):
        q = quote_welivery(weight_kg=5.0, sum_sides_cm=100.0, commune="Temuco")
        assert q.available is False

    def test_weight_determines_tier(self):
        """Small box but heavy → higher tier by weight."""
        q = quote_welivery(weight_kg=22.0, sum_sides_cm=100.0, commune="Santiago")
        # 100cm fits Normal, but 22kg exceeds Normal (max 20). Need XL (max 25kg, max 200cm)
        assert q.available is True
        assert q.tier == "XL"

    def test_dimensions_determine_tier(self):
        """Light but large box → higher tier by dimensions."""
        q = quote_welivery(weight_kg=5.0, sum_sides_cm=180.0, commune="Santiago")
        # 5kg fits Normal, but 180cm exceeds Normal (max 150). Need XL (max 200cm)
        assert q.available is True
        assert q.tier == "XL"


class TestStarken:
    def test_santiago_available(self):
        q = quote_starken(weight_kg=5.0, sum_sides_cm=100.0, commune="Santiago")
        assert q.available is True
        assert q.price_net == 2412  # 3-6 kg bracket for Santiago
        assert q.price == math.ceil(2412 * 1.19)

    def test_unknown_locality(self):
        q = quote_starken(weight_kg=5.0, sum_sides_cm=100.0, commune="NoExiste")
        assert q.available is False
        assert "no encontrada" in q.reason

    def test_accent_normalization(self):
        q = quote_starken(weight_kg=1.0, sum_sides_cm=50.0, commune="Viña del Mar")
        assert q.available is True

    def test_over_100kg(self):
        q = quote_starken(weight_kg=150.0, sum_sides_cm=300.0, commune="Santiago")
        assert q.available is True
        assert q.tier == "Sobrepeso"

    def test_over_1000kg(self):
        q = quote_starken(weight_kg=1001.0, sum_sides_cm=300.0, commune="Santiago")
        assert q.available is False


class TestQuoteAll:
    def test_returns_all_couriers(self):
        quotes = quote_all(weight_kg=5.0, sum_sides_cm=100.0, commune="Santiago")
        couriers = {q.courier for q in quotes}
        assert couriers == {"Rapiboy", "Welivery", "Starken"}

    def test_flex_zone_two_available(self):
        quotes = quote_all(weight_kg=5.0, sum_sides_cm=100.0, commune="Providencia")
        available = [q for q in quotes if q.available]
        assert len(available) == 2  # Rapiboy + Welivery

    def test_outside_flex_starken_only(self):
        quotes = quote_all(weight_kg=5.0, sum_sides_cm=100.0, commune="Valparaíso")
        available = [q for q in quotes if q.available]
        assert len(available) == 1
        assert available[0].courier == "Starken"
