"""
orquestacion/definitions.py — Lo que Dagster carga: assets, job, schedule y recursos.

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

from .activos import cruce_historia, enlaces_historia, historia, juegos, tablas_planas
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


defs = Definitions(
    assets=[juegos, tablas_planas, historia, enlaces_historia, cruce_historia],
    jobs=[temporada_en_curso],
    schedules=[cada_madrugada],
    resources={"base": BaseDatos(url=os.environ.get("LIDOM_DB_URL", DEFAULT_DB_URL))},
    # En serie: SQLite admite un solo escritor. Ver orquestacion/activos.py.
    executor=in_process_executor,
)
