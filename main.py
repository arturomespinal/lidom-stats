# main.py — pipeline completo: scrape → JSON → DB
import os
import sys
from src.utils.logger import setup_logger, logger
from src.storage.json_storage import save_result
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

    # Inicializar DB (crea tablas si no existen)
    init_db()

    if mode == "schedule":
        from src.scheduler.jobs import start_scheduler
        start_scheduler()

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
            # 1. Persistir JSON raw (backup)
            save_result(result.data, category=f"season_{season}")
            # 2. Cargar a SQLite
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