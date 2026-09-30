"""Validación cruzada de las dos capas, temporada por temporada, contra la base real.

Las tablas planas (standings, batting_stats, pitching_stats) salen de /standings
y /stats de la MLB API. El esquema de juego sale de /schedule + /boxscore y se
agrega en las vistas (v_standings, v_batting_season, v_pitching_season). Son dos
caminos independientes desde la misma fuente: si la agregación está bien, dan lo
mismo. Esta suite lo comprueba para cada temporada que exista en las DOS capas.

Qué se compara:
- Posiciones: G, P, carreras anotadas y permitidas de cada equipo.
- Bateo: los totales de la liga (VB, H, 2B, 3B, HR, C, CI, BB, K, BR) y, jugador
  por jugador, VB/H/HR/BB/K. Cruzados por el id de la MLB (players.mlb_id), y
  sumando los equipos de quien cambió de club a mitad de campaña: la tabla plana
  lo trae en una sola fila y la vista, una por equipo.
- Pitcheo: totales (outs, H, CL, BB, K, G, P, SV) y, lanzador por lanzador,
  outs/CL/K.

Lo que NO se compara, a propósito: juegos jugados. /stats cuenta `gamesPlayed`
de los lanzadores distinto que las apariciones reales en boxscores (el caso de
Enmanuel Mejía en CLAUDE.md); la vista es la correcta.

── Las diferencias conocidas: los forfeits ─────────────────────────────────────
Dos juegos de la historia se perdieron por forfeit y el ingestor los deja sin
boxscore (CLAUDE.md, "Los forfeits no entran en las posiciones"). Las
temporadas de esos juegos NO pueden cuadrar, y la suite no finge que sí: exige
que la diferencia esté CONFINADA a los dos equipos de ese juego. Posiciones:
solo esos dos equipos pueden diferir, y por un juego como mucho. Jugadores:
solo los de esos dos equipos. Si un día aparece una diferencia en un tercer
equipo, eso es un fallo de verdad y la suite lo dice.

── Las otras: discrepancias de la propia fuente ────────────────────────────────
Con las 14 temporadas cargadas (30-sep-2026) aparecieron cuatro más, chicas, y
ninguna es de nuestra agregación: en los 2.005 juegos finales las líneas suman
exacto el marcador de cada equipo (carreras de bateo y carreras permitidas de
pitcheo). Es /stats el que no coincide con la suma de sus propios boxscores:

- 2017-18: Anderson Feliz tiene un hit más en /stats (36 vs 35) y Tom Windle uno
  más permitido; Engel Beltre, un robo más. Una jugada reanotada después del
  juego (error → hit) que /stats recogió y el boxscore no.
- 2020-21: tres carreras MENOS en /stats (Ruben Sosa, Arismendy Alcántara,
  Narciso Crook, una cada uno). Esa campaña usó el corredor automático en
  extrainnings; lo más probable es que /stats no le acredite la carrera.
- 2021-22: un bloque de estadísticas de Escogido y Águilas que está en /stats
  y en ningún boxscore (5 bateadores, 7 lanzadores, una derrota de Carlos
  Martinez). Las posiciones sí cuadran, así que no es un juego perdido.
- 2023-24: Juan Lagares tiene un VB más en /stats y Cristopher Molina un out
  más: otra jugada reanotada.

La suite no las esconde: las fija EXACTAS (cuánto cambia cada total y qué
jugadores difieren). Si la fuente se corrige o aparece una diferencia nueva,
falla. Para las cifras de la app manda el esquema de juego: es el que se puede
auditar juego por juego.

Uso:  python verify_capas.py            (usa data/lidom_stats.db)
      python verify_capas.py otra.db
"""
import sqlite3
import sys
from collections import defaultdict

from src.constants import LIDOM_TEAMS

DB = sys.argv[1] if len(sys.argv) > 1 else "data/lidom_stats.db"

# season_id → los dos equipos del juego perdido por forfeit (sin boxscore).
FORFEITS = {
    "2016-17": {"GIG", "LIC"},  # 2016-11-22-GIG-LIC-1: GIG 2 – LIC 10, gana LIC
    "2022-23": {"LIC", "AGU"},  # 2022-11-06-LIC-AGU-1: LIC 5 – AGU 6, gana LIC
}

