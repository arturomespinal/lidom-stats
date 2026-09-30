# main.py — punto de entrada del pipeline: MLB Stats API → base de datos.
import os
import sys
from src.utils.logger import setup_logger, logger
# Importar flat_models para registrarlos en Base.metadata antes de init_db()
from src.models import flat_models  # noqa: F401
# Y las de la capa histórica (DIGIMETRICS), por lo mismo.
from src.models import hist_models  # noqa: F401
from src.models.database import init_db

os.makedirs("logs", exist_ok=True)
os.makedirs("data", exist_ok=True)

USO = """\
Uso: python main.py <modo> [temporada] [flags]

Modos:
  ingest [temporada]              Agregados de /stats → tablas planas
  ingest-games [temporada] [...]  /schedule + /boxscore → esquema de juego
      --smoke                     Solo 3 juegos, para validar el parser
      --refresh                   Re-procesa juegos ya ingestados
  ingest-game <gamePk>            Un solo juego: su calendario y su boxscore
                                  (lo mismo que hace el motor en vivo al final)
  ingest-historia [desde] [hasta] DIGIMETRICS (estadisticas.lidom.com) → capa
                                  histórica hist_*. Por defecto 1951-2019.
      --smoke                     Solo 1990-91, para probar (~35 pedidos)
      --sin-red                   Solo lo que ya está en data/raw/digimetrics
      --refrescar                 Vuelve a bajar aunque esté en la caché
  cruzar-historia                 Compara la capa histórica con la MLB API
                                  en las temporadas que tienen las dos
  enlazar-historia                Enlaza los jugadores de DIGIMETRICS con los
                                  de la MLB API (ingest-historia ya lo hace)

La temporada va en el formato crudo de la MLB API y se nombra por el año en
que EMPIEZA la campaña: "2025" es la 2025-26. Por defecto, "2025".
"""


