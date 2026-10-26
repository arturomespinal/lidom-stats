"""
src/publicar.py — Lo que la capa analítica le devuelve a la app.

    python main.py publicar-analitica

La API lee SQLite y nada más. La capa analítica (dbt sobre DuckDB, en
`analitica/`) calcula cosas que la app quiere mostrar —hoy, las mejores
temporadas de la historia— y este paso copia esos resultados a una tabla de la
base de la app (`ana_mejores_temporadas`). Es el último tramo del linaje:

    SQLite ─exportar─► Parquet ─dbt─► DuckDB ─publicar─► SQLite (la app)

¿Por qué copiar y no que la API lea DuckDB?

- **El servidor no necesita DuckDB ni dbt.** La API de producción se instala
  con `requirements.txt`; la capa analítica tiene su propio archivo de
  requisitos y corre donde se ingesta.
- **Un solo archivo que desplegar y respaldar.** El respaldo diario del
  servidor (`deploy/oracle/respaldo.py`) ya copia la base; con la tabla
  dentro, va incluida.
- **Cambia una vez al año.** Las mejores temporadas solo cuentan temporadas
  terminadas (`completa` en `minimos_temporada`), así que la tabla se rehace
  cuando termina una temporada, no cada noche.

La tabla se reemplaza entera en una transacción: quien lee la ve vieja o
nueva, nunca a medias. `ana_publicacion` guarda cuándo se publicó y de qué
archivo, para que la API pueda decirlo.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path

DUCKDB_POR_DEFECTO = Path("data/analitica.duckdb")
TABLA = "ana_mejores_temporadas"

COLUMNAS = [
    ("grupo", "TEXT"), ("stat", "TEXT"), ("etiqueta", "TEXT"), ("puesto", "INTEGER"),
    ("persona", "TEXT"), ("nombre", "TEXT"), ("player_id", "TEXT"), ("id_miembro", "INTEGER"),
    ("season_id", "TEXT"), ("anio", "INTEGER"), ("fuente", "TEXT"), ("equipos", "TEXT"),
    ("valor", "REAL"), ("mayor_es_mejor", "INTEGER"), ("es_tasa", "INTEGER"),
]


class SinCapaAnalitica(FileNotFoundError):
    """No hay `analitica.duckdb`: falta correr la capa analítica."""


def publicar_mejores(db: str, duckdb_path: Path = DUCKDB_POR_DEFECTO) -> int:
    """Copia `mejores_temporadas` de DuckDB a la base de la app. Devuelve las
    filas publicadas."""
    import duckdb  # requirements-analitica.txt: la API no lo necesita

    if not Path(duckdb_path).exists():
        raise SinCapaAnalitica(
            f"No existe {duckdb_path}. Corre: python main.py exportar-parquet && cd analitica && dbt build"
        )
    nombres = [c for c, _ in COLUMNAS]
    origen = duckdb.connect(str(duckdb_path), read_only=True)
    try:
        filas = origen.execute(
            f"SELECT {', '.join(nombres)} FROM mejores_temporadas ORDER BY grupo, stat, puesto, nombre"
        ).fetchall()
    finally:
        origen.close()

    ruta = db.removeprefix("sqlite:///")
    con = sqlite3.connect(ruta)
    try:
        with con:  # una transacción: o todo o nada
            con.execute(f"DROP TABLE IF EXISTS {TABLA}")
            con.execute(f"CREATE TABLE {TABLA} ({', '.join(f'{c} {t}' for c, t in COLUMNAS)})")
            con.execute(f"CREATE INDEX ix_{TABLA}_cat ON {TABLA} (grupo, stat, puesto)")
            con.executemany(
                f"INSERT INTO {TABLA} VALUES ({', '.join('?' for _ in nombres)})",
                [tuple(int(v) if isinstance(v, bool) else v for v in f) for f in filas],
            )
            con.execute("CREATE TABLE IF NOT EXISTS ana_publicacion (tabla TEXT PRIMARY KEY, publicado_en TEXT, filas INTEGER)")
            con.execute(
                "INSERT OR REPLACE INTO ana_publicacion VALUES (?, ?, ?)",
                (TABLA, datetime.now(timezone.utc).isoformat(timespec="seconds"), len(filas)),
            )
    finally:
        con.close()
    return len(filas)
