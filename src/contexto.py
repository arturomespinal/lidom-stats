"""
El jugador contra la liga: puesto entre los calificados, curva de la carrera y
los titulares que las acompañan.

Todo se calcula aquí, en el servidor, por la misma razón que `carrera.py` y
`titular_recorrido()`: son dos clientes, y un criterio implementado dos veces
es un criterio que un día diverge. Los clientes dibujan; no deciden quién es
tercero ni escriben la frase.

Funciones puras sobre filas ya leídas de las vistas. La ruta hace las
consultas; esto se prueba con cualquier lista de diccionarios.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Callable, Iterable

from src.carrera import edad

# ─────────────────────────────────────────────────────────────────────────────
# Agregar por jugador y temporada
# ─────────────────────────────────────────────────────────────────────────────

_CONTEO_BATEO = ("pa", "ab", "h", "doubles", "triples", "hr", "rbi", "bb", "so", "sb", "hbp", "sf")
_CONTEO_PITCHEO = ("outs", "h", "er", "so", "bb", "wins", "losses", "saves", "games", "games_started")


def _div(a: float, b: float) -> float | None:
    return a / b if b else None


def agregar_bateo(filas: Iterable[dict]) -> dict[tuple[str, str], dict]:
    """
    Una fila por (jugador, temporada), sumando los equipos.

    Un jugador cambiado a mitad de temporada tiene dos filas en la vista, una
    por equipo. Para calificar y para compararlo con la liga cuenta la
    temporada ENTERA: 90 AP con un club y 80 con otro son 170, y lo dejan
    dentro. Las tasas se recomponen de los conteos sumados, nunca se promedian.
    """
    out: dict[tuple[str, str], dict] = {}
    for f in filas:
        k = (f["player_id"], f["season_id"])
        acc = out.setdefault(k, {"player_id": k[0], "season_id": k[1], **{c: 0 for c in _CONTEO_BATEO}})
        for c in _CONTEO_BATEO:
            acc[c] += f.get(c) or 0
    for a in out.values():
        tb = a["h"] + a["doubles"] + 2 * a["triples"] + 3 * a["hr"]
        a["avg"] = _div(a["h"], a["ab"])
        a["obp"] = _div(a["h"] + a["bb"] + a["hbp"], a["ab"] + a["bb"] + a["hbp"] + a["sf"])
        a["slg"] = _div(tb, a["ab"])
        a["ops"] = None if a["obp"] is None or a["slg"] is None else a["obp"] + a["slg"]
        a["iso"] = None if a["slg"] is None or a["avg"] is None else a["slg"] - a["avg"]
        a["bb_pct"] = _div(a["bb"], a["pa"])
        a["so_pct"] = _div(a["so"], a["pa"])
    return out


def agregar_pitcheo(filas: Iterable[dict]) -> dict[tuple[str, str], dict]:
    """Lo mismo para lanzadores. Las tasas salen de los OUTS, no de IP redondeadas."""
    out: dict[tuple[str, str], dict] = {}
    for f in filas:
        k = (f["player_id"], f["season_id"])
        acc = out.setdefault(k, {"player_id": k[0], "season_id": k[1], **{c: 0 for c in _CONTEO_PITCHEO}})
        for c in _CONTEO_PITCHEO:
            acc[c] += f.get(c) or 0
    for a in out.values():
        o = a["outs"]
        a["era"] = _div(a["er"] * 27, o)
        a["whip"] = _div((a["h"] + a["bb"]) * 3, o)
        a["k9"] = _div(a["so"] * 27, o)
        a["bb9"] = _div(a["bb"] * 27, o)
        a["innings_pitched"] = round(o / 3, 1) if o else 0.0
    return out


# ─────────────────────────────────────────────────────────────────────────────
# Puesto contra la liga
# ─────────────────────────────────────────────────────────────────────────────

# (campo, etiqueta, mayor_es_mejor, formato). El orden es FIJO, no por fuerza
# del jugador: la lista muestra también dónde flojea, y cambiarla de orden
# según el jugador escondería eso. `formato` le dice al cliente cómo pintar el
# valor; el número viaja crudo.
CATEGORIAS_BATEO = [
    ("ops", "OPS", True, "rate3"),
    ("avg", "Promedio", True, "rate3"),
    ("obp", "Embasado", True, "rate3"),
    ("slg", "Slugging", True, "rate3"),
    ("iso", "Poder aislado", True, "rate3"),
    ("hr", "Jonrones", True, "int"),
    ("bb_pct", "Boletos", True, "pct1"),
    ("so_pct", "Ponches", False, "pct1"),
]
CATEGORIAS_PITCHEO = [
    ("era", "Efectividad", False, "dec2"),
    ("whip", "WHIP", False, "dec2"),
    ("k9", "Ponches por 9", True, "dec2"),
    ("bb9", "Boletos por 9", False, "dec2"),
    ("innings_pitched", "Entradas", True, "ip"),
    ("so", "Ponches", True, "int"),
]

# Precisión con la que se compara: la que se muestra. Dos jugadores que en
# pantalla tienen .873 comparten puesto aunque en el decimal 12 no coincidan.
_PRECISION = {"rate3": 3, "pct1": 3, "dec2": 2, "int": 0, "ip": 1}


def _puesto(valor: float, todos: list[float], mayor: bool) -> int:
    """Puesto con empates compartidos: 1, 2, 2, 4. Uno más los estrictamente mejores."""
    mejores = sum(1 for v in todos if (v > valor if mayor else v < valor))
    return 1 + mejores


def puesto_en_la_liga(
    jugador: dict,
    calificados: list[dict],
    categorias: list[tuple[str, str, bool, str]],
) -> list[dict]:
    """Una entrada por categoría con el valor del jugador y su puesto."""
    salida = []
    for campo, etiqueta, mayor, formato in categorias:
        p = _PRECISION[formato]
        valor = jugador.get(campo)
        if valor is None:
            continue
        todos = [round(f[campo], p) for f in calificados if f.get(campo) is not None]
        salida.append({
            "stat": campo,
            "label": etiqueta,
            "value": valor,
            "format": formato,
            "higher_is_better": mayor,
            "rank": _puesto(round(valor, p), todos, mayor),
        })
    return salida


_ORDINAL_M = {1: "El mejor", 2: "Segundo mejor", 3: "Tercer mejor", 4: "Cuarto mejor", 5: "Quinto mejor"}
_ORDINAL_F = {1: "La mejor", 2: "Segunda mejor", 3: "Tercera mejor", 4: "Cuarta mejor", 5: "Quinta mejor"}


def edad_en_temporada(fecha_nacimiento: str | None, season_id: str) -> int | None:
    """
    Años cumplidos al cierre de la temporada (31 de enero del segundo año).

    No la edad de hoy: el titular habla de ESA temporada, y un jugador que
    cumplió 35 en agosto no tenía 35 cuando bateó en diciembre.
    """
    return edad(fecha_nacimiento, hoy=date(int(season_id[:4]) + 1, 1, 31))


def titular_puesto(
    items: list[dict], rol: str, edad_temporada: int | None, temporada: str | None = None
) -> str | None:
    """
    "Tercer mejor OPS de la liga, a los 38."

    Solo sobre la tasa principal (OPS o efectividad) y solo si está entre los
    cinco primeros: un titular que presume un 9º puesto no dice nada. La edad
    entra desde los 35, que es cuando rendir arriba empieza a ser noticia.

    `temporada` va cuando NO es la más reciente de la base: "Segundo mejor OPS
    de la liga en 2019-20". Sin ella, la frase de un retirado sonaría a hoy.
    """
    principal = "ops" if rol == "batting" else "era"
    item = next((i for i in items if i["stat"] == principal), None)
    if item is None or item["rank"] > 5:
        return None
    if rol == "batting":
        frase = f"{_ORDINAL_M[item['rank']]} OPS de la liga"
    else:
        frase = f"{_ORDINAL_F[item['rank']]} efectividad de la liga"
    if temporada:
        frase += f" en {temporada}"
    if edad_temporada is not None and edad_temporada >= 35:
        frase += f", a los {edad_temporada}"
    return frase + "."


# ─────────────────────────────────────────────────────────────────────────────
# La curva de la carrera
# ─────────────────────────────────────────────────────────────────────────────

# Por debajo de esto el punto se pinta hueco: 27 AP en una temporada no son
# evidencia de nada, y dibujarlo lleno igualaría un .019 de ruido con una
# temporada de verdad.
MUESTRA_CHICA_PA = 50
MUESTRA_CHICA_OUTS = 30  # 10 entradas


def liga_por_temporada(bateo: Iterable[dict], pitcheo: Iterable[dict]) -> list[dict]:
    """OPS y efectividad de toda la liga por temporada, de los conteos sumados."""
    b: dict[str, dict] = {}
    for f in bateo:
        a = b.setdefault(f["season_id"], {c: 0 for c in _CONTEO_BATEO})
        for c in _CONTEO_BATEO:
            a[c] += f.get(c) or 0
    p: dict[str, dict] = {}
    for f in pitcheo:
        a = p.setdefault(f["season_id"], {"er": 0, "outs": 0})
        a["er"] += f.get("er") or 0
        a["outs"] += f.get("outs") or 0
    salida = []
    for s in sorted(set(b) | set(p)):
        fila: dict[str, Any] = {"season_id": s, "ops": None, "era": None}
        if s in b:
            a = b[s]
            obp = _div(a["h"] + a["bb"] + a["hbp"], a["ab"] + a["bb"] + a["hbp"] + a["sf"])
            slg = _div(a["h"] + a["doubles"] + 2 * a["triples"] + 3 * a["hr"], a["ab"])
            fila["ops"] = round(obp + slg, 3) if obp is not None and slg is not None else None
        if s in p and p[s]["outs"]:
            fila["era"] = round(p[s]["er"] * 27 / p[s]["outs"], 2)
        salida.append(fila)
    return salida


def curva_de_carrera(
    temporadas: list[dict],
    rol: str,
    minimo: Callable[[str], float],
) -> dict:
    """
    Los puntos de la curva (una temporada por punto, equipos sumados) y su
    titular.

    `minimo(season_id)` devuelve el listón de calificación de esa temporada
    —AP para bateo, OUTS para pitcheo—, el mismo que usan las tablas de
    líderes. Una temporada "calificada" es la que habría entrado a esas tablas.
    """
    campo = "ops" if rol == "batting" else "era"
    volumen = "pa" if rol == "batting" else "outs"
    chica = MUESTRA_CHICA_PA if rol == "batting" else MUESTRA_CHICA_OUTS
    puntos = []
    for t in sorted(temporadas, key=lambda t: t["season_id"]):
        if t.get(campo) is None:
            continue
        puntos.append({
            "season_id": t["season_id"],
            "value": round(t[campo], 3 if rol == "batting" else 2),
            "volume": t[volumen],
            "small_sample": t[volumen] < chica,
            "qualified": t[volumen] >= minimo(t["season_id"]),
        })
    return {"stat": campo, "points": puntos, "headline": titular_carrera(puntos, rol)}


def titular_carrera(puntos: list[dict], rol: str) -> str | None:
    """
    "Su mejor temporada calificada desde 2013-14."

    Se mira la ÚLTIMA temporada calificada y se busca hacia atrás la más
    reciente que fue igual o mejor. Si ninguna lo fue y hay al menos otra
    calificada, es la mejor de su carrera. Si la que la supera es justo la
    calificada anterior, no hay titular: "la mejor desde el año pasado" no es
    noticia.
    """
    mayor = rol == "batting"
    cal = [p for p in puntos if p["qualified"]]
    if len(cal) < 2:
        return None
    ultima, previas = cal[-1], cal[:-1]
    mejor_o_igual = [
        p for p in previas
        if (p["value"] >= ultima["value"] if mayor else p["value"] <= ultima["value"])
    ]
    if not mejor_o_igual:
        return "La mejor temporada calificada de su carrera."
    desde = mejor_o_igual[-1]
    if desde is previas[-1]:
        return None
    return f"Su mejor temporada calificada desde {desde['season_id']}."
