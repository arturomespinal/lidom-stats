"""
src/models/database.py — Esquema canónico LIDOM Stats con granularidad de juego.
 
Filosofía del diseño:
    1. Tablas dimensionales (teams, players, seasons) son catálogos estables.
    2. Tablas de hecho (games, batting_lines, pitching_lines) guardan eventos atómicos.
    3. Stats agregadas (AVG, OBP, ERA, WHIP) NO se guardan — se calculan con SELECT
       en vistas o queries on-demand. Si guardas el agregado, garantizas
       inconsistencias en cuanto reproceses un juego.
 
Convenciones:
    - team_code es la PK canónica de equipo (LIC, AGU, ESC, GIG, EST, TOR).
    - player_id es slug interno determinístico ("juan-soto-1998-10-25").
    - mlb_id y *_external_id permiten cruce con MLB Stats API y portal LIDOM.
    - Todas las PK compuestas garantizan idempotencia ante re-scraping.
    - Todos los TIMESTAMPs en UTC; conversión a hora dominicana solo en presentación.
"""
 
from __future__ import annotations
 
from datetime import datetime, date
from typing import Optional
 
from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    create_engine,
    event,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
 
from src.utils.logger import logger
 
 
class Base(DeclarativeBase):
    """Base declarativa para todos los modelos."""
    pass
 
 
# ─────────────────────────────────────────────────────────────────────────────
# DIMENSIONALES (catálogos)
# ─────────────────────────────────────────────────────────────────────────────
 
 
class Team(Base):
    """
    Catálogo canónico de equipos LIDOM.
 
    team_code es el identificador interno estable. Las columnas *_external_id
    permiten cruce con fuentes externas:
        - lidom_external_id: "01"–"09" del portal estadisticas.lidom.com
        - br_external_id: "AGL", "ESS", etc. de Baseball-Reference
    """
 
    __tablename__ = "teams"
 
    # PK canónica: código de 3 letras, en mayúsculas. Estable a través del tiempo.
    team_code: Mapped[str] = mapped_column(String(3), primary_key=True)
 
    full_name: Mapped[str] = mapped_column(String(100), nullable=False)
    short_name: Mapped[Optional[str]] = mapped_column(String(50))
    city: Mapped[Optional[str]] = mapped_column(String(50))
    founded_year: Mapped[Optional[int]] = mapped_column(Integer)
    primary_color: Mapped[Optional[str]] = mapped_column(String(7))  # hex "#RRGGBB"
 
    # IDs externos para cross-reference
    lidom_external_id: Mapped[Optional[str]] = mapped_column(String(10), unique=True)
    br_external_id: Mapped[Optional[str]] = mapped_column(String(10), unique=True)
 
    is_active: Mapped[bool] = mapped_column(default=True)
 
    # Relaciones inversas
    home_games = relationship(
        "Game", foreign_keys="Game.home_team_code", back_populates="home_team"
    )
    away_games = relationship(
        "Game", foreign_keys="Game.away_team_code", back_populates="away_team"
    )
 
 
class Player(Base):
    """
    Catálogo de jugadores. Un jugador es único globalmente — sus estadísticas
    por temporada/equipo viven en batting_lines / pitching_lines.
    """
 
    __tablename__ = "players"
 
    # Slug determinístico: "juan-soto-1998-10-25" (nombre + birth_date si disponible)
    player_id: Mapped[str] = mapped_column(String(80), primary_key=True)
 
    full_name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    birth_date: Mapped[Optional[date]] = mapped_column(Date)
    # Los DOS admiten 'S' (switch). Lo de `throws` no es teórico: Anthony
    # Seigler lanza con las dos manos. Traducir estos códigos a español se hace
    # en src/lateralidad.py, nunca en el cliente.
    bats: Mapped[Optional[str]] = mapped_column(String(1))    # 'L', 'R', 'S'
    throws: Mapped[Optional[str]] = mapped_column(String(1))  # 'L', 'R', 'S'
    nationality: Mapped[str] = mapped_column(String(3), default="DOM")
    height_cm: Mapped[Optional[int]] = mapped_column(Integer)
    weight_kg: Mapped[Optional[int]] = mapped_column(Integer)
 
    # Cross-reference para enriquecimiento
    mlb_id: Mapped[Optional[int]] = mapped_column(Integer, unique=True, index=True)
    lidom_external_id: Mapped[Optional[str]] = mapped_column(String(20), index=True)
    br_external_id: Mapped[Optional[str]] = mapped_column(String(20), index=True)
 
 
