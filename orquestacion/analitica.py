"""
orquestacion/analitica.py — La capa analítica en Dagster: el Parquet y dbt.

    juegos, tablas_planas, historia ──► parquet/<tabla> ──► modelos de dbt

`parquet` exporta la base con `src/exportar.py` (lo mismo que
`python main.py exportar-parquet`): un asset por archivo, con un check que
cuenta sus filas contra la base. Cada modelo de `analitica/` es un asset y
cada prueba de dbt, un check. Un job aparte, `capa_analitica`, con su
schedule: un job particionado por temporada no puede llevar assets sin
partición.

Las rutas salen del recurso `CapaAnalitica` y le llegan a dbt como variables
de entorno (`LIDOM_PARQUET_DIR`, `LIDOM_DUCKDB_PATH`), las mismas que lee
`analitica/profiles.yml`. Siempre absolutas: dbt corre con la carpeta
`analitica/` como directorio de trabajo.
"""

import os
import shutil
import sys
import sysconfig
from contextlib import closing, contextmanager
from pathlib import Path
from typing import Iterator

from dagster import (
    AssetCheckResult,
    AssetCheckSeverity,
    AssetCheckSpec,
    AssetExecutionContext,
    AssetKey,
    AssetSpec,
    ConfigurableResource,
    MaterializeResult,
    MetadataValue,
    multi_asset,
)
from dagster_dbt import DagsterDbtTranslator, DagsterDbtTranslatorSettings, DbtCliResource, DbtProject, dbt_assets

from src.exportar import TABLAS, exportar

from .activos import enlaces_historia, historia, juegos, tablas_planas
from .recursos import BaseDatos

RAIZ = Path(__file__).resolve().parent.parent
PROYECTO_DBT = RAIZ / "analitica"


class CapaAnalitica(ConfigurableResource):
    """Dónde va el Parquet y dónde vive la base de DuckDB."""

    parquet: str = str(RAIZ / "data" / "parquet")
    duckdb: str = str(RAIZ / "data" / "analitica.duckdb")

    @contextmanager
    def entorno(self) -> Iterator[None]:
        """Las rutas, absolutas, en las variables que lee dbt. Se restauran al
        salir: el ejecutor es en proceso y no deben quedar para otro asset."""
        nuevas = {
            "LIDOM_PARQUET_DIR": str(Path(self.parquet).resolve()),
            "LIDOM_DUCKDB_PATH": str(Path(self.duckdb).resolve()),
        }
        antes = {k: os.environ.get(k) for k in nuevas}
        os.environ.update(nuevas)
        try:
            yield
        finally:
            for k, v in antes.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v


# Cada archivo de Parquet es un asset (`parquet/<tabla>`), con la carga de la
# que sale. Así el linaje dice qué tabla alimenta cada modelo de dbt, y un
# modelo que solo lee la historia no aparece colgando de los boxscores.
_ORIGEN = {
    **{t: [juegos] for t in ("teams", "seasons", "players", "games", "batting_lines", "pitching_lines")},
    **{t: [tablas_planas] for t in ("standings", "batting_stats", "pitching_stats")},
    **{t: [historia] for t in ("hist_jugadores", "hist_equipos_temporada", "hist_etapas", "hist_bateo", "hist_pitcheo")},
    "hist_enlaces": [enlaces_historia],
    "minimos_temporada": [juegos, historia],
    "nombres_historicos": [historia],
    "categorias": [],
    "constantes": [],
}
ARCHIVOS = tuple(_ORIGEN)
assert set(TABLAS) <= set(ARCHIVOS), "una tabla de src/exportar.py sin asset"


def clave_parquet(archivo: str) -> AssetKey:
    return AssetKey(["parquet", archivo])


