"""
src/historia.py — La historia completa: DIGIMETRICS antes de 2012-13, la MLB API después.

Tres piezas:

1. `enlazar()`: conecta cada miembro de DIGIMETRICS con su jugador de la MLB
   API. Las dos fuentes se solapan de 2012-13 a 2019-20; ahí un mismo hombre
   aparece en el mismo equipo y la misma temporada en las dos, con números
   casi iguales (se anotan por separado: ver src/pipeline/cruce_historia.py).
2. `temporadas_historicas()`: las temporadas de un jugador en DIGIMETRICS, con
   la misma forma que las filas de v_batting_season / v_pitching_season, para
   que la ficha y src/carrera.py las traten igual.
3. `lideres()`: los líderes de todos los tiempos, sumando las dos fuentes.

La regla que lo ordena todo: **cada temporada sale de UNA sola fuente**. Antes
de 2012-13, DIGIMETRICS (la única que hay). Desde 2012-13, la MLB API (la que
se audita juego por juego). Las temporadas 2012-2019 de DIGIMETRICS solo
sirven para enlazar y para el cruce; sumarlas contaría esos años dos veces.

Y solo serie regular, que es como se cuentan los récords de carrera.
"""

from __future__ import annotations

import difflib
import re
import time
import unicodedata
from collections import defaultdict
from typing import Any, Iterable

from sqlalchemy import text
from sqlalchemy.engine import Connection, Engine

from src.models.hist_models import etiqueta_historica

# Primera temporada que sale de la MLB API. Antes de esta, DIGIMETRICS.
ANIO_CORTE = 2012

# Mínimos de carrera para las tasas. En LIDOM una temporada completa son unas
# 200 apariciones al plato para un regular y unas 60 entradas para un
# abridor, así que son ~7 temporadas completas. Con estos cortes califican 52
# bateadores y 34 lanzadores solo con los años de DIGIMETRICS (30-sep-2026).
MIN_PA_CARRERA = 1500
MIN_OUTS_CARRERA = 400 * 3


# ─── Nombres ─────────────────────────────────────────────────────────────────

def normalizar_nombre(nombre: str) -> str:
    """"José A. Váldez Jr." → "jose a valdez". Para comparar, no para mostrar."""
    s = unicodedata.normalize("NFKD", nombre).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z ]", " ", s)
    s = re.sub(r"\b(jr|sr|ii|iii)\b", " ", s)
    return " ".join(s.split())


def nombre_para_mostrar(nombre: str) -> str:
    """
    DIGIMETRICS escribe los años viejos en mayúsculas ("TONY PEÑA"). Esos se
    pasan a tipo título; los que ya vienen en mayúsculas y minúsculas se
    respetan tal cual ("Juan Francisco").
    """
    nombre = " ".join(nombre.split())
    if nombre != nombre.upper():
        return nombre
    return nombre.title()


def _apellido_parecido(a: str, b: str) -> bool:
    ua, ub = normalizar_nombre(a).split()[-1:], normalizar_nombre(b).split()[-1:]
    if not ua or not ub:
        return False
    return ua == ub or difflib.SequenceMatcher(None, ua[0], ub[0]).ratio() >= 0.8


def _parecido(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, normalizar_nombre(a), normalizar_nombre(b)).ratio()


# ─── 1. El enlace ────────────────────────────────────────────────────────────

# Tolerancias de la segunda pasada: las dos fuentes difieren en 5 como mucho
# por total de equipo en los años sanos (ver el cruce), mucho menos por
# jugador.
_TOL_AB, _TOL_H, _TOL_OUTS = 5, 3, 6


def _numeros_hist(conn: Connection) -> dict[tuple[int, str, str], list[int]]:
    """(id_miembro, season_id, team_code) → [AB, H, outs], regular desde 2012."""
    num: dict = defaultdict(lambda: [0, 0, 0])
    for i, s, t, ab, h in conn.execute(text(
        "SELECT id_miembro, season_id, team_code, SUM(COALESCE(at_bats,0)), SUM(COALESCE(hits,0)) "
        "FROM hist_bateo WHERE etapa = 'SR' AND temporada >= :c GROUP BY 1, 2, 3"), {"c": ANIO_CORTE}):
        num[(i, s, t)][0] += ab
        num[(i, s, t)][1] += h
    for i, s, t, outs in conn.execute(text(
        "SELECT id_miembro, season_id, team_code, SUM(COALESCE(outs,0)) "
        "FROM hist_pitcheo WHERE etapa = 'SR' AND temporada >= :c GROUP BY 1, 2, 3"), {"c": ANIO_CORTE}):
        num[(i, s, t)][2] += outs
    return num


