"""
orquestacion/temporadas.py — Las particiones: una por temporada de la MLB API.

La clave es el año en que EMPIEZA la campaña, como la nombra la MLB API:
"2025" es la 2025-26. Es el mismo formato que `python main.py ingest 2025`.
"""

from __future__ import annotations

from typing import Optional

from dagster import StaticPartitionsDefinition

# La regla vive en src/jornada.py: la usa también la ingesta diaria del
# servidor (`python main.py ingesta-diaria`), que no tiene Dagster.
from src.jornada import temporada_actual  # noqa: F401


# La MLB API tiene LIDOM desde la 2012-13. Antes, la capa histórica.
PRIMERA = 2012


def claves(hasta: Optional[int] = None) -> list[str]:
    return [str(y) for y in range(PRIMERA, (hasta or temporada_actual()) + 1)]


# Se calcula al cargar las definiciones: en septiembre aparece sola la
# partición de la temporada nueva.
TEMPORADAS = StaticPartitionsDefinition(claves())
