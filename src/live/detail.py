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



# ── El turno, sus lanzamientos y el batazo (6-oct-2026) ─────────────────────

# Tipos de lanzamiento, como se dicen en RD. Uno desconocido cae a la
# descripción de la MLB, nunca a una cadena vacía.
LANZAMIENTOS_ES = {
    "FF": "Recta", "FA": "Recta", "FT": "Recta de dos costuras", "SI": "Sinker",
    "FC": "Cutter", "SL": "Slider", "ST": "Sweeper", "SV": "Slurve",
    "CU": "Curva", "KC": "Curva de nudillos", "CS": "Curva lenta",
    "CH": "Cambio", "FS": "Splitter", "FO": "Forkball", "SC": "Screwball",
    "KN": "Nudillos", "EP": "Eephus", "PO": "Pickoff",
}

# La decisión de cada lanzamiento (`details.call.code`).
CANTOS_ES = {
    "B": "Bola", "*B": "Bola en la tierra", "I": "Bola intencional", "P": "Pitchout",
    "V": "Bola automática", "C": "Strike cantado", "S": "Strike tirándole",
    "W": "Strike tirándole", "Q": "Strike tirándole", "M": "Toque fallado",
    "F": "Foul", "T": "Foul tip", "L": "Toque de foul", "O": "Foul tip de toque",
    "R": "Foul", "A": "Strike automático", "X": "En juego", "D": "En juego",
    "E": "En juego", "H": "Golpeado",
}

TRAYECTORIAS_ES = {
    "ground_ball": "Roletazo", "line_drive": "Línea", "fly_ball": "Elevado",
    "popup": "Elevado al cuadro", "bunt_grounder": "Toque", "bunt_popup": "Toque elevado",
    "bunt_line_drive": "Toque en línea",
}


class HitData(BaseModel):
    """El batazo: velocidad de salida (mph), ángulo, distancia (pies)."""
    speed_mph: Optional[float] = None
    angle: Optional[float] = None
    distance_ft: Optional[int] = None
    trajectory_es: Optional[str] = None


class PitchLine(BaseModel):
    """Un lanzamiento del turno. `px`/`pz` en pies: px desde el centro del
    plato (positivo = a la derecha, vista del receptor), pz desde el suelo."""
    number: int
    type_es: Optional[str] = None
    speed_mph: Optional[float] = None
    call_es: Optional[str] = None
    kind: str = "bola"                       # bola | strike | en_juego
    px: Optional[float] = None
    pz: Optional[float] = None
    balls: int = 0
    strikes: int = 0


class MatchupBatter(BaseModel):
    name: Optional[str] = None
    player_id: Optional[int] = None          # número de la MLB (ver BatterLine)
    profile_id: Optional[str] = None
    bats_label: Optional[str] = None         # "Zurdo", de src/lateralidad.py
    today: Optional[str] = None              # "1-2 · 2B, CI"
    avg: Optional[str] = None                # temporada, incluido hoy
    ops: Optional[str] = None


class MatchupPitcher(BaseModel):
    name: Optional[str] = None
    player_id: Optional[int] = None
    profile_id: Optional[str] = None
    throws_label: Optional[str] = None
    pitches: int = 0
    strikes: int = 0
    today: Optional[str] = None              # "4.0 IP · 4 H · 1 CL · 1 BB · 5 K"
    era: Optional[str] = None                # temporada, incluido hoy


class AtBat(BaseModel):
    """El turno en curso, o el último si el que viene todavía no tiene
    lanzamientos (`is_current` en false): la zona de strike siempre muestra
    dónde cayeron los últimos."""
    index: int
    is_current: bool = True
    half_label: Optional[str] = None
    batter: MatchupBatter
    pitcher: MatchupPitcher
    pitches: list[PitchLine] = Field(default_factory=list)
    zone_top: float = 3.5                    # pies; la del bateador si la trae
    zone_bottom: float = 1.6
    result_es: Optional[str] = None          # si ya terminó


class Matchup(BaseModel):
    """El duelo de AHORA: quién batea y quién lanza, con sus números. Aparte
    de `at_bat` porque cuando un bateador nuevo todavía no ha visto
    lanzamientos la zona muestra el turno anterior, y la tarjeta no debe
    perder los números del que está en el plato."""
    batter: MatchupBatter
    pitcher: MatchupPitcher