def _numeros_mlb(conn: Connection) -> dict[tuple[str, str, str], list[int]]:
    """(player_id, season_id, team_code) → [AB, H, outs], regular, juegos finales."""
    num: dict = defaultdict(lambda: [0, 0, 0])
    for p, s, t, ab, h in conn.execute(text(
        "SELECT bl.player_id, g.season_id, bl.team_code, SUM(bl.at_bats), SUM(bl.hits) "
        "FROM batting_lines bl JOIN games g ON g.game_id = bl.game_id "
        "WHERE g.stage = 'regular' AND g.status = 'final' GROUP BY 1, 2, 3")):
        num[(p, s, t)][0] += ab or 0
        num[(p, s, t)][1] += h or 0
    for p, s, t, outs in conn.execute(text(
        "SELECT pl.player_id, g.season_id, pl.team_code, SUM(pl.outs_recorded) "
        "FROM pitching_lines pl JOIN games g ON g.game_id = pl.game_id "
        "WHERE g.stage = 'regular' AND g.status = 'final' GROUP BY 1, 2, 3")):
        num[(p, s, t)][2] += outs or 0
    return num


def calcular_enlaces(conn: Connection) -> dict[int, tuple[str, str, int]]:
    """
    id_miembro → (player_id, método, coincidencias). Sin escribir nada.

    Pasada 1, "nombre": el nombre normalizado es igual y está en el mismo
    equipo y temporada. Si sale más de un candidato (dos Luis De La Cruz), no
    se decide aquí.

    Pasada 2, "numeros", para los que quedaron: en el mismo equipo y
    temporada, un jugador de apellido parecido cuyos números esa temporada
    coinciden (±5 VB, ±3 H, ±6 outs). Para no enlazar por casualidad dos
    suplentes con 3 turnos, hace falta volumen (10 entre VB y outs) o un
    nombre bastante parecido. Y el candidato tiene que ser único.
    """
    hist = _numeros_hist(conn)
    mlb = _numeros_mlb(conn)
    nombres_h = dict(conn.execute(text("SELECT id_miembro, nombre FROM hist_jugadores")).all())
    nombres_m = dict(conn.execute(text("SELECT player_id, full_name FROM players")).all())

    por_miembro: dict[int, set[tuple[str, str]]] = defaultdict(set)
    for i, s, t in hist:
        por_miembro[i].add((s, t))
    plantilla: dict[tuple[str, str], set[str]] = defaultdict(set)
    por_nombre: dict[tuple[str, str, str], set[str]] = defaultdict(set)
    for p, s, t in mlb:
        plantilla[(s, t)].add(p)
        por_nombre[(normalizar_nombre(nombres_m.get(p, "")), s, t)].add(p)

    enlaces: dict[int, tuple[str, str, int]] = {}
    usados: dict[tuple[str, str], set[str]] = defaultdict(set)  # (s, t) → player_ids ya enlazados

    for i, st in por_miembro.items():
        n = normalizar_nombre(nombres_h.get(i, ""))
        candidatos: dict[str, int] = defaultdict(int)
        for s, t in st:
            for p in por_nombre.get((n, s, t), ()):
                candidatos[p] += 1
        if len(candidatos) == 1:
            p, veces = next(iter(candidatos.items()))
            enlaces[i] = (p, "nombre", veces)
            for s, t in st:
                if p in plantilla[(s, t)]:
                    usados[(s, t)].add(p)

    for i, st in por_miembro.items():
        if i in enlaces:
            continue
        nombre = nombres_h.get(i, "")
        candidatos = defaultdict(int)
        for s, t in st:
            h = hist[(i, s, t)]
            for p in plantilla[(s, t)] - usados[(s, t)]:
                m = mlb[(p, s, t)]
                if not _apellido_parecido(nombre, nombres_m.get(p, "")):
                    continue
                if abs(h[0] - m[0]) > _TOL_AB or abs(h[1] - m[1]) > _TOL_H or abs(h[2] - m[2]) > _TOL_OUTS:
                    continue
                volumen = max(h[0], m[0]) + max(h[2], m[2])
                if volumen < 10 and _parecido(nombre, nombres_m.get(p, "")) < 0.75:
                    continue
                candidatos[p] += 1
        if len(candidatos) == 1:
            p, veces = next(iter(candidatos.items()))
            enlaces[i] = (p, "numeros", veces)
    return enlaces


