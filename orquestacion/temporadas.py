"""
orquestacion/temporadas.py — Las particiones: una por temporada de la MLB API.

La clave es el año en que EMPIEZA la campaña, como la nombra la MLB API:
"2025" es la 2025-26. Es el mismo formato que `python main.py ingest 2025`.
"""

from __future__ import annotations

from datetime import date
from typing import Optional

from dagster import StaticPartitionsDefinition

from src.jornada import hoy_rd

# La MLB API tiene LIDOM desde la 2012-13. Antes, la capa histórica.
PRIMERA = 2012


def temporada_actual(hoy: Optional[date] = None) -> int:
    """La temporada en curso o la última jugada, en la hora de RD.

    LIDOM arranca a mediados de octubre y termina a fines de enero (febrero
    con la Serie del Caribe). Desde septiembre ya cuenta la que viene: el
    calendario de la nueva se publica antes del primer juego.
    """
    d = hoy or hoy_rd()
    return d.year if d.month >= 9 else d.year - 1


def claves(hasta: Optional[int] = None) -> list[str]:
    return [str(y) for y in range(PRIMERA, (hasta or temporada_actual()) + 1)]


# Se calcula al cargar las definiciones: en septiembre aparece sola la
# partición de la temporada nueva.
TEMPORADAS = StaticPartitionsDefinition(claves())
