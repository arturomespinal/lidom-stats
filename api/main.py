# api/main.py — API REST LIDOM Stats
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

# Registrar flat_models en Base.metadata antes de init_db()
from src.models import flat_models  # noqa: F401
from src.models.database import get_engine, init_db

init_db()
engine = get_engine()

app = FastAPI(
    title="LIDOM Stats API",
    description="Estadísticas de la Liga de Béisbol Profesional Dominicana",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


def query_db(sql: str, params: dict = {}) -> list[dict]:
    with engine.connect() as conn:
        rows = conn.execute(text(sql), params).mappings().all()
    return [dict(r) for r in rows]


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    counts = {}
    for table in ["standings", "batting_stats", "pitching_stats"]:
        try:
            counts[table] = query_db(f"SELECT COUNT(*) as c FROM {table}")[0]["c"]
        except Exception:
            counts[table] = 0
    return {"status": "ok", "records": counts}


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
