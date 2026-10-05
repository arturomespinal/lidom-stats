"""
verify_orquestacion.py — Comprueba la orquestación de Dagster sin red.

Necesita las dependencias de la orquestación:

    pip install -r requirements-orquestacion.txt
    python verify_orquestacion.py

Qué comprueba:
1. Las definiciones cargan: assets, checks, job, schedule, particiones.
2. La temporada en curso y el schedule de la madrugada.
3. Los assets de la MLB API contra una base SINTÉTICA coherente: los checks
   pasan, y fallan cuando se daña a propósito el esquema de juego (y entonces
   el check bloquea las tablas planas) o las tablas planas.
4. Los assets de la historia, con el ingestor y el enlace simulados.
5. Contra la base REAL, si existe: el check de las capas da lo mismo que
   verify_capas.py en las 14 temporadas.

Los ingestores se reemplazan por dobles: lo que se prueba aquí es el cableado
y las comprobaciones, no la ingesta (de eso se ocupan sus propias suites).
"""

import os
import shutil
import sqlite3
import sys
import tempfile
import warnings
from datetime import date, datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
warnings.filterwarnings("ignore")  # los avisos "beta" de Dagster no son fallos

from loguru import logger  # noqa: E402

logger.remove()  # los ingestores registran cada init_db(); aquí solo estorba
logger.add(sys.stderr, level="WARNING")

from dagster import (  # noqa: E402
    DagsterInstance,
    DefaultScheduleStatus,
    Definitions,
    build_schedule_context,
    materialize,
)

import orquestacion.activos as act  # noqa: E402
from orquestacion import defs  # noqa: E402
from orquestacion.recursos import BaseDatos  # noqa: E402
from orquestacion.temporadas import TEMPORADAS, claves, temporada_actual  # noqa: E402
from src.constants import LIDOM_TEAMS  # noqa: E402
from src.models import flat_models, hist_models  # noqa: E402,F401
from src.models.database import init_db  # noqa: E402

fails: list[str] = []
RD = timezone(timedelta(hours=-4))


def check(label, got, want):
    ok = got == want
    if not ok:
        fails.append(label)
    print(f"  {'✓' if ok else '✗'} {label}: {got}" + ("" if ok else f"  (esperado {want})"))


TMP = tempfile.mkdtemp(prefix="orq_")
INSTANCIA = DagsterInstance.ephemeral()


# ── Dobles de los ingestores ─────────────────────────────────────────────────

llamadas: list[tuple] = []


class BoxDoble:
    def __init__(self, db_url):
        self.db_url = db_url

    def ingest(self, season, refresh=False, **_):
        llamadas.append(("juegos", season, refresh))
        return {"games": 6, "games_skipped": 6, "batting_lines": 0, "pitching_lines": 0}


class PlanasDoble:
    def __init__(self, db_url):
        self.db_url = db_url

    def ingest(self, season):
        llamadas.append(("planas", season))
        return {"standings": 6, "batting": 6, "pitching": 6}


act.BoxscoreIngestor = BoxDoble
act.MLBIngestor = PlanasDoble


def correr(assets, base_path, run_config=None, **kw):
    # Los fallos de esta suite son a propósito: sin bajar el nivel del
    # registro, Dagster imprime la traza completa de cada uno.
    config = {"loggers": {"console": {"config": {"log_level": "CRITICAL"}}}, **(run_config or {})}
    return materialize(
        assets,
        resources={"base": BaseDatos(url=f"sqlite:///{base_path}")},
        instance=INSTANCIA,
        raise_on_error=False,
        run_config=config,
        **kw,
    )


def chequeos(res) -> dict:
    return {e.check_name: e.passed for e in res.get_asset_check_evaluations()}


def materializados(res) -> set:
    return {
        e.event_specific_data.materialization.asset_key.to_user_string()
        for e in res.get_asset_materialization_events()
    }


# ── La base sintética ────────────────────────────────────────────────────────