def enlazar(engine: Engine) -> dict[str, Any]:
    """Reconstruye hist_enlaces. Devuelve cuántos se enlazaron y cuántos no."""
    with engine.begin() as conn:
        enlaces = calcular_enlaces(conn)
        conn.execute(text("DELETE FROM hist_enlaces"))
        if enlaces:
            conn.execute(
                text("INSERT INTO hist_enlaces (id_miembro, player_id, metodo, coincidencias) "
                     "VALUES (:i, :p, :m, :c)"),
                [{"i": i, "p": p, "m": m, "c": c} for i, (p, m, c) in enlaces.items()],
            )
        candidatos = conn.execute(text(
            "SELECT COUNT(DISTINCT id_miembro) FROM ("
            " SELECT id_miembro FROM hist_bateo WHERE etapa='SR' AND temporada >= :c"
            " UNION SELECT id_miembro FROM hist_pitcheo WHERE etapa='SR' AND temporada >= :c)"),
            {"c": ANIO_CORTE}).scalar()
    por_metodo: dict[str, int] = defaultdict(int)
    for _, m, _ in enlaces.values():
        por_metodo[m] += 1
    return {
        "enlazables": candidatos,
        "enlazados": len(enlaces),
        "por_metodo": dict(por_metodo),
        "sin_enlace": candidatos - len(enlaces),
    }


# ─── 2. Las temporadas de DIGIMETRICS con la forma de las vistas ─────────────

_ETAPAS = {"SR": "regular", "RR": "round_robin", "SF": "final"}


def _fila_bateo(r: dict) -> dict[str, Any]:
    """Una fila de hist_bateo con los nombres y las tasas de v_batting_season."""
    ab, h = r["at_bats"] or 0, r["hits"] or 0
    d, t, hr = r["doubles"] or 0, r["triples"] or 0, r["home_runs"] or 0
    bb, hbp, sf, sh = r["walks"] or 0, r["hit_by_pitch"] or 0, r["sacrifice_flies"] or 0, r["sacrifice_bunts"] or 0
    bases = (h - d - t - hr) + 2 * d + 3 * t + 4 * hr
    opps = ab + bb + hbp + sf
    avg = round(h / ab, 3) if ab else 0
    obp = round((h + bb + hbp) / opps, 3) if opps else 0
    slg = round(bases / ab, 3) if ab else 0
    pa = ab + bb + hbp + sf + sh
    return {
        "season_id": r["season_id"], "team_code": r["team_code"], "team_name": r.get("nombre_equipo"),
        "stage": _ETAPAS.get(r["etapa"], r["etapa"]),
        # La fuente no separa juegos al bate de apariciones sin turno: se usa
        # el mismo número para los dos.
        "games": r["games"] or 0, "games_batted": (r["games"] or 0) if pa else 0,
        "pa": pa, "ab": ab, "h": h, "doubles": d, "triples": t, "hr": hr,
        "r": r["runs"] or 0, "rbi": r["rbi"] or 0, "bb": bb, "so": r["strikeouts"] or 0,
        "sb": r["stolen_bases"] or 0, "hbp": hbp, "sf": sf,
        "avg": avg, "obp": obp, "slg": slg, "ops": round(obp + slg, 3),
        "source": "digimetrics",
    }


