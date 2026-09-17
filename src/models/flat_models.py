"""
src/models/flat_models.py — Tablas planas de stats agregadas por temporada.

Diseño:
    PKs compuestas garantizan idempotencia: session.merge() actualiza si ya
    existe el par (season, team_id) o (season, mlb_player_id), inserta si no.

    Estas tablas son la capa de presentación que consume la API REST.
    Las stats calculadas (AVG, ERA, WHIP) se almacenan aquí porque vienen
    ya calculadas desde el endpoint /stats de la MLB API — no las calculamos
    nosotros, así que no hay riesgo de inconsistencia al reprocesar.
"""

from __future__ import annotations

from sqlalchemy import Column, Float, Index, Integer, String

from src.models.database import Base


class Standing(Base):
    __tablename__ = "standings"

    season = Column(String(10), primary_key=True)
    team_id = Column(String(10), primary_key=True)

    team_name = Column(String(100))
    wins = Column(Integer)
    losses = Column(Integer)
    games_played = Column(Integer)
    win_loss_pct = Column(Float)
    games_back = Column(String(10))
    runs_scored = Column(Integer)
    runs_allowed = Column(Integer)
    run_differential = Column(Integer)
    team_url = Column(String(200))
    source = Column(String(50), default="mlb_api")


class BattingStats(Base):
    __tablename__ = "batting_stats"

    season = Column(String(10), primary_key=True)
    mlb_player_id = Column(Integer, primary_key=True)

    player = Column(String(100), nullable=False)
    player_url = Column(String(200))
    team_id = Column(String(10))
    age = Column(Integer)  # No disponible en /stats — siempre NULL
    games = Column(Integer)
    plate_appearances = Column(Integer)
    at_bats = Column(Integer)
    runs = Column(Integer)
    hits = Column(Integer)
    doubles = Column(Integer)
    triples = Column(Integer)
    home_runs = Column(Integer)
    rbi = Column(Integer)
    stolen_bases = Column(Integer)
    caught_stealing = Column(Integer)
    walks = Column(Integer)
    strikeouts = Column(Integer)
    batting_avg = Column(Float)
    on_base_pct = Column(Float)
    slugging_pct = Column(Float)
    ops = Column(Float)
    source = Column(String(50), default="mlb_api")

    __table_args__ = (
        Index("ix_batting_stats_player", "player"),
        Index("ix_batting_stats_team_season", "team_id", "season"),
    )


class PitchingStats(Base):
    __tablename__ = "pitching_stats"

    season = Column(String(10), primary_key=True)
    mlb_player_id = Column(Integer, primary_key=True)

    player = Column(String(100), nullable=False)
    player_url = Column(String(200))
    age = Column(Integer)
    team_id = Column(String(10))
    wins = Column(Integer)
    losses = Column(Integer)
    win_loss_pct = Column(Float)
    era = Column(Float)
    games = Column(Integer)
    games_started = Column(Integer)
    saves = Column(Integer)
    innings_pitched = Column(Float)
    hits = Column(Integer)
    runs = Column(Integer)
    earned_runs = Column(Integer)
    home_runs = Column(Integer)
    walks = Column(Integer)
    strikeouts = Column(Integer)
    whip = Column(Float)
    strikeouts_per_nine = Column(Float)
    walks_per_nine = Column(Float)
    hits_per_nine = Column(Float)
    source = Column(String(50), default="mlb_api")

    __table_args__ = (
        Index("ix_pitching_stats_player", "player"),
        Index("ix_pitching_stats_team_season", "team_id", "season"),
    )


__all__ = ["Standing", "BattingStats", "PitchingStats"]
