"""Courier cost calculation logic.

Each courier function is pure: takes product dimensions, weight, and commune,
returns a CourierQuote. No DB, no HTTP, no side effects.
"""
import csv
import math
import os
from unicodedata import normalize as _unicode_normalize

from shipping.models import CourierQuote
from shipping.zones import is_flex_zone, is_welivery_rural


# ── Rapiboy ──────────────────────────────────────────────────────────────────
# Tarifa plana: $2,400 + IVA
# Restricciones: suma 3 lados <= 180 cm, peso <= 20 kg
# Solo zonas Flex

_RAPIBOY_NET = 2400
_RAPIBOY_IVA = math.ceil(_RAPIBOY_NET * 1.19)
_RAPIBOY_MAX_SIDES = 180.0
_RAPIBOY_MAX_WEIGHT = 20.0


def quote_rapiboy(weight_kg: float, sum_sides_cm: float, commune: str) -> CourierQuote:
    """Calculate Rapiboy shipping cost."""
    if not is_flex_zone(commune):
        return CourierQuote(
            courier="Rapiboy",
            available=False,
            reason=f"Comuna '{commune}' fuera de zona Flex",
        )
    if sum_sides_cm > _RAPIBOY_MAX_SIDES:
        return CourierQuote(
            courier="Rapiboy",
            available=False,
            reason=f"Suma de lados ({sum_sides_cm} cm) excede máximo {_RAPIBOY_MAX_SIDES} cm",
        )
    if weight_kg > _RAPIBOY_MAX_WEIGHT:
        return CourierQuote(
            courier="Rapiboy",
            available=False,
            reason=f"Peso ({weight_kg} kg) excede máximo {_RAPIBOY_MAX_WEIGHT} kg",
        )
    return CourierQuote(
        courier="Rapiboy",
        available=True,
        price=_RAPIBOY_IVA,
        price_net=_RAPIBOY_NET,
        tier="Estándar",
    )


# ── Welivery ─────────────────────────────────────────────────────────────────
# Tarifas por tramo (suma de lados / peso), con diferenciación urbano/rural
# El tramo se determina por el criterio MÁS restrictivo (lados o peso)

_WELIVERY_URBAN_TIERS = [
    # (max_sides, max_weight, tier_name, price_iva)
    (150.0, 20.0, "Normal", 2450),
    (200.0, 25.0, "XL", 4300),
    (250.0, 30.0, "2 XL", 10000),
    (300.0, 35.0, "3 XL", 16000),
    (350.0, 40.0, "4 XL", 21000),
    (400.0, 45.0, "5 XL", 26000),
    (450.0, 50.0, "6 XL", 30000),
]

_WELIVERY_RURAL_TIERS = [
    (150.0, 20.0, "Rural", 4600),
    (200.0, 25.0, "XL Rural", 6500),
    (250.0, 30.0, "2 XL Rural", 13000),
    (300.0, 35.0, "3 XL Rural", 19000),
    (350.0, 40.0, "4 XL Rural", 24000),
    (400.0, 45.0, "5 XL Rural", 29000),
    (450.0, 50.0, "6 XL Rural", 33000),
]


def _find_welivery_tier(
    weight_kg: float, sum_sides_cm: float, tiers: list[tuple],
) -> tuple[str, int] | None:
    """Find the matching Welivery tier. Returns (tier_name, price_iva) or None."""
    for max_sides, max_weight, name, price in tiers:
        if sum_sides_cm <= max_sides and weight_kg <= max_weight:
            return name, price
    return None


def quote_welivery(weight_kg: float, sum_sides_cm: float, commune: str) -> CourierQuote:
    """Calculate Welivery shipping cost."""
    if not is_flex_zone(commune):
        return CourierQuote(
            courier="Welivery",
            available=False,
            reason=f"Comuna '{commune}' fuera de zona Flex",
        )

    tiers = _WELIVERY_RURAL_TIERS if is_welivery_rural(commune) else _WELIVERY_URBAN_TIERS
    result = _find_welivery_tier(weight_kg, sum_sides_cm, tiers)

    if not result:
        max_sides = tiers[-1][0]
        max_weight = tiers[-1][1]
        return CourierQuote(
            courier="Welivery",
            available=False,
            reason=f"Excede límites: máx {max_sides} cm (lados) / {max_weight} kg (peso)",
        )

    tier_name, price_iva = result
    price_net = math.ceil(price_iva / 1.19)

    return CourierQuote(
        courier="Welivery",
        available=True,
        price=price_iva,
        price_net=price_net,
        tier=tier_name,
    )


# ── Starken ──────────────────────────────────────────────────────────────────
# Tarifa terrestre desde Santiago, por localidad + peso.
# Precios NETOS (sin IVA). Peso máximo: 1000 kg.
# CSV: region,locality,w_0_0.5,...,w_90_100,w_100_499_per_kg,w_499_1000_per_kg

# Weight bracket upper bounds (kg) for columns 0-13
_STARKEN_BRACKETS = [0.5, 1.5, 3, 6, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]

