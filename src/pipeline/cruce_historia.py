"""
src/pipeline/cruce_historia.py — DIGIMETRICS contra la MLB API, donde se solapan.

De 2012-13 en adelante la liga tiene las dos fuentes: el portal oficial
(capa hist_*) y los boxscores de la MLB API (esquema de juego). Son dos
anotaciones independientes de los mismos juegos, así que deberían dar lo
mismo. Este módulo compara, temporada por temporada y equipo por equipo, los
totales de la serie regular:

    bateo    VB, H, 2B, 3B, HR, C, CI, BB, K, BR
    pitcheo  G, P, SV, outs, CL, H, BB, K

Es la prueba que CLAUDE.md dejaba pendiente ("contrastar contra el portal de
LIDOM requeriría el scraper secundario"): la validación cruzada de las dos
capas de la MLB API prueba que NUESTRA agregación es correcta, pero no que
los datos de la MLB lo sean. Esta sí compara contra otra fuente.

Por equipo y no por jugador: los ids de las dos fuentes no se conectan
(idMiembro contra el id de la MLB) y cruzar por nombre es otro problema.
Si los totales de un equipo cuadran, cada jugador cuadra salvo que dos
diferencias se cancelen, lo que es raro.

Solo la serie regular: la base de desarrollo tiene únicamente juegos 'regular'.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.engine import Engine

BATEO = {
    "at_bats": "VB", "hits": "H", "doubles": "2B", "triples": "3B", "home_runs": "HR",
    "runs": "C", "rbi": "CI", "walks": "BB", "strikeouts": "K", "stolen_bases": "BR",
}
PITCHEO = {
    "wins": "G", "losses": "P", "saves": "SV", "outs": "outs", "earned_runs": "CL",
    "hits_allowed": "H", "walks_allowed": "BB", "strikeouts": "K",
}

_SQL_HIST_BATEO = "SELECT season_id, team_code, " + ", ".join(
    f"SUM(COALESCE({c}, 0)) AS {c}" for c in BATEO
) + " FROM hist_bateo WHERE etapa = 'SR' GROUP BY season_id, team_code"

_SQL_HIST_PITCHEO = "SELECT season_id, team_code, " + ", ".join(
    f"SUM(COALESCE({c}, 0)) AS {c}" for c in PITCHEO
) + " FROM hist_pitcheo WHERE etapa = 'SR' GROUP BY season_id, team_code"

# Del esquema de juego: solo juegos finales de la serie regular. Las columnas
# se renombran a los nombres de la capa histórica para compararlas una a una.
_SQL_JUEGO_BATEO = """
    SELECT g.season_id, bl.team_code,
           SUM(bl.at_bats) AS at_bats, SUM(bl.hits) AS hits, SUM(bl.doubles) AS doubles,
           SUM(bl.triples) AS triples, SUM(bl.home_runs) AS home_runs, SUM(bl.runs) AS runs,
           SUM(bl.rbi) AS rbi, SUM(bl.walks) AS walks, SUM(bl.strikeouts) AS strikeouts,
           SUM(bl.stolen_bases) AS stolen_bases
    FROM batting_lines bl JOIN games g ON g.game_id = bl.game_id
    WHERE g.stage = 'regular' AND g.status = 'final'
    GROUP BY g.season_id, bl.team_code
"""
_SQL_JUEGO_PITCHEO = """
    SELECT g.season_id, pl.team_code,
           SUM(pl.decision = 'W') AS wins, SUM(pl.decision = 'L') AS losses,
           SUM(pl.decision = 'SV') AS saves, SUM(pl.outs_recorded) AS outs,
           SUM(pl.earned_runs) AS earned_runs, SUM(pl.hits_allowed) AS hits_allowed,
           SUM(pl.walks_allowed) AS walks_allowed, SUM(pl.strikeouts) AS strikeouts
    FROM pitching_lines pl JOIN games g ON g.game_id = pl.game_id
    WHERE g.stage = 'regular' AND g.status = 'final'
    GROUP BY g.season_id, pl.team_code
"""


def _leer(engine: Engine, sql: str) -> dict[tuple[str, str], dict[str, int]]:
    with engine.connect() as c:
        return {
            (r["season_id"], r["team_code"]): {k: int(v or 0) for k, v in r.items() if k not in ("season_id", "team_code")}
            for r in (dict(fila._mapping) for fila in c.execute(text(sql)))
        }


def cruzar(engine: Engine, season_ids: Optional[set[str]] = None) -> dict[str, Any]:
    """
    Compara las temporadas que están en LAS DOS capas (o solo `season_ids`).

    Devuelve:
        {"temporadas": {"2015-16": {"AGU": {"bateo": {"H": (hist, mlb)}, "pitcheo": {...}}, ...}},
         "equipos": N, "identicos": M}
    Dentro de cada equipo solo aparecen los campos que DIFIEREN; un equipo
    idéntico queda con los dos diccionarios vacíos.
    """
    hist = {"bateo": _leer(engine, _SQL_HIST_BATEO), "pitcheo": _leer(engine, _SQL_HIST_PITCHEO)}
    juego = {"bateo": _leer(engine, _SQL_JUEGO_BATEO), "pitcheo": _leer(engine, _SQL_JUEGO_PITCHEO)}
    etiquetas = {"bateo": BATEO, "pitcheo": PITCHEO}

    comunes = {s for s, _ in hist["bateo"]} & {s for s, _ in juego["bateo"]}
    if season_ids is not None:
        comunes &= set(season_ids)

    temporadas: dict[str, dict] = defaultdict(dict)
    equipos = identicos = 0
    for season_id in sorted(comunes):
        codigos = sorted(
            {t for s, t in hist["bateo"] if s == season_id} | {t for s, t in juego["bateo"] if s == season_id}
        )
        for team in codigos:
            fila = {}
            for tipo in ("bateo", "pitcheo"):
                h = hist[tipo].get((season_id, team), {})
                j = juego[tipo].get((season_id, team), {})
                fila[tipo] = {
                    etiquetas[tipo][c]: (h.get(c, 0), j.get(c, 0))
                    for c in etiquetas[tipo]
                    if h.get(c, 0) != j.get(c, 0)
                }
            temporadas[season_id][team] = fila
            equipos += 1
            identicos += not (fila["bateo"] or fila["pitcheo"])
    return {"temporadas": dict(temporadas), "equipos": equipos, "identicos": identicos}


def informe(resultado: dict[str, Any]) -> str:
    """El resultado de cruzar() en texto, para la consola."""
    lineas = []
    for season_id, equipos in resultado["temporadas"].items():
        difieren = {t: f for t, f in equipos.items() if f["bateo"] or f["pitcheo"]}
        if not difieren:
            lineas.append(f"{season_id}  idéntica ({len(equipos)} equipos)")
            continue
        lineas.append(f"{season_id}  {len(difieren)} de {len(equipos)} equipos difieren  (DIGIMETRICS / MLB)")
        for team, f in difieren.items():
            partes = [f"{k} {a}/{b}" for tipo in ("bateo", "pitcheo") for k, (a, b) in f[tipo].items()]
            lineas.append(f"    {team}  " + "  ".join(partes))
    lineas.append(
        f"Total: {resultado['identicos']} de {resultado['equipos']} equipo-temporadas idénticos"
    )
    return "\n".join(lineas)
