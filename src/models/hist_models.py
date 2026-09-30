"""
src/models/hist_models.py — La capa histórica: DIGIMETRICS, 1951 en adelante.

Tercera capa de la base, independiente de las otras dos. Las tablas planas y el
esquema de juego nacen de la MLB API y empiezan en 2012-13; esta nace del
portal oficial de la liga y llega hasta 1951. Para 2012-13 en adelante la app
sigue usando el esquema de juego (se puede auditar juego por juego); los años
que se solapan sirven para CRUZAR las dos fuentes (src/pipeline/cruce_historia.py).

Qué hay y qué no:
    - Líneas de temporada por jugador, por equipo y por etapa (regular, round
      robin, final). Solo conteos: las tasas se calculan (regla 3 de CLAUDE.md).
    - NO hay juegos ni posiciones antes de 2013: la fuente no los tiene. El
      récord de un equipo se reconstruye con las decisiones de sus lanzadores.

La temporada se guarda como la numera la fuente, por el año en que empieza
(1990 = 1990-91), igual que la MLB API. `season_id` lleva la etiqueta para
mostrar; ver etiqueta_historica().

Claves: (temporada, etapa, id_equipo, id_miembro). El id_equipo de la fuente y
no nuestro team_code, porque dos ids de la fuente son la misma franquicia con
otro nombre (ver DIGIMETRICS_EQUIPOS en src/constants.py).
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from src.models.database import Base

# Hasta 1954 la liga jugó en verano, dentro de un mismo año; desde 1955-56,
# en invierno, a caballo entre dos.
ULTIMA_TEMPORADA_DE_VERANO = 1954


def etiqueta_historica(temporada: int) -> str:
    """1951 → "1951" (verano); 1990 → "1990-91"; 1999 → "1999-00"."""
    if temporada <= ULTIMA_TEMPORADA_DE_VERANO:
        return str(temporada)
    return f"{temporada}-{(temporada + 1) % 100:02d}"


class HistJugador(Base):
    """Un miembro de DIGIMETRICS. Solo id y nombre: la ficha de la fuente
    (Miembro/Detalle) casi no trae biografía de los años viejos."""

    __tablename__ = "hist_jugadores"

    id_miembro: Mapped[int] = mapped_column(Integer, primary_key=True)
    # Tal como lo escribe la fuente: en mayúsculas para los años viejos
    # ("TONY PEÑA"), con mayúsculas y minúsculas para los recientes.
    nombre: Mapped[str] = mapped_column(String(100), nullable=False, index=True)


class HistEtapa(Base):
    """Las etapas que tuvo cada temporada, con el nombre que les da la fuente."""

    __tablename__ = "hist_etapas"

    temporada: Mapped[int] = mapped_column(Integer, primary_key=True)
    etapa: Mapped[str] = mapped_column(String(4), primary_key=True)  # SR, RR, SF
    descripcion: Mapped[str] = mapped_column(String(40))
    orden: Mapped[int] = mapped_column(Integer)


class HistEquipoTemporada(Base):
    """Qué equipos jugaron cada temporada y con qué nombre."""

    __tablename__ = "hist_equipos_temporada"

    temporada: Mapped[int] = mapped_column(Integer, primary_key=True)
    id_equipo: Mapped[str] = mapped_column(String(2), primary_key=True)
    team_code: Mapped[str] = mapped_column(String(3), nullable=False)
    nombre: Mapped[Optional[str]] = mapped_column(String(60))


class HistBateo(Base):
    __tablename__ = "hist_bateo"

    temporada: Mapped[int] = mapped_column(Integer, primary_key=True)
    etapa: Mapped[str] = mapped_column(String(4), primary_key=True)
    id_equipo: Mapped[str] = mapped_column(String(2), primary_key=True)
    id_miembro: Mapped[int] = mapped_column(Integer, primary_key=True)

    season_id: Mapped[str] = mapped_column(String(7), nullable=False)
    team_code: Mapped[str] = mapped_column(String(3), nullable=False)

    # Nullable a propósito: la fuente deja en blanco lo que no se registró
    # (el LOB antes de 2013, por ejemplo) y un blanco no es un cero.
    games: Mapped[Optional[int]] = mapped_column(Integer)
    at_bats: Mapped[Optional[int]] = mapped_column(Integer)
    runs: Mapped[Optional[int]] = mapped_column(Integer)
    hits: Mapped[Optional[int]] = mapped_column(Integer)
    doubles: Mapped[Optional[int]] = mapped_column(Integer)
    triples: Mapped[Optional[int]] = mapped_column(Integer)
    home_runs: Mapped[Optional[int]] = mapped_column(Integer)
    rbi: Mapped[Optional[int]] = mapped_column(Integer)
    walks: Mapped[Optional[int]] = mapped_column(Integer)
    intentional_walks: Mapped[Optional[int]] = mapped_column(Integer)
    strikeouts: Mapped[Optional[int]] = mapped_column(Integer)
    left_on_base: Mapped[Optional[int]] = mapped_column(Integer)
    stolen_bases: Mapped[Optional[int]] = mapped_column(Integer)
    caught_stealing: Mapped[Optional[int]] = mapped_column(Integer)
    hit_by_pitch: Mapped[Optional[int]] = mapped_column(Integer)
    sacrifice_flies: Mapped[Optional[int]] = mapped_column(Integer)
    sacrifice_bunts: Mapped[Optional[int]] = mapped_column(Integer)
    grounded_into_dp: Mapped[Optional[int]] = mapped_column(Integer)

    scraped_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_hist_bateo_miembro", "id_miembro"),
        Index("ix_hist_bateo_temporada_equipo", "temporada", "team_code"),
    )


class HistPitcheo(Base):
    __tablename__ = "hist_pitcheo"

    temporada: Mapped[int] = mapped_column(Integer, primary_key=True)
    etapa: Mapped[str] = mapped_column(String(4), primary_key=True)
    id_equipo: Mapped[str] = mapped_column(String(2), primary_key=True)
    id_miembro: Mapped[int] = mapped_column(Integer, primary_key=True)

    season_id: Mapped[str] = mapped_column(String(7), nullable=False)
    team_code: Mapped[str] = mapped_column(String(3), nullable=False)

    wins: Mapped[Optional[int]] = mapped_column(Integer)
    losses: Mapped[Optional[int]] = mapped_column(Integer)
    games: Mapped[Optional[int]] = mapped_column(Integer)
    games_started: Mapped[Optional[int]] = mapped_column(Integer)
    games_finished: Mapped[Optional[int]] = mapped_column(Integer)
    complete_games: Mapped[Optional[int]] = mapped_column(Integer)
    shutouts: Mapped[Optional[int]] = mapped_column(Integer)
    saves: Mapped[Optional[int]] = mapped_column(Integer)
    # Innings como outs, igual que pitching_lines: "44.1" son 133.
    outs: Mapped[Optional[int]] = mapped_column(Integer)
    hits_allowed: Mapped[Optional[int]] = mapped_column(Integer)
    runs_allowed: Mapped[Optional[int]] = mapped_column(Integer)
    earned_runs: Mapped[Optional[int]] = mapped_column(Integer)
    home_runs_allowed: Mapped[Optional[int]] = mapped_column(Integer)
    walks_allowed: Mapped[Optional[int]] = mapped_column(Integer)
    intentional_walks_allowed: Mapped[Optional[int]] = mapped_column(Integer)
    strikeouts: Mapped[Optional[int]] = mapped_column(Integer)
    hit_batters: Mapped[Optional[int]] = mapped_column(Integer)
    wild_pitches: Mapped[Optional[int]] = mapped_column(Integer)
    balks: Mapped[Optional[int]] = mapped_column(Integer)

    scraped_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_hist_pitcheo_miembro", "id_miembro"),
        Index("ix_hist_pitcheo_temporada_equipo", "temporada", "team_code"),
    )
