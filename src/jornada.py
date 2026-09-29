"""
La jornada: lo que pasó (o pasa) en LIDOM en una fecha. Alimenta la portada
"Hoy" de las dos plataformas.

Funciones puras sobre filas de `games`, `batting_lines` y `pitching_lines`.
La ruta (`GET /day`, en api/game_routes.py) hace las consultas, cruza con la
caché en vivo y llama a esto. Aquí no hay SQL ni red, así que la suite puede
probar cada regla con filas escritas a mano.

Tres decisiones que conviene no deshacer:

- **Qué juego se destaca lo decide el marcador, no los datos que tengamos.**
  En vivo, el más apretado. Terminados: entradas extra primero, después el de
  menor diferencia. Elegir "el que tiene franja de probabilidad" haría que la
  portada destacara siempre el mismo tipo de juego por una razón técnica.
- **Las figuras salen de fórmulas conocidas**, no de un criterio inventado:
  para el pitcheo, el Game Score de Bill James; para el bateo, bases totales
  más impulsadas, anotadas, boletos y robos. Con mínimo de 3 entradas para
  un lanzador: un relevista de un out perfecto no es la figura de la noche.
- **La hora se pinta en la de República Dominicana** (UTC−4 todo el año, sin
  horario de verano). La base guarda UTC; un juego de las 8 de la noche es
  00:00 UTC del día siguiente, y por eso la fecha del juego es `game_date` —
  la oficial de la liga— y nunca la parte de fecha del UTC.
"""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone
from typing import Any, Iterable, Optional

from src.live.gumbo import ordinal_es

# República Dominicana: AST, UTC−4 fijo. zoneinfo no hace falta (y en Windows
# necesita el paquete tzdata): no hay cambio de hora que resolver.
RD = timezone(timedelta(hours=-4))

DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]

# Mínimo de outs para que un lanzador cuente como figura: 3 entradas.
OUTS_FIGURA = 9


def hoy_rd(ahora: Optional[datetime] = None) -> date:
    """La fecha de hoy en República Dominicana."""
    return (ahora or datetime.now(timezone.utc)).astimezone(RD).date()


def etiqueta_fecha(d: date) -> str:
    """date(2025, 10, 16) → "Jue 16 oct"."""
    return f"{DIAS[d.weekday()]} {d.day} {MESES[d.month - 1]}"


def hora_local(utc: Optional[str]) -> Optional[str]:
    """
    "2025-10-15 23:30:00.000000" → "7:30 p. m.". Formato de la RAE para la
    hora: "p. m." con espacios, no "PM".
    """
    if not utc:
        return None
    try:
        t = datetime.fromisoformat(str(utc)[:19]).replace(tzinfo=timezone.utc).astimezone(RD)
    except ValueError:
        return None
    h = t.hour % 12 or 12
    return f"{h}:{t.minute:02d} {'a. m.' if t.hour < 12 else 'p. m.'}"


def game_pk_de(source_url: Optional[str]) -> Optional[int]:
    """El gamePk de la MLB sale de la URL del boxscore que se ingestó."""
    m = re.search(r"/game/(\d+)/", source_url or "")
    return int(m.group(1)) if m else None


# ── Qué fecha se muestra ─────────────────────────────────────────────────────


def resolver_fecha(pedida: date, fechas_con_juegos: Iterable[date]) -> Optional[date]:
    """
    La fecha pedida si tuvo juegos; si no, la última jornada anterior; si no
    hay ninguna anterior, la primera posterior.

    Fuera de temporada "hoy" no tiene juegos, y una portada vacía durante
    nueve meses no le sirve a nadie: se muestra la última jornada, y la
    respuesta lo dice (`is_requested: false`) para que el cliente no la llame
    "Hoy".
    """
    fechas = sorted(set(fechas_con_juegos))
    if not fechas:
        return None
    if pedida in fechas:
        return pedida
    anteriores = [f for f in fechas if f < pedida]
    return anteriores[-1] if anteriores else fechas[0]


