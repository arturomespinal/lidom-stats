"""
verify_analitica.py — Comprueba la capa analítica (Parquet + dbt + Dagster) sin red.

Necesita las dependencias de la orquestación, que incluyen las de la capa:

    pip install -r requirements-orquestacion.txt
    python verify_analitica.py

Qué comprueba:
1. Las reglas exportadas son las de Python: categorías, ANIO_CORTE, mínimos.
2. Contra una base SINTÉTICA con las dos fuentes: el Parquet, `dbt build`
   en verde, una sola fuente por temporada, la postemporada fuera, el
   cambiado de equipo en una fila, los nombres de la planilla arreglados, y
   el mínimo de calificación redondeado como Python (46.5 → 46, no 47).
3. La carrera de CADA persona en dbt es la de `carreras()` de
   src/historia.py, la que sirve la API: dos implementaciones, un resultado.
4. Las pruebas de dbt fallan cuando se daña el Parquet a propósito.
5. Dagster: el Parquet y los modelos como assets, las pruebas de dbt como
   checks, de punta a punta.
6. Contra la base REAL, si existe: `dbt build` en verde, cada temporada de la
   MLB API igual a la suma de sus líneas en SQLite, y la carrera de cada
   persona igual a `carreras()`.
"""

import contextlib
import io
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import warnings
from datetime import date
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
warnings.filterwarnings("ignore")  # los avisos "beta" de Dagster no son fallos

from loguru import logger  # noqa: E402

logger.remove()
logger.add(sys.stderr, level="WARNING")

import duckdb  # noqa: E402
import pyarrow.parquet as pq  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from src.exportar import exportar  # noqa: E402
from src.historia import (  # noqa: E402
    ANIO_CORTE, CATEGORIAS_BATEO, CATEGORIAS_PITCHEO, MIN_OUTS_CARRERA, MIN_PA_CARRERA, carreras,
)
from src.models import flat_models  # noqa: E402,F401
from src.models.database import BattingLine, Game, PitchingLine, Player, Season, Team, get_engine, init_db  # noqa: E402
from src.models.hist_models import HistBateo, HistEnlace, HistJugador, HistPitcheo, etiqueta_historica  # noqa: E402
from src.qualification import qualifying_ip, qualifying_pa  # noqa: E402

RAIZ = Path(__file__).resolve().parent
PROYECTO = RAIZ / "analitica"
fails: list[str] = []


def check(label, got, want):
    ok = got == want
    if not ok:
        fails.append(label)
    print(f"  {'✓' if ok else '✗'} {label}: {got}" + ("" if ok else f"  (esperado {want})"))


TMP = Path(tempfile.mkdtemp(prefix="analitica_"))


def dbt_build(parquet: Path, base_duckdb: Path) -> dict[str, str]:
    """`dbt build` sobre ese Parquet, a esa base. Devuelve el estado de cada
    nodo (modelo o prueba) por nombre."""
    from orquestacion.analitica import ejecutable_dbt

    destino = TMP / "target"
    entorno = {**os.environ, "LIDOM_PARQUET_DIR": str(parquet), "LIDOM_DUCKDB_PATH": str(base_duckdb),
               "DBT_SEND_ANONYMOUS_USAGE_STATS": "false"}
    p = subprocess.run(
        [ejecutable_dbt(), "build", "--target-path", str(destino), "--log-path", str(TMP / "logs")],
        cwd=PROYECTO, env=entorno, capture_output=True, text=True,
    )
    resultados = destino / "run_results.json"
    if not resultados.exists():
        print(p.stdout[-3000:], p.stderr[-3000:])
        return {}
    estados = {r["unique_id"].split(".")[2]: r["status"] for r in json.loads(resultados.read_text())["results"]}
    resultados.unlink()
    return estados


def fallidos(estados: dict[str, str]) -> list[str]:
    """Las pruebas que fallaron o avisaron y los modelos con error. Lo que dbt
    salta porque una prueba de un modelo anterior falló no cuenta aquí: eso
    es el bloqueo, y se comprueba aparte."""
    return sorted(n for n, s in estados.items() if s in ("fail", "error", "warn"))