def _fila_pitcheo(r: dict) -> dict[str, Any]:
    outs = r["outs"] or 0
    er, h, bb = r["earned_runs"] or 0, r["hits_allowed"] or 0, r["walks_allowed"] or 0
    return {
        "season_id": r["season_id"], "team_code": r["team_code"], "team_name": r.get("nombre_equipo"),
        "stage": _ETAPAS.get(r["etapa"], r["etapa"]),
        "games": r["games"] or 0, "games_started": r["games_started"] or 0,
        "wins": r["wins"] or 0, "losses": r["losses"] or 0, "saves": r["saves"] or 0,
        "complete_games": r["complete_games"] or 0, "shutouts": r["shutouts"] or 0,
        "innings_pitched": round(outs / 3.0, 1), "outs": outs,
        "h": h, "er": er, "so": r["strikeouts"] or 0, "bb": bb,
        "era": round(er * 27 / outs, 2) if outs else None,
        "whip": round((bb + h) * 3 / outs, 2) if outs else None,
        "source": "digimetrics",
    }


def temporadas_historicas(
    conn: Connection, id_miembros: Iterable[int], solo_regular: bool = True, antes_del_corte: bool = True
) -> dict[str, list[dict]]:
    """
    Las temporadas de uno o varios idMiembro (una misma persona puede tener
    dos), de la más reciente a la más vieja.

    Por defecto solo serie regular y solo antes de 2012-13, que es lo que se
    suma a la carrera de la MLB API sin contar nada dos veces.
    """
    ids = sorted(set(id_miembros))
    if not ids:
        return {"batting": [], "pitching": []}
    marcas = ", ".join(f":i{n}" for n in range(len(ids)))
    params: dict[str, Any] = {f"i{n}": v for n, v in enumerate(ids)}
    filtro = f"x.id_miembro IN ({marcas})"
    if solo_regular:
        filtro += " AND x.etapa = 'SR'"
    if antes_del_corte:
        filtro += " AND x.temporada < :corte"
        params["corte"] = ANIO_CORTE
    orden = "ORDER BY x.temporada DESC, CASE x.etapa WHEN 'SR' THEN 0 WHEN 'RR' THEN 1 ELSE 2 END, x.team_code"
    unir = ("LEFT JOIN hist_equipos_temporada e ON e.temporada = x.temporada AND e.id_equipo = x.id_equipo")
    bateo = [dict(r._mapping) for r in conn.execute(text(
        f"SELECT x.*, e.nombre AS nombre_equipo FROM hist_bateo x {unir} WHERE {filtro} {orden}"), params)]
    pitcheo = [dict(r._mapping) for r in conn.execute(text(
        f"SELECT x.*, e.nombre AS nombre_equipo FROM hist_pitcheo x {unir} WHERE {filtro} {orden}"), params)]
    return {"batting": [_fila_bateo(r) for r in bateo], "pitching": [_fila_pitcheo(r) for r in pitcheo]}


def miembros_de(conn: Connection, player_id: str) -> list[int]:
    """Los idMiembro enlazados a un jugador de la MLB API."""
    return [i for (i,) in conn.execute(
        text("SELECT id_miembro FROM hist_enlaces WHERE player_id = :p ORDER BY id_miembro"), {"p": player_id})]


def es_lanzador_historico(bateo: list[dict], pitcheo: list[dict]) -> bool:
    """
    Como src/carrera.es_lanzador, pero para los años viejos: antes del
    bateador designado los lanzadores bateaban en casi todos sus juegos, así
    que comparar juegos lanzando contra juegos bateando da un empate. Aquí
    basta con que lance en al menos la mitad de los juegos en que batea.
    """
    lanzando = sum(t.get("games") or 0 for t in pitcheo)
    bateando = sum(t.get("games_batted") or 0 for t in bateo)
    return lanzando > 0 and lanzando * 2 >= bateando


# ─── 3. Líderes de todos los tiempos ─────────────────────────────────────────