# Lazy-loaded tariff dict: {normalized_locality: [14 bracket prices, per_kg_100, per_kg_499]}
_starken_tariffs: dict[str, list[int]] | None = None


def _normalize_name(name: str) -> str:
    """Normalize locality name for matching: lowercase, strip accents, trim."""
    name = name.strip().lower()
    # Remove accents: NFD decompose → drop combining chars → NFC recompose
    name = _unicode_normalize("NFD", name)
    name = "".join(c for c in name if not (0x0300 <= ord(c) <= 0x036F))
    return name


def _load_starken_tariffs() -> dict[str, list[int]]:
    """Load tariff CSV into memory (once)."""
    global _starken_tariffs
    if _starken_tariffs is not None:
        return _starken_tariffs

    csv_path = os.path.join(os.path.dirname(__file__), "starken_tariffs.csv")
    tariffs: dict[str, list[int]] = {}
    with open(csv_path, encoding="utf-8") as f:
        reader = csv.reader(f)
        next(reader)  # skip header
        for row in reader:
            if len(row) < 18:
                continue
            locality = _normalize_name(row[1])
            prices = [int(row[i]) for i in range(2, 18)]  # 16 values
            tariffs[locality] = prices
    _starken_tariffs = tariffs
    return tariffs


def _starken_price(prices: list[int], weight_kg: float) -> int | None:
    """Look up net price from the 16-column price list for a given weight."""
    if weight_kg <= 0:
        return None
    if weight_kg > 1000:
        return None

    # Brackets 0-13: fixed price for weight range
    for i, upper in enumerate(_STARKEN_BRACKETS):
        if weight_kg <= upper:
            return prices[i]

    # Over 100 kg: base price (90.01-100 bracket) + per-kg surcharge
    base_price = prices[13]  # 90.01-100 bracket
    extra_kg = weight_kg - 100
    if weight_kg <= 499:
        per_kg = prices[14]  # 100.01-499 per-kg rate
    else:
        per_kg = prices[15]  # 499.01-1000 per-kg rate

    return base_price + math.ceil(extra_kg * per_kg)


def _volumetric_weight(height_cm: float, width_cm: float, length_cm: float) -> float:
    """Starken volumetric weight: (h × w × l) / 4000."""
    return (height_cm * width_cm * length_cm) / 4000


def quote_starken(
    weight_kg: float,
    commune: str,
    height_cm: float = 0,
    width_cm: float = 0,
    length_cm: float = 0,
) -> CourierQuote:
    """Calculate Starken shipping cost.

    Uses 'volumen courier' = max(peso_real, (h×w×l)/4000) as the
    billable weight for tariff lookup.
    """
    vol_weight = _volumetric_weight(height_cm, width_cm, length_cm)
    billable_kg = max(weight_kg, vol_weight)

    if billable_kg > 1000:
        return CourierQuote(
            courier="Starken",
            available=False,
            reason=f"Peso tarificable ({billable_kg:.1f} kg) excede máximo 1000 kg",
        )

    tariffs = _load_starken_tariffs()
    key = _normalize_name(commune)

    if key not in tariffs:
        return CourierQuote(
            courier="Starken",
            available=False,
            reason=f"Localidad '{commune}' no encontrada en tarifario Starken",
        )

    prices = tariffs[key]
    price_net = _starken_price(prices, billable_kg)

    if price_net is None or price_net == 0:
        return CourierQuote(
            courier="Starken",
            available=False,
            reason=f"Sin tarifa para {billable_kg:.1f} kg en '{commune}'",
        )

    price_iva = math.ceil(price_net * 1.19)

    # Determine tier name from billable weight bracket
    tier = "Estándar"
    if billable_kg > 100:
        tier = "Sobrepeso"
    elif billable_kg > 30:
        tier = "Pesado"

    return CourierQuote(
        courier="Starken",
        available=True,
        price=price_iva,
        price_net=price_net,
        tier=tier,
    )


# ── Falabella Cofinanciamiento Logístico (Bluexpress / Chilexpress) ───────────
# Precio determinado por: peso tarificable + precio del producto + rating vendedor.
# Peso tarificable: max(peso_real, peso_volumétrico) donde vol = h×w×l / 4000.
# Precios con IVA incluido (CLP).
# Sin restricción geográfica: Falabella gestiona la entrega.

# Tramos de peso (límite superior en kg)
_FALA_UPPER_KG = [1, 2, 3, 6, 10, 15, 20, 30, 50, 80, 100, 125, 150, 175, 200, 225, 250, 300, 400, 500, 600]

