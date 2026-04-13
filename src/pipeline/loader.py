# src/pipeline/loader.py — ETL: transforma dicts del scraper → filas de DB
from sqlalchemy.orm import Session
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from src.models.database import Standing, BattingStats, PitchingStats, get_engine
from src.utils.logger import logger


def _safe_int(val) -> int | None:
    """Convierte a int ignorando vacíos y strings no numéricos."""
    try:
        return int(val) if val not in (None, "", "--") else None
    except (ValueError, TypeError):
        return None


def _safe_float(val) -> float | None:
    """Convierte a float ignorando vacíos."""
    try:
        return float(val) if val not in (None, "", "--") else None
    except (ValueError, TypeError):
        return None


def _transform_standing(record: dict) -> dict:
    """Transforma un dict raw de standing al esquema de DB."""
    pct_raw = record.get("win_loss_perc", "")
    gb_raw = record.get("games_back", "--")

    return {
        "season": record.get("season"),
        "team_id": record.get("team_ID", ""),
        "team_name": record.get("team_ID", ""),   # BR usa el mismo campo
        "wins": _safe_int(record.get("W")),
        "losses": _safe_int(record.get("L")),
        "win_loss_pct": _safe_float(pct_raw),
        "games_back": gb_raw,
        "team_url": record.get("team_url"),
        "source": record.get("source"),
    }


def _transform_batting(record: dict) -> dict:
    """Transforma un dict raw de batting al esquema de DB."""
    # Limpiar nombre: BR añade '*' (zurdo) y '#' (switch) al nombre
    player_name = record.get("player", "").replace("*", "").replace("#", "").strip()

    return {
        "season": record.get("season"),
        "player": player_name,
        "player_url": record.get("player_url"),
        "age": _safe_int(record.get("age")),
        "team_id": record.get("team_ID"),
        "games": _safe_int(record.get("G")),
        "plate_appearances": _safe_int(record.get("PA")),
        "at_bats": _safe_int(record.get("AB")),
        "runs": _safe_int(record.get("R")),
        "hits": _safe_int(record.get("H")),
        "doubles": _safe_int(record.get("2B")),
        "triples": _safe_int(record.get("3B")),
        "home_runs": _safe_int(record.get("HR")),
        "rbi": _safe_int(record.get("RBI")),
        "stolen_bases": _safe_int(record.get("SB")),
        "caught_stealing": _safe_int(record.get("CS")),
        "walks": _safe_int(record.get("BB")),
        "strikeouts": _safe_int(record.get("SO")),
        "batting_avg": _safe_float(record.get("batting_avg")),
        "on_base_pct": _safe_float(record.get("onbase_perc")),
        "slugging_pct": _safe_float(record.get("slugging_perc")),
        "ops": _safe_float(record.get("onbase_plus_slugging")),
        "total_bases": _safe_int(record.get("TB")),
        "gidp": _safe_int(record.get("GIDP")),
        "hbp": _safe_int(record.get("HBP")),
        "source": record.get("source"),
    }


def _transform_pitching(record: dict) -> dict:
    """Transforma un dict raw de pitching al esquema de DB."""
    player_name = record.get("player", "").replace("*", "").replace("#", "").strip()

    # IP viene como "23.2" — convertir a decimal real (23.2 = 23 + 2/3 innings)
    ip_raw = record.get("IP", "0")
    try:
        ip_parts = str(ip_raw).split(".")
        ip_decimal = int(ip_parts[0]) + (int(ip_parts[1]) / 3 if len(ip_parts) > 1 else 0)
    except (ValueError, IndexError):
        ip_decimal = None

    return {
        "season": record.get("season"),
        "player": player_name,
        "player_url": record.get("player_url"),
        "age": _safe_int(record.get("age")),
        "team_id": record.get("team_ID"),
        "wins": _safe_int(record.get("W")),
        "losses": _safe_int(record.get("L")),
        "win_loss_pct": _safe_float(record.get("win_loss_perc")),
        "era": _safe_float(record.get("earned_run_avg")),
        "games": _safe_int(record.get("G")),
        "games_started": _safe_int(record.get("GS")),
        "saves": _safe_int(record.get("SV")),
        "innings_pitched": ip_decimal,
        "hits": _safe_int(record.get("H")),
        "runs": _safe_int(record.get("R")),
        "earned_runs": _safe_int(record.get("ER")),
        "home_runs": _safe_int(record.get("HR")),
        "walks": _safe_int(record.get("BB")),
        "strikeouts": _safe_int(record.get("SO")),
        "whip": _safe_float(record.get("whip")),
        "strikeouts_per_nine": _safe_float(record.get("strikeouts_per_nine")),
        "walks_per_nine": _safe_float(record.get("bases_on_balls_per_nine")),
        "hits_per_nine": _safe_float(record.get("hits_per_nine")),
        "source": record.get("source"),
    }


# Mapa: record_type → (modelo, función de transformación)
TRANSFORMERS = {
    "standing": (Standing, _transform_standing),
    "batting_leader": (BattingStats, _transform_batting),
    "pitching_leader": (PitchingStats, _transform_pitching),
}


def load_to_db(records: list[dict], db_url: str = "sqlite:///data/lidom_stats.db") -> dict:
    """
    Carga lista de records raw a la base de datos.
    Usa INSERT OR REPLACE para ser idempotente — puedes correr múltiples
    veces sin duplicar datos.

    Returns:
        Resumen con conteo por tipo: {"standing": 6, "batting_leader": 77, ...}
    """
    engine = get_engine(db_url)
    summary = {"inserted": 0, "skipped": 0, "errors": 0}
    counts = {}

    with Session(engine) as session:
        for record in records:
            record_type = record.get("record_type")

            if record_type not in TRANSFORMERS:
                summary["skipped"] += 1
                continue

            Model, transform_fn = TRANSFORMERS[record_type]

            try:
                transformed = transform_fn(record)
                obj = Model(**transformed)
                # merge() = INSERT si no existe, UPDATE si ya existe
                session.merge(obj)
                summary["inserted"] += 1
                counts[record_type] = counts.get(record_type, 0) + 1

            except Exception as e:
                summary["errors"] += 1
                logger.warning(f"Error cargando {record_type}: {e} | data: {record}")

        session.commit()

    logger.info(f"✅ DB cargada | {summary}")
    for rtype, count in counts.items():
        logger.info(f"  → {rtype}: {count} registros")

    return summary


__all__ = ["load_to_db"]