# stat → (etiqueta, mayor es mejor, es tasa)
CATEGORIAS_BATEO: dict[str, tuple[str, bool, bool]] = {
    "h": ("Hits", True, False),
    "hr": ("Jonrones", True, False),
    "rbi": ("Carreras impulsadas", True, False),
    "r": ("Carreras anotadas", True, False),
    "doubles": ("Dobles", True, False),
    "triples": ("Triples", True, False),
    "sb": ("Bases robadas", True, False),
    "bb": ("Boletos", True, False),
    "games": ("Juegos", True, False),
    "avg": ("Promedio", True, True),
    "obp": ("Porcentaje de embasarse", True, True),
    "slg": ("Slugging", True, True),
    "ops": ("OPS", True, True),
}
CATEGORIAS_PITCHEO: dict[str, tuple[str, bool, bool]] = {
    "wins": ("Victorias", True, False),
    "saves": ("Salvados", True, False),
    "so": ("Ponches", True, False),
    "outs": ("Entradas lanzadas", True, False),
    "games": ("Juegos", True, False),
    "games_started": ("Aperturas", True, False),
    "era": ("Efectividad", False, True),
    "whip": ("WHIP", False, True),
}

# Totales por persona. Una "persona" es un player_id de la MLB API (con sus
# idMiembro enlazados) o, si no tiene enlace, un idMiembro suelto ("m123").
_SQL_HIST_BATEO = """
    SELECT COALESCE(e.player_id, 'm' || b.id_miembro) AS persona, b.id_miembro,
           b.temporada, b.team_code,
           SUM(COALESCE(b.games,0)) AS games, SUM(COALESCE(b.at_bats,0)) AS ab,
           SUM(COALESCE(b.hits,0)) AS h, SUM(COALESCE(b.doubles,0)) AS doubles,
           SUM(COALESCE(b.triples,0)) AS triples, SUM(COALESCE(b.home_runs,0)) AS hr,
           SUM(COALESCE(b.runs,0)) AS r, SUM(COALESCE(b.rbi,0)) AS rbi,
           SUM(COALESCE(b.walks,0)) AS bb, SUM(COALESCE(b.strikeouts,0)) AS so,
           SUM(COALESCE(b.stolen_bases,0)) AS sb, SUM(COALESCE(b.hit_by_pitch,0)) AS hbp,
           SUM(COALESCE(b.sacrifice_flies,0)) AS sf, SUM(COALESCE(b.sacrifice_bunts,0)) AS sh
    FROM hist_bateo b LEFT JOIN hist_enlaces e ON e.id_miembro = b.id_miembro
    WHERE b.etapa = 'SR' AND b.temporada < :corte
    GROUP BY 1, 2, 3, 4
"""
_SQL_MLB_BATEO = """
    SELECT bl.player_id AS persona, g.season_id, bl.team_code,
           COUNT(DISTINCT bl.game_id) AS games, SUM(bl.at_bats) AS ab, SUM(bl.hits) AS h,
           SUM(bl.doubles) AS doubles, SUM(bl.triples) AS triples, SUM(bl.home_runs) AS hr,
           SUM(bl.runs) AS r, SUM(bl.rbi) AS rbi, SUM(bl.walks) AS bb, SUM(bl.strikeouts) AS so,
           SUM(bl.stolen_bases) AS sb, SUM(bl.hit_by_pitch) AS hbp, SUM(bl.sacrifice_flies) AS sf,
           SUM(bl.plate_appearances) AS pa
    FROM batting_lines bl JOIN games g ON g.game_id = bl.game_id
    WHERE g.stage = 'regular' AND g.status = 'final'
    GROUP BY 1, 2, 3
"""
_SQL_HIST_PITCHEO = """
    SELECT COALESCE(e.player_id, 'm' || p.id_miembro) AS persona, p.id_miembro,
           p.temporada, p.team_code,
           SUM(COALESCE(p.games,0)) AS games, SUM(COALESCE(p.games_started,0)) AS games_started,
           SUM(COALESCE(p.wins,0)) AS wins, SUM(COALESCE(p.losses,0)) AS losses,
           SUM(COALESCE(p.saves,0)) AS saves, SUM(COALESCE(p.outs,0)) AS outs,
           SUM(COALESCE(p.hits_allowed,0)) AS h, SUM(COALESCE(p.earned_runs,0)) AS er,
           SUM(COALESCE(p.walks_allowed,0)) AS bb, SUM(COALESCE(p.strikeouts,0)) AS so
    FROM hist_pitcheo p LEFT JOIN hist_enlaces e ON e.id_miembro = p.id_miembro
    WHERE p.etapa = 'SR' AND p.temporada < :corte
    GROUP BY 1, 2, 3, 4
"""
_SQL_MLB_PITCHEO = """
    SELECT pl.player_id AS persona, g.season_id, pl.team_code,
           COUNT(DISTINCT pl.game_id) AS games,
           SUM(CASE WHEN pl.is_starter THEN 1 ELSE 0 END) AS games_started,
           SUM(pl.decision = 'W') AS wins, SUM(pl.decision = 'L') AS losses,
           SUM(pl.decision = 'SV') AS saves, SUM(pl.outs_recorded) AS outs,
           SUM(pl.hits_allowed) AS h, SUM(pl.earned_runs) AS er,
           SUM(pl.walks_allowed) AS bb, SUM(pl.strikeouts) AS so
    FROM pitching_lines pl JOIN games g ON g.game_id = pl.game_id
    WHERE g.stage = 'regular' AND g.status = 'final'
    GROUP BY 1, 2, 3
"""

