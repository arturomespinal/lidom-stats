"""
src/live/gumbo.py — GUMBO (feed en vivo v1.1) → estado de juego para el marcador.

El feed en vivo pesa cerca de un megabyte y trae el juego entero: cada lanzamiento,
cada jugada, los rosters completos, los líderes. De todo eso, un marcador tipo
SofaScore necesita unas veinte cosas. Este módulo hace esa reducción, para que
ni la caché, ni el canal de entrega, ni el cliente móvil tengan que conocer la
forma del GUMBO.

Decisiones de lectura, tomadas contra instantáneas reales:

  - El estado "ahora mismo" sale de liveData.linescore (balls, strikes, outs),
    no de plays.currentPlay.count. Cuando una jugada termina, currentPlay
    conserva la cuenta con que terminó ese turno; el linescore es el que refleja
    el estado vigente.

  - Los corredores salen de linescore.offense, donde las claves first/second/
    third SOLO aparecen si la base está ocupada. Ausencia = base vacía.

  - liveData.decisions únicamente existe cuando el juego terminó.

  - metaData.wait es el intervalo de sondeo que la propia API recomienda
    (10 segundos en LIDOM). Lo propagamos en vez de fijar un número a mano.
"""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field

from src.constants import LIDOM_TEAMS

# gameData.status.abstractGameState → nuestro estado
ABSTRACT_STATE = {
    "Preview": "preview",
    "Live": "live",
    "Final": "final",
    "Other": "other",
}

# Ordinales masculinos, que es lo que pide "inning" en el uso dominicano:
# "la parte baja del séptimo inning". Hasta la 10ma con su forma propia; de la
# 11 en adelante la escritura corriente usa "vo" para todo (11vo, 12vo, 13vo),
# y las entradas extra pasadas la décima son raras de por sí.
_ORDINALES_ES = {
    1: "1ro", 2: "2do", 3: "3ro", 4: "4to", 5: "5to",
    6: "6to", 7: "7mo", 8: "8vo", 9: "9no", 10: "10mo",
}


def ordinal_es(inning: Optional[int]) -> Optional[str]:
    """
    Ordinal en español de la entrada.

    Existe porque `currentInningOrdinal` de la MLB viene en inglés ("1st",
    "7th") y los dos clientes lo pintaban tal cual dentro de una frase en
    español: "Baja del 1st". Se deriva del número, no se traduce el string,
    porque el número es un dato y el string es una decisión de presentación
    de otra liga.
    """
    if not isinstance(inning, int) or inning < 1:
        return None
    return _ORDINALES_ES.get(inning, f"{inning}vo")


def _team_code(team: dict) -> str:
    """
    MLB team id → nuestro código de 3 letras.

    Cae a la abreviatura de la API si el equipo no es de LIDOM, para que el
    parser siga siendo útil si algún día se apunta a otra liga invernal.
    """
    info = LIDOM_TEAMS.get(team.get("id"))
    if info:
        return info["team_code"]
    return (team.get("abbreviation") or "???").upper()[:3]


def _team_name(team: dict) -> str:
    """Preferimos nuestro nombre con tildes; la API a veces los pierde."""
    info = LIDOM_TEAMS.get(team.get("id"))
    return info["full_name"] if info else team.get("name", "")


def _name(node: Any) -> Optional[str]:
    return node.get("fullName") if isinstance(node, dict) else None


class TeamLine(BaseModel):
    """El lado de un equipo en el marcador: la línea R-H-E."""
    team_code: str
    team_name: str
    runs: int = 0
    hits: int = 0
    errors: int = 0
    left_on_base: int = 0


class InningLine(BaseModel):
    """Carreras por entrada. runs queda en None si la mitad no se ha jugado."""
    inning: int
    away_runs: Optional[int] = None
    home_runs: Optional[int] = None


class Runners(BaseModel):
    """Quién está en cada base. None = base vacía."""
    first: Optional[str] = None
    second: Optional[str] = None
    third: Optional[str] = None

    @property
    def occupied(self) -> int:
        return sum(1 for b in (self.first, self.second, self.third) if b)

    @property
    def bases_loaded(self) -> bool:
        return self.occupied == 3

    @property
    def state_code(self) -> str:
        """
        Las ocho situaciones posibles como string de 3 bits: "101" = corredores
        en primera y tercera. Compacto para comparar estados y para cachear.
        """
        return "".join("1" if b else "0" for b in (self.first, self.second, self.third))