def saltados(estados: dict[str, str]) -> list[str]:
    return sorted(n for n, s in estados.items() if s == "skipped")


def comparar_carreras(con_duck, engine, etiqueta: str) -> None:
    """Persona por persona, la carrera de dbt contra la de src/historia.py."""
    for grupo, tabla, conteos, tasas in (
        ("bateo", "fct_carrera_bateo",
         ("games", "pa", "ab", "h", "doubles", "triples", "hr", "r", "rbi", "bb", "so", "sb", "hbp", "sf"),
         ("avg", "obp", "slg", "ops")),
        ("pitcheo", "fct_carrera_pitcheo",
         ("games", "games_started", "wins", "losses", "saves", "outs", "h", "er", "bb", "so"),
         ("era", "whip")),
    ):
        with engine.connect() as conn:
            py = carreras(conn, grupo)
        cols = ("persona",) + conteos + tasas + ("califica",)
        dbt = {r[0]: dict(zip(cols, r)) for r in con_duck.execute(f"SELECT {', '.join(cols)} FROM {tabla}").fetchall()}
        check(f"{etiqueta}, {grupo}: las mismas personas ({len(py)})", set(dbt) == set(py), True)
        conteo_mal = [p for p in py if p in dbt and any(dbt[p][k] != py[p][k] for k in conteos)]
        check(f"{etiqueta}, {grupo}: los mismos conteos en cada carrera", conteo_mal[:5], [])
        # Las tasas, a la precisión con que se pintan: el redondeo de Python y
        # el de DuckDB pueden diferir en un medio exacto, nada más.
        tol = {"avg": 0.0011, "obp": 0.0011, "slg": 0.0011, "ops": 0.0021, "era": 0.011, "whip": 0.011}
        tasa_mal = [
            (p, k, dbt[p][k], py[p][k]) for p in py if p in dbt for k in tasas
            if (dbt[p][k] is None) != (py[p][k] is None)
            or (py[p][k] is not None and abs(dbt[p][k] - py[p][k]) > tol[k])
        ]
        check(f"{etiqueta}, {grupo}: las mismas tasas", tasa_mal[:5], [])
        califica_mal = [p for p in py if p in dbt and bool(dbt[p]["califica"]) != bool(py[p]["califica"])]
        check(f"{etiqueta}, {grupo}: califican los mismos", califica_mal[:5], [])


# ─────────────────────────────────────────────────────────────────────────────
print("━━━ 1. Las reglas exportadas ━━━")
from src.exportar import categorias, constantes  # noqa: E402

check("categorías: las 13 de bateo y las 8 de pitcheo de src/historia.py",
      sorted((c["grupo"], c["stat"]) for c in categorias()),
      sorted([("bateo", s) for s in CATEGORIAS_BATEO] + [("pitcheo", s) for s in CATEGORIAS_PITCHEO]))
check("la EFE y el WHIP: menor es mejor", sorted(c["stat"] for c in categorias() if not c["mayor_es_mejor"]),
      ["era", "whip"])
check("constantes", constantes(), [{"anio_corte": ANIO_CORTE, "min_pa_carrera": MIN_PA_CARRERA,
                                    "min_outs_carrera": MIN_OUTS_CARRERA}])
check("el caso del redondeo: 15 juegos piden 46 AP (Python redondea 46.5 al par)", qualifying_pa(15), 46)


# ─────────────────────────────────────────────────────────────────────────────
print("\n━━━ 2. Base sintética con las dos fuentes ━━━")


def bateo_h(temporada, id_miembro, team, etapa="SR", **conteos):
    base = dict(games=10, at_bats=0, runs=0, hits=0, doubles=0, triples=0, home_runs=0, rbi=0, walks=0,
                intentional_walks=0, strikeouts=0, stolen_bases=0, caught_stealing=0, hit_by_pitch=0,
                sacrifice_flies=0, sacrifice_bunts=0, grounded_into_dp=0)
    base.update(conteos)
    return HistBateo(temporada=temporada, etapa=etapa, id_equipo={"AGU": "01", "LIC": "02"}[team],
                     id_miembro=id_miembro, season_id=etiqueta_historica(temporada), team_code=team, **base)


