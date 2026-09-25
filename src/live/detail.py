"""
src/live/detail.py — Proyección DETALLADA de un juego, desde el mismo GUMBO.

Por qué un segundo parser y no ampliar `LiveGameState`:

`gumbo.py` produce el marcador de tarjeta, 1.400 bytes, y el móvil lo sondea
cada diez segundos por CADA juego del día. Meterle las jugadas, el boxscore y
las alineaciones lo llevaría a decenas de kilobytes y multiplicaría ese tráfico
por nada: la tarjeta no muestra ninguna de esas cosas. Esto de aquí se pide una
sola vez, cuando alguien abre un juego.

Lo importante: se lee del documento GUMBO que la caché **ya tiene**. Abrir el
detalle NO dispara una sola petición contra la MLB API.

Cuatro proyecciones, que son las cuatro pestañas de la pantalla:

  jugada por jugada   plays.allPlays, del más reciente al más viejo
  línea por entradas  linescore.innings
  boxscore            boxscore.teams[].players, los números de HOY
  alineaciones        battingOrder + pitchers + bullpen

Las descripciones de la MLB vienen en inglés ("Manuel Pena flies out to center
fielder Magneuris Sierra"). NO se traducen: traducir texto libre de una API
ajena es frágil y se rompe en silencio el día que cambien la redacción. Lo que
se hace es componer el titular en español desde los campos ESTRUCTURADOS
—bateador, evento, carreras— con `evento_es()`, y dejar el texto original en
`description` por si el cliente lo quiere como subtítulo.
"""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field

from src.constants import LIDOM_TEAMS
from src.live.gumbo import ordinal_es


# ─────────────────────────────────────────────────────────────────────────────
# Eventos en español
#
# Se mapea sobre `result.event` (la etiqueta legible) y no sobre `eventType`,
# porque `field_out` cubre por igual un roletazo, un elevado y una palomita —
# distinciones que a un fanático sí le importan.
#
# Lo que no esté aquí cae al texto en inglés de la MLB, que es feo pero cierto;
# nunca a una cadena vacía. Si aparece un evento nuevo se nota y se añade.
# ─────────────────────────────────────────────────────────────────────────────

EVENTOS_ES: dict[str, str] = {
    # Outs en el terreno
    "Groundout": "Roletazo de out",
    "Bunt Groundout": "Toque, out en primera",
    "Flyout": "Elevado de out",
    "Pop Out": "Palomita de out",
    "Bunt Pop Out": "Toque elevado, out",
    "Lineout": "Línea de out",
    "Bunt Lineout": "Toque de línea, out",
    "Forceout": "Out forzado",
    "Fielders Choice": "Selección del cuadro",
    "Fielders Choice Out": "Selección del cuadro, out",
    "Field Error": "Error",
    "Error": "Error",
    # Ponches
    "Strikeout": "Ponche",
    "Strikeout Double Play": "Ponche y doble play",
    # Imparables
    "Single": "Sencillo",
    "Double": "Doble",
    "Triple": "Triple",
    "Home Run": "Jonrón",
    # Boletos
    "Walk": "Base por bolas",
    "Intent Walk": "Base intencional",
    "Hit By Pitch": "Golpeado por lanzamiento",
    "Catcher Interference": "Interferencia del receptor",
    # Dobles y triples matanzas
    "Grounded Into DP": "Doble play por tierra",
    "Double Play": "Doble play",
    "Triple Play": "Triple play",
    "Sac Bunt Double Play": "Toque de sacrificio, doble play",
    "Sac Fly Double Play": "Elevado de sacrificio, doble play",
    # Sacrificios
    "Sac Fly": "Elevado de sacrificio",
    "Sac Bunt": "Toque de sacrificio",
    # Corrido de bases
    "Stolen Base 2B": "Base robada (2da)",
    "Stolen Base 3B": "Base robada (3ra)",
    "Stolen Base Home": "Robo de home",
    "Caught Stealing 2B": "Atrapado robando 2da",
    "Caught Stealing 3B": "Atrapado robando 3ra",
    "Caught Stealing Home": "Atrapado robando home",
    "Pickoff 1B": "Atrapado fuera de 1ra",
    "Pickoff 2B": "Atrapado fuera de 2da",
    "Pickoff 3B": "Atrapado fuera de 3ra",
    "Wild Pitch": "Lanzamiento descontrolado",
    "Passed Ball": "Bola pasada",
    "Balk": "Balk",
    "Defensive Indiff": "Indiferencia defensiva",
    "Runner Out": "Corredor out",
    "Runner Double Play": "Corredor, doble play",
    "Other Advance": "Avance de corredor",
    # Administrativo
    "Pitching Substitution": "Cambio de lanzador",
    "Offensive Substitution": "Cambio ofensivo",
    "Defensive Substitution": "Cambio defensivo",
    "Defensive Switch": "Cambio de posición",
    "Ejection": "Expulsión",
    "Injury": "Lesión",
    "Game Advisory": "Aviso",
}


