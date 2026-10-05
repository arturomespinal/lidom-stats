"""
orquestacion/activos.py — Los assets del pipeline y sus comprobaciones.

    juegos ──(juegos_cuadran, bloquea)──┐
       │                                 ├── tablas_planas ──(capas_coinciden)
       │                                 │
    historia ──(tasas_cuadran)──┐        │
       │                        ├── enlaces_historia ──(cobertura_enlaces)
       └────────────────────────┴── cruce_historia

Los assets no reimplementan nada: llaman a los mismos ingestores que
`main.py`. Lo que Dagster agrega es el grafo (qué depende de qué), la
partición por temporada, el historial de cada carga y, sobre todo, que cada
carga se VALIDA sola al terminar: las comprobaciones son las de
`src/validacion.py`, las mismas que corre `verify_capas.py`.

Dos decisiones que no conviene deshacer:

- **Todo corre en serie** (`in_process_executor` en `definitions.py` y
  `BackfillPolicy.single_run()` aquí). SQLite admite un solo escritor: dos
  temporadas cargándose a la vez darían "database is locked". Y la MLB API
  agradece no recibir dos ingestas en paralelo.
- **`juegos_cuadran` bloquea**: si las líneas de un juego no suman su
  marcador, el esquema de juego está mal y comparar capas no significa nada.
  Con el check en rojo, `tablas_planas` no corre en esa ejecución.
"""

from contextlib import closing

from dagster import (
    AssetCheckResult,
    AssetCheckSeverity,
    AssetCheckSpec,
    AssetExecutionContext,
    BackfillPolicy,
    Config,
    Failure,
    MaterializeResult,
    MetadataValue,
    asset,
)

from src.clients.digimetrics import DigimetricsClient
from src.historia import enlazar
from src.pipeline.boxscore_ingestor import BoxscoreIngestor
from src.pipeline.cruce_historia import cruzar, informe
from src.pipeline.historia_ingestor import PRIMERA_TEMPORADA, ULTIMA_TEMPORADA, HistoriaIngestor
from src.pipeline.mlb_ingestor import MLBIngestor
from src.validacion import comparar_temporada, juegos_descuadrados, season_id, temporadas

from .recursos import BaseDatos
from .temporadas import TEMPORADAS

# El enlace entre fuentes llegó a 98,4% con la base real (1.588 de 1.614).
# Por debajo de esto, algo cambió en una de las dos fuentes o en el algoritmo.
COBERTURA_MINIMA_ENLACES = 0.98

UNA_CORRIDA = BackfillPolicy.single_run()


def _lista_md(filas: list[str], vacio: str = "ninguno") -> MetadataValue:
    return MetadataValue.md("\n".join(f"- {f}" for f in filas) if filas else vacio)


# ── MLB API: el esquema de juego ─────────────────────────────────────────────


class ConfigJuegos(Config):
    # Vuelve a procesar los boxscores ya cargados (correcciones del anotador).
    # Por defecto no: el ingestor salta los juegos que ya tienen líneas.
    refresh: bool = False


@asset(
    partitions_def=TEMPORADAS,
    backfill_policy=UNA_CORRIDA,
    group_name="mlb",
    kinds={"python", "sqlite"},
    description=(
        "Calendario y boxscores de la temporada regular desde la MLB API: games, "
        "players, batting_lines y pitching_lines. La partición es el año en que "
        "empieza la campaña ('2025' = 2025-26)."
    ),
    check_specs=[
        AssetCheckSpec(
            "juegos_cuadran",
            asset="juegos",
            blocking=True,
            description=(
                "En cada juego final, las carreras de bateo de cada equipo y las "
                "permitidas por el pitcheo rival suman el marcador."
            ),
        )
    ],
)
def juegos(context: AssetExecutionContext, config: ConfigJuegos, base: BaseDatos) -> MaterializeResult:
    base.preparar()
    ingestor = BoxscoreIngestor(db_url=base.url)
    resumenes = {}
    for season in context.partition_keys:
        context.log.info(f"Ingesta de juegos {season_id(season)}")
        resumenes[season] = ingestor.ingest(season=season, refresh=config.refresh)

    revisados, descuadrados = 0, []
    with closing(base.leer()) as con:
        for season in context.partition_keys:
            n, malos = juegos_descuadrados(con, season_id(season))
            revisados += n
            descuadrados += malos

    return MaterializeResult(
        metadata={
            "temporadas": ", ".join(season_id(s) for s in context.partition_keys),
            "juegos_en_calendario": sum(r.get("games", 0) for r in resumenes.values()),
            "lineas_de_bateo_nuevas": sum(r.get("batting_lines", 0) for r in resumenes.values()),
            "lineas_de_pitcheo_nuevas": sum(r.get("pitching_lines", 0) for r in resumenes.values()),
            "ya_estaban": sum(r.get("games_skipped", 0) for r in resumenes.values()),
        },
        check_results=[
            AssetCheckResult(
                check_name="juegos_cuadran",
                passed=not descuadrados,
                severity=AssetCheckSeverity.ERROR,
                metadata={
                    "juegos_finales_revisados": revisados,
                    "descuadrados": len(descuadrados),
                    "ejemplos": _lista_md(descuadrados[:20]),
                },
            )
        ],
    )