def franja_de_fechas(centro: date, conteo: dict[date, int], dias: int = 3) -> list[dict]:
    """Los días alrededor de la jornada, con cuántos juegos tuvo cada uno."""
    salida = []
    for k in range(-dias, dias + 1):
        d = centro + timedelta(days=k)
        salida.append({
            "date": d.isoformat(),
            "label": etiqueta_fecha(d),
            "games": conteo.get(d, 0),
        })
    return salida


# ── El estado de cada juego ──────────────────────────────────────────────────


def etiqueta_estado(juego: dict) -> str:
    """
    Lo que va en la esquina de la tarjeta: "FINAL", "FINAL (10)", "7:30 p. m.",
    "Baja del 5to", "POSPUESTO".
    """
    st = juego["status"]
    if st == "final":
        n = juego.get("innings") or 9
        return f"FINAL ({n})" if n > 9 else "FINAL"
    if st == "live":
        lado = "Alta" if juego.get("is_top_inning") else "Baja"
        return f"{lado} del {juego.get('inning_ordinal') or ordinal_es(juego.get('inning') or 1)}"
    if st == "postponed":
        return "POSPUESTO"
    if st == "cancelled":
        return "CANCELADO"
    if st == "no_result":
        return "SIN RESULTADO"
    return juego.get("time_local") or "Por definir"


def ganador(juego: dict) -> Optional[str]:
    """El código del que ganó, o None si no ha terminado. Nunca en empate."""
    if juego["status"] != "final":
        return None
    a, h = juego["away"]["runs"], juego["home"]["runs"]
    if a is None or h is None or a == h:
        return None
    return juego["home"]["code"] if h > a else juego["away"]["code"]


def destacado(juegos: list[dict]) -> Optional[dict]:
    """
    El juego de la portada.

    - Si hay juegos en curso, el más apretado de ellos; a igual diferencia, el
      que va más avanzado. Es el que la gente quiere mirar ahora.
    - Si no, entre los terminados: primero los de entradas extra, después el
      de menor diferencia, después el de más carreras (un 9-8 antes que un
      2-1: los dos son de una carrera, el primero tuvo más que contar).
    - Si no ha empezado ninguno, el primero de la tarde.
    """
    vivos = [j for j in juegos if j["status"] == "live"]
    if vivos:
        return min(vivos, key=lambda j: (
            abs((j["home"]["runs"] or 0) - (j["away"]["runs"] or 0)),
            -(j.get("inning") or 0),
        ))
    finales = [j for j in juegos if j["status"] == "final"]
    if finales:
        return min(finales, key=lambda j: (
            -(1 if (j.get("innings") or 9) > 9 else 0),
            abs(j["home"]["runs"] - j["away"]["runs"]),
            -(j["home"]["runs"] + j["away"]["runs"]),
            j.get("start_utc") or "",
        ))
    programados = [j for j in juegos if j["status"] == "scheduled"]
    if programados:
        return min(programados, key=lambda j: j.get("start_utc") or "")
    return None


# ── Figuras ──────────────────────────────────────────────────────────────────


def entradas(outs: int) -> str:
    """16 outs → "5.1". Notación de béisbol: después del punto van outs."""
    return f"{outs // 3}.{outs % 3}"


def puntos_bateo(b: dict) -> int:
    """Bases totales + impulsadas + anotadas + boletos + robos."""
    sencillos = b["hits"] - b["doubles"] - b["triples"] - b["home_runs"]
    bases = sencillos + 2 * b["doubles"] + 3 * b["triples"] + 4 * b["home_runs"]
    return (bases + b["rbi"] + b["runs"] + b["walks"] + b["hit_by_pitch"]
            + b["stolen_bases"] - b["caught_stealing"])


