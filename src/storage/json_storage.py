# src/storage/json_storage.py — Persistencia simple (paso previo a DB)
import json
import os
from datetime import datetime
from src.utils.logger import logger


def save_result(data: list[dict], category: str = "general") -> str:
    """
    Guarda resultados del scraper en JSON estructurado.
    
    Estructura:
        data/raw/{category}/YYYY-MM-DD_{category}.json
    
    Args:
        data: Lista de registros a guardar
        category: Categoría del dato (standings, team_01, full, etc.)
    
    Returns:
        Ruta del archivo guardado
    """
    today = datetime.now().strftime("%Y-%m-%d")
    output_dir = f"data/raw/{category}"
    os.makedirs(output_dir, exist_ok=True)

    filepath = f"{output_dir}/{today}_{category}.json"

    # Si el archivo ya existe hoy, lo sobreescribe (última versión del día)
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(
            {
                "scraped_at": datetime.now().isoformat(),
                "category": category,
                "record_count": len(data),
                "data": data,
            },
            f,
            ensure_ascii=False,
            indent=2,
        )

    logger.info(f"💾 Guardado: {filepath} | {len(data)} registros")
    return filepath