class Season(Base):
    """
    Metadata de una temporada. season_id es "YYYY-YY" (ej. "2024-25") porque
    la temporada LIDOM cruza el cambio de año.
    """
 
    __tablename__ = "seasons"
 
    season_id: Mapped[str] = mapped_column(String(7), primary_key=True)  # "2024-25"
 
    short_label: Mapped[str] = mapped_column(String(7), nullable=False)
    start_date: Mapped[Optional[date]] = mapped_column(Date)
    end_date: Mapped[Optional[date]] = mapped_column(Date)
    champion_team_code: Mapped[Optional[str]] = mapped_column(
        String(3), ForeignKey("teams.team_code")
    )
 
    # Configuración estructural (varía año a año)
    regular_season_games: Mapped[Optional[int]] = mapped_column(Integer, default=50)
    teams_count: Mapped[Optional[int]] = mapped_column(Integer, default=6)
 
 
# ─────────────────────────────────────────────────────────────────────────────
# HECHOS (events) — granularidad de juego
# ─────────────────────────────────────────────────────────────────────────────
 
 
class Game(Base):
    """
    Un juego individual de LIDOM. Esta es la tabla de hecho principal.
 
    game_id es un slug determinístico: "2024-10-15-LIC-AGU-1"
    (fecha + away + home + número secuencial por si hay doblete)
    """
 
    __tablename__ = "games"
 
    game_id: Mapped[str] = mapped_column(String(40), primary_key=True)
 
    season_id: Mapped[str] = mapped_column(
        String(7), ForeignKey("seasons.season_id"), nullable=False, index=True
    )
    game_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    game_datetime_utc: Mapped[Optional[datetime]] = mapped_column(DateTime)
 
    home_team_code: Mapped[str] = mapped_column(
        String(3), ForeignKey("teams.team_code"), nullable=False, index=True
    )
    away_team_code: Mapped[str] = mapped_column(
        String(3), ForeignKey("teams.team_code"), nullable=False, index=True
    )
 
    home_score: Mapped[Optional[int]] = mapped_column(Integer)
    away_score: Mapped[Optional[int]] = mapped_column(Integer)
    innings_played: Mapped[Optional[int]] = mapped_column(Integer, default=9)
 
    # Etapa: 'regular', 'round_robin', 'semifinal', 'final', 'serie_caribe'
    stage: Mapped[str] = mapped_column(String(20), default="regular", index=True)
    # Estado: 'scheduled', 'live', 'final', 'postponed', 'suspended'
    status: Mapped[str] = mapped_column(String(20), default="scheduled")
 
    venue: Mapped[Optional[str]] = mapped_column(String(100))
    attendance: Mapped[Optional[int]] = mapped_column(Integer)
 
    # Tracking de fuente
    source: Mapped[Optional[str]] = mapped_column(String(50))
    source_url: Mapped[Optional[str]] = mapped_column(Text)
    scraped_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
 
    # Relaciones
    home_team = relationship(
        "Team", foreign_keys=[home_team_code], back_populates="home_games"
    )
    away_team = relationship(
        "Team", foreign_keys=[away_team_code], back_populates="away_games"
    )
    batting_lines = relationship(
        "BattingLine", back_populates="game", cascade="all, delete-orphan"
    )
    pitching_lines = relationship(
        "PitchingLine", back_populates="game", cascade="all, delete-orphan"
    )
 
    __table_args__ = (
        # Búsquedas comunes: "todos los juegos del Licey en oct-2024"
        Index("ix_games_season_date", "season_id", "game_date"),
        Index("ix_games_home_season", "home_team_code", "season_id"),
        Index("ix_games_away_season", "away_team_code", "season_id"),
    )
 
 