def pitcheo_h(temporada, id_miembro, team, etapa="SR", **conteos):
    base = dict(wins=0, losses=0, games=5, games_started=0, games_finished=0, complete_games=0, shutouts=0,
                saves=0, outs=0, hits_allowed=0, runs_allowed=0, earned_runs=0, home_runs_allowed=0,
                walks_allowed=0, intentional_walks_allowed=0, strikeouts=0, hit_batters=0, wild_pitches=0, balks=0)
    base.update(conteos)
    return HistPitcheo(temporada=temporada, etapa=etapa, id_equipo={"AGU": "01", "LIC": "02"}[team],
                       id_miembro=id_miembro, season_id=etiqueta_historica(temporada), team_code=team, **base)


SINT = TMP / "sintetica.db"
engine = init_db(f"sqlite:///{SINT}")
with Session(engine) as s, s.begin():
    for code in ("AGU", "LIC"):
        s.add(Team(team_code=code, full_name=code))
    s.add(Season(season_id="2015-16", short_label="15-16"))
    s.add(Player(player_id="p-uno", full_name="Juan Pérez"))
    s.add(Player(player_id="moises-sierra", full_name="Moisés Sierra"))
    s.add(Player(player_id="p-cerrador", full_name="Cerrador Uno"))
    # Tres juegos de la regular 2015-16 y uno de postemporada que no cuenta.
    # Los marcadores salen de las carreras de las líneas: los juegos cuadran.
    juegos = [("g0", "AGU", "LIC", "regular"), ("g1", "LIC", "AGU", "regular"),
              ("g2", "AGU", "LIC", "regular"), ("g3", "AGU", "LIC", "round_robin")]
    corridas = {"g0": {"AGU": 3, "LIC": 1}, "g1": {"AGU": 2, "LIC": 4}, "g2": {"AGU": 5, "LIC": 0},
                "g3": {"AGU": 7, "LIC": 2}}
    for n, (gid, casa, visita, etapa) in enumerate(juegos):
        s.add(Game(game_id=gid, season_id="2015-16", game_date=date(2015, 10, 20 + n), home_team_code=casa,
                   away_team_code=visita, home_score=corridas[gid][casa], away_score=corridas[gid][visita],
                   stage=etapa, status="final"))
        # Juan Pérez (AGU) anota todas las de AGU; Moisés Sierra, las de LIC.
        s.add(BattingLine(game_id=gid, player_id="p-uno", team_code="AGU", at_bats=4, hits=2, home_runs=1,
                          runs=corridas[gid]["AGU"], walks=1, plate_appearances=5))
        s.add(BattingLine(game_id=gid, player_id="moises-sierra", team_code="LIC", at_bats=4, hits=1,
                          runs=corridas[gid]["LIC"], plate_appearances=4))
        s.add(PitchingLine(game_id=gid, player_id="p-cerrador", team_code="LIC", outs_recorded=3,
                           earned_runs=1, hits_allowed=1, decision="SV" if gid == "g1" else None))

    # DIGIMETRICS. 1 = Juan Pérez, enlazado. 1990 de la regular, su
    # postemporada (no cuenta) y 2015 (ya viene de la MLB API: no cuenta).
    s.add(HistJugador(id_miembro=1, nombre="JUAN PEREZ"))
    s.add(HistEnlace(id_miembro=1, player_id="p-uno", metodo="nombre", coincidencias=1))
    s.add(bateo_h(1990, 1, "AGU", at_bats=400, hits=120, home_runs=10, walks=40))
    s.add(bateo_h(1990, 1, "AGU", etapa="RR", at_bats=40, hits=15, home_runs=4))
    s.add(bateo_h(2015, 1, "AGU", at_bats=12, hits=6, home_runs=3))
    # 5 = una leyenda solo de DIGIMETRICS, con el nombre de la planilla.
    s.add(HistJugador(id_miembro=5, nombre="DIOM. GUAYUBIN OLIVO"))
    s.add(bateo_h(1960, 5, "LIC", at_bats=800, hits=300, home_runs=5, walks=100, hit_by_pitch=5,
                  sacrifice_flies=5, sacrifice_bunts=10, doubles=40, triples=10))
    s.add(bateo_h(1963, 5, "LIC", at_bats=700, hits=200, home_runs=4))
    # Sus temporadas con decisiones de pitcheo, de donde salen sus mínimos.
    s.add(HistJugador(id_miembro=9, nombre="LANZADOR VIEJO"))
    s.add(pitcheo_h(1960, 9, "LIC", wins=20, losses=18, outs=600, earned_runs=80, hits_allowed=190))
    s.add(pitcheo_h(1963, 9, "LIC", wins=15, losses=15, outs=500, earned_runs=70, hits_allowed=170))
    # 6 = cambió de equipo en 1990: una sola fila, los dos equipos sumados.
    s.add(HistJugador(id_miembro=6, nombre="PEDRO CAMBIADO"))
    s.add(bateo_h(1990, 6, "AGU", at_bats=20, hits=8, home_runs=6))
    s.add(bateo_h(1990, 6, "LIC", at_bats=22, hits=5, home_runs=4))
    # 7 = 46 apariciones en 1990 (40 VB + 6 BB), con un AVG de .500. 1990
    # tiene 15 juegos por equipo (las decisiones de AGU: 8-7) y el mínimo es
    # 3.1 × 15 = 46.5: Python lo redondea a 46 y califica; con el ROUND de SQL
    # serían 47 y se quedaría fuera.
    s.add(HistJugador(id_miembro=7, nombre="RAMON EXACTO"))
    s.add(bateo_h(1990, 7, "LIC", at_bats=40, hits=20, walks=6))
    # 8 = lo mismo con 45: no califica.
    s.add(HistJugador(id_miembro=8, nombre="LUIS CORTO"))
    s.add(bateo_h(1990, 8, "LIC", at_bats=39, hits=25, walks=6))
    # Lanzadores de 1990: AGU 8-7 (15 juegos). Mínimo 0.6 × 15 = 9 entradas.
    s.add(HistJugador(id_miembro=10, nombre="ABRIDOR BUENO"))
    s.add(pitcheo_h(1990, 10, "AGU", wins=5, losses=3, outs=60, earned_runs=4, hits_allowed=15,
                    walks_allowed=5, games_started=8, games=8))
    s.add(HistJugador(id_miembro=11, nombre="ABRIDOR MALO"))
    s.add(pitcheo_h(1990, 11, "AGU", wins=3, losses=4, outs=45, earned_runs=15, hits_allowed=40,
                    walks_allowed=20, games_started=7, games=7))
    # 12 = EFE 0.00 en dos entradas: no califica y no puede encabezar la EFE.
    s.add(HistJugador(id_miembro=12, nombre="RELEVO FUGAZ"))
    s.add(pitcheo_h(1990, 12, "LIC", wins=0, losses=0, outs=6, earned_runs=0, games=2))