# season_id → lo que /stats trae de más (+) o de menos (−) frente a la suma de
# los boxscores, y qué jugadores (id MLB) difieren. Ver el docstring.
FUENTE = {
    "2017-18": {
        "bateo": {"h": 1, "sb": 1}, "bateadores": {570716},
        "pitcheo": {"h": 1}, "lanzadores": set(),
    },
    "2020-21": {
        "bateo": {"r": -3}, "bateadores": set(),
        "pitcheo": {}, "lanzadores": set(),
    },
    "2021-22": {
        "bateo": {"ab": 9, "h": 3, "d": 1, "r": 4, "rbi": 1, "bb": 2, "so": 5},
        "bateadores": {543633, 596825, 670712, 673237, 688005},
        "pitcheo": {"outs": 28, "h": 15, "er": 12, "bb": 5, "so": 6, "l": 1},
        "lanzadores": {467100, 491703, 593372, 639373, 642759, 669018, 673257},
    },
    "2023-24": {
        "bateo": {"ab": 1}, "bateadores": {501571},
        "pitcheo": {"outs": 1}, "lanzadores": {650654},
    },
}

_CODIGOS = {tid: info["team_code"] for tid, info in LIDOM_TEAMS.items()}


def codigo(team_id) -> str | None:
    """Las tablas planas guardan el código ('AGU') en `team_id`; por si alguna
    fila vieja trae el id numérico de la MLB (667), se traduce."""
    if team_id in _CODIGOS.values():
        return team_id
    try:
        return _CODIGOS.get(int(team_id))
    except (TypeError, ValueError):
        return None

fails: list[str] = []


def check(label: str, ok: bool, detalle: str = "") -> None:
    if not ok:
        fails.append(label)
    print(f"  {'✓' if ok else '✗'} {label}{'' if ok else '  → ' + detalle}")


def season_id(season: str) -> str:
    """'2016' → '2016-17': la MLB nombra la campaña invernal por el año en que empieza."""
    y = int(season)
    return f"{y}-{(y + 1) % 100:02d}"


def outs(ip: float | None) -> int:
    """Las tablas planas guardan IP como fracción (3.333…); se vuelve a outs."""
    return round((ip or 0) * 3)


con = sqlite3.connect(DB)
con.row_factory = sqlite3.Row
q = lambda sql, *p: con.execute(sql, p).fetchall()  # noqa: E731

planas = [r["season"] for r in q("SELECT DISTINCT season FROM standings ORDER BY season")]
de_juego = {r["season_id"] for r in q("SELECT DISTINCT season_id FROM games")}
comunes = [s for s in planas if season_id(s) in de_juego]
sin_planas = sorted(de_juego - {season_id(s) for s in planas})

print(f"Base: {DB}")
print(f"Temporadas en las dos capas: {len(comunes)}  ({', '.join(season_id(s) for s in comunes)})")
if sin_planas:
    print(f"Solo en el esquema de juego (falta `python main.py ingest <año>`): {', '.join(sin_planas)}")

# ── Antes que nada: cada juego cuadra consigo mismo ────────────────────────
# Si las líneas de un juego no suman su marcador, la vista está mal y ninguna
# comparación de abajo significa nada. Carreras de bateo de cada equipo = sus
# carreras; carreras permitidas por su pitcheo = las del rival.
print("\n━━━ Las líneas de cada juego suman su marcador ━━━")
descuadres = q(
    """
    WITH b AS (SELECT game_id, team_code, SUM(runs) AS r FROM batting_lines GROUP BY 1, 2),
         p AS (SELECT game_id, team_code, SUM(runs_allowed) AS ra FROM pitching_lines GROUP BY 1, 2)
    SELECT g.game_id
    FROM games g
    LEFT JOIN b ba ON ba.game_id = g.game_id AND ba.team_code = g.away_team_code
    LEFT JOIN b bh ON bh.game_id = g.game_id AND bh.team_code = g.home_team_code
    LEFT JOIN p pa ON pa.game_id = g.game_id AND pa.team_code = g.away_team_code
    LEFT JOIN p ph ON ph.game_id = g.game_id AND ph.team_code = g.home_team_code
    WHERE g.status = 'final'
      AND (ba.r IS NOT g.away_score OR bh.r IS NOT g.home_score
           OR pa.ra IS NOT g.home_score OR ph.ra IS NOT g.away_score)
    """
)
finales = q("SELECT COUNT(*) AS n FROM games WHERE status = 'final'")[0]["n"]
check(f"los {finales:,} juegos finales cuadran: bateo y pitcheo suman el marcador",
      not descuadres, f"{len(descuadres)} descuadrados, p. ej. {[r['game_id'] for r in descuadres[:3]]}")

