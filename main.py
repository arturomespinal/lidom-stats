# main.py — punto de entrada del pipeline: MLB Stats API → base de datos.
import os
import sys
from src.utils.logger import setup_logger, logger
# Importar flat_models para registrarlos en Base.metadata antes de init_db()
from src.models import flat_models  # noqa: F401
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

    else:
        logger.error(f"Modo desconocido: {mode!r}")
        print(USO, file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
