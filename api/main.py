# api/main.py — API REST LIDOM Stats
from contextlib import asynccontextmanager

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

# Registrar flat_models en Base.metadata antes de init_db()
from src.models import flat_models  # noqa: F401
from src.models.database import get_engine, init_db

# Estado en vivo. El poller NO arranca solo: se enciende con la variable de
# entorno LIDOM_LIVE_POLLER=1, para que levantar la API a trabajar en los
# endpoints históricos no dispare tráfico contra la MLB API.
from api.live_routes import (
    router as live_router,
    maybe_start_poller,
    stop_poller,
)

init_db()
engine = get_engine()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Arranque y apagado. on_event está deprecado; esta es la forma actual."""
    maybe_start_poller()
    yield
    stop_poller()


app = FastAPI(
    title="LIDOM Stats API",
    description="Estadísticas de la Liga de Béisbol Profesional Dominicana",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

# Endpoints sobre el esquema de granularidad de juego. Van en su propio módulo
# y no comparten nada con los de abajo, que leen las tablas planas y son los
# que consumen el frontend y el mobile en producción.
from api.game_routes import router as game_router  # noqa: E402

app.include_router(game_router)

app.include_router(live_router)


def query_db(sql: str, params: dict = {}) -> list[dict]:
    with engine.connect() as conn:
        rows = conn.execute(text(sql), params).mappings().all()
    return [dict(r) for r in rows]


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    def count(table: str) -> int:
        try:
            return query_db(f"SELECT COUNT(*) as c FROM {table}")[0]["c"]
        except Exception:
            return 0

    # Las dos capas por separado: si una está vacía el diagnóstico es inmediato
    # y se sabe cuál de los dos ingestores falta correr.
    flat = {t: count(t) for t in ("standings", "batting_stats", "pitching_stats")}
    game_level = {
        t: count(t)
        for t in ("teams", "players", "seasons", "games",
                  "batting_lines", "pitching_lines")
    }

    return {
        "status": "ok",
        "records": flat,                 # se mantiene por compatibilidad
        "flat_tables": flat,
        "game_level": game_level,
        "ingest_hints": {
            "flat_tables": "python main.py ingest 2025",
            "game_level": "python main.py ingest-games 2025",
        },
    }


# ── Standings ─────────────────────────────────────────────────────────────────

@app.get("/standings")
def get_standings(season: str = Query("2025", description="Año de temporada")):
    rows = query_db(
        """
        SELECT team_id, team_name, wins, losses, win_loss_pct, games_back,
               games_played, runs_scored, runs_allowed, run_differential, team_url
        FROM standings
        WHERE season = :season
        ORDER BY wins DESC
        """,
        {"season": season},
    )
    if not rows:
        raise HTTPException(404, f"No hay standings para temporada {season}")
    return {"season": season, "count": len(rows), "data": rows}


# ── Batting ───────────────────────────────────────────────────────────────────

@app.get("/batting")
def get_batting(
    season: str = Query("2025"),
    team: str = Query(None, description="Filtrar por equipo (ej. LIC, AGU, EST)"),
    min_pa: int = Query(0, description="Mínimo de plate appearances"),
    sort_by: str = Query("ops", description="Campo para ordenar"),
    limit: int = Query(50, le=200),
):
    safe_sort = sort_by if sort_by in {
        "batting_avg", "on_base_pct", "slugging_pct", "ops",
        "home_runs", "rbi", "hits", "stolen_bases", "plate_appearances",
        "runs", "walks", "strikeouts", "games",
    } else "ops"

    team_filter = "AND team_id = :team" if team else ""
    sql = f"""
        SELECT player, team_id, games, plate_appearances, at_bats, runs,
               hits, doubles, triples, home_runs, rbi, stolen_bases,
               walks, strikeouts, batting_avg, on_base_pct, slugging_pct, ops
        FROM batting_stats
        WHERE season = :season
          AND plate_appearances >= :min_pa
          {team_filter}
        ORDER BY {safe_sort} DESC NULLS LAST
        LIMIT :limit
    """

    params: dict = {"season": season, "min_pa": min_pa, "limit": limit}
    if team:
        params["team"] = team

    rows = query_db(sql, params)
    if not rows:
        raise HTTPException(404, "No se encontraron datos de bateo")
    return {"season": season, "count": len(rows), "data": rows}


# ── Pitching ──────────────────────────────────────────────────────────────────

@app.get("/pitching")
def get_pitching(
    season: str = Query("2025"),
    team: str = Query(None),
    min_ip: float = Query(0.0, description="Mínimo de innings pitched"),
    sort_by: str = Query("era", description="Campo para ordenar"),
    limit: int = Query(50, le=200),
):
    asc_fields = {"era", "whip", "hits_per_nine", "walks_per_nine"}
    safe_sort = sort_by if sort_by in {
        "era", "whip", "strikeouts_per_nine", "walks_per_nine", "hits_per_nine",
        "innings_pitched", "strikeouts", "wins", "saves", "games",
    } else "era"
    order = "ASC" if safe_sort in asc_fields else "DESC"

    team_filter = "AND team_id = :team" if team else ""
    sql = f"""
        SELECT player, team_id, wins, losses, era, games, games_started,
               saves, innings_pitched, hits, earned_runs, walks, strikeouts,
               whip, strikeouts_per_nine, walks_per_nine
        FROM pitching_stats
        WHERE season = :season
          AND (innings_pitched IS NULL OR innings_pitched >= :min_ip)
          {team_filter}
        ORDER BY {safe_sort} {order} NULLS LAST
        LIMIT :limit
    """

    params: dict = {"season": season, "min_ip": min_ip, "limit": limit}
    if team:
        params["team"] = team

    rows = query_db(sql, params)
    if not rows:
        raise HTTPException(404, "No se encontraron datos de pitcheo")
    return {"season": season, "count": len(rows), "data": rows}


# ── Jugador individual ────────────────────────────────────────────────────────

@app.get("/player/{player_name}")
def get_player(player_name: str):
    batting = query_db(
        """
        SELECT season, team_id, games, batting_avg, on_base_pct,
               slugging_pct, ops, home_runs, rbi, stolen_bases
        FROM batting_stats
        WHERE LOWER(player) LIKE LOWER(:name)
        ORDER BY season DESC
        """,
        {"name": f"%{player_name}%"},
    )
    pitching = query_db(
        """
        SELECT season, team_id, wins, losses, era, games,
               innings_pitched, strikeouts, whip
        FROM pitching_stats
        WHERE LOWER(player) LIKE LOWER(:name)
        ORDER BY season DESC
        """,
        {"name": f"%{player_name}%"},
    )

    if not batting and not pitching:
        raise HTTPException(404, f"Jugador '{player_name}' no encontrado")

    return {"player": player_name, "batting": batting, "pitching": pitching}


# ── Temporadas disponibles ────────────────────────────────────────────────────

@app.get("/seasons")
def get_seasons():
    rows = query_db("SELECT DISTINCT season FROM standings ORDER BY season DESC")
    return {"seasons": [r["season"] for r in rows]}
