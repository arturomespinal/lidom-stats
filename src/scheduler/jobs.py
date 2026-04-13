# src/scheduler/jobs.py — Automatización del pipeline
from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger
from src.scrapers.lidom_scraper import LidomScraper, LIDOM_TEAMS
from src.storage.json_storage import save_result
from src.utils.logger import logger
import time

CURRENT_SEASON = "2025"


def run_standings_job():
    """Job: actualiza standings — corre cada hora durante la temporada."""
    logger.info("🔄 Job: Actualizando standings...")
    scraper = LidomScraper()
    result = scraper._scrape_standings(CURRENT_SEASON)  # solo standings, rápido
    save_result(result, category="standings")


def run_full_pipeline():
    """Job: pipeline completo — corre una vez al día (noche)."""
    logger.info("🔄 Job: Pipeline completo iniciado...")
    scraper = LidomScraper()
    result = scraper.scrape(season=CURRENT_SEASON)
    save_result(result.data, category="full")

    # Detalle por equipo
    for team_id in LIDOM_TEAMS:
        team_data = scraper.scrape_team_detail(team_id, CURRENT_SEASON)
        save_result(team_data, category=f"team_{team_id}")
        time.sleep(3)  # ético: 3s entre equipos


def start_scheduler():
    """Inicia el scheduler con los jobs configurados."""
    scheduler = BlockingScheduler(timezone="America/Santo_Domingo")

    # Standings: cada hora de 6pm a 11pm (hora dominicana, temporada activa)
    scheduler.add_job(
        run_standings_job,
        CronTrigger(hour="18-23", minute="0"),
        id="standings_hourly",
        name="Actualizar Standings",
    )

    # Pipeline completo: diario a las 2am
    scheduler.add_job(
        run_full_pipeline,
        CronTrigger(hour=2, minute=0),
        id="full_pipeline_daily",
        name="Pipeline Completo",
    )

    logger.info("✅ Scheduler iniciado | Jobs activos:")
    for job in scheduler.get_jobs():
        logger.info(f"  → {job.name} | Trigger: {job.trigger}")

    try:
        scheduler.start()
    except KeyboardInterrupt:
        logger.info("Scheduler detenido manualmente")