"""
api/game_routes.py — Endpoints sobre el esquema de granularidad de juego.

Separado de api/main.py a propósito: los endpoints de main.py leen las tablas
planas y sirven al frontend y al mobile en producción. Estos leen games,
batting_lines, pitching_lines y las vistas agregadas. Las dos capas nacen de
la misma API por caminos independientes, así que se validan entre sí — ver la
sección "Validación cruzada" de CLAUDE.md.

Convenciones heredadas de main.py:
    - SQL crudo parametrizado vía query_db
    - campos de ordenamiento en lista blanca (nunca interpolar entrada del
      usuario en un ORDER BY)
    - envoltorio {..., count, data} y 404 cuando no hay filas
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import text

from src.carrera import carrera_bateo, carrera_pitcheo, edad, equipos_de_la_carrera
from src.constants import LIDOM_TEAMS, LIDOM_TEAMS_BY_CODE
from src.lateralidad import anotar_lateralidad
from src.models.database import get_engine
from src.qualification import qualifying_ip, qualifying_pa

router = APIRouter()
engine = get_engine()

# Códigos de equipo válidos: los validamos contra la constante en vez de
# confiar en que la query no devuelva nada, para poder dar un 400 claro.
TEAM_CODES = {info["team_code"] for info in LIDOM_TEAMS.values()}

# Los mínimos viven en src/qualification.py porque los comparten estos
# endpoints y los de tablas planas de api/main.py. Duplicarlos garantizaría que
# un día muestren líderes distintos.


def query_db(sql: str, params: dict | None = None) -> list[dict]:
    with engine.connect() as conn:
        rows = conn.execute(text(sql), params or {}).mappings().all()
    return [dict(r) for r in rows]


def normalize_season_id(season: str) -> str:
    """
    Acepta "2025" o "2025-26" y devuelve siempre el season_id del esquema.

    Los endpoints viejos usan el string crudo de la MLB API ("2025"), así que
    quien venga del frontend va a pasar eso. Traducimos en vez de obligar al
    cliente a conocer la diferencia.
    """
    season = season.strip()
    if "-" in season:
        return season
    try:
        year = int(season)
    except ValueError:
        raise HTTPException(400, f"Temporada inválida: '{season}'")
    return f"{year}-{str(year + 1)[-2:]}"


def validate_team(code: str | None, field: str = "team") -> str | None:
    if code is None:
        return None
    code = code.upper()
    if code not in TEAM_CODES:
        raise HTTPException(
            400, f"{field} '{code}' no es un equipo LIDOM. Válidos: {sorted(TEAM_CODES)}"
        )
    return code


def team_games_played(season_id: str, team_code: str) -> int:
    """Juegos disputados por un equipo — la base del mínimo de calificación."""
    rows = query_db(
        "SELECT games_played FROM v_standings WHERE season_id = :s AND team_code = :t",
        {"s": season_id, "t": team_code},
    )
    return rows[0]["games_played"] if rows else 0


def season_games_played(season_id: str) -> int:
    """
    Juegos del equipo que más jugó en la temporada.

    Para una tabla de líderes de toda la liga el mínimo se calcula sobre el
    calendario completo, no sobre el equipo de cada jugador; si no, un jugador
    de un equipo con un juego suspendido tendría un listón más bajo.
    """
    rows = query_db(
        "SELECT MAX(games_played) AS g FROM v_standings WHERE season_id = :s",
        {"s": season_id},
    )
    return (rows[0]["g"] or 0) if rows else 0


# ─────────────────────────────────────────────────────────────────────────────
# Juegos
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/games", tags=["Juegos"])
def list_games(
    season: str = Query("2025", description='"2025" o "2025-26"'),
    team: str | None = Query(None, description="Filtra juegos de un equipo (local o visitante)"),
    opponent: str | None = Query(None, description="Requiere team; restringe al rival"),
    stage: str | None = Query(None, description="regular, round_robin, semifinal, final, serie_caribe"),
    status: str | None = Query(None, description="final, scheduled, live, postponed, cancelled"),
    date_from: str | None = Query(None, description="YYYY-MM-DD inclusive"),
    date_to: str | None = Query(None, description="YYYY-MM-DD inclusive"),
    order: str = Query("desc", description="asc o desc por fecha"),
    limit: int = Query(50, le=500),
    offset: int = Query(0, ge=0),
):
    """Listado de juegos. Sin filtros devuelve los más recientes de la temporada."""
    season_id = normalize_season_id(season)
    team = validate_team(team, "team")
    opponent = validate_team(opponent, "opponent")

    if opponent and not team:
        raise HTTPException(400, "opponent requiere que también envíes team")
    if opponent and opponent == team:
        raise HTTPException(400, "team y opponent no pueden ser el mismo equipo")

    where = ["g.season_id = :season_id"]
    params: dict = {"season_id": season_id, "limit": limit, "offset": offset}

    if team:
        where.append("(g.home_team_code = :team OR g.away_team_code = :team)")
        params["team"] = team
    if opponent:
        where.append("(g.home_team_code = :opp OR g.away_team_code = :opp)")
        params["opp"] = opponent
    if stage:
        where.append("g.stage = :stage")
        params["stage"] = stage
    if status:
        where.append("g.status = :status")
        params["status"] = status
    if date_from:
        where.append("g.game_date >= :date_from")
        params["date_from"] = date_from
    if date_to:
        where.append("g.game_date <= :date_to")
        params["date_to"] = date_to

    direction = "ASC" if order.lower() == "asc" else "DESC"
    clause = " AND ".join(where)

    total = query_db(f"SELECT COUNT(*) AS c FROM games g WHERE {clause}", params)[0]["c"]

    rows = query_db(
        f"""
        SELECT g.game_id, g.game_date, g.game_datetime_utc,
               g.away_team_code, ta.full_name AS away_team_name, g.away_score,
               g.home_team_code, th.full_name AS home_team_name, g.home_score,
               g.innings_played, g.stage, g.status, g.venue,
               CASE
                   WHEN g.status <> 'final' THEN NULL
                   WHEN g.home_score > g.away_score THEN g.home_team_code
                   WHEN g.away_score > g.home_score THEN g.away_team_code
                   ELSE NULL
               END AS winner_team_code
        FROM games g
        JOIN teams th ON th.team_code = g.home_team_code
        JOIN teams ta ON ta.team_code = g.away_team_code
        WHERE {clause}
        ORDER BY g.game_date {direction}, g.game_id {direction}
        LIMIT :limit OFFSET :offset
        """,
        params,
    )
    if not rows:
        raise HTTPException(404, f"No hay juegos para temporada {season_id} con esos filtros")

    return {
        "season_id": season_id,
        "total": total,
        "count": len(rows),
        "offset": offset,
        "data": rows,
    }


@router.get("/games/{game_id}", tags=["Juegos"])
def get_game(game_id: str):
    """Boxscore completo de un juego: las dos alineaciones con sus líneas."""
    games = query_db(
        """
        SELECT g.game_id, g.season_id, g.game_date, g.game_datetime_utc,
               g.away_team_code, ta.full_name AS away_team_name, g.away_score,
               g.home_team_code, th.full_name AS home_team_name, g.home_score,
               g.innings_played, g.stage, g.status, g.venue, g.attendance,
               g.source, g.source_url
        FROM games g
        JOIN teams th ON th.team_code = g.home_team_code
        JOIN teams ta ON ta.team_code = g.away_team_code
        WHERE g.game_id = :gid
        """,
        {"gid": game_id},
    )
    if not games:
        raise HTTPException(404, f"Juego '{game_id}' no encontrado")
    game = games[0]

    batting = query_db(
        """
        SELECT bl.team_code, bl.batting_order, bl.position,
               p.player_id, p.full_name,
               bl.plate_appearances, bl.at_bats, bl.runs, bl.hits,
               bl.doubles, bl.triples, bl.home_runs, bl.rbi,
               bl.walks, bl.strikeouts, bl.hit_by_pitch,
               bl.stolen_bases, bl.caught_stealing, bl.left_on_base
        FROM batting_lines bl
        JOIN players p ON p.player_id = bl.player_id
        WHERE bl.game_id = :gid
        ORDER BY bl.batting_order NULLS LAST, p.full_name
        """,
        {"gid": game_id},
    )
    pitching = query_db(
        """
        SELECT pl.team_code, pl.pitching_order, pl.is_starter, pl.decision,
               p.player_id, p.full_name,
               pl.outs_recorded,
               ROUND(pl.outs_recorded / 3.0, 1) AS innings_pitched,
               pl.batters_faced, pl.pitches_thrown, pl.strikes,
               pl.hits_allowed, pl.runs_allowed, pl.earned_runs,
               pl.home_runs_allowed, pl.walks_allowed, pl.strikeouts,
               pl.hit_batters, pl.wild_pitches
        FROM pitching_lines pl
        JOIN players p ON p.player_id = pl.player_id
        WHERE pl.game_id = :gid
        ORDER BY pl.pitching_order NULLS LAST, p.full_name
        """,
        {"gid": game_id},
    )

    if not batting and not pitching:
        # El juego existe en el calendario pero no se le ingestó el boxscore
        # (pospuesto, cancelado, o aún sin procesar).
        return {"game": game, "boxscore_available": False,
                "home": {"batting": [], "pitching": []},
                "away": {"batting": [], "pitching": []}}

    def by_team(rows: list[dict], code: str) -> list[dict]:
        return [r for r in rows if r["team_code"] == code]

    return {
        "game": game,
        "boxscore_available": True,
        "home": {
            "team_code": game["home_team_code"],
            "batting": by_team(batting, game["home_team_code"]),
            "pitching": by_team(pitching, game["home_team_code"]),
        },
        "away": {
            "team_code": game["away_team_code"],
            "batting": by_team(batting, game["away_team_code"]),
            "pitching": by_team(pitching, game["away_team_code"]),
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# Jugadores
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/players/search", tags=["Jugadores"])
def search_players(
    q: str = Query(..., min_length=2, description="Parte del nombre"),
    limit: int = Query(20, le=100),
):
    """
    Busca por nombre y devuelve player_id.

    Va antes de /players/{player_id} en el archivo a propósito: FastAPI resuelve
    las rutas en orden de declaración, y si el path dinámico se registrara
    primero, "search" entraría como un player_id.
    """
    rows = query_db(
        """
        SELECT p.player_id, p.full_name, p.birth_date, p.bats, p.throws,
               p.nationality, p.mlb_id,
               (SELECT GROUP_CONCAT(DISTINCT bl.team_code)
                  FROM batting_lines bl WHERE bl.player_id = p.player_id) AS batting_teams,
               (SELECT GROUP_CONCAT(DISTINCT pl.team_code)
                  FROM pitching_lines pl WHERE pl.player_id = p.player_id) AS pitching_teams
        FROM players p
        WHERE LOWER(p.full_name) LIKE LOWER(:q)
        ORDER BY p.full_name
        LIMIT :limit
        """,
        {"q": f"%{q}%", "limit": limit},
    )
    if not rows:
        raise HTTPException(404, f"Ningún jugador coincide con '{q}'")
    return {"query": q, "count": len(rows), "data": [anotar_lateralidad(r) for r in rows]}


@router.get("/players/{player_id}", tags=["Jugadores"])
def get_player_profile(player_id: str):
    """Perfil biográfico + temporadas agregadas desde las vistas."""
    players = query_db(
        """
        SELECT player_id, full_name, birth_date, bats, throws, nationality,
               height_cm, weight_kg, mlb_id
        FROM players WHERE player_id = :pid
        """,
        {"pid": player_id},
    )
    if not players:
        raise HTTPException(404, f"Jugador '{player_id}' no encontrado")

    batting = query_db(
        """
        SELECT season_id, team_code, games, games_batted, pa, ab, h, doubles,
               triples, hr, r, rbi, bb, so, sb, hbp, sf, avg, obp, slg,
               ROUND(obp + slg, 3) AS ops
        FROM v_batting_season WHERE player_id = :pid
        ORDER BY season_id DESC, team_code
        """,
        {"pid": player_id},
    )
    pitching = query_db(
        """
        SELECT season_id, team_code, games, games_started, wins, losses, saves,
               innings_pitched, outs, h, er, so, bb, era, whip
        FROM v_pitching_season WHERE player_id = :pid
        ORDER BY season_id DESC, team_code
        """,
        {"pid": player_id},
    )

    # La edad y los totales se componen aquí, no en el cliente. Promediar los
    # promedios de cada temporada da un número plausible y equivocado —ver la
    # cabecera de src/carrera.py— y tenerlo mal en dos plataformas distintas,
    # cada una a su manera, es peor que tenerlo mal en una.
    bio = anotar_lateralidad(players[0])
    bio["age"] = edad(bio.get("birth_date"))

    return {
        # Con `bats_label` y `throws_label` ya compuestos: ver src/lateralidad.py.
        "player": bio,
        "batting": batting,
        "pitching": pitching,
        "career_batting": carrera_bateo(batting),
        "career_pitching": carrera_pitcheo(pitching),
        "teams": equipos_de_la_carrera(batting, pitching),
        "is_pitcher": bool(pitching),
    }


@router.get("/players/{player_id}/gamelog", tags=["Jugadores"])
def get_player_gamelog(
    player_id: str,
    season: str = Query("2025"),
    limit: int = Query(50, le=200),
):
    """Juego por juego — lo que las tablas planas no pueden dar."""
    season_id = normalize_season_id(season)
    exists = query_db("SELECT 1 FROM players WHERE player_id = :pid", {"pid": player_id})
    if not exists:
        raise HTTPException(404, f"Jugador '{player_id}' no encontrado")

    batting = query_db(
        """
        SELECT g.game_id, g.game_date, bl.team_code,
               CASE WHEN g.home_team_code = bl.team_code
                    THEN g.away_team_code ELSE g.home_team_code END AS opponent,
               CASE WHEN g.home_team_code = bl.team_code THEN 'home' ELSE 'away' END AS side,
               bl.batting_order, bl.position, bl.plate_appearances, bl.at_bats,
               bl.runs, bl.hits, bl.doubles, bl.triples, bl.home_runs, bl.rbi,
               bl.walks, bl.strikeouts, bl.stolen_bases
        FROM batting_lines bl
        JOIN games g ON g.game_id = bl.game_id
        WHERE bl.player_id = :pid AND g.season_id = :season_id
        ORDER BY g.game_date DESC LIMIT :limit
        """,
        {"pid": player_id, "season_id": season_id, "limit": limit},
    )
    pitching = query_db(
        """
        SELECT g.game_id, g.game_date, pl.team_code,
               CASE WHEN g.home_team_code = pl.team_code
                    THEN g.away_team_code ELSE g.home_team_code END AS opponent,
               pl.is_starter, pl.decision,
               ROUND(pl.outs_recorded / 3.0, 1) AS innings_pitched,
               pl.hits_allowed, pl.runs_allowed, pl.earned_runs,
               pl.walks_allowed, pl.strikeouts, pl.pitches_thrown
        FROM pitching_lines pl
        JOIN games g ON g.game_id = pl.game_id
        WHERE pl.player_id = :pid AND g.season_id = :season_id
        ORDER BY g.game_date DESC LIMIT :limit
        """,
        {"pid": player_id, "season_id": season_id, "limit": limit},
    )

    if not batting and not pitching:
        raise HTTPException(404, f"Sin juegos de '{player_id}' en {season_id}")

    return {"player_id": player_id, "season_id": season_id,
            "batting": batting, "pitching": pitching}


# ─────────────────────────────────────────────────────────────────────────────
# Tablas de líderes
# ─────────────────────────────────────────────────────────────────────────────

BATTING_SORTS = {
    "avg", "obp", "slg", "ops", "hr", "rbi", "h", "r", "bb", "so", "sb",
    "ab", "pa", "doubles", "triples", "games",
}
# Menor es mejor en estas
BATTING_ASC = {"so"}

PITCHING_SORTS = {
    "era", "whip", "so", "bb", "wins", "losses", "saves", "innings_pitched",
    "h", "er", "games", "games_started",
    "strikeouts_per_nine", "walks_per_nine",
}
PITCHING_ASC = {"era", "whip", "bb", "h", "er", "losses", "walks_per_nine"}

# El mínimo de calificación existe para las estadísticas de TASA, donde pocas
# apariciones inflan el número: sin él, quien batea 1-de-1 encabeza el promedio.
# En las acumuladas no aplica — nadie exige un mínimo para liderar jonrones o
# ponches, porque el propio acumulado ya premia haber jugado.
BATTING_RATE_STATS = {"avg", "obp", "slg", "ops"}
PITCHING_RATE_STATS = {"era", "whip", "strikeouts_per_nine", "walks_per_nine"}


@router.get("/leaderboards/batting", tags=["Líderes"])
def leaderboard_batting(
    season: str = Query("2025"),
    team: str | None = Query(None),
    sort_by: str = Query("avg"),
    qualified: bool = Query(True, description="Aplica el mínimo de 3.1 PA por juego de equipo"),
    min_pa: int | None = Query(None, description="Sobrescribe el mínimo de calificación"),
    limit: int = Query(25, le=200),
):
    season_id = normalize_season_id(season)
    team = validate_team(team)

    sort = sort_by if sort_by in BATTING_SORTS else "avg"
    direction = "ASC" if sort in BATTING_ASC else "DESC"
    # OPS no existe como columna en la vista; se arma aquí.
    sort_expr = "(obp + slg)" if sort == "ops" else sort

    # min_pa explícito manda siempre. Si no viene, solo calificamos cuando el
    # orden es por tasa: una tabla de jonrones no lleva mínimo.
    applies = qualified and sort in BATTING_RATE_STATS
    if min_pa is None:
        min_pa = qualifying_pa(season_games_played(season_id)) if applies else 0

    params: dict = {"season_id": season_id, "min_pa": min_pa, "limit": limit}
    team_filter = ""
    if team:
        team_filter = "AND team_code = :team"
        params["team"] = team

    rows = query_db(
        f"""
        SELECT player_id, full_name, team_code, games, games_batted, pa, ab, h,
               doubles, triples, hr, r, rbi, bb, so, sb, avg, obp, slg,
               ROUND(obp + slg, 3) AS ops
        FROM v_batting_season
        WHERE season_id = :season_id AND pa >= :min_pa {team_filter}
        ORDER BY {sort_expr} {direction} NULLS LAST
        LIMIT :limit
        """,
        params,
    )
    if not rows:
        raise HTTPException(404, f"Sin líderes de bateo para {season_id}")

    return {"season_id": season_id, "sort_by": sort, "min_pa": min_pa,
            "qualification_applied": applies, "count": len(rows), "data": rows}


@router.get("/leaderboards/pitching", tags=["Líderes"])
def leaderboard_pitching(
    season: str = Query("2025"),
    team: str | None = Query(None),
    sort_by: str = Query("era"),
    qualified: bool = Query(True, description="Aplica el mínimo de 1 IP por juego de equipo"),
    min_ip: float | None = Query(None, description="Sobrescribe el mínimo de calificación"),
    limit: int = Query(25, le=200),
):
    season_id = normalize_season_id(season)
    team = validate_team(team)

    sort = sort_by if sort_by in PITCHING_SORTS else "era"
    direction = "ASC" if sort in PITCHING_ASC else "DESC"

    applies = qualified and sort in PITCHING_RATE_STATS
    if min_ip is None:
        min_ip = qualifying_ip(season_games_played(season_id)) if applies else 0.0

    params: dict = {"season_id": season_id, "min_ip": min_ip, "limit": limit}
    team_filter = ""
    if team:
        team_filter = "AND team_code = :team"
        params["team"] = team

    rows = query_db(
        f"""
        SELECT player_id, full_name, team_code, games, games_started,
               wins, losses, saves, innings_pitched, h, er, so, bb, era, whip,
               -- K/9 y BB/9 se calculan aquí y no se guardan: son tasas, y la
               -- regla 3 del proyecto es que los agregados salen de la vista.
               CASE WHEN innings_pitched > 0
                    THEN ROUND(so * 9.0 / innings_pitched, 2) END AS strikeouts_per_nine,
               CASE WHEN innings_pitched > 0
                    THEN ROUND(bb * 9.0 / innings_pitched, 2) END AS walks_per_nine
        FROM v_pitching_season
        WHERE season_id = :season_id AND innings_pitched >= :min_ip {team_filter}
        ORDER BY {sort} {direction} NULLS LAST
        LIMIT :limit
        """,
        params,
    )
    if not rows:
        raise HTTPException(404, f"Sin líderes de pitcheo para {season_id}")

    return {"season_id": season_id, "sort_by": sort, "min_ip": min_ip,
            "qualification_applied": applies, "count": len(rows), "data": rows}


# ─────────────────────────────────────────────────────────────────────────────
# Equipos
# ─────────────────────────────────────────────────────────────────────────────


# ─────────────────────────────────────────────────────────────────────────────
# Destacados de un equipo
# ─────────────────────────────────────────────────────────────────────────────

# Qué se considera "los mejores" de un equipo. La lista es declarativa para que
# añadir una categoría sea una línea y no un bloque de código más.
#
# La columna `tasa` decide si se aplica el mínimo de calificación, y sigue la
# regla 10 de CLAUDE.md al pie de la letra: el mínimo existe para las tasas,
# donde pocas apariciones inflan el número —de 1-1 se batea 1.000—, y NO para
# las acumuladas, porque nadie exige un mínimo para liderar jonrones. Aplicarlo
# a los jonrones escondería al suplente que conectó seis en treinta turnos, que
# es justo el tipo de dato que la gente abre una ficha para encontrar.
LIDERES_BATEO = [
    # (campo, etiqueta, mayor_es_mejor, es_tasa)
    ("hr", "Jonrones", True, False),
    ("rbi", "Impulsadas", True, False),
    ("sb", "Robadas", True, False),
    ("avg", "Promedio", True, True),
    ("ops", "OPS", True, True),
]

LIDERES_PITCHEO = [
    ("wins", "Ganados", True, False),
    ("saves", "Salvados", True, False),
    ("so", "Ponches", True, False),
    ("era", "Efectividad", False, True),
    ("whip", "WHIP", False, True),
]


def _lider(filas: list[dict], campo: str, mayor_es_mejor: bool) -> dict | None:
    """El mejor de `filas` en `campo`, o None si nadie tiene el dato.

    El desempate es por el propio valor y luego por nombre: sin un criterio
    estable, dos jugadores empatados en 8 jonrones se alternarían en la ficha
    de una carga a otra según el orden que devolviera SQLite.
    """
    candidatos = sorted(
        (f for f in filas if f.get(campo) is not None), key=lambda f: f["full_name"]
    )
    if not candidatos:
        return None
    # max() y min() devuelven el PRIMER extremo que encuentran, así que ordenar
    # por nombre antes convierte el empate en alfabético en vez de dejarlo al
    # orden que devuelva SQLite.
    mejor = (max if mayor_es_mejor else min)(candidatos, key=lambda f: f[campo])
    return {
        "player_id": mejor["player_id"],
        "full_name": mejor["full_name"],
        "value": mejor[campo],
    }


def destacados_del_equipo(
    bateadores: list[dict], lanzadores: list[dict], juegos_equipo: int
) -> dict:
    """Los líderes del equipo en cada categoría, listos para pintar.

    Se calcula en el servidor y no en el cliente por la misma razón que los
    totales de carrera: son dos plataformas, y un criterio de calificación
    implementado dos veces es un criterio que un día diverge.
    """
    min_pa = qualifying_pa(juegos_equipo)
    min_ip = qualifying_ip(juegos_equipo)

    calificados_bat = [f for f in bateadores if (f.get("pa") or 0) >= min_pa]
    # El mínimo de pitcheo se compara en OUTS y no en las entradas ya
    # redondeadas: `innings_pitched` viene a un decimal, y 29.96 entradas se
    # muestra como 30.0 pero no alcanza el listón de 30.
    calificados_pit = [f for f in lanzadores if (f.get("outs") or 0) >= min_ip * 3]

    def bloque(filas_todas, filas_calificadas, definiciones):
        salida = []
        for campo, etiqueta, mayor, es_tasa in definiciones:
            fuente = filas_calificadas if es_tasa else filas_todas
            lider = _lider(fuente, campo, mayor)
            if lider:
                salida.append({"stat": campo, "label": etiqueta, "qualified": es_tasa, **lider})
        return salida

    return {
        "batting": bloque(bateadores, calificados_bat, LIDERES_BATEO),
        "pitching": bloque(lanzadores, calificados_pit, LIDERES_PITCHEO),
        "qualified_batters": len(calificados_bat),
        "qualified_pitchers": len(calificados_pit),
    }


@router.get("/teams/{team_code}", tags=["Equipos"])
def team_profile(
    team_code: str,
    season: str = Query("2025", description="Temporada de la plantilla"),
    roster_limit: int = Query(30, ge=1, le=60),
):
    """Perfil del equipo: historial por temporada, plantilla y líderes.

    El historial sale de `games` y no de la tabla plana `standings` por un
    motivo concreto: la plana guarda el agregado que devuelve /stats, mientras
    que esto se calcula juego a juego y de paso deja salir el diferencial de
    carreras por temporada, que la plana no trae.

    Va en UNA respuesta y no en tres endpoints porque la pantalla los pinta
    juntos: partirlo obligaría al cliente a encadenar tres viajes para dibujar
    una sola vista.
    """
    team = validate_team(team_code, "team_code")
    season_id = normalize_season_id(season)

    # Historial completo, una fila por temporada. Los forfeits quedan fuera
    # (status != 'final'); es la deuda documentada en CLAUDE.md.
    historial = query_db(
        """
        SELECT g.season_id,
               COUNT(*) AS games_played,
               SUM(CASE WHEN (g.home_team_code = :team AND g.home_score > g.away_score)
                          OR (g.away_team_code = :team AND g.away_score > g.home_score)
                        THEN 1 ELSE 0 END) AS wins,
               SUM(CASE WHEN (g.home_team_code = :team AND g.home_score < g.away_score)
                          OR (g.away_team_code = :team AND g.away_score < g.home_score)
                        THEN 1 ELSE 0 END) AS losses,
               SUM(CASE WHEN g.home_team_code = :team THEN g.home_score
                        ELSE g.away_score END) AS runs_for,
               SUM(CASE WHEN g.home_team_code = :team THEN g.away_score
                        ELSE g.home_score END) AS runs_against
        FROM games g
        WHERE g.status = 'final' AND g.stage = 'regular'
          AND (g.home_team_code = :team OR g.away_team_code = :team)
        GROUP BY g.season_id
        ORDER BY g.season_id DESC
        """,
        {"team": team},
    )
    for fila in historial:
        jugados = fila["wins"] + fila["losses"]
        # El porcentaje se divide por G+P, no por juegos jugados: un empate
        # —raro pero posible en invernal— no debe contar como medio juego.
        fila["win_pct"] = round(fila["wins"] / jugados, 3) if jugados else None
        fila["run_diff"] = (fila["runs_for"] or 0) - (fila["runs_against"] or 0)

    # Sin LIMIT en el SQL, a propósito: los destacados se calculan sobre la
    # plantilla COMPLETA. Sacarlos de una lista ya recortada a los 30 de más
    # uso daría un líder de bases robadas equivocado el día que el corredor
    # emergente del equipo sea el 31ro en apariciones. Un equipo-temporada son
    # unas 45 filas, así que el LIMIT no ahorraba nada; el recorte se aplica
    # después, solo a lo que se muestra.
    plantilla = query_db(
        """
        SELECT player_id, full_name, games, games_batted, pa, ab, h, hr, rbi,
               sb, bb, so, avg, obp, slg, ROUND(obp + slg, 3) AS ops
        FROM v_batting_season
        WHERE team_code = :team AND season_id = :season_id
        ORDER BY pa DESC
        """,
        {"team": team, "season_id": season_id},
    )
    cuerpo = query_db(
        """
        SELECT player_id, full_name, games, games_started, wins, losses, saves,
               innings_pitched, outs, so, bb, era, whip
        FROM v_pitching_season
        WHERE team_code = :team AND season_id = :season_id
        ORDER BY innings_pitched DESC
        """,
        {"team": team, "season_id": season_id},
    )

    if not historial and not plantilla:
        raise HTTPException(404, f"No hay datos del equipo {team}")

    # El mínimo se calcula sobre los juegos que jugó ESTE equipo ESA temporada
    # —con la misma función que usan las tablas de líderes de la liga— y no
    # sobre un 50 fijo: 2020-21 y 2021-22 fueron campañas recortadas por la
    # pandemia, de 91 y 120 juegos.
    juegos_equipo = team_games_played(season_id, team)
    destacados = destacados_del_equipo(plantilla, cuerpo, juegos_equipo)

    info = LIDOM_TEAMS_BY_CODE.get(team, {})
    return {
        "team_code": team,
        "team_name": info.get("full_name", team),
        "short_name": info.get("short_name", team),
        "city": info.get("city"),
        "founded_year": info.get("founded_year"),
        "season_id": season_id,
        "history": historial,
        "seasons_count": len(historial),
        "team_games": juegos_equipo,
        "min_pa": qualifying_pa(juegos_equipo),
        "min_ip": qualifying_ip(juegos_equipo),
        "leaders": destacados,
        "batters": plantilla[:roster_limit],
        "pitchers": cuerpo[:roster_limit],
    }


@router.get("/teams/{team_code}/h2h/{opponent_code}", tags=["Equipos"])
def head_to_head(
    team_code: str,
    opponent_code: str,
    season: str | None = Query(None, description="Omitir para el historial completo"),
):
    """Historial entre dos equipos, con el desglose de local y visitante."""
    team = validate_team(team_code, "team_code")
    opponent = validate_team(opponent_code, "opponent_code")
    if team == opponent:
        raise HTTPException(400, "Los dos equipos no pueden ser el mismo")

    params: dict = {"team": team, "opp": opponent}
    season_filter = ""
    if season:
        params["season_id"] = normalize_season_id(season)
        season_filter = "AND g.season_id = :season_id"

    summary = query_db(
        f"""
        SELECT
            COUNT(*) AS games_played,
            SUM(CASE WHEN (g.home_team_code = :team AND g.home_score > g.away_score)
                       OR (g.away_team_code = :team AND g.away_score > g.home_score)
                     THEN 1 ELSE 0 END) AS wins,
            SUM(CASE WHEN (g.home_team_code = :team AND g.home_score < g.away_score)
                       OR (g.away_team_code = :team AND g.away_score < g.home_score)
                     THEN 1 ELSE 0 END) AS losses,
            SUM(CASE WHEN g.home_team_code = :team THEN g.home_score
                     ELSE g.away_score END) AS runs_for,
            SUM(CASE WHEN g.home_team_code = :team THEN g.away_score
                     ELSE g.home_score END) AS runs_against
        FROM games g
        WHERE g.status = 'final'
          AND ((g.home_team_code = :team AND g.away_team_code = :opp)
            OR (g.home_team_code = :opp AND g.away_team_code = :team))
          {season_filter}
        """,
        params,
    )[0]

    if not summary["games_played"]:
        raise HTTPException(404, f"Sin juegos entre {team} y {opponent}")

    split = query_db(
        f"""
        SELECT
            CASE WHEN g.home_team_code = :team THEN 'home' ELSE 'away' END AS side,
            COUNT(*) AS games_played,
            SUM(CASE WHEN (g.home_team_code = :team AND g.home_score > g.away_score)
                       OR (g.away_team_code = :team AND g.away_score > g.home_score)
                     THEN 1 ELSE 0 END) AS wins
        FROM games g
        WHERE g.status = 'final'
          AND ((g.home_team_code = :team AND g.away_team_code = :opp)
            OR (g.home_team_code = :opp AND g.away_team_code = :team))
          {season_filter}
        GROUP BY side
        """,
        params,
    )

    games = query_db(
        f"""
        SELECT g.game_id, g.game_date, g.season_id, g.stage,
               g.away_team_code, g.away_score, g.home_team_code, g.home_score
        FROM games g
        WHERE g.status = 'final'
          AND ((g.home_team_code = :team AND g.away_team_code = :opp)
            OR (g.home_team_code = :opp AND g.away_team_code = :team))
          {season_filter}
        ORDER BY g.game_date DESC
        """,
        params,
    )

    return {
        "team": team,
        "opponent": opponent,
        "season_id": params.get("season_id"),
        "summary": summary,
        "split": {row["side"]: row for row in split},
        "count": len(games),
        "games": games,
    }


__all__ = ["router"]
