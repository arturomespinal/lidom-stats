# main.py — pipeline completo: scrape → JSON → DB  |  ingest: MLB API → DB
import os
import sys
from src.utils.logger import setup_logger, logger
from src.storage.json_storage import save_result
# Importar flat_models para registrarlos en Base.metadata antes de init_db()
from src.models import flat_models  # noqa: F401
from src.models.database import init_db
from src.pipeline.loader import load_to_db

os.makedirs("logs", exist_ok=True)
os.makedirs("data", exist_ok=True)


def main():
    setup_logger(log_level="DEBUG")
    logger.info("=" * 50)
    logger.info("LIDOM Stats — Iniciando pipeline de datos")
    logger.info("=" * 50)

    mode = sys.argv[1] if len(sys.argv) > 1 else "scrape"
    season = sys.argv[2] if len(sys.argv) > 2 else "2025"
    flags = set(sys.argv[3:])

    # Inicializar DB (crea tablas si no existen)
    init_db()

    # ── MLB API ingestor (fuente canónica) ─────────────────────────────────────
    if mode == "ingest":
        from src.pipeline.mlb_ingestor import MLBIngestor
        ingestor = MLBIngestor()
        summary = ingestor.ingest(season=season)
        logger.success(f"✅ Ingestión MLB API completa: {summary}")

    # ── Boxscores → esquema de granularidad de juego ───────────────────────────
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

    elif mode == "schedule":
        from src.scheduler.jobs import start_scheduler
        start_scheduler()

    # ── Baseball-Reference scraper (legacy) ────────────────────────────────────
    elif mode == "all_seasons":
        from src.scrapers.baseball_reference_scraper import BaseballReferenceScraper
        scraper = BaseballReferenceScraper()
        result = scraper.scrape_all_seasons()
        save_result(result.data, category="historical_all")
        load_to_db(result.data)

    else:
        from src.scrapers.baseball_reference_scraper import BaseballReferenceScraper
        scraper = BaseballReferenceScraper()
        result = scraper.scrape(season=season)

        if result.success:
            save_result(result.data, category=f"season_{season}")
            summary = load_to_db(result.data)
            logger.success(
                f"✅ Pipeline completo | "
                f"Registros: {result.record_count} | "
                f"DB: {summary}"
            )
        else:
            logger.error(f"❌ Falló | Errores: {result.errors}")


if __name__ == "__main__":
    main()