def base_sintetica(path: str) -> None:
    """Seis equipos, seis juegos de la 2025-26, un bateador y un lanzador por
    equipo. Las tablas planas se llenan DESDE las vistas, así que las dos capas
    coinciden por construcción: cualquier falla del check es por un daño que
    la prueba hace a propósito."""
    init_db(f"sqlite:///{path}").dispose()
    con = sqlite3.connect(path)
    codigos = [t["team_code"] for t in LIDOM_TEAMS.values()]
    for i, c in enumerate(codigos):
        con.execute("INSERT INTO teams (team_code, full_name, is_active) VALUES (?, ?, 1)", (c, c))
        for rol, n in (("b", 1), ("p", 2)):
            con.execute(
                "INSERT INTO players (player_id, full_name, nationality, mlb_id) VALUES (?, ?, 'DOM', ?)",
                (f"{c.lower()}-{rol}", f"{c} {rol}", 100000 + 10 * i + n),
            )
    con.execute("INSERT INTO seasons (season_id, short_label) VALUES ('2025-26', '2025-26')")
    cruces = [(0, 1, 5, 3), (2, 3, 2, 7), (4, 5, 4, 4 + 1), (1, 2, 6, 1), (3, 4, 0, 2), (5, 0, 3, 8)]
    for n, (a, h, ra, rh) in enumerate(cruces):
        away, home = codigos[a], codigos[h]
        gid = f"2025-10-{15 + n}-{away}-{home}-1"
        con.execute(
            """INSERT INTO games (game_id, season_id, game_date, home_team_code, away_team_code,
                 home_score, away_score, innings_played, stage, status, scraped_at)
               VALUES (?, '2025-26', ?, ?, ?, ?, ?, 9, 'regular', 'final', '2025-10-15')""",
            (gid, f"2025-10-{15 + n}", home, away, rh, ra),
        )
        for equipo, propias, rival in ((away, ra, rh), (home, rh, ra)):
            con.execute(
                """INSERT INTO batting_lines (game_id, player_id, team_code, plate_appearances, at_bats,
                     runs, hits, doubles, triples, home_runs, rbi, walks, intentional_walks, strikeouts,
                     hit_by_pitch, sacrifice_flies, sacrifice_bunts, stolen_bases, caught_stealing,
                     grounded_into_dp, left_on_base)
                   VALUES (?, ?, ?, 36, 33, ?, ?, 1, 0, 1, ?, 3, 0, 8, 0, 0, 0, 1, 0, 1, 6)""",
                (gid, f"{equipo.lower()}-b", equipo, propias, propias + 5, propias),
            )
            gano = propias > rival
            con.execute(
                """INSERT INTO pitching_lines (game_id, player_id, team_code, is_starter, decision,
                     outs_recorded, batters_faced, hits_allowed, runs_allowed, earned_runs,
                     home_runs_allowed, walks_allowed, intentional_walks_allowed, strikeouts,
                     hit_batters, wild_pitches, balks)
                   VALUES (?, ?, ?, 1, ?, 27, 36, ?, ?, ?, 1, 3, 0, 8, 0, 0, 0)""",
                (gid, f"{equipo.lower()}-p", equipo, "W" if gano else "L", rival + 5, rival, rival),
            )
    # Las tablas planas, desde las vistas: coinciden por construcción.
    con.execute(
        """INSERT INTO standings (season, team_id, team_name, wins, losses, runs_scored, runs_allowed)
           SELECT '2025', team_code, team_code, wins, losses, runs_for, runs_against
           FROM v_standings WHERE season_id = '2025-26'"""
    )
    con.execute(
        """INSERT INTO batting_stats (season, mlb_player_id, player, team_id, at_bats, hits, doubles,
             triples, home_runs, runs, rbi, walks, strikeouts, stolen_bases)
           SELECT '2025', p.mlb_id, p.full_name, v.team_code, v.ab, v.h, v.doubles, v.triples, v.hr,
                  v.r, v.rbi, v.bb, v.so, v.sb
           FROM v_batting_season v JOIN players p ON p.player_id = v.player_id
           WHERE v.season_id = '2025-26'"""
    )
    con.execute(
        """INSERT INTO pitching_stats (season, mlb_player_id, player, team_id, innings_pitched, hits,
             earned_runs, walks, strikeouts, wins, losses, saves)
           SELECT '2025', p.mlb_id, p.full_name, v.team_code, v.outs / 3.0, v.h, v.er, v.bb, v.so,
                  v.wins, v.losses, v.saves
           FROM v_pitching_season v JOIN players p ON p.player_id = v.player_id
           WHERE v.season_id = '2025-26'"""
    )
    con.commit()
    con.close()


def con_base(path):
    c = sqlite3.connect(path)
    return c


# ─────────────────────────────────────────────────────────────────────────────
print("━━━ 1. Las definiciones ━━━")
Definitions.validate_loadable(defs)
check("cargan sin error", True, True)
rg = defs.get_repository_def()
check("assets", sorted(k.to_user_string() for k in rg.asset_graph.get_all_asset_keys()),
      ["cruce_historia", "enlaces_historia", "historia", "juegos", "tablas_planas"])
check("checks", sorted(c.name for c in rg.asset_graph.asset_check_keys),
      ["capas_coinciden", "cobertura_enlaces", "juegos_cuadran", "tasas_cuadran"])
job = defs.resolve_job_def("temporada_en_curso")
check("el job de la temporada toma juegos y tablas planas",
      sorted(k.to_user_string() for k in job.asset_layer.selected_asset_keys), ["juegos", "tablas_planas"])
