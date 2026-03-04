"""Chilean public holidays 2025-2027.

Source: Ley 2.977 (feriados fijos) + decretos anuales.
Variable holidays (San Pedro, Virgen del Carmen, etc.) are included with
their legislated dates. Update annually if decrees change the specific date.
"""
from datetime import date

CHILE_HOLIDAYS: set[date] = {
    # ── 2025 ──────────────────────────────────────────────
    date(2025, 1, 1),   # Año Nuevo
    date(2025, 4, 18),  # Viernes Santo
    date(2025, 4, 19),  # Sábado Santo
    date(2025, 5, 1),   # Día del Trabajo
    date(2025, 5, 21),  # Día de las Glorias Navales
    date(2025, 6, 20),  # Día Nacional de los Pueblos Indígenas
    date(2025, 6, 29),  # San Pedro y San Pablo
    date(2025, 7, 16),  # Virgen del Carmen
    date(2025, 8, 15),  # Asunción de la Virgen
    date(2025, 9, 18),  # Independencia Nacional
    date(2025, 9, 19),  # Día de las Glorias del Ejército
    date(2025, 10, 12), # Día del Encuentro de Dos Mundos
    date(2025, 10, 31), # Día de las Iglesias Evangélicas y Protestantes
    date(2025, 11, 1),  # Día de Todos los Santos
    date(2025, 12, 8),  # Inmaculada Concepción
    date(2025, 12, 25), # Navidad
    # ── 2026 ──────────────────────────────────────────────
    date(2026, 1, 1),
    date(2026, 4, 3),   # Viernes Santo
    date(2026, 4, 4),   # Sábado Santo
    date(2026, 5, 1),
    date(2026, 5, 21),
    date(2026, 6, 22),  # Día Nacional de los Pueblos Indígenas
    date(2026, 6, 29),
    date(2026, 7, 16),
    date(2026, 8, 15),
    date(2026, 9, 18),
    date(2026, 9, 19),
    date(2026, 10, 12),
    date(2026, 10, 31),
    date(2026, 11, 1),
    date(2026, 12, 8),
    date(2026, 12, 25),
    # ── 2027 ──────────────────────────────────────────────
    date(2027, 1, 1),
    date(2027, 3, 26),  # Viernes Santo
    date(2027, 3, 27),  # Sábado Santo
    date(2027, 5, 1),
    date(2027, 5, 21),
    date(2027, 6, 21),  # Día Nacional de los Pueblos Indígenas
    date(2027, 6, 29),
    date(2027, 7, 16),
    date(2027, 8, 15),
    date(2027, 9, 18),
    date(2027, 9, 19),
    date(2027, 10, 12),
    date(2027, 10, 31),
    date(2027, 11, 1),
    date(2027, 12, 8),
    date(2027, 12, 25),
}


def is_holiday(d: date) -> bool:
    """Return True if d is a Chilean public holiday."""
    return d in CHILE_HOLIDAYS
