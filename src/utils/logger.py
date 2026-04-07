# Configuración centralizada de logging usando Loguru.
# Loguru > logging estándar: sintaxis simple, colores, rotación de archivos.
from loguru import logger
import sys


def setup_logger(log_level: str = "DEBUG") -> None:
    """Configura el logger global del proyecto."""
    
    logger.remove()  # Elimina el handler por defecto de loguru
    
    # Handler para consola con colores
    logger.add(
        sys.stdout,
        level=log_level,
        format=(
            "<green>{time:YYYY-MM-DD HH:mm:ss}</green> | "
            "<level>{level: <8}</level> | "
            "<cyan>{name}</cyan>:<cyan>{line}</cyan> | "
            "<level>{message}</level>"
        ),
        colorize=True,
    )
    
    # Handler para archivo con rotación diaria
    logger.add(
        "logs/lidom_{time:YYYY-MM-DD}.log",
        level="INFO",
        rotation="1 day",      # Nuevo archivo cada día
        retention="30 days",   # Guarda los últimos 30 días
        compression="zip",     # Comprime logs viejos
        encoding="utf-8",
    )


# Exportar el logger para usar en todo el proyecto:
# from src.utils.logger import logger
__all__ = ["logger", "setup_logger"]