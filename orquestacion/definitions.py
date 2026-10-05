"""
orquestacion/definitions.py — Lo que Dagster carga: assets, jobs, schedules y recursos.

    dagster dev -m orquestacion          # desde la raíz del repo; UI en http://localhost:3000

Ver CLAUDE.md, "La orquestación con Dagster".
"""

import os

from dagster import (
    AssetSelection,
    DefaultScheduleStatus,
    Definitions,
    RunRequest,
    ScheduleEvaluationContext,
    define_asset_job,
    in_process_executor,
    schedule,
)

from src.constants import DEFAULT_DB_URL

from dagster_dbt import DbtCliResource

from .activos import cruce_historia, enlaces_historia, historia, juegos, tablas_planas
from .analitica import CapaAnalitica, ejecutable_dbt, modelos_dbt, parquet, proyecto_dbt
from .recursos import BaseDatos
from .temporadas import TEMPORADAS, temporada_actual

# La temporada en curso: el calendario y los boxscores nuevos, y las tablas
# planas al día. El motor en vivo ya ingesta cada juego al terminar; esto es
# la red de seguridad de la madrugada: los juegos que el motor no vio (la API
# caída, un juego suspendido que se completó otro día), las correcciones de
# /stats, y la validación de las dos capas cada día.
temporada_en_curso = define_asset_job(
    "temporada_en_curso",
    selection=AssetSelection.assets(juegos, tablas_planas),
    partitions_def=TEMPORADAS,
    description="Pone al día la temporada en curso y valida las dos capas.",
)


@schedule(
    job=temporada_en_curso,
    # 5:30 a. m. de RD, de octubre a febrero: ningún juego en curso y la
    # jornada anterior ya terminó.
    cron_schedule="30 5 * 10,11,12,1,2 *",
    execution_timezone="America/Santo_Domingo",
    # Apagado hasta que alguien lo encienda en la UI: un schedule que empieza
    # a pedirle cosas a la MLB API sin que nadie lo haya decidido no conviene.
    default_status=DefaultScheduleStatus.STOPPED,
    description="Cada madrugada de la temporada: la temporada en curso, al día y validada.",
)
def cada_madrugada(context: ScheduleEvaluationContext) -> RunRequest:
    hoy = context.scheduled_execution_time.date()
    season = str(temporada_actual(hoy))
    return RunRequest(partition_key=season, run_key=f"{season}-{hoy.isoformat()}")


# La capa analítica: el Parquet y los modelos de dbt. Job aparte porque
# `temporada_en_curso` está particionado por temporada y estos assets no.
capa_analitica = define_asset_job(
    "capa_analitica",
    selection=AssetSelection.assets(parquet, modelos_dbt),
    description="Exporta la base a Parquet y corre dbt build: modelos y pruebas.",
)


@schedule(
    job=capa_analitica,
    # 6:15 de RD: después de `cada_madrugada`, que pone al día la temporada.
    cron_schedule="15 6 * 10,11,12,1,2 *",
    execution_timezone="America/Santo_Domingo",
    default_status=DefaultScheduleStatus.STOPPED,
    description="Cada mañana de la temporada: el Parquet y los modelos de dbt al día.",
)
def cada_manana(context: ScheduleEvaluationContext) -> RunRequest:
    return RunRequest(run_key=context.scheduled_execution_time.date().isoformat())


defs = Definitions(
    assets=[juegos, tablas_planas, historia, enlaces_historia, cruce_historia, parquet, modelos_dbt],
    jobs=[temporada_en_curso, capa_analitica],
    schedules=[cada_madrugada, cada_manana],
    resources={
        "base": BaseDatos(url=os.environ.get("LIDOM_DB_URL", DEFAULT_DB_URL)),
        "analitica": CapaAnalitica(),
        "dbt": DbtCliResource(project_dir=proyecto_dbt, dbt_executable=ejecutable_dbt()),
    },
    # En serie: SQLite admite un solo escritor. Ver orquestacion/activos.py.
    executor=in_process_executor,
)
