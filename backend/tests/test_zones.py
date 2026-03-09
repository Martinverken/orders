"""Tests for shipping zone logic."""
from shipping.zones import is_flex_zone, is_welivery_rural


class TestFlexZone:
    def test_standard_communes(self):
        assert is_flex_zone("Providencia") is True
        assert is_flex_zone("Santiago") is True
        assert is_flex_zone("Las Condes") is True
        assert is_flex_zone("Maipú") is True

    def test_case_insensitive(self):
        assert is_flex_zone("PROVIDENCIA") is True
        assert is_flex_zone("providencia") is True

    def test_accents_variants(self):
        assert is_flex_zone("Ñuñoa") is True
        assert is_flex_zone("nunoa") is True
        assert is_flex_zone("Maipú") is True
        assert is_flex_zone("maipu") is True

    def test_outside_zone(self):
        assert is_flex_zone("Valparaíso") is False
        assert is_flex_zone("Temuco") is False
        assert is_flex_zone("Concepción") is False

    def test_trimmed(self):
        assert is_flex_zone("  Santiago  ") is True


class TestWeliveryRural:
    def test_colina_is_rural(self):
        assert is_welivery_rural("Colina") is True

    def test_padre_hurtado_is_rural(self):
        assert is_welivery_rural("Padre Hurtado") is True

    def test_santiago_is_not_rural(self):
        assert is_welivery_rural("Santiago") is False
