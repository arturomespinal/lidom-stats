"""
Del id de la MLB al slug de la ficha.

El feed en vivo identifica a cada jugador con su número de la MLB (688005);
las fichas usan el slug `nombre-fechanacimiento` (ver CLAUDE.md, "El
player_id es el slug"). Este módulo cruza uno con otro contra la tabla
`players`, que guarda los dos (`players.mlb_id` es único).

El cruce vive aquí y NO en el parser (`src/live/detail.py`): el parser es una
función pura sobre el GUMBO, sin base de datos, y así se prueba sin nada
más que las capturas de `fixtures/`. La ruta proyecta el detalle y después
le pone los slugs.
"""

from __future__ import annotations

from typing import Any, Iterable

from sqlalchemy import bindparam, text

from src.models.database import get_engine

_engine = get_engine()

# mlb_id → slug. Un cruce que ya salió bien no cambia nunca: un jugador no
# cambia de fecha de nacimiento. Los FALLOS no se guardan a propósito: un
# debutante no tiene ficha durante su primer juego, pero la tendrá en cuanto
# se ingeste, y cachear el "no" lo dejaría sin enlace hasta reiniciar.
_cache: dict[int, str] = {}

_SQL = text(
    "SELECT mlb_id, player_id FROM players WHERE mlb_id IN :ids"
).bindparams(bindparam("ids", expanding=True))


def slugs_por_mlb_id(ids: Iterable[int]) -> dict[int, str]:
    """Los slugs de los ids que tienen ficha. Los que no, no aparecen."""
    pedidos = {i for i in ids if i}
    faltan = [i for i in pedidos if i not in _cache]
    if faltan:
        with _engine.connect() as conn:
            for mlb_id, slug in conn.execute(_SQL, {"ids": faltan}):
                _cache[mlb_id] = slug
    return {i: _cache[i] for i in pedidos if i in _cache}


# Las cuatro listas del detalle que traen jugadores con id. El relato no:
# `plays[].batter` y `.pitcher` son solo nombres.
_LISTAS = ("batters", "pitchers", "bench", "bullpen")


def anotar_fichas(detalle: dict[str, Any]) -> dict[str, Any]:
    """
    Pone `profile_id` (el slug, o None) en cada jugador del detalle ya
    serializado. Una sola consulta para los dos equipos: un juego son unos
    cien ids, y con la caché caliente ninguna.
    """
    filas = [
        fila
        for lado in ("away", "home")
        for lista in _LISTAS
        for fila in (detalle.get(lado) or {}).get(lista, [])
    ]
    slugs = slugs_por_mlb_id(f.get("player_id") for f in filas)
    for f in filas:
        f["profile_id"] = slugs.get(f.get("player_id"))
    return detalle
