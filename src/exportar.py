"""
src/exportar.py — La base a Parquet, para la capa analítica (dbt, `analitica/`).

    python main.py exportar-parquet          # data/parquet/<tabla>.parquet

Un archivo por tabla, reescrito entero en cada exportación: son unos MB y
tarda un segundo, así que no vale la pena exportar por partes. Se escribe a un
temporal y se renombra, para que dbt nunca lea un archivo a medias.

Con pyarrow y no con la extensión `sqlite` de DuckDB: esa extensión se baja de
internet la primera vez que se usa, y una exportación que depende de una
descarga falla en una máquina sin salida (el servidor, la CI) sin aviso previo.

Además de las tablas, se exportan cuatro derivadas que dbt NO debe recalcular,
porque la regla ya vive en Python y dos implementaciones acabarían
divergiendo:

- `minimos_temporada`: los juegos del equipo que más jugó en cada temporada y
  los mínimos de calificación, con `src/qualification.py`. Ojo: `round()` de
  Python redondea los .5 al par (3.1 × 15 = 46.5 → 46) y el de SQL hacia
  arriba (47). Calculado aquí, la app y la capa analítica califican igual.
- `nombres_historicos`: el nombre para mostrar de cada miembro de la liga,
  con `src/nombres.py` (tildes, apodos, los Alou sin el Rojas).
- `categorias`: las categorías de récords con su etiqueta, si mayor es mejor y
  si son tasa, de `src/historia.py`.
- `constantes`: el año en que cambia la fuente (`ANIO_CORTE`) y los mínimos
  de carrera para las tasas, también de `src/historia.py`.
"""

from __future__ import annotations

import math
import os
import sqlite3
from pathlib import Path
from typing import Any, Optional

import pyarrow as pa
import pyarrow.parquet as pq

from src.historia import (
    ANIO_CORTE, CATEGORIAS_BATEO, CATEGORIAS_PITCHEO, MIN_OUTS_CARRERA, MIN_PA_CARRERA,
)
from src.models.hist_models import etiqueta_historica
from src.nombres import mostrar_nombre
from src.qualification import qualifying_ip, qualifying_pa

DIRECTORIO = Path("data/parquet")

# Las tablas que lee la capa analítica. Las históricas pueden no existir (la
# capa de la liga es opcional): se exportan si están.
TABLAS = (
    "teams", "seasons", "players", "games", "batting_lines", "pitching_lines",
    "standings", "batting_stats", "pitching_stats",
    "hist_jugadores", "hist_equipos_temporada", "hist_etapas",
    "hist_bateo", "hist_pitcheo", "hist_enlaces",
)


def _tipo_arrow(declarado: str) -> pa.DataType:
    """El tipo declarado en SQLite → el de Arrow. Las fechas se quedan como
    texto ISO: dbt las convierte donde hagan falta, y así no se pierde nada
    si alguna fila trae un formato distinto."""
    t = (declarado or "").upper()
    if "INT" in t:
        return pa.int64()
    if any(x in t for x in ("REAL", "FLOA", "DOUB", "NUMERIC", "DECIMAL")):
        return pa.float64()
    if "BOOL" in t:
        return pa.bool_()
    return pa.string()


def _escribir(tabla: pa.Table, destino: Path) -> None:
    parcial = destino.with_suffix(".parquet.parcial")
    pq.write_table(tabla, parcial, compression="zstd")
    os.replace(parcial, destino)


def _tabla(con: sqlite3.Connection, nombre: str) -> Optional[pa.Table]:
    columnas = con.execute(f"PRAGMA table_info({nombre})").fetchall()
    if not columnas:
        return None
    nombres = [c[1] for c in columnas]
    filas = con.execute(f"SELECT * FROM {nombre}").fetchall()
    esquema = pa.schema([(c[1], _tipo_arrow(c[2])) for c in columnas])
    datos = {}
    for i, n in enumerate(nombres):
        valores = [f[i] for f in filas]
        # SQLite guarda los BOOLEAN como 0/1, y Arrow no los convierte solo.
        if esquema.field(n).type == pa.bool_():
            valores = [None if v is None else bool(v) for v in valores]
        datos[n] = valores
    return pa.table(datos, schema=esquema)