def evento_es(event: Optional[str]) -> Optional[str]:
    """Nombre del evento en español; el inglés de la MLB si no lo conocemos."""
    if not event:
        return None
    return EVENTOS_ES.get(event, event)


# ─────────────────────────────────────────────────────────────────────────────
# Modelos
# ─────────────────────────────────────────────────────────────────────────────


class PlayLine(BaseModel):
    """Una jugada del relato."""

    index: int                              # atBatIndex, para ordenar y como key
    inning: Optional[int] = None
    inning_ordinal_es: Optional[str] = None
    is_top_inning: Optional[bool] = None
    half_label: Optional[str] = None         # "Alta del 3ro"

    event: Optional[str] = None              # crudo de la MLB: "Groundout"
    event_es: Optional[str] = None           # "Roletazo de out"
    description: Optional[str] = None        # texto libre de la MLB, en inglés

    batter: Optional[str] = None
    pitcher: Optional[str] = None

    rbi: int = 0
    is_scoring_play: bool = False
    is_out: bool = False
    outs: int = 0                            # outs DESPUÉS de la jugada
    balls: int = 0
    strikes: int = 0

    away_score: int = 0
    home_score: int = 0
    is_complete: bool = True


class InningLine(BaseModel):
    """Una columna del cuadro por entradas."""

    num: int
    ordinal_es: Optional[str] = None
    away_runs: Optional[int] = None          # None = todavía no se jugó
    home_runs: Optional[int] = None
    away_hits: int = 0
    home_hits: int = 0


class BatterLine(BaseModel):
    """Línea de bateo de HOY, no del acumulado de temporada."""

    # OJO: aquí `player_id` es el número de la MLB, no el slug de la ficha
    # que usa el resto de la API. El slug lo pone la ruta en `profile_id`
    # (src/fichas.py): el parser no toca la base de datos.
    player_id: int
    name: str
    profile_id: Optional[str] = None
    position: Optional[str] = None
    batting_order: Optional[int] = None      # 100, 200… ; los sustitutos 101, 102
    is_starter: bool = False
    summary: Optional[str] = None            # "1-4 | SB", tal cual lo da la MLB

    at_bats: int = 0
    runs: int = 0
    hits: int = 0
    doubles: int = 0
    triples: int = 0
    home_runs: int = 0
    rbi: int = 0
    walks: int = 0
    strikeouts: int = 0
    stolen_bases: int = 0
    left_on_base: int = 0


class PitcherLine(BaseModel):
    """Línea de pitcheo de HOY."""

    player_id: int                           # número de la MLB (ver BatterLine)
    name: str
    profile_id: Optional[str] = None
    order: int = 0                           # en qué turno entró al juego
    is_starter: bool = False
    note: Optional[str] = None               # "(W, 1-0)" cuando la MLB la pone
    summary: Optional[str] = None            # "5.0 IP, 2 ER, 6 K, BB"

    innings_pitched: Optional[str] = None    # "5.0" — string, es notación de outs
    hits: int = 0
    runs: int = 0
    earned_runs: int = 0
    walks: int = 0
    strikeouts: int = 0
    home_runs: int = 0
    pitches: int = 0
    strikes: int = 0


class BullpenArm(BaseModel):
    """Alguien del bullpen —o del banco— que todavía no ha entrado."""

    player_id: int                           # número de la MLB (ver BatterLine)
    name: str
    profile_id: Optional[str] = None


class TeamDetail(BaseModel):
    team_code: Optional[str] = None
    team_name: Optional[str] = None
    runs: int = 0
    hits: int = 0
    errors: int = 0
    left_on_base: int = 0

    batters: list[BatterLine] = Field(default_factory=list)
    pitchers: list[PitcherLine] = Field(default_factory=list)
    bench: list[BullpenArm] = Field(default_factory=list)
    bullpen: list[BullpenArm] = Field(default_factory=list)


class LiveGameDetail(BaseModel):
    """Todo lo que la pantalla de un juego necesita, en una sola respuesta."""

    game_pk: Optional[int] = None
    game_id: Optional[str] = None
    status: str = "other"
    timestamp: Optional[str] = None

    innings: list[InningLine] = Field(default_factory=list)
    scheduled_innings: int = 9

    plays: list[PlayLine] = Field(default_factory=list)
    plays_total: int = 0                     # cuántas hay en el juego completo
    plays_returned: int = 0

    home: TeamDetail
    away: TeamDetail


