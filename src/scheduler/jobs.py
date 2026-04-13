# src/scheduler/jobs.py
import time
from datetime import datetime
from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from src.scrapers.baseball_reference_scraper import BaseballReferenceScraper
from src.pipeline.loader import load_to_db
from src.storage.json_storage import save_result
from src.utils.logger import logger

# Temporada activa — actualizar cada inicio de temporada
CURRENT_SEASON = "2025"

# Meses de temporada LIDOM: octubre(10), noviembre(11), diciembre(12), enero(1)
SEASON_MONTHS = {10, 11, 12, 1}


def is_season_active() -> bool:
    """Retorna True si estamos en meses de temporada LIDOM."""
    return datetime.now().month in SEASON_MONTHS


def run_standings_update():
    """
    Job rápido: solo standings.
    Corre cada hora durante la temporada activa.
    Fuera de temporada se omite automáticamente.
    """
    if not is_season_active():
        logger.info("⏸ Temporada inactiva — standings update omitido")
        return

    logger.info("🔄 Job: Actualizando standings...")
    try:
        scraper = BaseballReferenceScraper()
        soup = scraper.get_soup(
            f"https://www.baseball-reference.com/register/league.cgi"
            f"?id={scraper._get_league_id(CURRENT_SEASON)}"
        )
        standings = scraper._parse_standings(soup, CURRENT_SEASON)
        if standings:
            load_to_db(standings)
            logger.info(f"✅ Standings actualizados: {len(standings)} equipos")
        else:
            logger.warning("⚠ No se obtuvieron standings")
    except Exception as e:
        logger.error(f"❌ Error en standings job: {e}")


def run_full_pipeline():
    """
    Job completo: standings + bateo + pitcheo.
    Corre una vez al día a las 6am hora dominicana.
    """
    logger.info("🔄 Job: Pipeline completo iniciado...")
    try:
        scraper = BaseballReferenceScraper()
        result = scraper.scrape(season=CURRENT_SEASON)

        if result.data:
            save_result(result.data, category=f"season_{CURRENT_SEASON}")
            summary = load_to_db(result.data)
            logger.info(f"✅ Pipeline completo | {summary}")
        else:
            logger.warning("⚠ Pipeline completó sin datos")

    except Exception as e:
        logger.error(f"❌ Error en pipeline completo: {e}")


def run_health_check():
    """
    Job de monitoreo: verifica que la DB tenga datos recientes.
    Corre cada 6 horas. Alerta si los datos tienen más de 24h.
    """
    from src.models.database import get_engine
    from sqlalchemy import text

    engine = get_engine()
    with engine.connect() as conn:
        result = conn.execute(
            text("SELECT MAX(scraped_at) FROM standings WHERE season = :s"),
            {"s": CURRENT_SEASON}
        ).scalar()

    if result:
        last_update = datetime.fromisoformat(str(result))
        hours_ago = (datetime.now() - last_update).total_seconds() / 3600
        if hours_ago > 24:
            logger.warning(f"⚠ HEALTH CHECK: datos con {hours_ago:.1f}h de antigüedad")
        else:
            logger.info(f"✅ Health check OK | Última actualización: {hours_ago:.1f}h atrás")
    else:
        logger.warning("⚠ HEALTH CHECK: no hay datos en DB")


def start_scheduler():
    """Configura e inicia el scheduler con todos los jobs."""
    scheduler = BlockingScheduler(timezone="America/Santo_Domingo")

    # ── Job 1: Standings cada hora (solo en temporada) ──────────────────────
    scheduler.add_job(
        run_standings_update,
        CronTrigger(
            hour="*",
            minute="0",
            timezone="America/Santo_Domingo"
        ),
        id="standings_hourly",
        name="Standings (cada hora)",
        max_instances=1,            # No ejecutar si el anterior sigue corriendo
        misfire_grace_time=300,     # Si se perdió el trigger, ejecutar si tiene <5min de retraso
    )

    # ── Job 2: Pipeline completo diario a las 6am ────────────────────────────
    scheduler.add_job(
        run_full_pipeline,
        CronTrigger(
            hour=6,
            minute=0,
            timezone="America/Santo_Domingo"
        ),
        id="full_pipeline_daily",
        name="Pipeline completo (6am diario)",
        max_instances=1,
        misfire_grace_time=3600,    # Si se perdió, ejecutar si tiene <1h de retraso
    )

    # ── Job 3: Health check cada 6 horas ────────────────────────────────────
    scheduler.add_job(
        run_health_check,
        IntervalTrigger(hours=6),
        id="health_check",
        name="Health Check (cada 6h)",
    )

    logger.info("=" * 50)
    logger.info("🗓  Scheduler LIDOM Stats iniciado")
    logger.info("=" * 50)
    for job in scheduler.get_jobs():
        logger.info(f"  ✓ {job.name}")
    logger.info("=" * 50)

    try:
        scheduler.start()
    except KeyboardInterrupt:
        logger.info("🛑 Scheduler detenido manualmente")
        scheduler.shutdown()