sched = defs.resolve_schedule_def("cada_madrugada")
check("el schedule nace apagado", sched.default_status, DefaultScheduleStatus.STOPPED)
check("y corre de octubre a febrero, a las 5:30 de RD",
      (sched.cron_schedule, sched.execution_timezone), ("30 5 * 10,11,12,1,2 *", "America/Santo_Domingo"))
check("las particiones van de 2012 a la temporada en curso",
      TEMPORADAS.get_partition_keys(), claves())
check("una ejecución corre en serie (SQLite: un solo escritor)",
      defs.resolve_job_def("temporada_en_curso").executor_def.name, "in_process")

print("\n━━━ 2. La temporada en curso y la madrugada ━━━")
check("5-oct-2026 → 2026 (la 2026-27)", temporada_actual(date(2026, 10, 5)), 2026)
check("20-ene-2027 → 2026 (la final de la 2026-27)", temporada_actual(date(2027, 1, 20)), 2026)
check("31-ago-2026 → 2025", temporada_actual(date(2026, 8, 31)), 2025)
check("1-sep-2026 → 2026 (ya se publica el calendario)", temporada_actual(date(2026, 9, 1)), 2026)
for cuando, esperado in ((datetime(2026, 10, 20, 5, 30, tzinfo=RD), "2026"),
                         (datetime(2027, 1, 12, 5, 30, tzinfo=RD), "2026")):
    rr = sched.evaluate_tick(build_schedule_context(scheduled_execution_time=cuando, repository_def=rg)).run_requests
    check(f"la madrugada del {cuando:%d-%m-%Y} pide la partición", [r.partition_key for r in rr], [esperado])

print("\n━━━ 3. MLB API contra una base sintética ━━━")
sint = os.path.join(TMP, "sintetica.db")
base_sintetica(sint)

llamadas.clear()
r = correr([act.juegos, act.tablas_planas], sint, partition_key="2025")
check("la ejecución termina bien", r.success, True)
check("los dos checks pasan", chequeos(r), {"juegos_cuadran": True, "capas_coinciden": True})
check("juegos antes que las tablas planas", llamadas, [("juegos", "2025", False), ("planas", "2025")])

# Un juego que no suma su marcador: el check falla y BLOQUEA las tablas planas.
c = con_base(sint)
c.execute("UPDATE batting_lines SET runs = runs + 1 WHERE rowid = (SELECT MIN(rowid) FROM batting_lines)")
c.commit()
llamadas.clear()
r = correr([act.juegos, act.tablas_planas], sint, partition_key="2025")
check("un juego descuadrado: juegos_cuadran falla", chequeos(r).get("juegos_cuadran"), False)
check("y bloquea: las tablas planas no se cargan", ("planas", "2025") in llamadas, False)
check("ni se materializan", "tablas_planas" in materializados(r), False)
c.execute("UPDATE batting_lines SET runs = runs - 1 WHERE rowid = (SELECT MIN(rowid) FROM batting_lines)")
c.commit()

# Las tablas planas en desacuerdo con los juegos: falla el check de las capas.
c.execute("UPDATE standings SET wins = wins + 1 WHERE team_id = 'AGU'")
c.commit()
r = correr([act.juegos, act.tablas_planas], sint, partition_key="2025")
check("un ganado de más en las planas: capas_coinciden falla",
      chequeos(r), {"juegos_cuadran": True, "capas_coinciden": False})
c.execute("UPDATE standings SET wins = wins - 1 WHERE team_id = 'AGU'")
c.execute("UPDATE batting_stats SET hits = hits + 1 WHERE rowid = (SELECT MIN(rowid) FROM batting_stats)")
c.commit()
r = correr([act.juegos, act.tablas_planas], sint, partition_key="2025")
check("un hit de más en un bateador: también", chequeos(r).get("capas_coinciden"), False)
c.execute("UPDATE batting_stats SET hits = hits - 1 WHERE rowid = (SELECT MIN(rowid) FROM batting_stats)")
c.commit()

# Juegos terminados sin tablas planas: fallo. La temporada que no empieza: no.
c.execute("CREATE TABLE standings_respaldo AS SELECT * FROM standings")
c.execute("DELETE FROM standings")
c.commit()
r = correr([act.juegos, act.tablas_planas], sint, partition_key="2025")
check("juegos terminados y ninguna tabla plana: falla", chequeos(r).get("capas_coinciden"), False)
c.execute("INSERT INTO standings SELECT * FROM standings_respaldo")
c.execute("DROP TABLE standings_respaldo")
c.commit()
c.close()
r = correr([act.juegos, act.tablas_planas], sint, partition_key="2024")
check("una temporada sin juegos terminados no tiene nada que comparar: pasa",
      chequeos(r), {"juegos_cuadran": True, "capas_coinciden": True})