engine.dispose()

PQ = TMP / "parquet"
filas = exportar(f"sqlite:///{SINT}", PQ)
check("el Parquet: las tablas y las cuatro derivadas",
      {k: filas[k] for k in ("games", "batting_lines", "hist_bateo", "hist_pitcheo", "hist_enlaces",
                             "minimos_temporada", "nombres_historicos", "categorias", "constantes")},
      {"games": 4, "batting_lines": 8, "hist_bateo": 9, "hist_pitcheo": 5, "hist_enlaces": 1,
       "minimos_temporada": 4, "nombres_historicos": 9, "categorias": 21, "constantes": 1})
check("ningún archivo a medias queda en la carpeta", sorted(p.name for p in PQ.iterdir() if p.suffix != ".parquet"), [])
minimos = {r["season_id"]: r for r in pq.read_table(PQ / "minimos_temporada.parquet").to_pylist()}
check("mínimos de 2015-16: 3 juegos (de v_standings, sin la postemporada)",
      minimos["2015-16"], {"season_id": "2015-16", "juegos_equipo": 3, "min_pa": qualifying_pa(3),
                           "min_ip": qualifying_ip(3), "min_outs": 6})
check("mínimos de 1990-91: 15 juegos (8-7 de AGU), 46 AP y 27 outs",
      (minimos["1990-91"]["juegos_equipo"], minimos["1990-91"]["min_pa"], minimos["1990-91"]["min_outs"]),
      (15, 46, 27))