# Columnas: [5/5_low, 4/5_low, 3/5_low, 2/5_low, 5/5_high, 4/5_high, 3/5_high, 2/5_high]
# _low = producto < $19.990 / _high = producto >= $19.990
_FALA_PRICES: list[list[int]] = [
    [1000,  1190,  1890,  2390,  2790,  3490,  5290,  6590],   # 0–1 kg
    [1000,  1190,  1890,  2390,  2890,  3490,  5590,  6990],   # 1–2 kg
    [1000,  1190,  1890,  2390,  3090,  3690,  5890,  7390],   # 2–3 kg
    [2490,  2990,  4790,  5990,  3390,  3990,  6390,  7990],   # 3–6 kg
    [3790,  4490,  7190,  8990,  3790,  4490,  7190,  8990],   # 6–10 kg
    [4590,  5490,  8790,  10990, 4590,  5490,  8790,  10990],  # 10–15 kg
    [5490,  6490,  10390, 12990, 5490,  6490,  10390, 12990],  # 15–20 kg
    [6690,  7990,  12790, 15990, 6690,  7990,  12790, 15990],  # 20–30 kg
    [7590,  8990,  14390, 17990, 7590,  8990,  14390, 17990],  # 30–50 kg
    [8390,  9990,  15990, 19990, 8390,  9990,  15990, 19990],  # 50–80 kg
    [9190,  10990, 17590, 21990, 9190,  10990, 17590, 21990],  # 80–100 kg
    [9190,  10990, 17590, 21990, 9190,  10990, 17590, 21990],  # 100–125 kg
    [10890, 12990, 20790, 25990, 10890, 12990, 20790, 25990],  # 125–150 kg
    [10890, 12990, 20790, 25990, 10890, 12990, 20790, 25990],  # 150–175 kg
    [12590, 14990, 23990, 29990, 12590, 14990, 23990, 29990],  # 175–200 kg
    [15990, 18990, 30390, 37990, 15990, 18990, 30390, 37990],  # 200–225 kg
    [15990, 18990, 30390, 37990, 15990, 18990, 30390, 37990],  # 225–250 kg
    [20990, 24990, 39990, 49990, 20990, 24990, 39990, 49990],  # 250–300 kg
    [21790, 25990, 41590, 51990, 21790, 25990, 41590, 51990],  # 300–400 kg
    [22690, 26990, 43190, 53990, 22690, 26990, 43190, 53990],  # 400–500 kg
    [29390, 34990, 55990, 69990, 29390, 34990, 55990, 69990],  # 500–600 kg
]

# >600 kg: tarifa por kg (CLP con IVA) — misma para ambos grupos de precio
_FALA_PER_KG: list[int] = [34, 40, 64, 80, 34, 40, 64, 80]

_FALA_RATING_IDX = {"5/5": 0, "4/5": 1, "3/5": 2, "2/5": 3}


def quote_falabella(
    weight_kg: float,
    height_cm: float = 0,
    width_cm: float = 0,
    length_cm: float = 0,
    product_price: float = 0,
    rating: str = "5/5",
) -> CourierQuote:
    """Cofinanciamiento logístico Falabella (Bluexpress/Chilexpress).

    Peso tarificable = max(peso_real, h×w×l / 4000).
    Precios con IVA incluido.
    """
    if rating not in _FALA_RATING_IDX:
        return CourierQuote(
            courier="Falabella",
            available=False,
            reason=f"Rating inválido '{rating}'. Valores: 5/5, 4/5, 3/5, 2/5",
        )

    vol_weight = (height_cm * width_cm * length_cm) / 4000 if height_cm and width_cm and length_cm else 0.0
    billable_kg = max(weight_kg, vol_weight)

    # Column index: 0–3 for <19990, 4–7 for >=19990
    price_group_offset = 4 if product_price >= 19990 else 0
    col = price_group_offset + _FALA_RATING_IDX[rating]

    if billable_kg > 600:
        price_iva = math.ceil(billable_kg * _FALA_PER_KG[col])
        tier_label = "Sobrepeso"
    else:
        price_iva = _FALA_PRICES[-1][col]  # fallback (shouldn't happen)
        tier_label = "Estándar"
        for i, upper in enumerate(_FALA_UPPER_KG):
            if billable_kg <= upper:
                price_iva = _FALA_PRICES[i][col]
                break

    price_net = math.ceil(price_iva / 1.19)
    product_tier = "Producto ≥$19.990" if product_price >= 19990 else "Producto <$19.990"

    return CourierQuote(
        courier="Falabella (Bluexpress/Chilexpress)",
        available=True,
        price=price_iva,
        price_net=price_net,
        tier=f"{tier_label} · Rating {rating} · {product_tier}",
    )


# ── Cotización global ────────────────────────────────────────────────────────

def quote_all(
    weight_kg: float,
    sum_sides_cm: float,
    commune: str,
    height_cm: float = 0,
    width_cm: float = 0,
    length_cm: float = 0,
    product_price: float = 0,
    rating: str = "5/5",
) -> list[CourierQuote]:
    """Get quotes from all couriers for a given product + destination."""
    return [
        quote_rapiboy(weight_kg, sum_sides_cm, commune),
        quote_welivery(weight_kg, sum_sides_cm, commune),
        quote_starken(weight_kg, commune, height_cm=height_cm, width_cm=width_cm, length_cm=length_cm),
        quote_falabella(weight_kg, height_cm=height_cm, width_cm=width_cm, length_cm=length_cm,
                        product_price=product_price, rating=rating),
    ]