# Una carga de varias temporadas es UNA ejecución que las recorre en orden.
llamadas.clear()
r = correr(
    [act.juegos, act.tablas_planas], sint,
    tags={"dagster/asset_partition_range_start": "2024", "dagster/asset_partition_range_end": "2025"},
)
check("un rango de temporadas corre en una sola ejecución y en orden", llamadas,
      [("juegos", "2024", False), ("juegos", "2025", False), ("planas", "2024"), ("planas", "2025")])
check("y valida las dos", chequeos(r), {"juegos_cuadran": True, "capas_coinciden": True})

print("\n━━━ 4. La historia, con el ingestor y el enlace simulados ━━━")
resultado_historia = {"temporadas": 1, "bateo": 300, "pitcheo": 150, "pedidos_red": 0, "pedidos_cache": 35,
                      "no_jugadas": [], "omitidas_por_peso": [], "avisos": [], "discrepancias": []}


class ClienteDoble:
    def __init__(self, offline=False, refrescar=False):
        self.offline = offline

    def __enter__(self):
        return self

    def __exit__(self, *e):
        pass


class HistoriaDoble:
    def __init__(self, db_url, client):
        self.client = client

    def __enter__(self):
        return self

    def __exit__(self, *e):
        pass

    def ingest(self, temporadas):
        llamadas.append(("historia", list(temporadas), self.client.offline))
        return dict(resultado_historia)


act.DigimetricsClient = ClienteDoble
act.HistoriaIngestor = HistoriaDoble
cfg = {"ops": {"historia": {"config": {"desde": 1990, "hasta": 1991, "sin_red": True}}}}
llamadas.clear()
r = correr([act.historia], sint, run_config=cfg)
check("la historia carga el rango pedido, sin red si se pide", llamadas, [("historia", [1990, 1991], True)])
check("sin filas que no cuadren: tasas_cuadran pasa", chequeos(r), {"tasas_cuadran": True})
resultado_historia["discrepancias"] = ["1990 SR 01: Fulano AVG publicado .300, calculado .290"]
r = correr([act.historia], sint, run_config=cfg)
check("con una fila que no cuadra: falla", chequeos(r), {"tasas_cuadran": False})
r = correr([act.historia], sint, run_config={"ops": {"historia": {"config": {"desde": 1940}}}})
check("un rango fuera de 1951-2019 no corre", r.success, False)

act.enlazar = lambda engine: {"enlazables": 1614, "enlazados": 1588, "por_metodo": {"nombre": 1490, "numeros": 98}}
r = correr([act.enlaces_historia], sint)
check("98,4% de enlaces (la base real): cobertura_enlaces pasa", chequeos(r), {"cobertura_enlaces": True})
act.enlazar = lambda engine: {"enlazables": 1614, "enlazados": 1400, "por_metodo": {"nombre": 1400}}
r = correr([act.enlaces_historia], sint)
check("86,7%: falla", chequeos(r), {"cobertura_enlaces": False})

print("\n━━━ 5. Contra la base real ━━━")
REAL = "data/lidom_stats.db"
tiene_juegos = False
if os.path.exists(REAL):
    with sqlite3.connect(REAL) as c:
        try:
            tiene_juegos = c.execute("SELECT COUNT(*) FROM games WHERE status = 'final'").fetchone()[0] > 0
        except sqlite3.Error:
            pass
if not tiene_juegos:
    print("  (no hay base real con juegos: se salta)")
else:
    copia = os.path.join(TMP, "real.db")
    shutil.copy(REAL, copia)
    from src.validacion import comparar_temporada, conectar, temporadas

    with conectar(copia) as c:
        comunes, _ = temporadas(c)
        esperadas = sum(len(comparar_temporada(c, s).comprobaciones) for s in comunes)
    llamadas.clear()
    r = correr(
        [act.juegos, act.tablas_planas], copia,
        tags={"dagster/asset_partition_range_start": comunes[0],
              "dagster/asset_partition_range_end": comunes[-1]},
    )
    check(f"las {len(comunes)} temporadas en una ejecución: los dos checks pasan",
          chequeos(r), {"juegos_cuadran": True, "capas_coinciden": True})
    ev = {e.check_name: e for e in r.get_asset_check_evaluations()}
    check("con las mismas comprobaciones que verify_capas.py",
          ev["capas_coinciden"].metadata["comprobaciones"].value, esperadas)

shutil.rmtree(TMP, ignore_errors=True)
print()
if fails:
    print(f"❌ {len(fails)} fallaron: {fails}")
    sys.exit(1)
print("✅ Todas las comprobaciones pasaron")