class Decisions(BaseModel):
    winner: Optional[str] = None
    loser: Optional[str] = None
    save: Optional[str] = None


class LiveGameState(BaseModel):
    """Lo que necesita el marcador, y nada más."""

    # Identidad
    game_pk: int
    game_id: Optional[str] = None  # slug de nuestro esquema, para cruzar con games
    season: Optional[str] = None
    game_date: Optional[str] = None
    venue: Optional[str] = None

    # Estado
    status: str = "other"           # preview | live | final | other
    detailed_status: str = ""
    timestamp: Optional[str] = None  # metaData.timeStamp, la marca de ESTA foto
    poll_wait_seconds: int = 10      # metaData.wait, lo que recomienda la API

    # Situación
    inning: Optional[int] = None
    inning_ordinal: Optional[str] = None      # crudo de la MLB: "1st", "7th"
    inning_ordinal_es: Optional[str] = None   # "1ro", "7mo" — ver ordinal_es()
    inning_half: Optional[str] = None   # "top" | "bottom"
    is_top_inning: Optional[bool] = None
    scheduled_innings: int = 9
    outs: int = 0
    balls: int = 0
    strikes: int = 0

    # Marcador
    home: TeamLine
    away: TeamLine
    line_score: list[InningLine] = Field(default_factory=list)

    # En el terreno
    runners: Runners = Field(default_factory=Runners)
    batter: Optional[str] = None
    on_deck: Optional[str] = None
    pitcher: Optional[str] = None

    # Narrativa
    last_play: Optional[str] = None
    last_play_event: Optional[str] = None
    last_play_is_scoring: bool = False
    plays_count: int = 0

    decisions: Optional[Decisions] = None

    # Probabilidad de que gane el LOCAL, 0..1. Solo existe mientras el juego
    # corre: en preview no hay estado que simular y en final ya se sabe quién
    # ganó, así que un número ahí sería ruido. Ver src/winprob.py.
    win_prob_home: Optional[float] = None

    @property
    def is_live(self) -> bool:
        return self.status == "live"

    @property
    def is_final(self) -> bool:
        return self.status == "final"

    @property
    def score_line(self) -> str:
        """'TOR 3 - 7 EST' — para logs y depuración."""
        return (f"{self.away.team_code} {self.away.runs} - "
                f"{self.home.runs} {self.home.team_code}")

    @property
    def situation(self) -> str:
        """'Baja del 5to · 0 outs · 3-1 · corredor en 1ª' — resumen legible."""
        if self.status == "preview":
            return "Por comenzar"
        if self.status == "final":
            extra = (self.inning and self.inning != self.scheduled_innings)
            return f"Final{f' ({self.inning} entradas)' if extra else ''}"
        media = "Alta" if self.is_top_inning else "Baja"
        entrada = self.inning_ordinal_es or self.inning_ordinal or self.inning
        base = f"{media} del {entrada}"
        outs = f"{self.outs} out" + ("s" if self.outs != 1 else "")
        count = f"{self.balls}-{self.strikes}"
        runners = {
            "000": "bases limpias", "100": "corredor en 1ª", "010": "corredor en 2ª",
            "001": "corredor en 3ª", "110": "corredores en 1ª y 2ª",
            "101": "corredores en 1ª y 3ª", "011": "corredores en 2ª y 3ª",
            "111": "bases llenas",
        }[self.runners.state_code]
        return f"{base} · {outs} · {count} · {runners}"