class BattingLine(Base):
    """
    Línea de bateo de UN jugador en UN juego.
 
    NO guardamos AVG/OBP/SLG/OPS — se calculan al vuelo con SELECT.
    Esto evita inconsistencias cuando reprocesamos un juego.
    """
 
    __tablename__ = "batting_lines"
 
    # PK compuesta garantiza idempotencia: re-scrapear el mismo juego sobreescribe
    game_id: Mapped[str] = mapped_column(
        String(40),
        ForeignKey("games.game_id", ondelete="CASCADE"),
        primary_key=True,
    )
    player_id: Mapped[str] = mapped_column(
        String(80), ForeignKey("players.player_id"), primary_key=True
    )
 
    # Equipo del jugador EN ese juego (puede cambiar de equipo mid-season)
    team_code: Mapped[str] = mapped_column(
        String(3), ForeignKey("teams.team_code"), nullable=False, index=True
    )
 
    # Contexto del juego
    batting_order: Mapped[Optional[int]] = mapped_column(Integer)
    position: Mapped[Optional[str]] = mapped_column(String(5))
 
    # Stats atómicas — todas Integer porque se cuentan
    plate_appearances: Mapped[int] = mapped_column(Integer, default=0)
    at_bats: Mapped[int] = mapped_column(Integer, default=0)
    runs: Mapped[int] = mapped_column(Integer, default=0)
    hits: Mapped[int] = mapped_column(Integer, default=0)
    doubles: Mapped[int] = mapped_column(Integer, default=0)
    triples: Mapped[int] = mapped_column(Integer, default=0)
    home_runs: Mapped[int] = mapped_column(Integer, default=0)
    rbi: Mapped[int] = mapped_column(Integer, default=0)
    walks: Mapped[int] = mapped_column(Integer, default=0)
    intentional_walks: Mapped[int] = mapped_column(Integer, default=0)
    strikeouts: Mapped[int] = mapped_column(Integer, default=0)
    hit_by_pitch: Mapped[int] = mapped_column(Integer, default=0)
    sacrifice_flies: Mapped[int] = mapped_column(Integer, default=0)
    sacrifice_bunts: Mapped[int] = mapped_column(Integer, default=0)
    stolen_bases: Mapped[int] = mapped_column(Integer, default=0)
    caught_stealing: Mapped[int] = mapped_column(Integer, default=0)
    grounded_into_dp: Mapped[int] = mapped_column(Integer, default=0)
    left_on_base: Mapped[int] = mapped_column(Integer, default=0)
 
    game = relationship("Game", back_populates="batting_lines")
 
    __table_args__ = (
        # Búsqueda más común: "todas las apariciones de X en una temporada"
        Index("ix_batting_player", "player_id"),
        Index("ix_batting_team", "team_code"),
    )
 
 
class PitchingLine(Base):
    """
    Línea de pitcheo de UN lanzador en UN juego.
    """
 
    __tablename__ = "pitching_lines"
 
    game_id: Mapped[str] = mapped_column(
        String(40),
        ForeignKey("games.game_id", ondelete="CASCADE"),
        primary_key=True,
    )
    player_id: Mapped[str] = mapped_column(
        String(80), ForeignKey("players.player_id"), primary_key=True
    )
    team_code: Mapped[str] = mapped_column(
        String(3), ForeignKey("teams.team_code"), nullable=False, index=True
    )
 
    # Rol del lanzador en ese juego
    is_starter: Mapped[bool] = mapped_column(default=False)
    pitching_order: Mapped[Optional[int]] = mapped_column(Integer)  # 1=abridor
    decision: Mapped[Optional[str]] = mapped_column(String(2))
    # decision: 'W', 'L', 'SV', 'HLD', 'BS', 'ND'
 
    # IP almacenados como OUTS (entero) para evitar el lío de
    # ".1" = 1/3 y ".2" = 2/3. Conversión en queries: outs / 3.0
    outs_recorded: Mapped[int] = mapped_column(Integer, default=0)
 
    # Stats atómicas
    batters_faced: Mapped[int] = mapped_column(Integer, default=0)
    pitches_thrown: Mapped[Optional[int]] = mapped_column(Integer)
    strikes: Mapped[Optional[int]] = mapped_column(Integer)
    hits_allowed: Mapped[int] = mapped_column(Integer, default=0)
    runs_allowed: Mapped[int] = mapped_column(Integer, default=0)
    earned_runs: Mapped[int] = mapped_column(Integer, default=0)
    home_runs_allowed: Mapped[int] = mapped_column(Integer, default=0)
    walks_allowed: Mapped[int] = mapped_column(Integer, default=0)
    intentional_walks_allowed: Mapped[int] = mapped_column(Integer, default=0)
    strikeouts: Mapped[int] = mapped_column(Integer, default=0)
    hit_batters: Mapped[int] = mapped_column(Integer, default=0)
    wild_pitches: Mapped[int] = mapped_column(Integer, default=0)
    balks: Mapped[int] = mapped_column(Integer, default=0)
 
    game = relationship("Game", back_populates="pitching_lines")
 
    __table_args__ = (
        Index("ix_pitching_player", "player_id"),
        Index("ix_pitching_team", "team_code"),
    )
 
 
# ─────────────────────────────────────────────────────────────────────────────
# Vistas SQL — agregaciones on-demand
# ─────────────────────────────────────────────────────────────────────────────
 
