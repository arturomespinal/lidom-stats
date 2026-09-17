# api/main.py — API REST LIDOM Stats
from contextlib import asynccontextmanager

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

# Registrar flat_models en Base.metadata antes de init_db()
from src.models import flat_models  # noqa: F401
from src.models.database import get_engine, init_db
from src.qualification import qualifying_ip, qualifying_pa

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


def _season_team_games(season: str) -> int:
    """
    Juegos del equipo que más jugó en la temporada.

    Es la base del mínimo de calificación. Se toma el máximo y no el equipo de
    cada jugador: si no, alguien de un equipo con un juego suspendido tendría
    un listón más bajo que el resto de la liga.
    """
    rows = query_db(
        "SELECT MAX(games_played) AS g FROM standings WHERE season = :s",
        {"s": season},
    )
    return (rows[0]["g"] or 0) if rows else 0


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

    # El games_back que guarda la tabla NO es distancia al líder: la MLB API lo
    # entrega respecto al cuarto puesto, que en LIDOM es la línea de
    # clasificación al round robin. Se ve en los datos — el "-" cae en el 4to,
    # no en el 1ro, y el líder aparece con valor negativo.
    #
    # Es un dato útil, incluso más relevante para un fanático que el GB
    # tradicional, pero una columna "GB" en una tabla de posiciones significa
    # otra cosa. Así que calculamos el de verdad desde G-P y conservamos el de
    # la API con un nombre honesto.
    leader = rows[0]
    for row in rows:
        gb = ((leader["wins"] - row["wins"]) + (row["losses"] - leader["losses"])) / 2
        row["playoff_games_back"] = row["games_back"]
        # "-" en el líder: es lo que los clientes ya saben pintar como guion.
        row["games_back"] = "-" if gb <= 0 else f"{gb:.1f}"

    return {"season": season, "count": len(rows), "data": rows}


# ── Batting ───────────────────────────────────────────────────────────────────

@app.get("/batting")
def get_batting(
    season: str = Query("2025"),
    team: str = Query(None, description="Filtrar por equipo (ej. LIC, AGU, EST)"),
    min_pa: int = Query(None, description="Mínimo de apariciones al plato; si se omite se calcula"),
    qualified: bool = Query(True, description="Aplica el mínimo en las tablas de tasa"),
    sort_by: str = Query("ops", description="Campo para ordenar"),
    limit: int = Query(50, le=200),
):
    safe_sort = sort_by if sort_by in {
        "batting_avg", "on_base_pct", "slugging_pct", "ops",
        "home_runs", "rbi", "hits", "stolen_bases", "plate_appearances",
        "runs", "walks", "strikeouts", "games",
    } else "ops"

    # Sin mínimo, quien batea de 1-1 encabeza el promedio con 1.000 y la tabla
    # deja de significar algo. Solo aplica a las tasas: nadie exige un mínimo
    # para liderar jonrones. Un min_pa explícito manda siempre.
    applies = qualified and safe_sort in {
        "batting_avg", "on_base_pct", "slugging_pct", "ops",
    }
    if min_pa is None:
        min_pa = qualifying_pa(_season_team_games(season)) if applies else 0

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
    return {"season": season, "sort_by": safe_sort, "min_pa": min_pa,
            "qualification_applied": applies, "count": len(rows), "data": rows}


# ── Pitching ──────────────────────────────────────────────────────────────────

@app.get("/pitching")
def get_pitching(
    season: str = Query("2025"),
    team: str = Query(None),
    min_ip: float = Query(None, description="Mínimo de entradas lanzadas; si se omite se calcula"),
    qualified: bool = Query(True, description="Aplica el mínimo en las tablas de tasa"),
    sort_by: str = Query("era", description="Campo para ordenar"),
    limit: int = Query(50, le=200),
):
    asc_fields = {"era", "whip", "hits_per_nine", "walks_per_nine"}
    safe_sort = sort_by if sort_by in {
        "era", "whip", "strikeouts_per_nine", "walks_per_nine", "hits_per_nine",
        "innings_pitched", "strikeouts", "wins", "saves", "games",
    } else "era"
    order = "ASC" if safe_sort in asc_fields else "DESC"

    # Mismo criterio que en bateo: el mínimo es para las tasas. Sin él, 24 de
    # los 32 lanzadores con efectividad 0.00 lanzaron menos de 5 entradas y la
    # tabla de líderes se llena de apariciones de un tercio de inning.
    applies = qualified and safe_sort in {
        "era", "whip", "strikeouts_per_nine", "walks_per_nine", "hits_per_nine",
    }
    if min_ip is None:
        min_ip = qualifying_ip(_season_team_games(season)) if applies else 0.0

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
    return {"season": season, "sort_by": safe_sort, "min_ip": min_ip,
            "qualification_applied": applies, "count": len(rows), "data": rows}


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