class TeamTotals(BaseModel):
    """Para la comparación equipo contra equipo. `pitches`: los que tiraron
    los lanzadores de ESTE equipo."""
    hits: int = 0
    walks: int = 0
    strikeouts: int = 0
    home_runs: int = 0
    left_on_base: int = 0
    pitches: int = 0


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
    hit: Optional[HitData] = None            # el batazo, si hubo


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
    totals: Optional[TeamTotals] = None


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
    at_bat: Optional[AtBat] = None
    matchup: Optional[Matchup] = None


# ─────────────────────────────────────────────────────────────────────────────
# Lectura
# ─────────────────────────────────────────────────────────────────────────────


def _team_code(team: dict) -> Optional[str]:
    """Nuestro código; fuera de LIDOM (el modo de prueba con la MLB), la
    abreviatura de la API, igual que en gumbo.py."""
    info = LIDOM_TEAMS.get(team.get("id"))
    if info:
        return info["team_code"]
    abrev = team.get("abbreviation")
    return abrev.upper()[:3] if abrev else None


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
        hit=_hit(raw),
    )


def _hit(raw: dict) -> Optional[HitData]:
    """El último evento con datos del batazo. No todos los parques los
    miden: sin ellos, None."""
    for ev in reversed(raw.get("playEvents") or []):
        h = ev.get("hitData")
        if h:
            dist = h.get("totalDistance")
            return HitData(
                speed_mph=h.get("launchSpeed"),
                angle=h.get("launchAngle"),
                distance_ft=round(dist) if isinstance(dist, (int, float)) else None,
                trajectory_es=TRAYECTORIAS_ES.get(h.get("trajectory") or ""),
            )
    return None


def _pitch(ev: dict) -> PitchLine:
    det = ev.get("details") or {}
    pd = ev.get("pitchData") or {}
    coord = pd.get("coordinates") or {}
    tipo = det.get("type") or {}
    call = det.get("call") or {}
    count = ev.get("count") or {}
    kind = "en_juego" if det.get("isInPlay") else "strike" if det.get("isStrike") else "bola"
    return PitchLine(
        number=_i(ev, "pitchNumber"),
        type_es=LANZAMIENTOS_ES.get(tipo.get("code") or "", tipo.get("description")),
        speed_mph=pd.get("startSpeed"),
        call_es=CANTOS_ES.get(call.get("code") or "", call.get("description") or det.get("description")),
        kind=kind,
        px=coord.get("pX"),
        pz=coord.get("pZ"),
        balls=_i(count, "balls"),
        strikes=_i(count, "strikes"),
    )


def _jugador(bx_teams: dict, pid: Optional[int]) -> dict:
    for lado in ("home", "away"):
        pl = ((bx_teams.get(lado) or {}).get("players") or {}).get(f"ID{pid}")
        if pl:
            return pl
    return {}


def _hoy_bateo(b: dict) -> Optional[str]:
    """'1-3 · 2B, CI' — compuesto en español, no el resumen en inglés."""
    if not b or (not b.get("atBats") and not b.get("plateAppearances") and not b.get("baseOnBalls")):
        return None
    partes = []
    for clave, sigla in (("homeRuns", "HR"), ("triples", "3B"), ("doubles", "2B"), ("rbi", "CI"),
                         ("baseOnBalls", "BB"), ("strikeOuts", "K"), ("stolenBases", "BR")):
        n = b.get(clave) or 0
        if n:
            partes.append(sigla if n == 1 else f"{n} {sigla}")
    linea = f"{b.get('hits') or 0}-{b.get('atBats') or 0}"
    return linea + (f" · {', '.join(partes)}" if partes else "")


def _hoy_pitcheo(p: dict) -> Optional[str]:
    if not p or not (p.get("inningsPitched") or p.get("numberOfPitches")):
        return None
    return (f"{p.get('inningsPitched') or '0.0'} IP · {p.get('hits') or 0} H · "
            f"{p.get('earnedRuns') or 0} CL · {p.get('baseOnBalls') or 0} BB · {p.get('strikeOuts') or 0} K")