VIEW_STATEMENTS = {
    "v_batting_season": """
        CREATE VIEW IF NOT EXISTS v_batting_season AS
        SELECT
            bl.player_id,
            p.full_name,
            g.season_id,
            bl.team_code,
            -- games sigue la convención oficial: cuenta CUALQUIER aparición,
            -- incluidos corredores emergentes y sustitutos defensivos que
            -- nunca pasaron al plato.
            COUNT(DISTINCT bl.game_id)                 AS games,
            -- games_batted excluye esas apariciones. Es el filtro correcto
            -- para tablas de líderes, donde un corredor emergente con 0 turnos
            -- no debería contar como juego disputado.
            COUNT(DISTINCT CASE WHEN bl.plate_appearances > 0
                                THEN bl.game_id END)   AS games_batted,
            SUM(bl.plate_appearances)                  AS pa,
            SUM(bl.at_bats)                            AS ab,
            SUM(bl.hits)                               AS h,
            SUM(bl.doubles)                            AS doubles,
            SUM(bl.triples)                            AS triples,
            SUM(bl.home_runs)                          AS hr,
            SUM(bl.runs)                               AS r,
            SUM(bl.rbi)                                AS rbi,
            SUM(bl.walks)                              AS bb,
            SUM(bl.strikeouts)                         AS so,
            SUM(bl.stolen_bases)                       AS sb,
            -- hbp y sf se exponen aunque casi ninguna pantalla los pinte: sin
            -- ellos no se puede recomponer el OBP de la CARRERA, porque el
            -- denominador es (AB + BB + HBP + SF) y promediar los OBP de cada
            -- temporada no da el mismo número. Ver src/carrera.py.
            SUM(bl.hit_by_pitch)                       AS hbp,
            SUM(bl.sacrifice_flies)                    AS sf,
            -- AVG = H / AB
            CASE WHEN SUM(bl.at_bats) > 0
                THEN ROUND(CAST(SUM(bl.hits) AS REAL) / SUM(bl.at_bats), 3)
                ELSE 0
            END AS avg,
            -- OBP = (H + BB + HBP) / (AB + BB + HBP + SF)
            CASE WHEN (SUM(bl.at_bats) + SUM(bl.walks) + SUM(bl.hit_by_pitch) + SUM(bl.sacrifice_flies)) > 0
                THEN ROUND(
                    CAST(SUM(bl.hits) + SUM(bl.walks) + SUM(bl.hit_by_pitch) AS REAL) /
                    (SUM(bl.at_bats) + SUM(bl.walks) + SUM(bl.hit_by_pitch) + SUM(bl.sacrifice_flies)),
                    3)
                ELSE 0
            END AS obp,
            -- SLG = TB / AB ; TB = singles + 2*2B + 3*3B + 4*HR
            CASE WHEN SUM(bl.at_bats) > 0
                THEN ROUND(
                    CAST(
                        (SUM(bl.hits) - SUM(bl.doubles) - SUM(bl.triples) - SUM(bl.home_runs))
                        + 2 * SUM(bl.doubles)
                        + 3 * SUM(bl.triples)
                        + 4 * SUM(bl.home_runs)
                    AS REAL) / SUM(bl.at_bats),
                    3)
                ELSE 0
            END AS slg
        FROM batting_lines bl
        JOIN games   g ON g.game_id   = bl.game_id
        JOIN players p ON p.player_id = bl.player_id
        GROUP BY bl.player_id, g.season_id, bl.team_code
    """,
    "v_pitching_season": """
        CREATE VIEW IF NOT EXISTS v_pitching_season AS
        SELECT
            pl.player_id,
            p.full_name,
            g.season_id,
            pl.team_code,
            COUNT(DISTINCT pl.game_id)                            AS games,
            SUM(CASE WHEN pl.is_starter THEN 1 ELSE 0 END)        AS games_started,
            SUM(CASE WHEN pl.decision = 'W' THEN 1 ELSE 0 END)    AS wins,
            SUM(CASE WHEN pl.decision = 'L' THEN 1 ELSE 0 END)    AS losses,
            SUM(CASE WHEN pl.decision = 'SV' THEN 1 ELSE 0 END)   AS saves,
            ROUND(CAST(SUM(pl.outs_recorded) AS REAL) / 3.0, 1)   AS innings_pitched,
            -- Los outs en crudo, además de las entradas. `innings_pitched` va
            -- redondeado a un decimal y sumar catorce valores redondeados
            -- arrastra error; la ERA de la carrera se calcula sobre esto.
            SUM(pl.outs_recorded)                                 AS outs,
            SUM(pl.hits_allowed)                                  AS h,
            SUM(pl.earned_runs)                                   AS er,
            SUM(pl.strikeouts)                                    AS so,
            SUM(pl.walks_allowed)                                 AS bb,
            -- ERA = (ER * 9) / IP. En outs: (ER * 27) / outs
            CASE WHEN SUM(pl.outs_recorded) > 0
                THEN ROUND(CAST(SUM(pl.earned_runs) * 27 AS REAL) / SUM(pl.outs_recorded), 2)
                ELSE NULL
            END AS era,
            -- WHIP = (BB + H) / IP. En outs: (BB + H) * 3 / outs
            CASE WHEN SUM(pl.outs_recorded) > 0
                THEN ROUND(CAST((SUM(pl.walks_allowed) + SUM(pl.hits_allowed)) * 3 AS REAL) / SUM(pl.outs_recorded), 2)
                ELSE NULL
            END AS whip
        FROM pitching_lines pl
        JOIN games   g ON g.game_id   = pl.game_id
        JOIN players p ON p.player_id = pl.player_id
        GROUP BY pl.player_id, g.season_id, pl.team_code
    """,
    "v_standings": """
        CREATE VIEW IF NOT EXISTS v_standings AS
        WITH game_results AS (
            SELECT
                season_id,
                home_team_code AS team_code,
                CASE WHEN home_score > away_score THEN 1 ELSE 0 END AS win,
                CASE WHEN home_score < away_score THEN 1 ELSE 0 END AS loss,
                home_score AS runs_for,
                away_score AS runs_against
            FROM games
            WHERE status = 'final' AND stage = 'regular'
            UNION ALL
            SELECT
                season_id,
                away_team_code AS team_code,
                CASE WHEN away_score > home_score THEN 1 ELSE 0 END AS win,
                CASE WHEN away_score < home_score THEN 1 ELSE 0 END AS loss,
                away_score AS runs_for,
                home_score AS runs_against
            FROM games
            WHERE status = 'final' AND stage = 'regular'
        )
        SELECT
            gr.season_id,
            gr.team_code,
            t.full_name                                       AS team_name,
            COUNT(*)                                          AS games_played,
            SUM(gr.win)                                       AS wins,
            SUM(gr.loss)                                      AS losses,
            ROUND(CAST(SUM(gr.win) AS REAL) / COUNT(*), 3)    AS win_loss_pct,
            SUM(gr.runs_for)                                  AS runs_for,
            SUM(gr.runs_against)                              AS runs_against,
            SUM(gr.runs_for) - SUM(gr.runs_against)           AS run_differential
        FROM game_results gr
        JOIN teams t ON t.team_code = gr.team_code
        GROUP BY gr.season_id, gr.team_code
        ORDER BY gr.season_id DESC, win_loss_pct DESC
    """,
}
 
 
# ─────────────────────────────────────────────────────────────────────────────
# Engine y bootstrapping
# ─────────────────────────────────────────────────────────────────────────────
 
 
def get_engine(db_url: str = "sqlite:///data/lidom_stats.db"):
    """
    Crea engine SQLAlchemy. Habilita foreign keys en SQLite (off por default).
    """
    engine = create_engine(db_url, echo=False)
 
    # SQLite no enforce FKs por default — hay que activarlo en cada conexión.
    # Esto es crítico: sin PRAGMA foreign_keys=ON, los ON DELETE CASCADE no aplican.
    if db_url.startswith("sqlite"):
 
        @event.listens_for(engine, "connect")
        def _enable_fk(dbapi_conn, _):
            cursor = dbapi_conn.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()
 
    return engine
 
 