def main():
    # Sin argumentos no se adivina nada. La versión anterior caía por defecto
    # al scraper de Baseball-Reference, que era justo la fuente que CLAUDE.md
    # marca como legacy y no se debe usar: escribir `python main.py` sin más
    # disparaba una ingesta contra la fuente equivocada sin avisar.
    if len(sys.argv) < 2:
        print(USO, file=sys.stderr)
        sys.exit(2)

    mode = sys.argv[1]
    season = sys.argv[2] if len(sys.argv) > 2 else "2025"
    flags = set(sys.argv[3:])

    setup_logger(log_level="DEBUG")
    logger.info("=" * 50)
    logger.info("LIDOM Stats — Iniciando pipeline de datos")
    logger.info("=" * 50)

    # Inicializar DB (crea tablas si no existen, recrea las vistas)
    init_db()

    # ── Agregados de temporada → tablas planas ────────────────────────────────
    if mode == "ingest":
        from src.pipeline.mlb_ingestor import MLBIngestor
        ingestor = MLBIngestor()
        summary = ingestor.ingest(season=season)
        logger.success(f"✅ Ingestión MLB API completa: {summary}")

    # ── Boxscores → esquema de granularidad de juego ──────────────────────────
    elif mode == "ingest-games":
        from src.pipeline.boxscore_ingestor import BoxscoreIngestor
        ingestor = BoxscoreIngestor()
        summary = ingestor.ingest(
            season=season,
            game_type=os.environ.get("LIDOM_GAME_TYPE", "R"),
            # --refresh re-procesa juegos que ya tienen líneas cargadas
            refresh="--refresh" in flags,
            # --smoke corre solo 3 juegos, para verificar el parser sin esperar
            max_games=3 if "--smoke" in flags else None,
        )
        logger.success(f"✅ Ingesta de boxscores completa: {summary}")

    # ── Un solo juego → esquema de juego ─────────────────────────────────────
    elif mode == "ingest-game":
        from src.pipeline.boxscore_ingestor import BoxscoreIngestor
        if len(sys.argv) < 3 or not sys.argv[2].isdigit():
            print("Uso: python main.py ingest-game <gamePk>   (ej.: 826343)", file=sys.stderr)
            sys.exit(2)
        summary = BoxscoreIngestor().ingest_game(int(sys.argv[2]))
        if not summary["ingested"]:
            logger.warning(f"El juego no se ingestó: {summary}")
            sys.exit(1)

    # ── DIGIMETRICS → capa histórica ─────────────────────────────────────────
    elif mode == "ingest-historia":
        from src.clients.digimetrics import DigimetricsClient
        from src.pipeline.historia_ingestor import (
            PRIMERA_TEMPORADA, ULTIMA_TEMPORADA, HistoriaIngestor,
        )
        anios = [a for a in sys.argv[2:] if not a.startswith("--")]
        flags = {a for a in sys.argv[2:] if a.startswith("--")}
        if "--smoke" in flags:
            desde = hasta = 1990
        else:
            try:
                desde = int(anios[0]) if anios else PRIMERA_TEMPORADA
                hasta = int(anios[1]) if len(anios) > 1 else (desde if anios else ULTIMA_TEMPORADA)
            except ValueError:
                print("Uso: python main.py ingest-historia [desde] [hasta]   (ej.: 1951 2011)", file=sys.stderr)
                sys.exit(2)
        if not PRIMERA_TEMPORADA <= desde <= hasta <= ULTIMA_TEMPORADA:
            print(f"El rango va de {PRIMERA_TEMPORADA} a {ULTIMA_TEMPORADA}.", file=sys.stderr)
            sys.exit(2)
        from src.clients.digimetrics import DigimetricsError
        from src.scrapers.digimetrics import FormatoInesperado
        cliente = DigimetricsClient(offline="--sin-red" in flags, refrescar="--refrescar" in flags)
        try:
            with cliente:
                r = HistoriaIngestor(client=cliente).ingest(range(desde, hasta + 1))
        except (DigimetricsError, FormatoInesperado) as e:
            # Lo ya bajado queda en la caché: volver a correr retoma sin
            # repetir pedidos. Las temporadas completas ya están en la base.
            logger.error(f"La ingesta se detuvo: {type(e).__name__}: {e}")
            sys.exit(1)
        logger.success(
            f"✅ Historia {desde}-{hasta}: {r['temporadas']} temporadas, {r['bateo']} líneas de bateo, "
            f"{r['pitcheo']} de pitcheo. Pedidos al servidor: {r['pedidos_red']}, "
            f"desde la caché: {r['pedidos_cache']}"
            + (f". No se jugaron: {r['no_jugadas']}" if r["no_jugadas"] else "")
        )
        if r["omitidas_por_peso"]:
            logger.warning(
                f"Saltadas por páginas de más de 5 MB (fotos en base64): {r['omitidas_por_peso']}"
            )
        for aviso in r["avisos"]:
            logger.warning(aviso)
        # Con la capa al día, se rehacen los enlaces con la MLB API: la
        # carrera completa y los líderes de todos los tiempos dependen de ellos.
        from src.historia import enlazar
        from src.models.database import get_engine
        e = enlazar(get_engine())
        logger.info(f"Enlaces con la MLB API: {e['enlazados']} de {e['enlazables']} ({e['por_metodo']})")
        if r["discrepancias"]:
            # Una tasa publicada que no cuadra con sus conteos: o una columna
            # se leyó mal o la fuente tiene un error. No se esconde.
            for d in r["discrepancias"]:
                logger.error(d)
            logger.error(f"{len(r['discrepancias'])} filas con tasas que no cuadran")
            sys.exit(1)

    # ── Enlaces DIGIMETRICS ↔ MLB API ────────────────────────────────────────
    elif mode == "enlazar-historia":
        from src.historia import enlazar
        from src.models.database import get_engine
        e = enlazar(get_engine())
        logger.success(
            f"✅ Enlazados {e['enlazados']} de {e['enlazables']} jugadores de 2012-13 a 2019-20 "
            f"({e['por_metodo']}); sin enlace: {e['sin_enlace']}"
        )

    # ── Capa histórica contra la MLB API ─────────────────────────────────────
    elif mode == "cruzar-historia":
        from src.models.database import get_engine
        from src.pipeline.cruce_historia import cruzar, informe
        r = cruzar(get_engine())
        if not r["equipos"]:
            print("No hay temporadas en las dos capas. Corre antes: python main.py ingest-historia 2012 2019")
            sys.exit(1)
        print(informe(r))

    else:
        logger.error(f"Modo desconocido: {mode!r}")
        print(USO, file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