# ─────────────────────────────────────────────────────────────────────────────
# Lectura
# ─────────────────────────────────────────────────────────────────────────────


def _team_code(team: dict) -> Optional[str]:
    info = LIDOM_TEAMS.get(team.get("id"))
    return info["team_code"] if info else None


def _team_name(team: dict) -> Optional[str]:
    info = LIDOM_TEAMS.get(team.get("id"))
    return info["full_name"] if info else team.get("name")


def _i(node: Any, key: str, default: int = 0) -> int:
    """Entero tolerante: la MLB a veces manda strings y a veces omite la clave."""
    v = (node or {}).get(key, default)
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def _play(raw: dict) -> PlayLine:
    about = raw.get("about") or {}
    result = raw.get("result") or {}
    count = raw.get("count") or {}
    matchup = raw.get("matchup") or {}

    inning = about.get("inning")
    ordinal = ordinal_es(inning)
    is_top = about.get("isTopInning")
    half = None
    if ordinal is not None and is_top is not None:
        half = f"{'Alta' if is_top else 'Baja'} del {ordinal}"

    event = result.get("event")

    return PlayLine(
        index=raw.get("atBatIndex", 0),
        inning=inning,
        inning_ordinal_es=ordinal,
        is_top_inning=is_top,
        half_label=half,
        event=event,
        event_es=evento_es(event),
        description=result.get("description"),
        batter=(matchup.get("batter") or {}).get("fullName"),
        pitcher=(matchup.get("pitcher") or {}).get("fullName"),
        rbi=_i(result, "rbi"),
        is_scoring_play=bool(about.get("isScoringPlay")),
        is_out=bool(result.get("isOut")),
        outs=_i(count, "outs"),
        balls=_i(count, "balls"),
        strikes=_i(count, "strikes"),
        away_score=_i(result, "awayScore"),
        home_score=_i(result, "homeScore"),
        is_complete=bool(about.get("isComplete", True)),
    )


def _innings(linescore: dict) -> list[InningLine]:
    out: list[InningLine] = []
    for inn in linescore.get("innings") or []:
        home = inn.get("home") or {}
        away = inn.get("away") or {}
        num = inn.get("num") or 0
        out.append(
            InningLine(
                num=num,
                ordinal_es=ordinal_es(num),
                # La clave "runs" falta mientras la mitad no se haya jugado, y
                # eso NO es cero: es el guion del cuadro. Por eso Optional.
                away_runs=away.get("runs"),
                home_runs=home.get("runs"),
                away_hits=_i(away, "hits"),
                home_hits=_i(home, "hits"),
            )
        )
    return out


def _batter(pl: dict) -> Optional[BatterLine]:
    bat = ((pl.get("stats") or {}).get("batting")) or {}
    person = pl.get("person") or {}
    order_raw = pl.get("battingOrder")
    # Sin battingOrder no llegó a batear ni a correr: es banca, y va en `bench`.
    if order_raw is None:
        return None
    try:
        order = int(order_raw)
    except (TypeError, ValueError):
        order = 0
    return BatterLine(
        player_id=person.get("id", 0),
        name=person.get("fullName", "—"),
        position=(pl.get("position") or {}).get("abbreviation"),
        batting_order=order,
        # Múltiplo exacto de 100 = titular; 101, 102… son quienes lo relevaron.
        is_starter=order % 100 == 0,
        summary=bat.get("summary"),
        at_bats=_i(bat, "atBats"),
        runs=_i(bat, "runs"),
        hits=_i(bat, "hits"),
        doubles=_i(bat, "doubles"),
        triples=_i(bat, "triples"),
        home_runs=_i(bat, "homeRuns"),
        rbi=_i(bat, "rbi"),
        walks=_i(bat, "baseOnBalls"),
        strikeouts=_i(bat, "strikeOuts"),
        stolen_bases=_i(bat, "stolenBases"),
        left_on_base=_i(bat, "leftOnBase"),
    )