@multi_asset(
    specs=[
        AssetSpec(clave_parquet(a), deps=_ORIGEN[a], group_name="analitica",
                  description=f"{a}, exportada a Parquet (src/exportar.py).")
        for a in ARCHIVOS
    ],
    check_specs=[
        AssetCheckSpec("filas_completas", asset=clave_parquet(t),
                       description="El archivo tiene las filas de su tabla en la base.")
        for t in TABLAS
    ],
)
def parquet(context: AssetExecutionContext, base: BaseDatos, analitica: CapaAnalitica):
    """La base a Parquet, para dbt. Lo mismo que `python main.py exportar-parquet`."""
    base.preparar()
    directorio = Path(analitica.parquet)
    filas = exportar(base.url, directorio)
    # La base se vuelve a contar después de exportar: una diferencia es una
    # tabla que cambió a medio camino (otra ingesta escribiendo) o un archivo
    # truncado.
    with closing(base.leer()) as con:
        en_base = {t: con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in TABLAS}
    context.log.info(f"Parquet en {directorio}: {len(filas)} archivos")
    for a in ARCHIVOS:
        yield MaterializeResult(
            asset_key=clave_parquet(a),
            metadata={"filas": filas.get(a, 0),
                      "archivo": MetadataValue.path(str((directorio / f"{a}.parquet").resolve()))},
        )
    for t in TABLAS:
        yield AssetCheckResult(
            asset_key=clave_parquet(t),
            check_name="filas_completas",
            passed=filas.get(t) == en_base[t],
            severity=AssetCheckSeverity.ERROR,
            metadata={"parquet": filas.get(t, 0), "base": en_base[t]},
        )


# ── dbt ──────────────────────────────────────────────────────────────────────

def ejecutable_dbt() -> str:
    """La ruta de `dbt`, aunque su carpeta no esté en el PATH.

    Con el Python de la Microsoft Store, `pip` deja los ejecutables en una
    carpeta de Scripts que no está en el PATH: el mismo caso que obligó a
    escribir `python -m dagster` (CLAUDE.md). dagster-dbt exige la ruta de un
    ejecutable y `dbt` a secas fallaría ahí, así que se busca también junto
    a los scripts de este Python, del sistema y del usuario.
    """
    encontrado = shutil.which("dbt")
    if encontrado:
        return encontrado
    carpetas = {sysconfig.get_path("scripts"), sysconfig.get_path("scripts", f"{os.name}_user"),
                str(Path(sys.executable).parent)}
    for carpeta in filter(None, carpetas):
        for nombre in ("dbt.exe", "dbt"):
            candidato = Path(carpeta) / nombre
            if candidato.exists():
                return str(candidato)
    return "dbt"


proyecto_dbt = DbtProject(project_dir=PROYECTO_DBT, profiles_dir=PROYECTO_DBT)


def preparar_manifiesto(forzar: bool = False) -> None:
    """`dbt parse`: arma `analitica/target/manifest.json`, que no se versiona
    y del que salen los assets. Con `dagster dev` se rehace en cada carga,
    para que un modelo editado aparezca sin más; fuera de dev (la suite, la
    CI, `dagster definitions validate`), solo si falta.

    No se usa `DbtProject.prepare_if_dev()`: llama a `dbt` a secas, sin la
    búsqueda de `ejecutable_dbt()`.
    """
    if not forzar and proyecto_dbt.manifest_path.exists() and not os.getenv("DAGSTER_IS_DEV_CLI"):
        return
    dbt = DbtCliResource(project_dir=proyecto_dbt, dbt_executable=ejecutable_dbt())
    with CapaAnalitica().entorno():
        dbt.cli(["parse", "--quiet"], target_path=proyecto_dbt.target_path).wait()


preparar_manifiesto()


class Traductor(DagsterDbtTranslator):
    """Las fuentes de dbt son los archivos de Parquet (`parquet/<tabla>`), y
    los modelos van en el grupo `analitica`, junto a ellos."""

    def get_asset_key(self, dbt_resource_props) -> AssetKey:
        if dbt_resource_props["resource_type"] == "source":
            return clave_parquet(dbt_resource_props["name"])
        return super().get_asset_key(dbt_resource_props)

    def get_group_name(self, dbt_resource_props) -> str:
        return "analitica"


@dbt_assets(
    manifest=proyecto_dbt.manifest_path,
    project=proyecto_dbt,
    dagster_dbt_translator=Traductor(settings=DagsterDbtTranslatorSettings(enable_asset_checks=True)),
)
def modelos_dbt(context: AssetExecutionContext, dbt: DbtCliResource, analitica: CapaAnalitica):
    with analitica.entorno():
        yield from dbt.cli(["build"], context=context).stream()