for s in comunes:
    sid = season_id(s)
    forfeit = FORFEITS.get(sid, set())
    print(f"\n━━━ {sid} {'(forfeit: ' + '-'.join(sorted(forfeit)) + ')' if forfeit else ''} ━━━")

    # ── Posiciones ─────────────────────────────────────────────────────────
    plana = {
        codigo(r["team_id"]): r
        for r in q("SELECT * FROM standings WHERE season = ?", s)
    }
    vista = {r["team_code"]: r for r in q("SELECT * FROM v_standings WHERE season_id = ?", sid)}
    check(f"{sid}: seis equipos en las dos capas", set(plana) == set(vista) and len(plana) == 6,
          f"planas {sorted(k or '?' for k in plana)} / vista {sorted(vista)}")

    distintos = {}
    for code in sorted(set(plana) & set(vista)):
        p, v = plana[code], vista[code]
        dif = {
            "G": p["wins"] - v["wins"],
            "P": p["losses"] - v["losses"],
            "CA": (p["runs_scored"] or 0) - (v["runs_for"] or 0),
            "CP": (p["runs_allowed"] or 0) - (v["runs_against"] or 0),
        }
        dif = {k: d for k, d in dif.items() if d}
        if dif:
            distintos[code] = dif

    comparados = len(set(plana) & set(vista))
    if not forfeit:
        check(f"{sid}: G-P y carreras idénticas en los {comparados} equipos",
              comparados == 6 and not distintos, str(distintos) or f"{comparados} comparados")
    else:
        fuera = {c: d for c, d in distintos.items() if c not in forfeit}
        check(f"{sid}: las diferencias de posiciones solo tocan a {'/'.join(sorted(forfeit))}",
              not fuera, str(fuera))
        gp = {c: {k: d for k, d in dd.items() if k in ("G", "P")} for c, dd in distintos.items()}
        check(f"{sid}: y como mucho por un juego",
              all(abs(x) <= 1 for dd in gp.values() for x in dd.values()), str(gp))
        print(f"    (diferencia del forfeit: {distintos or 'ninguna'})")

    # ── Bateo ──────────────────────────────────────────────────────────────
    b_plana = q(
        """SELECT mlb_player_id AS id, team_id, at_bats AS ab, hits AS h, doubles AS d, triples AS t,
                  home_runs AS hr, runs AS r, rbi, walks AS bb, strikeouts AS so, stolen_bases AS sb
           FROM batting_stats WHERE season = ?""", s)
    b_vista = q(
        """SELECT p.mlb_id AS id, v.team_code, v.ab, v.h, v.doubles AS d, v.triples AS t, v.hr, v.r,
                  v.rbi, v.bb, v.so, v.sb
           FROM v_batting_season v JOIN players p ON p.player_id = v.player_id
           WHERE v.season_id = ?""", sid)
    campos_b = ["ab", "h", "d", "t", "hr", "r", "rbi", "bb", "so", "sb"]
    tot_p = {k: sum(r[k] or 0 for r in b_plana) for k in campos_b}
    tot_v = {k: sum(r[k] or 0 for r in b_vista) for k in campos_b}
    dif_tot = {k: tot_p[k] - tot_v[k] for k in campos_b if tot_p[k] != tot_v[k]}

    por_p = defaultdict(lambda: defaultdict(int))
    for r in b_plana:
        for k in ("ab", "h", "hr", "bb", "so"):
            por_p[r["id"]][k] += r[k] or 0
    por_v = defaultdict(lambda: defaultdict(int))
    equipos_v = defaultdict(set)
    for r in b_vista:
        for k in ("ab", "h", "hr", "bb", "so"):
            por_v[r["id"]][k] += r[k] or 0
        equipos_v[r["id"]].add(r["team_code"])
    equipos_p = {r["id"]: codigo(r["team_id"]) for r in b_plana}
    malos_b = [i for i in set(por_p) | set(por_v) if dict(por_p.get(i, {})) != dict(por_v.get(i, {}))
               and any(por_p.get(i, {}).get(k, 0) or por_v.get(i, {}).get(k, 0) for k in ("ab", "bb"))]

    fuente = FUENTE.get(sid)
    if fuente:
        check(f"{sid}: totales de bateo iguales salvo la discrepancia conocida de /stats {fuente['bateo']}",
              dif_tot == fuente["bateo"], str(dif_tot))
        check(f"{sid}: y solo difieren los bateadores conocidos ({len(fuente['bateadores'])})",
              set(malos_b) == fuente["bateadores"], str(sorted(set(malos_b) ^ fuente["bateadores"])))
    elif not forfeit:
        check(f"{sid}: totales de bateo idénticos (VB {tot_v['ab']:,}, H {tot_v['h']:,}, HR {tot_v['hr']})",
              not dif_tot, str(dif_tot))
        check(f"{sid}: bateo idéntico jugador por jugador ({len(por_v)} bateadores)",
              not malos_b, f"{len(malos_b)} distintos, p. ej. {malos_b[:3]}")
    else:
        fuera = [i for i in malos_b
                 if not ((equipos_v.get(i, set()) | {equipos_p.get(i)}) & forfeit)]
        check(f"{sid}: las diferencias de bateo solo tocan jugadores de {'/'.join(sorted(forfeit))}",
              not fuera, f"{len(fuera)} fuera, p. ej. {fuera[:3]}")
        print(f"    (diferencia del forfeit en los totales: {dif_tot or 'ninguna'}; {len(malos_b)} bateadores)")

    # ── Pitcheo ────────────────────────────────────────────────────────────
    p_plana = q(
        """SELECT mlb_player_id AS id, team_id, innings_pitched AS ip, hits AS h, earned_runs AS er,
                  walks AS bb, strikeouts AS so, wins AS w, losses AS l, saves AS sv
           FROM pitching_stats WHERE season = ?""", s)
    p_vista = q(
        """SELECT p.mlb_id AS id, v.team_code, v.outs, v.h, v.er, v.bb, v.so, v.wins AS w,
                  v.losses AS l, v.saves AS sv
           FROM v_pitching_season v JOIN players p ON p.player_id = v.player_id
           WHERE v.season_id = ?""", sid)
    campos_p = ["outs", "h", "er", "bb", "so", "w", "l", "sv"]
    tp = {k: sum((outs(r["ip"]) if k == "outs" else (r[k] or 0)) for r in p_plana) for k in campos_p}
    tv = {k: sum(r[k] or 0 for r in p_vista) for k in campos_p}
    dif_tp = {k: tp[k] - tv[k] for k in campos_p if tp[k] != tv[k]}

    pp = defaultdict(lambda: defaultdict(int))
    for r in p_plana:
        pp[r["id"]]["outs"] += outs(r["ip"])
        pp[r["id"]]["er"] += r["er"] or 0
        pp[r["id"]]["so"] += r["so"] or 0
    pv = defaultdict(lambda: defaultdict(int))
    eq_pv = defaultdict(set)
    for r in p_vista:
        for k in ("outs", "er", "so"):
            pv[r["id"]][k] += r[k] or 0
        eq_pv[r["id"]].add(r["team_code"])
    eq_pp = {r["id"]: codigo(r["team_id"]) for r in p_plana}
    malos_p = [i for i in set(pp) | set(pv) if dict(pp.get(i, {})) != dict(pv.get(i, {}))
               and (pp.get(i, {}).get("outs", 0) or pv.get(i, {}).get("outs", 0))]

    if fuente:
        check(f"{sid}: totales de pitcheo iguales salvo la discrepancia conocida de /stats {fuente['pitcheo'] or '(ninguna)'}",
              dif_tp == fuente["pitcheo"], str(dif_tp))
        check(f"{sid}: y solo difieren los lanzadores conocidos ({len(fuente['lanzadores'])})",
              set(malos_p) == fuente["lanzadores"], str(sorted(set(malos_p) ^ fuente["lanzadores"])))
    elif not forfeit:
        check(f"{sid}: totales de pitcheo idénticos (outs {tv['outs']:,}, CL {tv['er']:,}, K {tv['so']:,}, SV {tv['sv']})",
              not dif_tp, str(dif_tp))
        check(f"{sid}: pitcheo idéntico lanzador por lanzador ({len(pv)} lanzadores)",
              not malos_p, f"{len(malos_p)} distintos, p. ej. {malos_p[:3]}")
    else:
        fuera = [i for i in malos_p if not ((eq_pv.get(i, set()) | {eq_pp.get(i)}) & forfeit)]
        check(f"{sid}: las diferencias de pitcheo solo tocan lanzadores de {'/'.join(sorted(forfeit))}",
              not fuera, f"{len(fuera)} fuera, p. ej. {fuera[:3]}")
        print(f"    (diferencia del forfeit en los totales: {dif_tp or 'ninguna'}; {len(malos_p)} lanzadores)")

print()
if not comunes:
    fails.append("no hay ninguna temporada en las dos capas")
if fails:
    print(f"❌ {len(fails)} comprobaciones fallaron:")
    for f in fails:
        print(f"   - {f}")
    sys.exit(1)
print(f"✅ Todas las comprobaciones pasaron ({len(comunes)} temporadas)")