nombres = {r["id_miembro"]: r["nombre"] for r in pq.read_table(PQ / "nombres_historicos.parquet").to_pylist()}
check("el nombre de la planilla, como lo escribe la app", nombres[5], 'Diómedes "Guayubín" Olivo')
check("los tipos se conservan (BOOLEAN de SQLite → bool de Arrow)",
      str(pq.read_schema(PQ / "pitching_lines.parquet").field("is_starter").type), "bool")

DUCK = TMP / "sintetica.duckdb"
estados = dbt_build(PQ, DUCK)
check("dbt build: todos los modelos y todas las pruebas en verde", (len(estados) > 30, fallidos(estados)), (True, []))

con = duckdb.connect(str(DUCK), read_only=True)
bateo = {(r[0], r[1]): r[2:] for r in con.execute(
    "SELECT persona, season_id, fuente, equipos, ab, hr, pa, califica FROM fct_bateo_temporada").fetchall()}
check("Juan Pérez: 1990-91 de la liga y 2015-16 de la MLB API, sin su 2015 de DIGIMETRICS",
      sorted((k[1], v[0], v[2]) for k, v in bateo.items() if k[0] == "p-uno"),
      [("1990-91", "liga", 400), ("2015-16", "mlb", 12)])
check("la postemporada no entra: ni el round robin de 1990 ni el juego g3",
      bateo[("p-uno", "1990-91")][2] + bateo[("p-uno", "2015-16")][2], 412)
check("el cambiado de equipo: una fila, AGU/LIC, 10 jonrones",
      (bateo[("hist:6", "1990-91")][1], bateo[("hist:6", "1990-91")][3]), ("AGU/LIC", 10))
check("46 AP en una temporada de 15 juegos: califica (46.5 → 46 en Python)",
      bateo[("hist:7", "1990-91")][4:], (46, True))
check("45 AP: no califica", bateo[("hist:8", "1990-91")][4:], (45, False))

mejores = con.execute("SELECT stat, puesto, nombre, season_id, valor FROM mejores_temporadas ORDER BY stat, puesto, nombre").fetchall()
por_stat: dict[str, list] = {}
for stat, puesto, nombre, sid, valor in mejores:
    por_stat.setdefault(stat, []).append((puesto, nombre, sid, valor))
check("HR: el empate comparte el puesto (1, 1, 3…)", [(p, n) for p, n, _, _ in por_stat["hr"][:3]],
      [(1, "Juan Pérez"), (1, "Pedro Cambiado"), (3, "Diómedes \"Guayubín\" Olivo")])
avg_nombres = [n for _, n, _, _ in por_stat["avg"]]
check("AVG: entra el .500 de 46 AP (empatado en el 1º) y no el .641 de 45",
      ([(p, v) for p, n, _, v in por_stat["avg"] if n == "Ramón Exacto"], "Luis Corto" in avg_nombres),
      ([(1, 0.5)], False))
check("EFE: de menor a mayor, empates compartidos, y sin el 0.00 de dos entradas",
      [(p, n, v) for p, n, _, v in por_stat["era"]],
      [(1, "Abridor Bueno", 1.8), (2, "Lanzador Viejo", 3.6), (3, "Lanzador Viejo", 3.78),
       (4, "Abridor Malo", 9.0), (4, "Cerrador Uno", 9.0)])
check("salvados: el de la MLB API (2015-16) cuenta", [(n, v) for _, n, _, v in por_stat["saves"]][:1],
      [("Cerrador Uno", 1.0)])
dim = dict(con.execute("SELECT persona, nombre FROM dim_personas").fetchall())
check("dim_personas: el enlazado con su nombre de la MLB API, el histórico con el arreglado",
      (dim["p-uno"], dim["hist:5"]), ("Juan Pérez", 'Diómedes "Guayubín" Olivo'))
