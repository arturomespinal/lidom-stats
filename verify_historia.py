"""La historia completa (src/historia.py y api/historia_routes.py), sin red.

1. Una base sintética, que corre siempre: el enlace DIGIMETRICS ↔ MLB API en
   sus dos pasadas, la carrera que suma las dos fuentes SIN contar dos veces
   2012-2019, los mínimos de las tasas y los empates.
2. La base real (data/lidom_stats.db), si tiene la capa histórica y los
   enlaces: cobertura del enlace, enlaces difíciles comprobados a mano, y los
   líderes de todos los tiempos. Los de carreras cerradas antes de 2012 van
   EXACTOS; los de jugadores activos van como mínimos (la 2026-27 los mueve).
   Y los endpoints por HTTP.

Uso:  python verify_historia.py
"""
import os
import sqlite3
import sys
import tempfile
from datetime import date
from pathlib import Path

from sqlalchemy.orm import Session

from src.historia import (
    MIN_OUTS_CARRERA,
    MIN_PA_CARRERA,
    calcular_enlaces,
    carreras,
    enlazar,
    es_lanzador_historico,
    lideres,
    nombre_para_mostrar,
    normalizar_nombre,
    temporadas_historicas,
)
from src.models import flat_models  # noqa: F401  (registra las tablas planas antes de init_db)
from src.models.database import (
    BattingLine, Game, PitchingLine, Player, Season, Team, init_db,
)
from src.models.hist_models import HistBateo, HistEquipoTemporada, HistJugador, HistPitcheo

fails: list[str] = []


def check(label, got, want):
    ok = got == want
    if not ok:
        fails.append(label)
    print(f"  {'✓' if ok else '✗'} {label}: {got}" + ("" if ok else f"  (esperado {want})"))


def abiertos(carpeta) -> list[str]:
    """Archivos de `carpeta` abiertos por este proceso (en Windows no se
    pueden borrar: WinError 32). Solo donde hay /proc."""
    fd = Path("/proc/self/fd")
    if not fd.exists():
        return []
    raiz = str(Path(carpeta).resolve())
    vistos = []
    for f in fd.iterdir():
        try:
            destino = os.readlink(f)
        except OSError:
            continue
        if destino.startswith(raiz):
            vistos.append(destino)
    return vistos


print("━━━ Nombres ━━━")
check("normalizar: sin tildes, sin puntos, sin Jr.", normalizar_nombre("José A. Váldez Jr."), "jose a valdez")
check("mostrar: los años viejos en mayúsculas pasan a tipo título", nombre_para_mostrar("TONY  PEÑA"), "Tony Peña")
check("mostrar: los que ya vienen bien se respetan", nombre_para_mostrar("Juan Francisco"), "Juan Francisco")
check("lanzador de los años sin designado: lanza en sus juegos y batea en casi todos",
      es_lanzador_historico([{"games_batted": 32}], [{"games": 30}]), True)
check("un jugador de posición que lanzó una vez no es lanzador",
      es_lanzador_historico([{"games_batted": 50}], [{"games": 1}]), False)

print("\n━━━ 1. Base sintética ━━━")


def bateo_h(temporada, id_miembro, team, id_equipo="01", etapa="SR", **conteos):
    base = dict(games=10, at_bats=0, runs=0, hits=0, doubles=0, triples=0, home_runs=0, rbi=0, walks=0,
                intentional_walks=0, strikeouts=0, stolen_bases=0, caught_stealing=0, hit_by_pitch=0,
                sacrifice_flies=0, sacrifice_bunts=0, grounded_into_dp=0)
    base.update(conteos)
    from src.models.hist_models import etiqueta_historica
    return HistBateo(temporada=temporada, etapa=etapa, id_equipo=id_equipo, id_miembro=id_miembro,
                     season_id=etiqueta_historica(temporada), team_code=team, **base)