@asset(
    partitions_def=TEMPORADAS,
    backfill_policy=UNA_CORRIDA,
    group_name="mlb",
    # La ingesta no usa nada de `juegos`: /standings y /stats son un camino
    # aparte. La dependencia está porque su check LEE el esquema de juego, y
    # porque es lo que hace que `juegos_cuadran` la bloquee. Declararla solo en
    # el check (additional_deps) no alcanza: no ordena los pasos ni bloquea
    # (comprobado en verify_orquestacion.py).
    deps=[juegos],
    kinds={"python", "sqlite"},
    description=(
        "Posiciones y agregados de bateo y pitcheo de la temporada desde /standings "
        "y /stats: standings, batting_stats y pitching_stats. Es un camino "
        "independiente del de `juegos`, y por eso sirve para validarlo."
    ),
    check_specs=[
        AssetCheckSpec(
            "capas_coinciden",
            asset="tablas_planas",
            description=(
                "Las tablas planas coinciden con las vistas del esquema de juego: "
                "posiciones equipo por equipo, totales de la liga y jugador por "
                "jugador, salvo las diferencias conocidas (src/validacion.py)."
            ),
        )
    ],
)
def tablas_planas(context: AssetExecutionContext, base: BaseDatos) -> MaterializeResult:
    base.preparar()
    ingestor = MLBIngestor(db_url=base.url)
    filas = {"standings": 0, "batting": 0, "pitching": 0}
    for season in context.partition_keys:
        context.log.info(f"Tablas planas {season_id(season)}")
        r = ingestor.ingest(season=season)
        for k in filas:
            filas[k] += r.get(k, 0)

    comprobadas, fallidas, notas, sin_terminar = 0, [], [], []
    with closing(base.leer()) as con:
        comunes, _ = temporadas(con)
        for season in context.partition_keys:
            sid = season_id(season)
            if season not in comunes:
                # Una temporada sin juegos terminados (la que está por empezar)
                # no tiene nada que comparar. Si tiene juegos y le faltan las
                # planas, eso sí es un fallo.
                finales, _ = juegos_descuadrados(con, sid)
                if finales:
                    fallidas.append(f"{sid}: hay {finales} juegos finales y no hay tablas planas")
                else:
                    sin_terminar.append(sid)
                continue
            res = comparar_temporada(con, season)
            comprobadas += len(res.comprobaciones)
            fallidas += [f"{c.etiqueta} → {c.detalle}" for c in res.fallidas]
            notas += [f"{sid}: {n}" for n in res.notas]

    return MaterializeResult(
        metadata={
            "temporadas": ", ".join(season_id(s) for s in context.partition_keys),
            "filas_standings": filas["standings"],
            "filas_bateo": filas["batting"],
            "filas_pitcheo": filas["pitching"],
        },
        check_results=[
            AssetCheckResult(
                check_name="capas_coinciden",
                passed=not fallidas,
                severity=AssetCheckSeverity.ERROR,
                metadata={
                    "comprobaciones": comprobadas,
                    "fallidas": _lista_md(fallidas),
                    "diferencias_conocidas": _lista_md(notas),
                    "sin_juegos_terminados": ", ".join(sin_terminar) or "—",
                },
            )
        ],
    )


# ── DIGIMETRICS: la historia desde 1951 ──────────────────────────────────────


class ConfigHistoria(Config):
    desde: int = PRIMERA_TEMPORADA
    hasta: int = ULTIMA_TEMPORADA
    # Solo lo que ya está en data/raw/digimetrics, sin pedir nada al portal.
    sin_red: bool = False
    # Vuelve a bajar aunque la página esté en la caché.
    refrescar: bool = False