def parse_live_feed(payload: dict, game_id: Optional[str] = None) -> LiveGameState:
    """
    Reduce una respuesta de /feed/live al estado del marcador.

    Tolerante a campos ausentes a propósito: el feed de pre-juego no trae
    corredores ni cuenta, y el de un juego terminado no trae bateador actual.
    Cualquier acceso asume que la clave puede faltar.
    """
    meta = payload.get("metaData", {})
    game_data = payload.get("gameData", {})
    live = payload.get("liveData", {})
    linescore = live.get("linescore", {})

    teams = game_data.get("teams", {})
    home_team = teams.get("home", {})
    away_team = teams.get("away", {})

    ls_teams = linescore.get("teams", {})
    ls_home = ls_teams.get("home", {})
    ls_away = ls_teams.get("away", {})

    status = game_data.get("status", {})
    datetime_info = game_data.get("datetime", {})

    # Corredores: las claves solo existen si la base está ocupada.
    offense = linescore.get("offense", {})
    runners = Runners(
        first=_name(offense.get("first")),
        second=_name(offense.get("second")),
        third=_name(offense.get("third")),
    )

    # La última jugada completada es la narrativa del marcador.
    current_play = live.get("plays", {}).get("currentPlay", {})
    result = current_play.get("result", {})
    description = result.get("description")
    # rbi puede venir en 0 con carreras anotadas por error, así que miramos
    # también si la jugada aparece marcada como anotadora.
    is_scoring = bool(result.get("rbi")) or result.get("isScoringPlay", False)

    decisions_raw = live.get("decisions")
    decisions = None
    if decisions_raw:
        decisions = Decisions(
            winner=_name(decisions_raw.get("winner")),
            loser=_name(decisions_raw.get("loser")),
            save=_name(decisions_raw.get("save")),
        )

    line_score = [
        InningLine(
            inning=inn.get("num"),
            away_runs=(inn.get("away") or {}).get("runs"),
            home_runs=(inn.get("home") or {}).get("runs"),
        )
        for inn in linescore.get("innings", [])
        if inn.get("num") is not None
    ]

    half = linescore.get("inningHalf") or linescore.get("inningState")

    estado = LiveGameState(
        game_pk=payload.get("gamePk") or game_data.get("game", {}).get("pk"),
        game_id=game_id,
        season=game_data.get("game", {}).get("season"),
        game_date=datetime_info.get("officialDate"),
        venue=game_data.get("venue", {}).get("name"),

        status=ABSTRACT_STATE.get(status.get("abstractGameState", ""), "other"),
        detailed_status=status.get("detailedState", ""),
        timestamp=meta.get("timeStamp"),
        poll_wait_seconds=meta.get("wait") or 10,

        inning=linescore.get("currentInning"),
        inning_ordinal=linescore.get("currentInningOrdinal"),
        inning_ordinal_es=ordinal_es(linescore.get("currentInning")),
        inning_half=half.lower() if isinstance(half, str) else None,
        is_top_inning=linescore.get("isTopInning"),
        scheduled_innings=linescore.get("scheduledInnings") or 9,
        outs=linescore.get("outs") or 0,
        balls=linescore.get("balls") or 0,
        strikes=linescore.get("strikes") or 0,

        home=TeamLine(
            team_code=_team_code(home_team), team_name=_team_name(home_team),
            runs=ls_home.get("runs") or 0, hits=ls_home.get("hits") or 0,
            errors=ls_home.get("errors") or 0,
            left_on_base=ls_home.get("leftOnBase") or 0,
        ),
        away=TeamLine(
            team_code=_team_code(away_team), team_name=_team_name(away_team),
            runs=ls_away.get("runs") or 0, hits=ls_away.get("hits") or 0,
            errors=ls_away.get("errors") or 0,
            left_on_base=ls_away.get("leftOnBase") or 0,
        ),
        line_score=line_score,

        runners=runners,
        batter=_name(offense.get("batter")),
        on_deck=_name(offense.get("onDeck")),
        pitcher=_name(linescore.get("defense", {}).get("pitcher")),

        last_play=description,
        last_play_event=result.get("event"),
        last_play_is_scoring=is_scoring,
        plays_count=len(live.get("plays", {}).get("allPlays", [])),

        decisions=decisions,
    )

    # La probabilidad solo tiene sentido con el juego en curso. Se calcula
    # aquí y no en el cliente porque el modelo vive en el servidor y porque
    # está memoizado: el mismo estado no se vuelve a simular.
    if estado.status == "live" and estado.inning:
        from src.winprob import Estado, prob_gana_local_cached
        estado.win_prob_home = round(prob_gana_local_cached(Estado(
            entrada=estado.inning,
            es_alta=bool(estado.is_top_inning),
            outs=min(estado.outs, 2),
            bases=(
                estado.runners.first is not None,
                estado.runners.second is not None,
                estado.runners.third is not None,
            ),
            dif_local=estado.home.runs - estado.away.runs,
        )), 3)

    return estado


__all__ = ["LiveGameState", "TeamLine", "InningLine", "Runners", "Decisions",
           "parse_live_feed"]