check("la base de DuckDB no guarda vistas con rutas al Parquet",
      con.execute("SELECT count(*) FROM duckdb_views() WHERE NOT internal").fetchone()[0], 0)

print("\n━━━ 3. La carrera: dbt contra src/historia.py ━━━")
engine = get_engine(f"sqlite:///{SINT}")
comparar_carreras(con, engine, "sintética")
uno = con.execute("SELECT ab, h, hr, temporadas, primera, ultima FROM fct_carrera_bateo WHERE persona='p-uno'").fetchone()
check("Juan Pérez: 412 VB, 126 H, 13 HR en dos temporadas, de 1990-91 a 2015-16", uno,
      (412, 126, 13, 2, "1990-91", "2015-16"))
con.close()
engine.dispose()


# ─────────────────────────────────────────────────────────────────────────────
print("\n━━━ 4. Las pruebas de dbt fallan con el Parquet dañado ━━━")
import pyarrow as pa  # noqa: E402


def danar(nombre: str, cambio) -> Path:
    """Copia el Parquet y aplica `cambio` a la tabla `nombre` (lista de filas)."""
    destino = TMP / f"danado_{nombre}"
    shutil.rmtree(destino, ignore_errors=True)
    shutil.copytree(PQ, destino)
    t = pq.read_table(destino / f"{nombre}.parquet")
    pq.write_table(pa.Table.from_pylist(cambio(t.to_pylist()), schema=t.schema), destino / f"{nombre}.parquet")
    return destino


# Una línea duplicada: el juego deja de sumar su marcador.
d = danar("batting_lines", lambda fs: fs + [fs[0]])
estados = dbt_build(d, TMP / "d1.duckdb")
check("una línea de bateo duplicada → juegos_cuadran_en_parquet", fallidos(estados), ["juegos_cuadran_en_parquet"])
check("y la prueba BLOQUEA: lo que sale de fct_bateo_temporada no se construye",
      [m for m in ("fct_carrera_bateo", "dim_personas", "mejores_temporadas") if m in saltados(estados)],
      ["fct_carrera_bateo", "dim_personas", "mejores_temporadas"])


# Más hits que turnos.
def mas_hits(fs):
    next(f for f in fs if f["id_miembro"] == 7)["hits"] = 99
    return fs


d = danar("hist_bateo", mas_hits)
check("más hits que turnos → tasas_en_rango_bateo",
      fallidos(dbt_build(d, TMP / "d2.duckdb")), ["tasas_en_rango_bateo"])


# Correr el corte a 2016: 2015-16 saldría de las dos fuentes.
def corte_2016(fs):
    fs[0]["anio_corte"] = 2016
    return fs


d = danar("constantes", corte_2016)
check("el corte movido a 2016 → 2015-16 de las dos fuentes, y la fila de Juan Pérez repetida",
      fallidos(dbt_build(d, TMP / "d3.duckdb")),
      ["corte_de_fuentes_bateo", "corte_de_fuentes_pitcheo", "una_fuente_bateo",
       "unique_fct_bateo_temporada_persona_temporada"])


# Una temporada sin mínimos: nadie calificaría en ella. Es un aviso.
d = danar("minimos_temporada", lambda fs: [f for f in fs if f["season_id"] != "1990-91"])
estados = dbt_build(d, TMP / "d4.duckdb")
check("una temporada sin mínimos → aviso (no fallo) en temporadas_con_minimo",
      (estados.get("temporadas_con_minimo"), [n for n in fallidos(estados) if n != "temporadas_con_minimo"]),
      ("warn", []))


# ─────────────────────────────────────────────────────────────────────────────
print("\n━━━ 5. Dagster: el Parquet y dbt como assets ━━━")
from dagster import DagsterInstance, materialize  # noqa: E402
from dagster_dbt import DbtCliResource  # noqa: E402

from orquestacion import defs  # noqa: E402
from orquestacion.analitica import ARCHIVOS, CapaAnalitica, ejecutable_dbt, modelos_dbt, parquet, proyecto_dbt  # noqa: E402
from orquestacion.recursos import BaseDatos  # noqa: E402
from src.exportar import TABLAS  # noqa: E402

