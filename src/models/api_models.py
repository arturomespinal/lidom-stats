"""
src/models/api_models.py — Modelos Pydantic para validar respuestas MLB Stats API.

Filosofía:
    Estos modelos son una "trinchera de validación" en la frontera externa.
    El JSON que devuelve la API entra por aquí; si pasa, garantizamos tipos
    correctos en todo el flujo interno. Si falla, capturamos el error con
    contexto en vez de tener KeyError 30 niveles abajo.

Decisiones de diseño:
    1. `extra="ignore"` por defecto: la API agrega campos nuevos sin avisar.
       No queremos que un campo nuevo rompa nuestro ingestor.
    2. Campos opcionales (`| None = None`) para todo lo que no aparece
       garantizado en cada response. Mejor None que crash.
    3. Validators custom para las stats que vienen como string ".368" en vez
       de float 0.368. La API tiene esta inconsistencia.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


# ─────────────────────────────────────────────────────────────────────────────
# Sub-modelos compartidos
# ─────────────────────────────────────────────────────────────────────────────


class APITeam(BaseModel):
    """Equipo tal como lo devuelve la API."""

    model_config = ConfigDict(extra="ignore")

    id: int
    name: str
    link: Optional[str] = None


class APIPlayer(BaseModel):
    """Jugador tal como lo devuelve la API."""

    model_config = ConfigDict(extra="ignore")

    id: int
    fullName: str
    link: Optional[str] = None
    firstName: Optional[str] = None
    lastName: Optional[str] = None


class APILeague(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: int
    name: str
    link: Optional[str] = None


class APISport(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: int
    abbreviation: Optional[str] = None
    link: Optional[str] = None


class APIPosition(BaseModel):
    model_config = ConfigDict(extra="ignore")

    code: Optional[str] = None
    name: Optional[str] = None
    type: Optional[str] = None
    abbreviation: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────────
# /stats endpoint — agregados de temporada
# ─────────────────────────────────────────────────────────────────────────────


class APIHittingStat(BaseModel):
    """
    Stats de bateo agregadas (endpoint /stats, group=hitting).

    OJO: la API devuelve los promedios como strings (".368" en vez de 0.368).
    Los convertimos a float con un validator. Los campos contables (HR, AB)
    sí vienen como int.
    """

    model_config = ConfigDict(extra="ignore")

    # Contables (vienen como int desde la API)
    gamesPlayed: int = 0
    plateAppearances: int = 0
    atBats: int = 0
    runs: int = 0
    hits: int = 0
    doubles: int = 0
    triples: int = 0
    homeRuns: int = 0
    rbi: int = 0
    baseOnBalls: int = 0
    intentionalWalks: int = 0
    strikeOuts: int = 0
    hitByPitch: int = 0
    sacBunts: int = 0
    sacFlies: int = 0
    stolenBases: int = 0
    caughtStealing: int = 0
    groundIntoDoublePlay: int = 0
    leftOnBase: int = 0
    totalBases: int = 0
    numberOfPitches: int = 0
    groundOuts: int = 0
    airOuts: int = 0
    catchersInterference: int = 0

    # Promedios (la API los devuelve como strings ".368")
    avg: Optional[float] = None
    obp: Optional[float] = None
    slg: Optional[float] = None
    ops: Optional[float] = None
    babip: Optional[float] = None
    stolenBasePercentage: Optional[float] = None
    caughtStealingPercentage: Optional[float] = None

    # Strings que dejamos como strings (formato inconsistente)
    groundOutsToAirouts: Optional[str] = None
    atBatsPerHomeRun: Optional[str] = None  # Puede venir como "-.--" cuando HR=0

    @field_validator("avg", "obp", "slg", "ops", "babip",
                     "stolenBasePercentage", "caughtStealingPercentage",
                     mode="before")
    @classmethod
    def _parse_baseball_avg(cls, v) -> Optional[float]:
        """
        Parsea promedios de béisbol desde la API.

        La MLB API devuelve los promedios como strings con formato peculiar:
            ".368" → 0.368
            "1.000" → 1.000
            "-.--" → None (no calculable, ej. 0 AB)
            None → None
        """
        if v is None or v == "" or v == "-.--" or v == ".---":
            return None
        if isinstance(v, (int, float)):
            return float(v)
        if isinstance(v, str):
            try:
                # ".368" → 0.368 (Python parsea esto correctamente)
                return float(v)
            except ValueError:
                return None
        return None


class APIHittingSplit(BaseModel):
    """Una fila del array 'splits' del endpoint /stats group=hitting."""

    model_config = ConfigDict(extra="ignore")

    season: str
    rank: Optional[int] = None
    numTeams: Optional[int] = None
    stat: APIHittingStat
    team: APITeam
    player: APIPlayer
    league: APILeague
    sport: APISport
    position: Optional[APIPosition] = None


class APIHittingStatsResponse(BaseModel):
    """
    Respuesta completa de:
        GET /api/v1/stats?stats=season&group=hitting&leagueId=131&season=2025

    Estructura del JSON:
        {
          "copyright": "...",
          "stats": [
            {
              "type": {"displayName": "season"},
              "group": {"displayName": "hitting"},
              "totalSplits": 22,
              "splits": [ {...}, {...} ]
            }
          ]
        }
    """

    model_config = ConfigDict(extra="ignore")

    copyright: Optional[str] = None
    stats: list[APIStatsBlock] = Field(default_factory=list)

    def all_splits(self) -> list[APIHittingSplit]:
        """Aplana todos los splits de todos los bloques en una lista."""
        result: list[APIHittingSplit] = []
        for block in self.stats:
            result.extend(block.splits)
        return result


class APIStatsBlockType(BaseModel):
    model_config = ConfigDict(extra="ignore")
    displayName: str


class APIStatsBlock(BaseModel):
    """Bloque interno dentro de la respuesta /stats."""

    model_config = ConfigDict(extra="ignore")

    type: Optional[APIStatsBlockType] = None
    group: Optional[APIStatsBlockType] = None
    totalSplits: Optional[int] = None
    splits: list[APIHittingSplit] = Field(default_factory=list)


# Rebuild para resolver forward reference de APIStatsBlock dentro de APIHittingStatsResponse
APIHittingStatsResponse.model_rebuild()


__all__ = [
    "APITeam",
    "APIPlayer",
    "APILeague",
    "APISport",
    "APIPosition",
    "APIHittingStat",
    "APIHittingSplit",
    "APIStatsBlock",
    "APIStatsBlockType",
    "APIHittingStatsResponse",
]
