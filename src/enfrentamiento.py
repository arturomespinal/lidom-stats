"""
Un equipo contra otro: la serie de la temporada, sus juegos y quién brilló
en ellos. Lo usan la ficha de equipo ("Contra cada rival") y la página del
enfrentamiento (GET /teams/{code}/h2h/{rival}).

Funciones puras sobre filas ya leídas; la ruta hace las consultas. Las tasas
de los destacados se recomponen de los conteos sumados (`carrera.py`), como
en todas partes: nunca un promedio de promedios.
"""

from __future__ import annotations

from typing import Any, Iterable

from src.carrera import carrera_bateo, carrera_pitcheo
from src.jornada import entradas

# Cuántos destacados por equipo. Pocos: es un resumen, no la plantilla.
TOP_BATEO = 3
TOP_PITCHEO = 2


def contra_cada_rival(juegos: Iterable[dict], equipo: str, rivales: Iterable[str]) -> list[dict[str, Any]]:
    """
    El récord del equipo contra cada uno de los otros cinco en esos juegos
    (los de una temporada, ya terminados). Un rival sin juegos todavía sale
    0-0: la fila existe y dice que no se han visto.
    """
    cuenta = {r: {"team_code": r, "wins": 0, "losses": 0} for r in rivales}
    for g in juegos:
        if g["home_score"] is None or g["away_score"] is None or g["home_score"] == g["away_score"]:
            continue
        if g["home_team_code"] == equipo:
            rival, gano = g["away_team_code"], g["home_score"] > g["away_score"]
        elif g["away_team_code"] == equipo:
            rival, gano = g["home_team_code"], g["away_score"] > g["home_score"]
        else:
            continue
        if rival in cuenta:
            cuenta[rival]["wins" if gano else "losses"] += 1
    return list(cuenta.values())


def titular(nombre: str, rival: str, ganados: int, perdidos: int, temporada: str | None) -> str:
    """
    "Serie de 2026-27: Licey 4, Escogido 2." Con los dos nombres y sin
    artículos: "le gana al Escogido" pero "a las Águilas" pediría saber el
    género y el número de cada club, y un error ahí se ve.
    """
    cuando = f"de {temporada}" if temporada else "desde 2012-13"
    if ganados == perdidos:
        return f"Serie {cuando} empatada: {ganados}-{perdidos}."
    return f"Serie {cuando}: {nombre} {ganados}, {rival} {perdidos}."


def destacados_bateo(filas: list[dict], juegos: int) -> list[dict[str, Any]]:
    """
    Los bateadores de UN equipo en esos juegos, con su línea recompuesta,
    del mejor OPS al peor, entre los que fueron al bate al menos dos veces
    por juego (mínimo 5): un 2-2 no es un destacado.
    """
    minimo = max(5, 2 * juegos)
    out = []
    for f in filas:
        if (f["pa"] or 0) < minimo:
            continue
        l = carrera_bateo([f])
        out.append({
            "player_id": f["player_id"],
            "full_name": f["full_name"],
            "pa": l["pa"], "ab": l["ab"], "h": l["h"], "hr": l["hr"], "rbi": l["rbi"],
            "avg": l["avg"], "ops": l["ops"],
        })
    out.sort(key=lambda d: (-(d["ops"] or 0), -d["pa"], d["full_name"]))
    return out[:TOP_BATEO]


def destacados_pitcheo(filas: list[dict], juegos: int) -> list[dict[str, Any]]:
    """
    Los lanzadores de UN equipo en esos juegos, de la efectividad más baja a
    la más alta, entre los que sacaron al menos un out por cada juego de la
    serie... y no menos de 9 (tres entradas): un relevista de un out con 0.00
    no dice nada.
    """
    minimo = max(9, 3 * juegos)
    out = []
    for f in filas:
        if (f["outs"] or 0) < minimo:
            continue
        l = carrera_pitcheo([f])
        out.append({
            "player_id": f["player_id"],
            "full_name": f["full_name"],
            "outs": l["outs"], "ip": entradas(l["outs"]), "er": l["er"], "so": l["so"],
            "era": l["era"], "whip": l["whip"],
        })
    out.sort(key=lambda d: (d["era"] if d["era"] is not None else 99, -d["outs"], d["full_name"]))
    return out[:TOP_PITCHEO]


def _resumen_serie(nombre_visita: str, nombre_local: str, gv: int, gl: int) -> str:
    """
    La serie de la temporada en una línea corta, para las tarjetas de un
    juego: "Serie: Águilas 2, Licey 1", "Serie empatada 1-1" o "Primer duelo
    de la temporada". Va primero el que la lleva; la temporada no se repite
    porque la portada ya la dice.
    """
    if gv + gl == 0:
        return "Primer duelo de la temporada"
    if gv == gl:
        return f"Serie empatada {gv}-{gl}"
    if gv > gl:
        return f"Serie: {nombre_visita} {gv}, {nombre_local} {gl}"
    return f"Serie: {nombre_local} {gl}, {nombre_visita} {gv}"


def anotar_series(juegos: list[dict], finales: Iterable[dict]) -> None:
    """
    Añade a cada juego (la forma de `armar_juego`) la serie de la temporada
    entre sus dos equipos (`series`) y el récord de cada uno (`record` en
    `away` y `home`), con los juegos terminados de `finales`: los de la base
    hasta la fecha de la jornada. Lo usan la portada Hoy y la página de un
    juego.

    Un juego de la lista que ya terminó cuenta aunque la base todavía no lo
    tenga (la caché en vivo lo dio por final antes de ingestarlo): la serie
    y el récord de un juego terminado lo incluyen.
    """
    por_id = {f["game_id"]: f for f in finales}
    for j in juegos:
        if (j["status"] == "final" and j["game_id"] not in por_id
                and j["away"]["runs"] is not None and j["home"]["runs"] is not None):
            por_id[j["game_id"]] = {
                "game_id": j["game_id"], "season_id": j["season_id"],
                "away_team_code": j["away"]["code"], "home_team_code": j["home"]["code"],
                "away_score": j["away"]["runs"], "home_score": j["home"]["runs"],
            }
    por_temporada: dict[Any, list[dict]] = {}
    for f in por_id.values():
        por_temporada.setdefault(f["season_id"], []).append(f)

    for j in juegos:
        del_ano = por_temporada.get(j["season_id"], [])
        v, l = j["away"]["code"], j["home"]["code"]
        serie = contra_cada_rival(del_ano, v, [l])[0]
        gv, gl = serie["wins"], serie["losses"]
        j["series"] = {
            "away_wins": gv,
            "home_wins": gl,
            "label": _resumen_serie(j["away"]["short_name"], j["home"]["short_name"], gv, gl),
        }
        for lado in ("away", "home"):
            j[lado]["record"] = _record(del_ano, j[lado]["code"])


def _record(juegos: Iterable[dict], equipo: str) -> dict[str, int]:
    """Ganados y perdidos de un equipo en esos juegos (un empate no cuenta)."""
    g = p = 0
    for f in juegos:
        if f["home_score"] is None or f["away_score"] is None or f["home_score"] == f["away_score"]:
            continue
        if equipo == f["home_team_code"]:
            gano = f["home_score"] > f["away_score"]
        elif equipo == f["away_team_code"]:
            gano = f["away_score"] > f["home_score"]
        else:
            continue
        g, p = (g + 1, p) if gano else (g, p + 1)
    return {"wins": g, "losses": p}