def minimos_temporada(con: sqlite3.Connection) -> list[dict[str, Any]]:
    """Por temporada: los juegos del equipo que más jugó y los mínimos.

    Desde 2012-13, de `v_standings`, igual que la API. Antes, de las
    decisiones de los lanzadores de la liga (ganados + perdidos por equipo):
    la fuente no trae posiciones de esos años (CLAUDE.md, "Qué tiene la fuente
    y qué no").
    """
    juegos: dict[str, int] = {}
    # La misma cuenta que `season_games_played()` de la API: la vista de
    # posiciones, solo regular y juegos finales.
    hay_vista = con.execute(
        "SELECT 1 FROM sqlite_master WHERE type='view' AND name='v_standings'"
    ).fetchone()
    if hay_vista:
        for sid, n in con.execute(
            "SELECT season_id, MAX(games_played) FROM v_standings GROUP BY season_id"
        ):
            if n:
                juegos[sid] = n
    hay_hist = con.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='hist_pitcheo'"
    ).fetchone()
    if hay_hist:
        for temporada, n in con.execute(
            """SELECT temporada, MAX(n) FROM (
                 SELECT temporada, team_code, SUM(COALESCE(wins,0) + COALESCE(losses,0)) AS n
                 FROM hist_pitcheo WHERE etapa = 'SR' AND temporada < ? GROUP BY 1, 2)
               GROUP BY 1""",
            (ANIO_CORTE,),
        ):
            juegos.setdefault(etiqueta_historica(temporada), n)
    filas = []
    for sid, n in sorted(juegos.items()):
        min_ip = qualifying_ip(n)
        filas.append({
            "season_id": sid, "juegos_equipo": n,
            "min_pa": qualifying_pa(n), "min_ip": min_ip,
            # En outs y entero: 30.6 entradas son 92 outs (91.8 hacia arriba).
            # Comparar contra 30.6 * 3 en SQL es comparar flotantes.
            "min_outs": math.ceil(round(min_ip * 3, 6)),
        })
    return filas


def nombres_historicos(con: sqlite3.Connection) -> list[dict[str, Any]]:
    hay = con.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='hist_jugadores'"
    ).fetchone()
    if not hay:
        return []
    return [
        {"id_miembro": i, "nombre": mostrar_nombre(n)}
        for i, n in con.execute("SELECT id_miembro, nombre FROM hist_jugadores")
    ]


def categorias() -> list[dict[str, Any]]:
    return [
        {"grupo": grupo, "stat": stat, "etiqueta": etiqueta, "mayor_es_mejor": mayor, "es_tasa": tasa}
        for grupo, cats in (("bateo", CATEGORIAS_BATEO), ("pitcheo", CATEGORIAS_PITCHEO))
        for stat, (etiqueta, mayor, tasa) in cats.items()
    ]


def constantes() -> list[dict[str, Any]]:
    return [{
        "anio_corte": ANIO_CORTE,
        "min_pa_carrera": MIN_PA_CARRERA,
        "min_outs_carrera": MIN_OUTS_CARRERA,
    }]


ESQUEMAS_DERIVADAS = {
    "minimos_temporada": pa.schema([
        ("season_id", pa.string()), ("juegos_equipo", pa.int64()),
        ("min_pa", pa.int64()), ("min_ip", pa.float64()), ("min_outs", pa.int64()),
    ]),
    "nombres_historicos": pa.schema([("id_miembro", pa.int64()), ("nombre", pa.string())]),
    "categorias": pa.schema([
        ("grupo", pa.string()), ("stat", pa.string()), ("etiqueta", pa.string()),
        ("mayor_es_mejor", pa.bool_()), ("es_tasa", pa.bool_()),
    ]),
    "constantes": pa.schema([
        ("anio_corte", pa.int64()), ("min_pa_carrera", pa.int64()), ("min_outs_carrera", pa.int64()),
    ]),
}


def exportar(db: str, destino: Path = DIRECTORIO) -> dict[str, int]:
    """Exporta la base `db` (ruta o URL sqlite:///) a `destino`. Devuelve las
    filas de cada archivo escrito."""
    ruta = Path(db.removeprefix("sqlite:///")).resolve()
    if not ruta.exists():
        raise FileNotFoundError(f"No existe la base: {ruta}")
    destino.mkdir(parents=True, exist_ok=True)
    filas: dict[str, int] = {}
    con = sqlite3.connect(f"{ruta.as_uri()}?mode=ro", uri=True)
    try:
        for nombre in TABLAS:
            t = _tabla(con, nombre)
            if t is None:
                continue
            _escribir(t, destino / f"{nombre}.parquet")
            filas[nombre] = t.num_rows
        derivadas = {
            "minimos_temporada": minimos_temporada(con),
            "nombres_historicos": nombres_historicos(con),
            "categorias": categorias(),
            "constantes": constantes(),
        }
    finally:
        con.close()
    for nombre, registros in derivadas.items():
        t = pa.Table.from_pylist(registros, schema=ESQUEMAS_DERIVADAS[nombre])
        _escribir(t, destino / f"{nombre}.parquet")
        filas[nombre] = t.num_rows
    return filas