def _pitcher(pl: dict, order: int, starter_id: Optional[int]) -> PitcherLine:
    pit = ((pl.get("stats") or {}).get("pitching")) or {}
    person = pl.get("person") or {}
    pid = person.get("id", 0)
    return PitcherLine(
        player_id=pid,
        name=person.get("fullName", "—"),
        order=order,
        is_starter=pid == starter_id,
        note=pit.get("note"),
        summary=pit.get("summary"),
        # inningsPitched es un STRING ("5.1" = cinco y un tercio). Convertirlo a
        # float lo rompería: 5.1 decimal no es cinco entradas y un out.
        innings_pitched=pit.get("inningsPitched"),
        hits=_i(pit, "hits"),
        runs=_i(pit, "runs"),
        earned_runs=_i(pit, "earnedRuns"),
        walks=_i(pit, "baseOnBalls"),
        strikeouts=_i(pit, "strikeOuts"),
        home_runs=_i(pit, "homeRuns"),
        pitches=_i(pit, "numberOfPitches"),
        strikes=_i(pit, "strikes"),
    )


def _arms(side: dict, ids: list) -> list[BullpenArm]:
    players = side.get("players") or {}
    out = []
    for pid in ids or []:
        pl = players.get(f"ID{pid}") or {}
        person = pl.get("person") or {}
        out.append(BullpenArm(player_id=person.get("id", pid),
                              name=person.get("fullName", "—")))
    return out


def _side(side: dict, ls_side: dict) -> TeamDetail:
    players = side.get("players") or {}

    batters: list[BatterLine] = []
    for pid in side.get("batters") or []:
        pl = players.get(f"ID{pid}")
        if not pl:
            continue
        line = _batter(pl)
        if line:
            batters.append(line)
    # Por turno al bate: 100, 101, 200, 201… deja a cada relevo debajo del
    # titular al que sustituyó, que es como se lee un boxscore.
    batters.sort(key=lambda b: b.batting_order or 9999)

    pitcher_ids = side.get("pitchers") or []
    starter_id = pitcher_ids[0] if pitcher_ids else None
    pitchers = [
        _pitcher(players[f"ID{pid}"], i + 1, starter_id)
        for i, pid in enumerate(pitcher_ids)
        if f"ID{pid}" in players
    ]

    team = side.get("team") or {}
    return TeamDetail(
        team_code=_team_code(team),
        team_name=_team_name(team),
        runs=_i(ls_side, "runs"),
        hits=_i(ls_side, "hits"),
        errors=_i(ls_side, "errors"),
        left_on_base=_i(ls_side, "leftOnBase"),
        batters=batters,
        pitchers=pitchers,
        bench=_arms(side, side.get("bench") or []),
        bullpen=_arms(side, side.get("bullpen") or []),
    )


ABSTRACT_STATE = {"Preview": "preview", "Live": "live",
                  "Final": "final", "Other": "other"}


def parse_game_detail(
    payload: dict,
    game_id: Optional[str] = None,
    plays_limit: Optional[int] = None,
) -> LiveGameDetail:
    """
    Reduce un documento GUMBO al detalle completo de un juego.

    `plays_limit` recorta el relato a las N jugadas MÁS RECIENTES, que es lo
    que quiere ver quien abre un juego en curso. `plays_total` siempre informa
    cuántas hay, para que el cliente sepa que recortó.

    Tolerante a campos ausentes en todo: el feed de pre-juego no trae jugadas
    ni entradas, y un boxscore a medias es normal mientras el juego corre.
    """
    live = payload.get("liveData") or {}
    game_data = payload.get("gameData") or {}
    boxscore = live.get("boxscore") or {}
    linescore = live.get("linescore") or {}
    ls_teams = linescore.get("teams") or {}
    bx_teams = boxscore.get("teams") or {}

    all_plays = (live.get("plays") or {}).get("allPlays") or []
    # Del más reciente al más viejo: es el orden en que se lee un relato en vivo.
    plays = [_play(p) for p in reversed(all_plays)]
    total = len(plays)
    if plays_limit is not None and plays_limit >= 0:
        plays = plays[:plays_limit]

    status = (game_data.get("status") or {}).get("abstractGameState", "")

    return LiveGameDetail(
        game_pk=payload.get("gamePk") or (game_data.get("game") or {}).get("pk"),
        game_id=game_id,
        status=ABSTRACT_STATE.get(status, "other"),
        timestamp=(payload.get("metaData") or {}).get("timeStamp"),
        innings=_innings(linescore),
        scheduled_innings=_i(linescore, "scheduledInnings", 9) or 9,
        plays=plays,
        plays_total=total,
        plays_returned=len(plays),
        home=_side(bx_teams.get("home") or {}, ls_teams.get("home") or {}),
        away=_side(bx_teams.get("away") or {}, ls_teams.get("away") or {}),
    )


__all__ = [
    "EVENTOS_ES",
    "evento_es",
    "PlayLine",
    "InningLine",
    "BatterLine",
    "PitcherLine",
    "BullpenArm",
    "TeamDetail",
    "LiveGameDetail",
    "parse_game_detail",
]