def init_db(db_url: str = "sqlite:///data/lidom_stats.db"):
    """Crea tablas, índices y vistas si no existen. Idempotente."""
    engine = get_engine(db_url)
    Base.metadata.create_all(engine)
 
    # Crear vistas DESPUÉS de las tablas (dependen de las tablas).
    #
    # DROP antes de CREATE a propósito: con "CREATE VIEW IF NOT EXISTS" una
    # base que ya existe conserva la definición vieja para siempre, así que
    # cambiar el SQL de una vista aquí no tendría ningún efecto y quedarías
    # leyendo columnas obsoletas sin ningún aviso. Las vistas no guardan datos
    # —son solo SELECT guardados— así que recrearlas en cada arranque no
    # cuesta nada y garantiza que reflejen este archivo.
    with engine.connect() as conn:
        for view_name, sql in VIEW_STATEMENTS.items():
            conn.execute(text(f"DROP VIEW IF EXISTS {view_name}"))
            conn.execute(text(sql))
            logger.debug(f"Vista recreada: {view_name}")
        conn.commit()
 
    logger.info(f"✅ DB inicializada: {db_url}")
    return engine
 
 
__all__ = [
    "Base",
    "Team",
    "Player",
    "Season",
    "Game",
    "BattingLine",
    "PitchingLine",
    "get_engine",
    "init_db",
    "VIEW_STATEMENTS",
]