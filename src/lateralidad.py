"""Lateralidad de un jugador: con qué lado batea y con qué mano lanza.

La MLB API codifica ambos campos con una sola letra, y **los dos admiten
`"S"`** — switch. Traducir eso en el cliente parece trivial y es justo donde
se pierde: un ternario `bats === "L" ? "Zurdo" : "Derecho"` etiqueta mal a
los 198 ambidiestros de la base, y lo hace en silencio, sin error ni pista.

Por eso la etiqueta la compone la API, no el cliente. Es la misma decisión que
`ordinal_es()` en el motor en vivo: cuando hay un solo lugar donde traducir,
solo hay un lugar donde equivocarse.

OJO con `throws`: el esquema de `database.py` decía que solo valía 'L' o 'R'.
La base lo desmiente — **Anthony Seigler lanza con las dos manos**. Es un solo
jugador entre 2.253, que es exactamente el perfil del caso que nadie prueba y
que nadie ve fallar.
"""

from __future__ import annotations

from typing import Optional

# Cómo se para en la caja de bateo.
BATEA_ES = {
    "R": "Derecho",
    "L": "Zurdo",
    "S": "Ambidiestro",
}

# Con qué mano lanza. Concuerda con "mano", de ahí el femenino.
LANZA_ES = {
    "R": "Derecha",
    "L": "Zurda",
    "S": "Ambas",
}


def batea_es(code: Optional[str]) -> Optional[str]:
    """'S' → 'Ambidiestro'. Un código desconocido devuelve None, no el crudo:
    mostrar una letra suelta en la ficha es peor que no mostrar nada."""
    if not code:
        return None
    return BATEA_ES.get(code.strip().upper())


def lanza_es(code: Optional[str]) -> Optional[str]:
    """'S' → 'Ambas'. Mismo criterio que `batea_es` con lo desconocido."""
    if not code:
        return None
    return LANZA_ES.get(code.strip().upper())


def anotar_lateralidad(row: dict) -> dict:
    """Añade `bats_label` y `throws_label` a una fila de `players`.

    Muta y devuelve la misma fila, que es lo que quieren los endpoints: las
    filas salen de `query_db` como dicts sueltos y no hay modelo que respetar.
    """
    row["bats_label"] = batea_es(row.get("bats"))
    row["throws_label"] = lanza_es(row.get("throws"))
    return row
