# src/models/database.py — primary keys compuestas para idempotencia real
from sqlalchemy import create_engine, Column, String, Integer, Float, DateTime, Index
from sqlalchemy.orm import DeclarativeBase, Session
from datetime import datetime
from src.utils.logger import logger


class Base(DeclarativeBase):
    pass


class Standing(Base):
    __tablename__ = "standings"

    # PK compuesta: season + team — garantiza un registro único por equipo/temporada
    season  = Column(String, primary_key=True)
    team_id = Column(String, primary_key=True)
    team_name    = Column(String)
    wins         = Column(Integer)
    losses       = Column(Integer)
    win_loss_pct = Column(Float)
    games_back   = Column(String)
    team_url     = Column(String)
    source       = Column(String, default="baseball_reference")
    scraped_at   = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    __table_args__ = (
        Index("ix_standings_season", "season"),
    )


class BattingStats(Base):
    __tablename__ = "batting_stats"

    # PK compuesta: season + player + team_id
    # (un jugador puede jugar para dos equipos en la misma temporada)
    season   = Column(String, primary_key=True)
    player   = Column(String, primary_key=True)
    team_id  = Column(String, primary_key=True)
    player_url         = Column(String)
    age                = Column(Integer)
    games              = Column(Integer)
    plate_appearances  = Column(Integer)
    at_bats            = Column(Integer)
    runs               = Column(Integer)
    hits               = Column(Integer)
    doubles            = Column(Integer)
    triples            = Column(Integer)
    home_runs          = Column(Integer)
    rbi                = Column(Integer)
    stolen_bases       = Column(Integer)
    caught_stealing    = Column(Integer)
    walks              = Column(Integer)
    strikeouts         = Column(Integer)
    batting_avg        = Column(Float)
    on_base_pct        = Column(Float)
    slugging_pct       = Column(Float)
    ops                = Column(Float)
    total_bases        = Column(Integer)
    gidp               = Column(Integer)
    hbp                = Column(Integer)
    source             = Column(String, default="baseball_reference")
    scraped_at         = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    __table_args__ = (
        Index("ix_batting_season", "season"),
        Index("ix_batting_player", "player"),
    )


class PitchingStats(Base):
    __tablename__ = "pitching_stats"

    season   = Column(String, primary_key=True)
    player   = Column(String, primary_key=True)
    team_id  = Column(String, primary_key=True)
    player_url          = Column(String)
    age                 = Column(Integer)
    wins                = Column(Integer)
    losses              = Column(Integer)
    win_loss_pct        = Column(Float)
    era                 = Column(Float)
    games               = Column(Integer)
    games_started       = Column(Integer)
    saves               = Column(Integer)
    innings_pitched     = Column(Float)
    hits                = Column(Integer)
    runs                = Column(Integer)
    earned_runs         = Column(Integer)
    home_runs           = Column(Integer)
    walks               = Column(Integer)
    strikeouts          = Column(Integer)
    whip                = Column(Float)
    strikeouts_per_nine = Column(Float)
    walks_per_nine      = Column(Float)
    hits_per_nine       = Column(Float)
    source              = Column(String, default="baseball_reference")
    scraped_at          = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    __table_args__ = (
        Index("ix_pitching_season", "season"),
        Index("ix_pitching_player", "player"),
    )


def get_engine(db_url: str = "sqlite:///data/lidom_stats.db"):
    return create_engine(db_url, echo=False)


def init_db(db_url: str = "sqlite:///data/lidom_stats.db"):
    engine = get_engine(db_url)
    # ❌ Base.metadata.drop_all(engine)  ← ELIMINAR esta línea
    Base.metadata.create_all(engine)     # Solo crea si no existen
    logger.info(f"✅ DB inicializada: {db_url}")
    return engine


__all__ = ["Standing", "BattingStats", "PitchingStats", "init_db", "get_engine", "Base"]