def pitcheo_h(temporada, id_miembro, team, id_equipo="01", etapa="SR", **conteos):
    base = dict(wins=0, losses=0, games=5, games_started=0, games_finished=0, complete_games=0, shutouts=0,
                saves=0, outs=0, hits_allowed=0, runs_allowed=0, earned_runs=0, home_runs_allowed=0,
                walks_allowed=0, intentional_walks_allowed=0, strikeouts=0, hit_batters=0, wild_pitches=0, balks=0)
    base.update(conteos)
    from src.models.hist_models import etiqueta_historica
    return HistPitcheo(temporada=temporada, etapa=etapa, id_equipo=id_equipo, id_miembro=id_miembro,
                       season_id=etiqueta_historica(temporada), team_code=team, **base)


with tempfile.TemporaryDirectory() as tmp:
    engine = init_db(f"sqlite:///{tmp}/h.db")
    with Session(engine) as s, s.begin():
        for code in ("AGU", "LIC"):
            s.add(Team(team_code=code, full_name=code))
        s.add(Season(season_id="2015-16", short_label="15-16"))
        for pid, nombre in [("p-uno", "Juan Pérez"), ("p-gordon", "Dee Strange-Gordon"),
                            ("p-diaz1", "Luis Díaz"), ("p-diaz2", "Luis Díaz"),
                            ("p-suplente", "Kevin Sanchez"), ("p-lolo", "Lolo Sanchez")]:
            s.add(Player(player_id=pid, full_name=nombre))
        for n, (casa, visita) in enumerate([("AGU", "LIC"), ("LIC", "AGU"), ("AGU", "LIC")]):
            s.add(Game(game_id=f"g{n}", season_id="2015-16", game_date=date(2015, 10, 20 + n),
                       home_team_code=casa, away_team_code=visita, stage="regular", status="final"))
        # Juan Pérez (AGU): 3 juegos, 12 VB, 4 H, 1 HR.
        for n, (ab, h, hr) in enumerate([(4, 2, 1), (4, 1, 0), (4, 1, 0)]):
            s.add(BattingLine(game_id=f"g{n}", player_id="p-uno", team_code="AGU", at_bats=ab, hits=h,
                              home_runs=hr, plate_appearances=ab))
        # Dee Strange-Gordon (LIC): 12 VB, 5 H.
        for n in range(3):
            s.add(BattingLine(game_id=f"g{n}", player_id="p-gordon", team_code="LIC", at_bats=4,
                              hits=2 if n < 2 else 1, plate_appearances=4))
        # Dos Luis Díaz en AGU con números distintos (el caso ambiguo).
        s.add(BattingLine(game_id="g0", player_id="p-diaz1", team_code="AGU", at_bats=3, hits=1, plate_appearances=3))
        s.add(BattingLine(game_id="g1", player_id="p-diaz2", team_code="AGU", at_bats=9, hits=3, plate_appearances=9))
        # Un suplente con 2 VB: poco volumen para enlazar por números.
        s.add(BattingLine(game_id="g0", player_id="p-lolo", team_code="LIC", at_bats=2, hits=0, plate_appearances=2))
        # Juan Pérez también lanzó (para la carrera de pitcheo): 9 outs, 1 CL, G.
        s.add(PitchingLine(game_id="g0", player_id="p-uno", team_code="AGU", decision="W", outs_recorded=9,
                           earned_runs=1, hits_allowed=2, walks_allowed=1, strikeouts=3))

        # DIGIMETRICS. 1: "JUAN PEREZ" (mayúsculas, sin tilde), con 1990 y 2015.
        s.add(HistJugador(id_miembro=1, nombre="JUAN PEREZ"))
        s.add(bateo_h(1990, 1, "AGU", at_bats=400, hits=120, home_runs=10, walks=40))
        s.add(bateo_h(1990, 1, "AGU", etapa="RR", at_bats=40, hits=15))  # postemporada: no suma a la carrera
        s.add(bateo_h(2015, 1, "AGU", at_bats=12, hits=4, home_runs=1))  # 2015: ya viene de la MLB API
        s.add(pitcheo_h(1990, 1, "AGU", wins=2, outs=30, earned_runs=5))
        # 2: "Dee Gordon": no se llama igual; mismo equipo y temporada, apellido
        # parecido y los mismos números → enlace por números.
        s.add(HistJugador(id_miembro=2, nombre="Dee Gordon"))
        s.add(bateo_h(2015, 2, "LIC", id_equipo="02", at_bats=12, hits=5))
        # 3: "Luis Diaz" en AGU 2015: dos candidatos con el mismo nombre → la
        # pasada de nombre no decide; la de números elige al de 3 VB y 1 H.
        s.add(HistJugador(id_miembro=3, nombre="Luis Diaz"))
        s.add(bateo_h(2015, 3, "AGU", at_bats=3, hits=1))
        # 4: "Kevin Sanchez" (LIC 2015, 2 VB): el apellido coincide con Lolo
        # Sanchez y los números también, pero 2 VB no bastan y los nombres se
        # parecen poco → sin enlace. Y Kevin Sanchez de la MLB API no jugó.
        s.add(HistJugador(id_miembro=4, nombre="Kevin Sanchez"))
        s.add(bateo_h(2015, 4, "LIC", id_equipo="02", at_bats=2, hits=0))
        # 5: una leyenda que solo existe en DIGIMETRICS (1960-1961).
        s.add(HistJugador(id_miembro=5, nombre="VIEJO LEYENDA"))
        s.add(bateo_h(1960, 5, "LIC", id_equipo="02", at_bats=800, hits=300, home_runs=5, walks=100,
                      hit_by_pitch=5, sacrifice_flies=5, sacrifice_bunts=10, doubles=40, triples=10))
        s.add(bateo_h(1963, 5, "LIC", id_equipo="02", at_bats=700, hits=200, home_runs=4))
        s.add(HistEquipoTemporada(temporada=1960, id_equipo="02", team_code="LIC", nombre="Tigres del Licey"))

    with engine.connect() as conn:
        enl = calcular_enlaces(conn)
    check("pasada de nombre: JUAN PEREZ ↔ Juan Pérez", enl.get(1), ("p-uno", "nombre", 1))
    check("pasada de números: Dee Gordon ↔ Dee Strange-Gordon", enl.get(2), ("p-gordon", "numeros", 1))
    check("dos homónimos: decide la pasada de números", enl.get(3), ("p-diaz1", "numeros", 1))
    check("poco volumen y nombre distinto: sin enlace", 4 in enl, False)
    check("quien solo está antes de 2012 no se enlaza", 5 in enl, False)

    r = enlazar(engine)
    check("enlazar() escribe y resume", (r["enlazables"], r["enlazados"], r["sin_enlace"], r["por_metodo"]),
          (4, 3, 1, {"nombre": 1, "numeros": 2}))
    check("idempotente", enlazar(engine)["enlazados"], 3)

    with engine.connect() as conn:
        b = carreras(conn, "bateo")
        p = carreras(conn, "pitcheo")
        th = temporadas_historicas(conn, [1])
        th5 = temporadas_historicas(conn, [5], solo_regular=False, antes_del_corte=False)
    uno = b["p-uno"]
    check("carrera de Juan Pérez: 1990 de DIGIMETRICS + 2015-16 de la MLB API, sin contar dos veces 2015",
          (uno["ab"], uno["h"], uno["hr"], sorted(uno["_temporadas"])), (412, 124, 11, ["1990-91", "2015-16"]))
    check("la postemporada de 1990 no entra en la carrera", uno["ab"] < 440, True)
    check("tasas recompuestas sobre la suma", uno["avg"], round(124 / 412, 3))
    check("pitcheo de las dos fuentes: 2 G en 1990 + 1 G en 2015", (p["p-uno"]["wins"], p["p-uno"]["outs"]), (3, 39))
    check("la leyenda sin enlace es su propia persona", b["m5"]["h"], 500)
    check("y califica para las tasas", (b["m5"]["pa"] >= MIN_PA_CARRERA, b["m5"]["califica"]), (True, True))
    check("temporadas históricas del enlazado: solo 1990, solo regular",
          [(t["season_id"], t["stage"], t["ab"]) for t in th["batting"]], [("1990-91", "regular", 400)])
    check("con la forma de v_batting_season (y la fuente)",
          sorted(k for k in th["batting"][0] if k in ("avg", "obp", "slg", "ops", "source", "games_batted")),
          ["avg", "games_batted", "obp", "ops", "slg", "source"])
    check("la ficha de la leyenda trae el nombre del equipo de esa temporada", th5["batting"][-1]["team_name"], "Tigres del Licey")
    fila60 = th5["batting"][-1]
    check("OBP de 1960: (H+BB+HBP)/(AB+BB+HBP+SF)", fila60["obp"], round((300 + 100 + 5) / (800 + 100 + 5 + 5), 3))

    with engine.connect() as conn:
        hr = lideres(conn, "bateo", "hr", 10)
        avg = lideres(conn, "bateo", "avg", 10)
        era = lideres(conn, "pitcheo", "era", 10)
    check("líderes de HR: Juan Pérez (dos fuentes) y la leyenda",
          [(x["name"], x["value"], x["player_id"], x["id_miembro"]) for x in hr["data"]][:2],
          [("Juan Pérez", 11, "p-uno", 1), ("Viejo Leyenda", 9, None, 5)])
    check("en AVG solo entra quien pasa el mínimo", [x["name"] for x in avg["data"]], ["Viejo Leyenda"])
    check("y el mínimo se anuncia", avg["minimum"], f"{MIN_PA_CARRERA} apariciones al plato")
    check("en EFE nadie llega a las entradas mínimas", (era["data"], era["minimum"]), ([], f"{MIN_OUTS_CARRERA // 3} entradas"))
    try:
        with engine.connect() as conn:
            lideres(conn, "bateo", "xx")
        check("categoría inexistente rechazada", False, True)
    except ValueError:
        check("categoría inexistente rechazada", True, True)

    engine.dispose()
    check("sin archivos abiertos al salir (WinError 32 en Windows)", abiertos(tmp), [])

