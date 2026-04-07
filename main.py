# main.py — Entry point del proyecto LIDOM Stats
import os
from src.utils.logger import setup_logger, logger
from src.scrapers.lidom_scraper import LidomScraper

# Crear carpeta de logs si no existe
os.makedirs("logs", exist_ok=True)


def main():
    # Inicializar logging primero
    setup_logger(log_level="DEBUG")
    
    logger.info("=" * 50)
    logger.info("LIDOM Stats — Iniciando pipeline de datos")
    logger.info("=" * 50)
    
    # Ejecutar scraper principal
    scraper = LidomScraper()
    result = scraper.scrape(season="2024-2025")
    
    # Mostrar resultados
    if result.success:
        logger.success(f"Pipeline completado | {result.record_count} registros extraídos")
        for record in result.data:
            logger.info(f"  → {record}")
    else:
        logger.error(f"Pipeline falló | Errores: {result.errors}")


if __name__ == "__main__":
    main()