_CONTEOS = {
    "bateo": ("games", "ab", "h", "doubles", "triples", "hr", "r", "rbi", "bb", "so", "sb", "hbp", "sf", "pa"),
    "pitcheo": ("games", "games_started", "wins", "losses", "saves", "outs", "h", "er", "bb", "so"),
}


def carreras(conn: Connection, grupo: str) -> dict[str, dict[str, Any]]:
    """
    Totales de carrera de TODAS las personas, en serie regular: DIGIMETRICS
    antes de 2012-13 y la MLB API desde entonces. `grupo`: "bateo" o "pitcheo".
    """
    if grupo not in _CONTEOS:
        raise ValueError(grupo)
    sql_h, sql_m = (_SQL_HIST_BATEO, _SQL_MLB_BATEO) if grupo == "bateo" else (_SQL_HIST_PITCHEO, _SQL_MLB_PITCHEO)
    total: dict[str, dict[str, Any]] = {}

    def acumular(persona: str, fila: dict, season_id: str, team: str, miembro: int | None) -> None:
        t = total.setdefault(persona, {k: 0 for k in _CONTEOS[grupo]} | {
            "_temporadas": set(), "_equipos": set(), "_miembros": set()})
        for k in _CONTEOS[grupo]:
            t[k] += fila.get(k) or 0
        t["_temporadas"].add(season_id)
        t["_equipos"].add(team)
        if miembro is not None:
            t["_miembros"].add(miembro)

    for r in conn.execute(text(sql_h), {"corte": ANIO_CORTE}):
        f = dict(r._mapping)
        if grupo == "bateo":
            f["pa"] = f["ab"] + f["bb"] + f["hbp"] + f["sf"] + f["sh"]
        acumular(f["persona"], f, etiqueta_historica(f["temporada"]), f["team_code"], f["id_miembro"])
    for r in conn.execute(text(sql_m)):
        f = dict(r._mapping)
        acumular(f["persona"], f, f["season_id"], f["team_code"], None)

    for t in total.values():
        if grupo == "bateo":
            ab = t["ab"]
            bases = (t["h"] - t["doubles"] - t["triples"] - t["hr"]) + 2 * t["doubles"] + 3 * t["triples"] + 4 * t["hr"]
            opps = ab + t["bb"] + t["hbp"] + t["sf"]
            t["avg"] = round(t["h"] / ab, 3) if ab else None
            t["obp"] = round((t["h"] + t["bb"] + t["hbp"]) / opps, 3) if opps else None
            t["slg"] = round(bases / ab, 3) if ab else None
            t["ops"] = round(t["obp"] + t["slg"], 3) if t["obp"] is not None and t["slg"] is not None else None
            t["califica"] = t["pa"] >= MIN_PA_CARRERA
        else:
            outs = t["outs"]
            t["innings_pitched"] = round(outs / 3.0, 1)
            t["era"] = round(t["er"] * 27 / outs, 2) if outs else None
            t["whip"] = round((t["bb"] + t["h"]) * 3 / outs, 2) if outs else None
            t["califica"] = outs >= MIN_OUTS_CARRERA
    return total