@asset(
    group_name="historia",
    kinds={"python", "sqlite"},
    description=(
        "Bateo y pitcheo por jugador desde 1951, del portal de estadísticas de la "
        "liga (DIGIMETRICS). Un pedido por segundo y caché en disco: repetir no "
        "vuelve a pedir lo que ya se bajó."
    ),
    check_specs=[
        AssetCheckSpec(
            "tasas_cuadran",
            asset="historia",
            description=(
                "Cada fila cuadra con las tasas que publica la propia página (AVG, "
                "SLG, ERA, WHIP), fuera de los errores conocidos de la fuente."
            ),
        )
    ],
)
def historia(context: AssetExecutionContext, config: ConfigHistoria, base: BaseDatos) -> MaterializeResult:
    if not PRIMERA_TEMPORADA <= config.desde <= config.hasta <= ULTIMA_TEMPORADA:
        raise Failure(f"El rango va de {PRIMERA_TEMPORADA} a {ULTIMA_TEMPORADA}.")

    cliente = DigimetricsClient(offline=config.sin_red, refrescar=config.refrescar)
    with cliente, HistoriaIngestor(db_url=base.url, client=cliente) as ingestor:
        r = ingestor.ingest(range(config.desde, config.hasta + 1))

    return MaterializeResult(
        metadata={
            "rango": f"{config.desde}-{config.hasta}",
            "temporadas": r["temporadas"],
            "lineas_de_bateo": r["bateo"],
            "lineas_de_pitcheo": r["pitcheo"],
            "pedidos_al_portal": r.get("pedidos_red", 0),
            "desde_la_cache": r.get("pedidos_cache", 0),
            "no_se_jugaron": ", ".join(str(t) for t in r["no_jugadas"]) or "—",
            "saltadas_por_peso": ", ".join(str(t) for t in r["omitidas_por_peso"]) or "—",
            "avisos": _lista_md(r["avisos"]),
        },
        check_results=[
            AssetCheckResult(
                check_name="tasas_cuadran",
                passed=not r["discrepancias"],
                severity=AssetCheckSeverity.ERROR,
                metadata={
                    "filas_que_no_cuadran": len(r["discrepancias"]),
                    "detalle": _lista_md(r["discrepancias"][:30]),
                },
            )
        ],
    )


@asset(
    group_name="historia",
    deps=[historia, juegos],
    kinds={"python", "sqlite"},
    description=(
        "Enlace jugador por jugador entre el portal de la liga y la MLB API, con los "
        "años que tienen las dos (2012-13 a 2019-20). Es lo que permite la carrera "
        "completa y los líderes de todos los tiempos."
    ),
    check_specs=[
        AssetCheckSpec(
            "cobertura_enlaces",
            asset="enlaces_historia",
            description=f"Se enlaza al menos el {COBERTURA_MINIMA_ENLACES:.0%} de los enlazables.",
        )
    ],
)
def enlaces_historia(context: AssetExecutionContext, base: BaseDatos) -> MaterializeResult:
    e = enlazar(base.preparar())
    enlazables = e["enlazables"] or 0
    cobertura = e["enlazados"] / enlazables if enlazables else 0.0
    return MaterializeResult(
        metadata={
            "enlazados": e["enlazados"],
            "enlazables": enlazables,
            "por_metodo": MetadataValue.json(e["por_metodo"]),
        },
        check_results=[
            AssetCheckResult(
                check_name="cobertura_enlaces",
                passed=cobertura >= COBERTURA_MINIMA_ENLACES,
                severity=AssetCheckSeverity.WARN,
                metadata={"cobertura": MetadataValue.float(round(cobertura, 4))},
            )
        ],
    )


@asset(
    group_name="historia",
    deps=[historia, juegos],
    kinds={"python", "sqlite"},
    description=(
        "El portal de la liga contra la MLB API, equipo por equipo, en las temporadas "
        "que tienen las dos. Dos anotaciones independientes de los mismos juegos: el "
        "informe dice dónde no coinciden (ver CLAUDE.md, 'El cruce con la MLB API')."
    ),
)
def cruce_historia(context: AssetExecutionContext, base: BaseDatos) -> MaterializeResult:
    r = cruzar(base.preparar())
    return MaterializeResult(
        metadata={
            "equipo_temporadas": r["equipos"],
            "identicos": r["identicos"],
            "informe": MetadataValue.md(f"```\n{informe(r)}\n```" if r["equipos"] else "Sin temporadas comunes."),
        }
    )