rg = defs.get_repository_def().asset_graph
analitica = sorted(k.to_user_string() for k in rg.get_all_asset_keys() if rg.get(k).group_name == "analitica")
check("los modelos de dbt son assets",
      [a for a in analitica if not a.startswith("parquet/")],
      ["dim_personas", "fct_bateo_temporada", "fct_carrera_bateo", "fct_carrera_pitcheo",
       "fct_pitcheo_temporada", "mejores_temporadas"])
check("y cada archivo de Parquet también", sorted(a for a in analitica if a.startswith("parquet/")),
      sorted(f"parquet/{a}" for a in ARCHIVOS))
check("parquet/games sale de la carga de juegos",
      sorted(p.to_user_string() for p in rg.get(next(k for k in rg.get_all_asset_keys()
                                                      if k.to_user_string() == "parquet/games")).parent_keys),
      ["juegos"])
check("mejores_temporadas lee las categorías exportadas de Python",
      "parquet/categorias" in {p.to_user_string() for p in rg.get(
          next(k for k in rg.get_all_asset_keys() if k.to_user_string() == "mejores_temporadas")).parent_keys},
      True)
singulares = {c.name for c in rg.asset_check_keys} & {p.stem for p in (PROYECTO / "tests").glob("*.sql")}
check("todas las pruebas singulares de dbt son checks",
      sorted(singulares), sorted(p.stem for p in (PROYECTO / "tests").glob("*.sql")))
job = defs.resolve_job_def("capa_analitica")
check("el job capa_analitica toma el Parquet y los modelos", len(job.asset_layer.selected_asset_keys),
      len(ARCHIVOS) + 6)
sched = defs.resolve_schedule_def("cada_manana")
check("su schedule: 6:15 de RD, de octubre a febrero, apagado",
      (sched.cron_schedule, sched.execution_timezone, sched.default_status.value),
      ("15 6 * 10,11,12,1,2 *", "America/Santo_Domingo", "STOPPED"))

PQ_D = TMP / "dagster_parquet"
# dagster-dbt reimprime la salida de dbt; aquí solo estorba.
with contextlib.redirect_stdout(io.StringIO()):
    r = materialize(
        [parquet, modelos_dbt],
        resources={
            "base": BaseDatos(url=f"sqlite:///{SINT}"),
            "analitica": CapaAnalitica(parquet=str(PQ_D), duckdb=str(TMP / "dagster.duckdb")),
            "dbt": DbtCliResource(project_dir=proyecto_dbt, dbt_executable=ejecutable_dbt()),
        },
        instance=DagsterInstance.ephemeral(),
        raise_on_error=False,
        run_config={"loggers": {"console": {"config": {"log_level": "CRITICAL"}}}},
    )
check("la ejecución termina bien", r.success, True)
mat = {e.event_specific_data.materialization.asset_key.to_user_string() for e in r.get_asset_materialization_events()}
check("materializa el Parquet y los seis modelos", len(mat), len(ARCHIVOS) + 6)
evals = r.get_asset_check_evaluations()
check("los checks del Parquet: uno por tabla, todos en verde",
      sorted({(e.check_name, e.passed) for e in evals if e.asset_key.path[0] == "parquet"}),
      [("filas_completas", True)])
check("…y son uno por tabla de la base", sum(1 for e in evals if e.asset_key.path[0] == "parquet"), len(TABLAS))
check("las pruebas de dbt llegan como checks, todas en verde",
      (len([e for e in evals if e.asset_key.path[0] != "parquet"]) > 30,
       sorted(e.check_name for e in evals if not e.passed)), (True, []))
check("el Parquet fue a la carpeta del recurso", (PQ_D / "games.parquet").exists(), True)
check("las variables de entorno no quedan puestas después",
      (os.environ.get("LIDOM_PARQUET_DIR"), os.environ.get("LIDOM_DUCKDB_PATH")), (None, None))