def _duelo(turno: dict, bx_teams: dict) -> Matchup:
    from src.lateralidad import batea_es, lanza_es
    matchup = turno.get("matchup") or {}
    bid = (matchup.get("batter") or {}).get("id")
    pid = (matchup.get("pitcher") or {}).get("id")
    bj, pj = _jugador(bx_teams, bid), _jugador(bx_teams, pid)
    bhoy = (bj.get("stats") or {}).get("batting") or {}
    phoy = (pj.get("stats") or {}).get("pitching") or {}
    btemp = (bj.get("seasonStats") or {}).get("batting") or {}
    ptemp = (pj.get("seasonStats") or {}).get("pitching") or {}
    return Matchup(
        batter=MatchupBatter(
            name=(matchup.get("batter") or {}).get("fullName"), player_id=bid,
            bats_label=batea_es((matchup.get("batSide") or {}).get("code")),
            today=_hoy_bateo(bhoy), avg=btemp.get("avg"), ops=btemp.get("ops"),
        ),
        pitcher=MatchupPitcher(
            name=(matchup.get("pitcher") or {}).get("fullName"), player_id=pid,
            throws_label=lanza_es((matchup.get("pitchHand") or {}).get("code")),
            pitches=_i(phoy, "numberOfPitches") or _i(phoy, "pitchesThrown"),
            strikes=_i(phoy, "strikes"), today=_hoy_pitcheo(phoy), era=ptemp.get("era"),
        ),
    )


def _matchup(all_plays: list, bx_teams: dict) -> Optional[Matchup]:
    """El duelo del turno en curso; None si no hay turno abierto."""
    if not all_plays or (all_plays[-1].get("about") or {}).get("isComplete"):
        return None
    return _duelo(all_plays[-1], bx_teams)


def _at_bat(all_plays: list, bx_teams: dict) -> Optional[AtBat]:
    if not all_plays:
        return None
    turno = all_plays[-1]
    tiene = lambda pl: any(e.get("isPitch") for e in pl.get("playEvents") or [])  # noqa: E731
    actual = not (turno.get("about") or {}).get("isComplete")
    if not tiene(turno):
        previos = [pl for pl in all_plays[:-1] if tiene(pl)]
        if not previos:
            return None
        turno, actual = previos[-1], False
    about = turno.get("about") or {}
    eventos = [e for e in turno.get("playEvents") or [] if e.get("isPitch")]
    zona = (eventos[-1].get("pitchData") or {}) if eventos else {}
    duelo = _duelo(turno, bx_teams)
    ordinal = ordinal_es(about.get("inning"))
    top = about.get("isTopInning")
    evento = (turno.get("result") or {}).get("event")
    return AtBat(
        index=turno.get("atBatIndex", 0),
        is_current=actual,
        half_label=f"{'Alta' if top else 'Baja'} del {ordinal}" if ordinal and top is not None else None,
        batter=duelo.batter,
        pitcher=duelo.pitcher,
        pitches=[_pitch(e) for e in eventos],
        zone_top=zona.get("strikeZoneTop") or 3.5,
        zone_bottom=zona.get("strikeZoneBottom") or 1.6,
        result_es=None if actual else evento_es(evento),
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


def _side(side: dict, ls_side: dict, gd_team: Optional[dict] = None) -> TeamDetail:
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

    # El equipo del boxscore no trae abreviatura; la de gameData sí. Hace
    # falta para los equipos que no son de LIDOM (el modo de prueba con la MLB).
    team = {**(gd_team or {}), **(side.get("team") or {})}
    ts = side.get("teamStats") or {}
    bat, pit = ts.get("batting") or {}, ts.get("pitching") or {}
    totals = TeamTotals(
        hits=_i(bat, "hits"), walks=_i(bat, "baseOnBalls"), strikeouts=_i(bat, "strikeOuts"),
        home_runs=_i(bat, "homeRuns"), left_on_base=_i(bat, "leftOnBase"),
        pitches=_i(pit, "numberOfPitches") or _i(pit, "pitchesThrown"),
    ) if ts else None
    return TeamDetail(
        totals=totals,
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
        home=_side(bx_teams.get("home") or {}, ls_teams.get("home") or {},
                   (game_data.get("teams") or {}).get("home")),
        away=_side(bx_teams.get("away") or {}, ls_teams.get("away") or {},
                   (game_data.get("teams") or {}).get("away")),
        at_bat=_at_bat(all_plays, bx_teams),
        matchup=_matchup(all_plays, bx_teams),
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
    "TeamTotals",
    "AtBat",
    "Matchup",
    "PitchLine",
    "HitData",
    "LiveGameDetail",
    "parse_game_detail",
]