def game_score(p: dict) -> int:
    """
    El Game Score de Bill James: 50, más un punto por out, dos por cada
    entrada completa después de la cuarta, uno por ponche; menos dos por hit,
    cuatro por limpia, dos por sucia y uno por boleto.
    """
    outs = p["outs_recorded"]
    sucias = p["runs_allowed"] - p["earned_runs"]
    return (50 + outs + 2 * max(0, outs // 3 - 4) + p["strikeouts"]
            - 2 * p["hits_allowed"] - 4 * p["earned_runs"] - 2 * sucias
            - p["walks_allowed"])


def linea_bateo(b: dict) -> str:
    """ "2-3 · HR · 5 CI". Lo que hizo, en el orden en que se lee un boxscore."""
    partes = [f"{b['hits']}-{b['at_bats']}"]
    for n, sigla in ((b["doubles"], "2B"), (b["triples"], "3B"), (b["home_runs"], "HR")):
        if n:
            partes.append(sigla if n == 1 else f"{n} {sigla}")
    if b["rbi"]:
        partes.append(f"{b['rbi']} CI")
    if b["runs"] >= 2:
        partes.append(f"{b['runs']} CA")
    if b["walks"] >= 2:
        partes.append(f"{b['walks']} BB")
    if b["stolen_bases"]:
        partes.append(f"{b['stolen_bases']} BR" if b["stolen_bases"] > 1 else "BR")
    return " · ".join(partes)


DECISION_ES = {"W": "G", "L": "P", "SV": "SV", "HLD": "HLD", "BS": "SV fallido"}


def linea_pitcheo(p: dict) -> str:
    """ "G · 5.0 IP · 6 K · 2 CL". La decisión primero: es lo primero que se pregunta."""
    partes = []
    if p.get("decision") in ("W", "L", "SV"):
        partes.append(DECISION_ES[p["decision"]])
    partes.append(f"{entradas(p['outs_recorded'])} IP")
    partes.append(f"{p['strikeouts']} K")
    partes.append(f"{p['earned_runs']} CL")
    return " · ".join(partes)


def figuras(bateo: list[dict], pitcheo: list[dict], n: int = 2) -> list[dict]:
    """
    Las figuras de la jornada: los `n` mejores bateadores y los `n` mejores
    lanzadores, intercalados (bateo, pitcheo, bateo, pitcheo) como en la
    maqueta. Cada fila trae `game_id`, `team_code`, `opponent` y el nombre.

    Un bateador necesita al menos un hit para ser figura: tres boletos y dos
    robos suman, pero la portada no abre con alguien que no bateó de hit.
    """
    b = sorted(
        (x for x in bateo if x["hits"] > 0),
        key=lambda x: (-puntos_bateo(x), -x["rbi"], x["full_name"]),
    )[:n]
    p = sorted(
        (x for x in pitcheo if x["outs_recorded"] >= OUTS_FIGURA),
        key=lambda x: (-game_score(x), -x["outs_recorded"], x["full_name"]),
    )[:n]
    salida: list[dict] = []
    for k in range(n):
        if k < len(b):
            x = b[k]
            salida.append({
                "kind": "batting", "player_id": x["player_id"], "full_name": x["full_name"],
                "team_code": x["team_code"], "opponent": x["opponent"], "game_id": x["game_id"],
                "line": linea_bateo(x), "score": puntos_bateo(x),
            })
        if k < len(p):
            x = p[k]
            salida.append({
                "kind": "pitching", "player_id": x["player_id"], "full_name": x["full_name"],
                "team_code": x["team_code"], "opponent": x["opponent"], "game_id": x["game_id"],
                "line": linea_pitcheo(x), "score": game_score(x),
            })
    return salida


# ── El titular del destacado ────────────────────────────────────────────────


def _plural(n: int, uno: str, varios: str) -> str:
    return uno if n == 1 else f"{n} {varios}"


def frase_figura(f: dict, lineas_bateo: dict[str, dict], lineas_pitcheo: dict[str, dict]) -> Optional[str]:
    """
    La figura del juego en una frase: "Jonrón y 5 impulsadas de Rodolfo
    Castro." o "Esmil Rogers: 5 entradas y 6 ponches." Se compone de los
    conteos, nunca de la línea abreviada.
    """
    if f["kind"] == "batting":
        b = lineas_bateo.get(f["player_id"])
        if not b:
            return None
        partes = []
        if b["home_runs"]:
            partes.append(_plural(b["home_runs"], "jonrón", "jonrones"))
        if b["rbi"]:
            partes.append(_plural(b["rbi"], "una impulsada", "impulsadas"))
        if not partes:
            partes.append(f"{b['hits']} de {b['at_bats']}")
        cuerpo = " y ".join([", ".join(partes[:-1]), partes[-1]]) if len(partes) > 1 else partes[0]
        return f"{cuerpo[0].upper()}{cuerpo[1:]} de {f['full_name']}."
    p = lineas_pitcheo.get(f["player_id"])
    if not p:
        return None
    ent = p["outs_recorded"] // 3
    tramo = _plural(ent, "una entrada", "entradas") if p["outs_recorded"] % 3 == 0 else f"{entradas(p['outs_recorded'])} entradas"
    limpias = "sin limpias" if p["earned_runs"] == 0 else _plural(p["earned_runs"], "una limpia", "limpias")
    return f"{f['full_name']}: {tramo}, {_plural(p['strikeouts'], 'un ponche', 'ponches')} y {limpias}."


def titular_destacado(
    juego: dict,
    recorrido: Optional[str],
    figura: Optional[str],
) -> Optional[str]:
    """
    La frase del juego destacado, por orden de lo que cuenta mejor el juego:

    1. El recorrido de la probabilidad, si el juego se siguió en vivo: "Estrellas
       nunca estuvo por debajo del 56%." Lo compone `titular_recorrido`.
    2. Las entradas extra: "Licey lo resolvió en la entrada 10."
    3. La figura del juego.
    """
    if juego["status"] != "final":
        return None
    if recorrido:
        return recorrido
    n = juego.get("innings") or 9
    g = ganador(juego)
    if n > 9 and g:
        lado = juego["home"] if juego["home"]["code"] == g else juego["away"]
        return f"{lado['short_name']} lo resolvió en la entrada {n}."
    return figura


def armar_juego(fila: dict, nombres: dict[str, dict], hoy: Optional[date] = None) -> dict[str, Any]:
    """
    Una fila de `games` en la forma que sirve la jornada.

    Un juego `scheduled` de una fecha ya pasada no está programado: es uno que
    la base nunca cerró — el forfeit de 2016, un pospuesto sin reposición —.
    Pintarlo con su hora ("7:15 p. m." en 2016) invita a esperarlo. Pasa a
    `no_result` ("SIN RESULTADO").
    """
    def lado(code: str, runs: Any) -> dict:
        info = nombres.get(code, {})
        return {
            "code": code,
            "name": info.get("full_name", code),
            "short_name": info.get("short_name", code),
            "runs": runs,
        }

    juego = {
        "game_id": fila["game_id"],
        "season_id": fila.get("season_id"),
        "game_pk": game_pk_de(fila.get("source_url")),
        "status": fila["status"],
        "start_utc": str(fila["game_datetime_utc"]) if fila.get("game_datetime_utc") else None,
        "time_local": hora_local(fila.get("game_datetime_utc")),
        "venue": fila.get("venue"),
        "innings": fila.get("innings_played"),
        "away": lado(fila["away_team_code"], fila.get("away_score")),
        "home": lado(fila["home_team_code"], fila.get("home_score")),
    }
    dia = str(fila.get("game_date") or "")[:10]
    if juego["status"] == "scheduled" and dia and dia < (hoy or hoy_rd()).isoformat():
        juego["status"] = "no_result"
    # Un juego que no ha empezado no tiene marcador, aunque la fila traiga
    # ceros de la siembra: 0-0 a las 5 de la tarde sería mentira.
    if juego["status"] not in ("final", "live"):
        juego["away"]["runs"] = juego["home"]["runs"] = None
    return juego
