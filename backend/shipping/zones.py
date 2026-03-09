"""Zonas de cobertura de los couriers Flex."""

# Todas las comunas donde operan los couriers Flex (Rapiboy, Welivery)
FLEX_ZONES: set[str] = {
    "quilicura",
    "cerrillos",
    "cerro navia",
    "estación central",
    "estacion central",
    "la cisterna",
    "lo espejo",
    "lo prado",
    "pedro aguirre cerda",
    "quinta normal",
    "renca",
    "conchalí",
    "conchali",
    "independencia",
    "la granja",
    "macul",
    "ñuñoa",
    "nunoa",
    "providencia",
    "recoleta",
    "san joaquín",
    "san joaquin",
    "san miguel",
    "san ramón",
    "san ramon",
    "santiago",
    "huechuraba",
    "pudahuel",
    "colina",
    "el bosque",
    "la florida",
    "la pintana",
    "la reina",
    "las condes",
    "lo barnechea",
    "maipú",
    "maipu",
    "peñalolén",
    "penalolen",
    "vitacura",
    "padre hurtado",
    "puente alto",
    "san bernardo",
}

# Comunas rurales de Welivery (tarifa diferenciada)
WELIVERY_RURAL_ZONES: set[str] = {
    "colina",
    "padre hurtado",
}


def is_flex_zone(commune: str) -> bool:
    """Check if a commune is in the Flex delivery zone."""
    return commune.strip().lower() in FLEX_ZONES


def is_welivery_rural(commune: str) -> bool:
    """Check if a commune has Welivery rural pricing."""
    return commune.strip().lower() in WELIVERY_RURAL_ZONES
