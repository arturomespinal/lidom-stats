# main.py — Actualizado con modo scheduler
import os
import sys
from src.utils.logger import setup_logger, logger
from src.scrapers.lidom_scraper import LidomScraper
from src.storage.json_storage import save_result

os.makedirs("logs", exist_ok=True)


def main():
    setup_logger(log_level="DEBUG")

    logger.info("=" * 50)
    logger.info("LIDOM Stats — Iniciando pipeline de datos")
    logger.info("=" * 50)

    # Modo: "scrape" (una vez) o "schedule" (automático)
    mode = sys.argv[1] if len(sys.argv) > 1 else "scrape"

    if mode == "schedule":
        from src.scheduler.jobs import start_scheduler
        logger.info("Modo: Scheduler automático")
        start_scheduler()
    else:
        logger.info("Modo: Scraping único")
        scraper = LidomScraper()
        result = scraper.scrape(season="2025")

        if result.success:
            save_result(result.data, category="full")
            logger.success(f"✅ Pipeline completado | {result.record_count} registros")
        else:
            logger.error(f"❌ Pipeline falló | Errores: {result.errors}")


if __name__ == "__main__":
    main()