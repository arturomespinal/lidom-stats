"""
src/scrapers/digimetrics.py — Parser de las tablas de DIGIMETRICS (estadisticas.lidom.com).

Funciones puras: reciben el HTML (o el JSON ya decodificado) y devuelven datos.
No saben nada de HTTP ni de la base; así se prueban con páginas guardadas.

Por qué BeautifulSoup con "html.parser":
    - Las páginas son fragmentos chicos (5-400 KB) y sencillos: dos tablas, sin
      JavaScript que ejecutar. La velocidad de lxml o selectolax no se nota
      frente al segundo de espera entre pedidos.
    - "html.parser" viene con Python: nada que compilar en Windows.

La regla que protege contra el fallo más común de un scraper —que la fuente
reordene o renombre columnas y nosotros sigamos leyendo en silencio la columna
equivocada— es doble:
    1. Las columnas se leen por el TEXTO del encabezado, nunca por posición. Si
       falta un encabezado que esperamos, FormatoInesperado y se para todo.
    2. Cada fila se comprueba contra las tasas que la propia página publica: el
       AVG y el SLG se recalculan con H, AB, 2B, 3B y HR; la ERA y el WHIP, con
       CL, outs, H y BB. Si una columna estuviera cruzada, las tasas no darían.
       Eso cubre justo las columnas que más se usan.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Optional

from bs4 import BeautifulSoup


class FormatoInesperado(Exception):
    """La página no tiene la forma que el parser conoce. Mejor parar que adivinar."""


# ─── Columnas: encabezado de la fuente → nuestro nombre ─────────────────────
# Los nombres son los mismos de batting_lines / pitching_lines, para que una
# línea histórica y una de la MLB API se lean igual.

BATEO: dict[str, str] = {
    "G": "games",
    "AB": "at_bats",
    "R": "runs",
    "H": "hits",
    "2B": "doubles",
    "3B": "triples",
    "HR": "home_runs",
    "RBI": "rbi",
    "BB": "walks",
    "IBB": "intentional_walks",
    "SO": "strikeouts",
    "LOB": "left_on_base",
    "SB": "stolen_bases",
    "CS": "caught_stealing",
    "HBP": "hit_by_pitch",
    "SF": "sacrifice_flies",
    "SH": "sacrifice_bunts",
    "DP": "grounded_into_dp",
}

PITCHEO: dict[str, str] = {
    "W": "wins",
    "L": "losses",
    "G": "games",
    "GS": "games_started",
    "GF": "games_finished",
    "GC": "complete_games",  # "juegos completos": la fuente lo abrevia en español
    "SHO": "shutouts",
    "SV": "saves",
    "IP": "outs",  # "44.1" → 133 outs; ver outs_de_innings()
    "H": "hits_allowed",
    "R": "runs_allowed",
    "ER": "earned_runs",
    "HR": "home_runs_allowed",
    "BB": "walks_allowed",
    "IBB": "intentional_walks_allowed",
    "SO": "strikeouts",
    "HBP": "hit_batters",
    "WP": "wild_pitches",
    "BK": "balks",
}

# Tasas que publica la página y que usamos SOLO para comprobar. No se guardan:
# regla 3 de CLAUDE.md, las tasas salen de los conteos.
TASAS_BATEO = ("AVG", "SLG")
TASAS_PITCHEO = ("ERA", "WHIP")

_ID_MIEMBRO = re.compile(r"idMiembro=(\d+)")
_ID_EQUIPO = re.compile(r"idEquipo=(\d+)")


@dataclass
class TablaJugadores:
    """Lo que sale de una página de bateo o de pitcheo de un equipo."""

    filas: list[dict[str, Any]] = field(default_factory=list)
    # Filas cuyas tasas publicadas no cuadran con sus conteos. Debe estar
    # vacía; si no, alguna columna se leyó mal.
    discrepancias: list[str] = field(default_factory=list)
    # Cosas raras pero no fatales (un jugador repetido, una fila sin enlace).
    avisos: list[str] = field(default_factory=list)
    # Solo pitcheo: el nombre del equipo tal como lo escribe la fuente esa
    # temporada ("Azucareros del Este").
    nombre_equipo: Optional[str] = None


# ─── Valores sueltos ─────────────────────────────────────────────────────────

def _texto(celda) -> str:
    return " ".join(celda.get_text(" ", strip=True).split())


def entero(texto: str) -> Optional[int]:
    """'12' → 12. Vacío → None: la fuente deja en blanco lo que no registró
    (el LOB de las temporadas viejas), y eso NO es un cero."""
    texto = texto.strip()
    if texto == "":
        return None
    if not re.fullmatch(r"-?\d+", texto):
        raise FormatoInesperado(f"se esperaba un entero y vino {texto!r}")
    return int(texto)


def outs_de_innings(texto: str) -> Optional[int]:
    """
    Innings a outs. "44.1" son 44 entradas y UN out (no una décima): 133.
    El decimal solo puede ser 0, 1 o 2; cualquier otra cosa es que la columna
    no es la que creemos.
    """
    texto = texto.strip()
    if texto == "":
        return None
    m = re.fullmatch(r"(\d+)(?:\.(\d))?", texto)
    if not m or (m.group(2) or "0") not in "012":
        raise FormatoInesperado(f"innings con forma rara: {texto!r}")
    return int(m.group(1)) * 3 + int(m.group(2) or 0)


def _tasa(texto: str) -> Optional[float]:
    texto = texto.strip()
    if texto in ("", "-", "--", "INF", "∞"):
        return None
    try:
        return float(texto)
    except ValueError:
        return None


# ─── La tabla ────────────────────────────────────────────────────────────────

def _tabla_de_jugadores(html: str):
    """La tabla con encabezado "Jugador". La página trae otra arriba con los
    selectores de temporada y etapa, que no es de datos."""
    sopa = BeautifulSoup(html, "html.parser")
    for tabla in sopa.find_all("table"):
        thead = tabla.find("thead")
        if thead and any(_texto(th) == "Jugador" for th in thead.find_all("th")):
            return tabla
    raise FormatoInesperado("no hay ninguna tabla con la columna 'Jugador'")


def _leer(html: str, columnas: dict[str, str], tasas: tuple[str, ...]) -> tuple[TablaJugadores, list[dict]]:
    """Lee la tabla y devuelve las filas crudas (con las tasas como texto)."""
    tabla = _tabla_de_jugadores(html)
    encabezados = [_texto(th) for th in tabla.find("thead").find_all("th")]

    faltan = [c for c in ("Jugador", *columnas, *tasas) if c not in encabezados]
    if faltan:
        raise FormatoInesperado(f"faltan columnas {faltan}; la página trae {encabezados}")
    pos = {nombre: i for i, nombre in enumerate(encabezados)}

    resultado = TablaJugadores()
    crudas: list[dict] = []
    cuerpo = tabla.find("tbody")
    for tr in (cuerpo.find_all("tr") if cuerpo else []):
        celdas = tr.find_all("td")
        if len(celdas) != len(encabezados):
            raise FormatoInesperado(
                f"fila con {len(celdas)} celdas y {len(encabezados)} encabezados"
            )
        celda_jugador = celdas[pos["Jugador"]]
        enlace = celda_jugador.find("a", href=_ID_MIEMBRO)
        if not enlace:
            resultado.avisos.append(f"fila sin enlace a jugador: {_texto(celda_jugador)!r}")
            continue
        fila: dict[str, Any] = {
            "id_miembro": int(_ID_MIEMBRO.search(enlace["href"]).group(1)),
            "nombre": _texto(celda_jugador),
        }
        for encabezado, campo in columnas.items():
            valor = _texto(celdas[pos[encabezado]])
            fila[campo] = outs_de_innings(valor) if campo == "outs" else entero(valor)
        if "Equipo" in pos:
            fila["_equipo"] = _texto(celdas[pos["Equipo"]])
        fila["_tasas"] = {t: _texto(celdas[pos[t]]) for t in tasas}
        crudas.append(fila)
    return resultado, crudas


def _sumar_repetidos(resultado: TablaJugadores, crudas: list[dict]) -> None:
    """
    Un jugador debería salir una sola vez por equipo y etapa. Si sale dos (la
    fuente partió su línea), se suman los conteos: la clave primaria es
    (temporada, etapa, equipo, jugador) y la segunda fila pisaría a la primera.
    """
    por_id: dict[int, dict] = {}
    for fila in crudas:
        previa = por_id.get(fila["id_miembro"])
        if previa is None:
            por_id[fila["id_miembro"]] = fila
            continue
        resultado.avisos.append(f"jugador repetido, se suman sus filas: {fila['nombre']}")
        for k, v in fila.items():
            if k.startswith("_") or k in ("id_miembro", "nombre"):
                continue
            if v is not None:
                previa[k] = (previa[k] or 0) + v
        previa["_repetido"] = True
    resultado.filas = list(por_id.values())


def _cerca(publicada: Optional[float], calculada: float, tolerancia: float) -> bool:
    return publicada is None or abs(publicada - calculada) <= tolerancia + 1e-9


def parse_bateo_equipo(html: str) -> TablaJugadores:
    """/Equipo/EquipoBateo → una fila por bateador, con conteos."""
    resultado, crudas = _leer(html, BATEO, TASAS_BATEO)
    for f in crudas:
        ab = f["at_bats"] or 0
        if ab > 0 and not f.get("_repetido"):
            h = f["hits"] or 0
            bases = h + (f["doubles"] or 0) + 2 * (f["triples"] or 0) + 3 * (f["home_runs"] or 0)
            tasas = {t: _tasa(v) for t, v in f["_tasas"].items()}
            # Media milésima de tolerancia: la fuente redondea a tres cifras y
            # no sabemos si hacia arriba o al par en los empates.
            if not _cerca(tasas["AVG"], h / ab, 0.0005):
                resultado.discrepancias.append(f"{f['nombre']}: AVG {f['_tasas']['AVG']} con {h} H en {ab} AB")
            if not _cerca(tasas["SLG"], bases / ab, 0.0005):
                resultado.discrepancias.append(f"{f['nombre']}: SLG {f['_tasas']['SLG']} con {bases} bases en {ab} AB")
    _sumar_repetidos(resultado, crudas)
    for f in resultado.filas:
        for k in [k for k in f if k.startswith("_")]:
            del f[k]
    return resultado


def parse_pitcheo_equipo(html: str) -> TablaJugadores:
    """/Equipo/EquipoLanzamiento → una fila por lanzador, IP convertido a outs."""
    resultado, crudas = _leer(html, PITCHEO, TASAS_PITCHEO)
    equipos = {f["_equipo"] for f in crudas if f.get("_equipo")}
    if len(equipos) > 1:
        resultado.avisos.append(f"varios equipos en la misma página: {sorted(equipos)}")
    resultado.nombre_equipo = min(equipos) if equipos else None
    for f in crudas:
        outs = f["outs"] or 0
        if outs > 0 and not f.get("_repetido"):
            tasas = {t: _tasa(v) for t, v in f["_tasas"].items()}
            cl = f["earned_runs"] or 0
            bb_h = (f["walks_allowed"] or 0) + (f["hits_allowed"] or 0)
            # La fuente divide entre los innings REDONDEADOS a tres decimales:
            # 3 CL en 1.1 IP publica 20.26 (27 / 1.333), no 20.25 (27 / 4 × 3).
            # Se acepta cualquiera de las dos cuentas; con innings largos dan
            # lo mismo y con innings cortos solo cuadra la de la fuente.
            ips = (outs / 3, round(outs / 3, 3))
            if not any(_cerca(tasas["ERA"], cl * 9 / ip, 0.005) for ip in ips):
                resultado.discrepancias.append(f"{f['nombre']}: ERA {f['_tasas']['ERA']} con {cl} CL en {outs} outs")
            if not any(_cerca(tasas["WHIP"], bb_h / ip, 0.005) for ip in ips):
                resultado.discrepancias.append(f"{f['nombre']}: WHIP {f['_tasas']['WHIP']} con {bb_h} BB+H en {outs} outs")
    _sumar_repetidos(resultado, crudas)
    for f in resultado.filas:
        for k in [k for k in f if k.startswith("_")]:
            del f[k]
    return resultado


def parse_etapas(datos: Any) -> list[tuple[str, str]]:
    """
    /Equipo/SelectEtapasTemporada → [("SR", "Serie Regular"), ("RR", ...), ...].

    Una temporada que no se jugó (1961, 1962, 1965) devuelve la lista vacía.
    "RR" es el round robin aunque la fuente lo llame "Serie Semifinal".
    """
    if not isinstance(datos, list):
        raise FormatoInesperado(f"las etapas deberían ser una lista y vino {type(datos).__name__}")
    etapas = []
    for e in datos:
        if not isinstance(e, dict) or "Id" not in e:
            raise FormatoInesperado(f"etapa con forma rara: {e!r}")
        etapas.append((str(e["Id"]), str(e.get("Descripcion") or e["Id"])))
    return etapas