def _nombres(conn: Connection, personas: list[str]) -> dict[str, str]:
    mlb = [p for p in personas if not p.startswith("m")]
    hist = [int(p[1:]) for p in personas if p.startswith("m")]
    nombres: dict[str, str] = {}
    for grupo, sql, clave in (
        (mlb, "SELECT player_id, full_name FROM players WHERE player_id IN ({})", lambda k: k),
        (hist, "SELECT id_miembro, nombre FROM hist_jugadores WHERE id_miembro IN ({})", lambda k: f"m{k}"),
    ):
        if not grupo:
            continue
        marcas = ", ".join(f":x{n}" for n in range(len(grupo)))
        for k, n in conn.execute(text(sql.format(marcas)), {f"x{n}": v for n, v in enumerate(grupo)}):
            nombres[clave(k)] = nombre_para_mostrar(n)
    return nombres


def lideres(conn: Connection, grupo: str, stat: str, limite: int = 25) -> dict[str, Any]:
    """Los `limite` primeros de todos los tiempos en `stat`."""
    categorias = CATEGORIAS_BATEO if grupo == "bateo" else CATEGORIAS_PITCHEO
    if stat not in categorias:
        raise ValueError(f"{stat!r} no es una categoría de {grupo}")
    etiqueta, mayor_mejor, es_tasa = categorias[stat]
    todos = carreras(conn, grupo)
    candidatos = [(p, t) for p, t in todos.items() if t.get(stat) is not None and (t["califica"] or not es_tasa)]
    candidatos = [(p, t) for p, t in candidatos if es_tasa or t[stat] > 0]
    # Empates: gana el de más volumen (más turnos o más outs), y luego el
    # nombre, para que el orden no dependa del azar de SQLite.
    volumen = "pa" if grupo == "bateo" else "outs"
    candidatos.sort(key=lambda pt: ((-pt[1][stat] if mayor_mejor else pt[1][stat]), -pt[1][volumen], pt[0]))
    primeros = candidatos[:limite]
    nombres = _nombres(conn, [p for p, _ in primeros])

    data, puesto, previo = [], 0, object()
    for n, (p, t) in enumerate(primeros, start=1):
        if t[stat] != previo:
            puesto, previo = n, t[stat]
        temporadas = sorted(t["_temporadas"])
        data.append({
            "rank": puesto,
            "name": nombres.get(p, p),
            "player_id": None if p.startswith("m") else p,
            "id_miembro": int(p[1:]) if p.startswith("m") else (min(t["_miembros"]) if t["_miembros"] else None),
            "value": t[stat],
            "seasons": len(temporadas),
            "first_season": temporadas[0],
            "last_season": temporadas[-1],
            "teams": sorted(t["_equipos"]),
            volumen: t[volumen],
        })
    return {
        "group": grupo,
        "stat": stat,
        "label": etiqueta,
        "is_rate": es_tasa,
        "minimum": (f"{MIN_PA_CARRERA} apariciones al plato" if grupo == "bateo" else f"{MIN_OUTS_CARRERA // 3} entradas")
        if es_tasa else None,
        "count": len(data),
        "data": data,
    }


class CacheCarreras:
    """
    `carreras()` recorre todas las líneas de las dos fuentes: ~0,5 s. Los
    líderes cambian solo cuando entra un juego nuevo, así que se guardan unos
    minutos en memoria. Por proceso, como la caché en vivo.
    """

    def __init__(self, segundos: float = 600):
        self.segundos = segundos
        self._guardado: dict[tuple, tuple[float, Any]] = {}

    def lideres(self, engine: Engine, grupo: str, stat: str, limite: int) -> dict[str, Any]:
        clave = (grupo, stat, limite)
        ahora = time.monotonic()
        guardado = self._guardado.get(clave)
        if guardado and ahora - guardado[0] < self.segundos:
            return guardado[1]
        with engine.connect() as conn:
            valor = lideres(conn, grupo, stat, limite)
        self._guardado[clave] = (ahora, valor)
        return valor
