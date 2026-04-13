# src/api/main.py — API REST LIDOM Stats
from fastapi import FastAPI, Query, HTTPException
from sqlalchemy import text
from src.models.database import get_engine

app = FastAPI(
    title="LIDOM Stats API",
    description="Estadísticas de la Liga de Béisbol Profesional Dominicana",
    version="0.1.0",
)

engine = get_engine()


def query_db(sql: str, params: dict = {}) -> list[dict]:
    with engine.connect() as conn:
        rows = conn.execute(text(sql), params).mappings().all()
    return [dict(r) for r in rows]


# ── Health ───────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    counts = {}
    for table in ["standings", "batting_stats", "pitching_stats"]:
        counts[table] = query_db(f"SELECT COUNT(*) as c FROM {table}")[0]["c"]
    return {"status": "ok", "records": counts}


# ── Standings ─────────────────────────────────────────────────────────────────

@app.get("/standings")
def get_standings(season: str = Query("2025", description="Año de temporada")):
    rows = query_db(
        """
        SELECT team_id, team_name, wins, losses, win_loss_pct, games_back, team_url
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
    team: str = Query(None, description="Filtrar por equipo (ej. ESS, AGL)"),
    min_pa: int = Query(0, description="Mínimo de plate appearances"),
    sort_by: str = Query("batting_avg", description="Campo para ordenar"),
    limit: int = Query(20, le=100),
):
    sql = """
        SELECT player, team_id, age, games, plate_appearances, at_bats,
               hits, home_runs, rbi, stolen_bases, walks, strikeouts,
               batting_avg, on_base_pct, slugging_pct, ops, player_url
        FROM batting_stats
        WHERE season = :season
          AND plate_appearances >= :min_pa
          {team_filter}
        ORDER BY {sort_by} DESC NULLS LAST
        LIMIT :limit
    """
    team_filter = "AND team_id = :team" if team else ""
    sql = sql.format(team_filter=team_filter, sort_by=sort_by)

    params = {"season": season, "min_pa": min_pa, "limit": limit}
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
    limit: int = Query(20, le=100),
):
    # ERA y WHIP ordenan ASC (menor es mejor) — el resto DESC
    asc_fields = {"era", "whip", "hits_per_nine", "walks_per_nine"}
    order = "ASC" if sort_by in asc_fields else "DESC"

    sql = f"""
        SELECT player, team_id, age, wins, losses, era, games, games_started,
               saves, innings_pitched, strikeouts, walks, whip,
               strikeouts_per_nine, player_url
        FROM pitching_stats
        WHERE season = :season
          AND innings_pitched >= :min_ip
          {"AND team_id = :team" if team else ""}
        ORDER BY {sort_by} {order} NULLS LAST
        LIMIT :limit
    """

    params = {"season": season, "min_ip": min_ip, "limit": limit}
    if team:
        params["team"] = team

    rows = query_db(sql, params)
    if not rows:
        raise HTTPException(404, "No se encontraron datos de pitcheo")
    return {"season": season, "count": len(rows), "data": rows}


# ── Jugador individual ────────────────────────────────────────────────────────

@app.get("/player/{player_name}")
def get_player(player_name: str):
    """Historial completo de un jugador en todas las temporadas."""
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

    return {
        "player": player_name,
        "batting": batting,
        "pitching": pitching,
    }


# ── Temporadas disponibles ────────────────────────────────────────────────────

@app.get("/seasons")
def get_seasons():
    rows = query_db("SELECT DISTINCT season FROM standings ORDER BY season DESC")
    return {"seasons": [r["season"] for r in rows]}