print("\n━━━ 2. La base real ━━━")
base = Path("data/lidom_stats.db")
con = sqlite3.connect(base) if base.exists() else None
con_enlaces = bool(con and con.execute(
    "SELECT 1 FROM sqlite_master WHERE name = 'hist_enlaces'").fetchone() and con.execute(
    "SELECT 1 FROM hist_enlaces LIMIT 1").fetchone())
if con:
    con.close()
if not con_enlaces:
    print("  (sin capa histórica o sin enlaces: corre `python main.py ingest-historia` o `enlazar-historia`)")
else:
    from src.models.database import get_engine

    real = get_engine(f"sqlite:///{base}")
    with real.connect() as conn:
        enl = calcular_enlaces(conn)
        filas = dict(conn.exec_driver_sql(
            "SELECT id_miembro, player_id FROM hist_enlaces").fetchall())
        nombres = dict(conn.exec_driver_sql("SELECT id_miembro, nombre FROM hist_jugadores").fetchall())
    check("la tabla de enlaces está al día con los datos", filas == {i: p for i, (p, _, _) in enl.items()}, True)
    metodos = {}
    for _, m, _ in enl.values():
        metodos[m] = metodos.get(m, 0) + 1
    # Medido el 30-sep-2026: de 1.614 jugadores de DIGIMETRICS con años en
    # 2012-13 a 2019-20, 1.490 por nombre y 98 por números (98,4%).
    check("cobertura del enlace", (len(enl), metodos), (1588, {"nombre": 1490, "numeros": 98}))
    por_nombre = {nombres[i]: p for i, (p, _, _) in enl.items()}
    with real.connect() as conn:
        nombres_mlb = dict(conn.exec_driver_sql("SELECT player_id, full_name FROM players").fetchall())
    check("enlaces por números revisados a mano (apodo, segundo nombre, errata, mayúsculas)",
          [nombres_mlb.get(por_nombre.get(n)) for n in ("Dee Gordon", "Nicholas Blake Solak", "Yasmani Grandall", "ROBERT WIDLANSKY")],
          ["Dee Strange-Gordon", "Nick Solak", "Yasmani Grandal", "Robbie Widlansky"])

    with real.connect() as conn:
        def primero(grupo, stat):
            x = lideres(conn, grupo, stat, 1)["data"][0]
            return x["name"], x["value"]
        # Carreras cerradas antes de 2012: exactas.
        check("más hits: Luis Polonia, 927", primero("bateo", "h"), ("Luis Polonia", 927))
        check("mejor promedio (1.500 AP): Manuel Mota, .333", primero("bateo", "avg"), ("Manuel Mota", 0.333))
        check("más victorias: Diómedes Olivo, 86", primero("pitcheo", "wins"), ("Diom. Guayubin Olivo", 86))
        check("mejor efectividad (400 IP): Juan Marichal, 1.87", primero("pitcheo", "era"), ("Juan Marichal", 1.87))
        # Jugadores activos: como mínimo lo del 30-sep-2026.
        n, v = primero("bateo", "hr")
        check("más jonrones: Juan Francisco (DIGIMETRICS + MLB API), 85 o más", (n, v >= 85), ("Juan Francisco", True))
        n, v = primero("pitcheo", "saves")
        check("más salvados: Jairo Asencio, 167 o más", (n, v >= 167), ("Jairo Asencio", True))
    real.dispose()

    print("\n━━━ Los endpoints ━━━")
    from fastapi.testclient import TestClient

    from api.main import app

    c = TestClient(app)
    r = c.get("/historia/lideres", params={"group": "bateo", "stat": "h", "limit": 3})
    check("GET /historia/lideres", (r.status_code, r.json()["data"][0]["name"], len(r.json()["categories"])),
          (200, "Luis Polonia", 13))
    check("categoría inválida: 422", c.get("/historia/lideres", params={"stat": "xx"}).status_code, 422)
    s = c.get("/players/search", params={"q": "pena"}).json()
    check("el buscador encuentra a TONY PEÑA escribiendo 'pena' (sin tilde, en minúsculas)",
          any(h["name"] == "Tony Peña" for h in s["historicos"]), True)
    s = c.get("/players/search", params={"q": "marichal"})
    check("un histórico sin MLB API: 200 con `historicos`, no 404",
          (s.status_code, s.json()["count"], s.json()["historicos"][0]["name"]), (200, 0, "Juan Marichal"))
    m = c.get(f"/historia/miembros/{s.json()['historicos'][0]['id_miembro']}").json()
    check("la ficha de Marichal: lanzador, 1.87, y su postemporada aparte",
          (m["is_pitcher"], m["career_pitching"]["era"], m["postseason_pitching"] is not None), (True, 1.87, True))
    pid = c.get("/players/search", params={"q": "juan francisco"}).json()["data"][0]["player_id"]
    f = c.get(f"/players/{pid}").json()
    check("la ficha de Juan Francisco trae sus años anteriores a 2012-13",
          (f["history"]["batting"][-1]["season_id"], f["history"]["career_batting"]["hr"] >= 85), ("2007-08", True))
    check("un miembro que no existe: 404", c.get("/historia/miembros/999999999").status_code, 404)

print()
if fails:
    print(f"❌ {len(fails)} comprobaciones fallaron: {fails}")
    sys.exit(1)
print("✅ Todas las comprobaciones pasaron")