# ─────────────────────────────────────────────────────────────────────────────
print("\n━━━ 6. Contra la base real ━━━")
REAL = RAIZ / "data" / "lidom_stats.db"
if not REAL.exists():
    print("  (sin data/lidom_stats.db: corre las ingestas para esta sección)")
else:
    PQ_R = TMP / "real"
    filas = exportar(f"sqlite:///{REAL}", PQ_R)
    with sqlite3.connect(REAL) as c:
        en_base = {t: c.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in TABLAS
                   if c.execute("SELECT 1 FROM sqlite_master WHERE name=?", (t,)).fetchone()}
        lineas_b = {(p, s): (pa_, ab, h, hr, bb) for p, s, pa_, ab, h, hr, bb in c.execute(
            """SELECT bl.player_id, g.season_id, SUM(bl.plate_appearances), SUM(bl.at_bats), SUM(bl.hits),
                      SUM(bl.home_runs), SUM(bl.walks)
               FROM batting_lines bl JOIN games g ON g.game_id = bl.game_id
               WHERE g.stage = 'regular' AND g.status = 'final' GROUP BY 1, 2""")}
        lineas_p = {(p, s): (o, er, so, w) for p, s, o, er, so, w in c.execute(
            """SELECT pl.player_id, g.season_id, SUM(pl.outs_recorded), SUM(pl.earned_runs),
                      SUM(pl.strikeouts), SUM(CASE WHEN pl.decision = 'W' THEN 1 ELSE 0 END)
               FROM pitching_lines pl JOIN games g ON g.game_id = pl.game_id
               WHERE g.stage = 'regular' AND g.status = 'final' GROUP BY 1, 2""")}
        hay_historia = c.execute("SELECT COUNT(*) FROM hist_bateo").fetchone()[0] > 0 if "hist_bateo" in en_base else False
    check("cada tabla exportada con todas sus filas", {t: filas[t] for t in en_base} == en_base, True)
    estados = dbt_build(PQ_R, TMP / "real.duckdb")
    check(f"dbt build en verde ({len(estados)} nodos)", fallidos(estados), [])
    con = duckdb.connect(str(TMP / "real.duckdb"), read_only=True)
    fb = {(p, s): v for p, s, *v in con.execute(
        "SELECT persona, season_id, pa, ab, h, hr, bb FROM fct_bateo_temporada WHERE fuente = 'mlb'").fetchall()}
    fp = {(p, s): v for p, s, *v in con.execute(
        "SELECT persona, season_id, outs, er, so, wins FROM fct_pitcheo_temporada WHERE fuente = 'mlb'").fetchall()}
    check(f"bateo: cada temporada de la MLB API igual a la suma de sus líneas ({len(lineas_b)})",
          [k for k in lineas_b if tuple(fb.get(k, ())) != lineas_b[k]][:5] + [k for k in fb if k not in lineas_b][:5], [])
    check(f"pitcheo: lo mismo ({len(lineas_p)})",
          [k for k in lineas_p if tuple(fp.get(k, ())) != lineas_p[k]][:5] + [k for k in fp if k not in lineas_p][:5], [])
    check("las mejores temporadas: diez o más por categoría (con empates)",
          con.execute("SELECT min(n) >= 10 FROM (SELECT count(*) n FROM mejores_temporadas GROUP BY grupo, stat)").fetchone()[0],
          True)
    check("y las 21 categorías", con.execute("SELECT count(DISTINCT grupo || stat) FROM mejores_temporadas").fetchone()[0], 21)
    engine = get_engine(f"sqlite:///{REAL}")
    comparar_carreras(con, engine, "real")
    engine.dispose()
    if hay_historia:
        check("con la capa histórica: la primera temporada es la de 1951",
              con.execute("SELECT min(anio) FROM fct_bateo_temporada").fetchone()[0], 1951)
    else:
        print("  (la base no tiene la capa histórica: solo temporadas de la MLB API)")
    con.close()

shutil.rmtree(TMP, ignore_errors=True)
print()
if fails:
    print(f"❌ {len(fails)} fallaron: {fails}")
    sys.exit(1)
print("✅ Todas las comprobaciones pasaron")
