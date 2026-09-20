"""Ejercita cada endpoint del esquema de juego contra la base real y verifica las cifras."""
import json, sys
from fastapi.testclient import TestClient
from api.main import app

c = TestClient(app)
fails = []


def call(path, expect=200):
    r = c.get(path)
    ok = r.status_code == expect
    if not ok:
        fails.append(f"{path} → {r.status_code} (esperado {expect})")
    return r.json() if r.headers.get("content-type", "").startswith("application/json") else {}


def check(label, got, want):
    ok = got == want
    if not ok:
        fails.append(label)
    print(f"  {'✓' if ok else '✗'} {label}: {got}" + ("" if ok else f"  (esperado {want})"))


print("━━━ /health ━━━")
h = call("/health")
print("  planas:", h["flat_tables"])
print("  juego :", h["game_level"])
check("health mantiene 'records' por compatibilidad", "records" in h, True)

print("\n━━━ /games ━━━")
g = call("/games?season=2025&limit=3")
check("season '2025' se traduce a season_id", g["season_id"], "2025-26")
check("total de juegos de la temporada", g["total"], 150)
for r in g["data"]:
    print(f"    {r['game_date']} {r['away_team_code']} {r['away_score']}-{r['home_score']} {r['home_team_code']}"
          f" → gana {r['winner_team_code']} | {r['venue']}")

g2 = call("/games?season=2025-26&limit=1")
check("acepta el season_id directo", g2["season_id"], "2025-26")

gt = call("/games?season=2025&team=LIC")
check("juegos del Licey (49 jugados + el cancelado del rival no cuenta)", gt["total"], 50)

gf = call("/games?season=2025&team=AGU&status=final")
check("juegos finales de Águilas", gf["total"], 49)

gd = call("/games?season=2025&date_from=2025-10-15&date_to=2025-10-17&order=asc")
print(f"    filtro por fecha 15–17 oct: {gd['total']} juegos")
check("el primer juego del rango es del 15-oct", gd["data"][0]["game_date"], "2025-10-15")

print("\n  errores esperados:")
check("equipo inválido → 400", c.get("/games?season=2025&team=XXX").status_code, 400)
check("opponent sin team → 400", c.get("/games?season=2025&opponent=LIC").status_code, 400)
# 2019 dejó de servir para esto el día del backfill: ahora hay 14 temporadas
# cargadas, de la 2012-13 a la 2025-26. Se usa una anterior a lo que la MLB API
# expone para LIDOM, que es lo que de verdad no tiene datos.
check("temporada sin datos → 404", c.get("/games?season=2005").status_code, 404)

print("\n━━━ /games/{game_id} ━━━")
gid = g["data"][0]["game_id"]
bx = call(f"/games/{gid}")
check("boxscore disponible", bx["boxscore_available"], True)
nb = len(bx["home"]["batting"]) + len(bx["away"]["batting"])
npi = len(bx["home"]["pitching"]) + len(bx["away"]["pitching"])
print(f"  {gid}: {nb} líneas de bateo, {npi} de pitcheo")
runs_home = sum(x["runs"] for x in bx["home"]["batting"])
check("carreras del bateo local == marcador", runs_home, bx["game"]["home_score"])
dec = [x["decision"] for x in bx["home"]["pitching"] + bx["away"]["pitching"] if x["decision"]]
check("hay exactamente un ganador", dec.count("W"), 1)
check("hay exactamente un perdedor", dec.count("L"), 1)
first = bx["away"]["batting"][0]
check("el primer bateador es el orden 100", first["batting_order"], 100)
print(f"    abre {first['full_name']} ({first['position']}) — {first['hits']}/{first['at_bats']}")
check("juego inexistente → 404", c.get("/games/2099-01-01-AAA-BBB-1").status_code, 404)

cancelado = call("/games?season=2025&status=cancelled")["data"][0]["game_id"]
bxc = call(f"/games/{cancelado}")
check("juego cancelado responde 200 sin boxscore", bxc["boxscore_available"], False)

print("\n━━━ /players/search ━━━")
s = call("/players/search?q=munguia")
print(f"  '{s['query']}' → {s['count']}: {[p['full_name'] for p in s['data']]}")
pid = s["data"][0]["player_id"]
check("player_id con fecha de nacimiento", pid.count("-") >= 4, True)
check("'search' no se interpreta como player_id", s["count"] >= 1, True)
check("query de 1 carácter → 422", c.get("/players/search?q=a").status_code, 422)
check("sin coincidencias → 404", c.get("/players/search?q=zzzzzz").status_code, 404)

print("\n━━━ /players/{player_id} ━━━")
p = call(f"/players/{pid}")
bio = p["player"]
print(f"  {bio['full_name']} | nac. {bio['birth_date']} | "
      f"batea {bio['bats_label']} lanza {bio['throws_label']} | {bio['nationality']}")

# La lateralidad viaja ya traducida para que ningún cliente tenga que saber
# que 'S' existe. Se comprueba la tabla entera, no solo el jugador de turno:
# el caso que se rompe en silencio es el ambidiestro, no el derecho.
from src.lateralidad import batea_es, lanza_es  # noqa: E402
check("batea R → Derecho", batea_es("R"), "Derecho")
check("batea L → Zurdo", batea_es("L"), "Zurdo")
check("batea S → Ambidiestro", batea_es("S"), "Ambidiestro")
check("lanza R → Derecha", lanza_es("R"), "Derecha")
check("lanza L → Zurda", lanza_es("L"), "Zurda")
check("lanza S → Ambas (existe: Anthony Seigler)", lanza_es("S"), "Ambas")
check("código desconocido → None, no la letra cruda", batea_es("X"), None)
check("None → None", lanza_es(None), None)
check("el perfil trae la etiqueta compuesta", isinstance(bio.get("bats_label"), str), True)
for b in p["batting"]:
    print(f"    {b['season_id']} {b['team_code']}: G={b['games']} GB={b['games_batted']} "
          f"AB={b['ab']} AVG={b['avg']} OBP={b['obp']} SLG={b['slg']} OPS={b['ops']}")
check("AVG coincide con lo ya validado", p["batting"][0]["avg"], 0.368)
check("no es lanzador", p["is_pitcher"], False)
check("player_id inexistente → 404", c.get("/players/no-existe-1990-01-01").status_code, 404)

print("\n━━━ La carrera: totales recompuestos, NO promediados ━━━")
# Gustavo Nunez es el caso completo: 14 temporadas, 4 equipos y ambidiestro.
veterano = call("/players/gustavo-nunez-1988-02-08")
car = veterano["career_batting"]
print(f"  {veterano['player']['full_name']}, {veterano['player']['age']} años: "
      f"{car['seasons']} temporadas con {car['teams']} equipos | "
      f"{car['h']}-{car['ab']} .{str(car['avg']).split('.')[1]} "
      f"OBP {car['obp']} SLG {car['slg']} OPS {car['ops']}")

from src.carrera import carrera_bateo, edad  # noqa: E402
from datetime import date  # noqa: E402

# La comprobación que justifica el módulo entero. El promedio simple de los
# AVG de cada temporada da un número plausible y equivocado; si algún día
# alguien "simplifica" carrera.py a un mean(), esto se pone rojo.
promedio_ingenuo = round(
    sum(t["avg"] for t in veterano["batting"]) / len(veterano["batting"]), 3
)
check("el AVG de la carrera NO es el promedio de los AVG anuales",
      car["avg"] == promedio_ingenuo, False)
print(f"    recompuesto {car['avg']} contra promedio ingenuo {promedio_ingenuo}")

check("AVG de carrera = H / AB", car["avg"], round(car["h"] / car["ab"], 3))
check("OBP de carrera = (H+BB+HBP) / (AB+BB+HBP+SF)", car["obp"],
      round((car["h"] + car["bb"] + car["hbp"])
            / (car["ab"] + car["bb"] + car["hbp"] + car["sf"]), 3))
check("SLG de carrera = TB / AB", car["slg"], round(car["tb"] / car["ab"], 3))
check("OPS = OBP + SLG", car["ops"], round(car["obp"] + car["slg"], 3))
check("los turnos suman los de cada temporada", car["ab"],
      sum(t["ab"] for t in veterano["batting"]))
check("14 temporadas en la carrera", car["seasons"], 14)
check("y cuatro camisetas", car["teams"], 4)

# Los equipos, en orden cronológico inverso y con el rango de cada uno.
print(f"    equipos: {[(e['team_code'], e['first_season'], e['last_season']) for e in veterano['teams']]}")
check("el equipo más reciente va primero", veterano["teams"][0]["team_code"], "LIC")
check("una estancia de varios años guarda el rango",
      [e for e in veterano["teams"] if e["team_code"] == "TOR"][0]["seasons"], 2)
check("sin temporadas de pitcheo no hay bloque de pitcheo",
      veterano["career_pitching"], None)
check("un jugador sin nada devuelve None, no un bloque en cero",
      carrera_bateo([]), None)

# La edad se fija la fecha a propósito: con date.today() la comprobación
# cambiaría de resultado el día del cumpleaños del jugador y fallaría sola.
check("edad el día antes del cumpleaños", edad("1988-02-08", date(2026, 2, 7)), 37)
check("edad el día del cumpleaños", edad("1988-02-08", date(2026, 2, 8)), 38)
check("sin fecha de nacimiento, sin edad", edad(None), None)
check("fecha corrupta no revienta", edad("no-es-fecha"), None)

print("\n━━━ /players/{player_id}/gamelog ━━━")
gl = call(f"/players/{pid}/gamelog?season=2025&limit=5")
print(f"  {len(gl['batting'])} juegos (últimos 5):")
for r in gl["batting"]:
    print(f"    {r['game_date']} vs {r['opponent']} ({r['side']}): {r['hits']}/{r['at_bats']} "
          f"R={r['runs']} RBI={r['rbi']} BB={r['walks']}")
full = call(f"/players/{pid}/gamelog?season=2025&limit=200")
check("los juegos del gamelog cuadran con 'games' de la vista",
      len(full["batting"]), p["batting"][0]["games"])
suma_ab = sum(r["at_bats"] for r in full["batting"])
check("suma de AB del gamelog == AB de la vista", suma_ab, p["batting"][0]["ab"])

print("\n━━━ /leaderboards/batting ━━━")
lb = call("/leaderboards/batting?season=2025&sort_by=avg")
print(f"  mínimo calculado: {lb['min_pa']} PA (3.1 × 50 juegos)")
for r in lb["data"][:5]:
    print(f"    {r['full_name']:24} {r['team_code']} PA={r['pa']:<4} AVG={r['avg']} OPS={r['ops']}")
check("el líder de AVG es el mismo ya verificado", lb["data"][0]["full_name"], "Ismael Munguia")
check("mínimo de calificación = 3.1 × 50", lb["min_pa"], 155)
sinq = call("/leaderboards/batting?season=2025&qualified=false&limit=200")
check("sin calificar entran todos", sinq["count"], 200)
check("calificados son muchos menos", lb["count"] < 60, True)
hr = call("/leaderboards/batting?season=2025&sort_by=hr&limit=3")
check("HR NO aplica calificación", hr["qualification_applied"], False)
check("HR sin mínimo de PA", hr["min_pa"], 0)
print(f"  líderes de HR: {[(r['full_name'], r['hr']) for r in hr['data']]}")
check("ordena por HR descendente", hr["data"][0]["hr"] >= hr["data"][1]["hr"], True)
inj = call("/leaderboards/batting?season=2025&sort_by=DROP+TABLE+games")
check("sort_by no permitido cae al default", inj["sort_by"], "avg")

print("\n━━━ /leaderboards/pitching ━━━")
lp = call("/leaderboards/pitching?season=2025&sort_by=era")
print(f"  mínimo calculado: {lp['min_ip']} IP → {lp['count']} calificados")
check("ERA aplica calificación", lp["qualification_applied"], True)
check("mínimo de pitcheo = 0.6 × 50", lp["min_ip"], 30.0)
check("14 lanzadores calificados", lp["count"], 14)
lp40 = call("/leaderboards/pitching?season=2025&sort_by=era&min_ip=40")
check("min_ip explícito manda", lp40["min_ip"], 40.0)
check("min_ip=40 deja 5", lp40["count"], 5)
for r in lp["data"][:5]:
    print(f"    {r['full_name']:24} {r['team_code']} IP={r['innings_pitched']:<6} ERA={r['era']:<6} WHIP={r['whip']} K={r['so']}")
check("ERA ordena ascendente (menor es mejor)", lp["data"][0]["era"] <= lp["data"][1]["era"], True)
ks = call("/leaderboards/pitching?season=2025&sort_by=so&limit=3")
check("K NO aplica calificación aunque qualified=true", ks["qualification_applied"], False)
check("K sin mínimo de IP", ks["min_ip"], 0.0)
print(f"  líderes de K: {[(r['full_name'], r['so']) for r in ks['data']]}")
check("K ordena descendente", ks["data"][0]["so"] >= ks["data"][1]["so"], True)

print("\n━━━ /teams/{code} — la ficha del equipo ━━━")
agu = call("/teams/AGU")
print(f"  {agu['team_name']} ({agu['city']}, {agu['founded_year']}): "
      f"{agu['seasons_count']} temporadas, {len(agu['batters'])} bateadores, "
      f"{len(agu['pitchers'])} lanzadores")
check("catálogo canónico, no el código pelado", agu["team_name"], "Águilas Cibaeñas")
check("nombre corto para pantallas angostas", agu["short_name"], "Águilas")
check("las 14 temporadas de la base", agu["seasons_count"], 14)
check("historial de la más reciente a la más vieja",
      (agu["history"][0]["season_id"], agu["history"][-1]["season_id"]),
      ("2025-26", "2012-13"))
check("equipo inválido → 400", c.get("/teams/XXX").status_code, 400)
check("roster_limit recorta la plantilla", len(call("/teams/AGU?roster_limit=5")["batters"]), 5)

# La comprobación que de verdad vale: este historial se calcula juego a juego
# desde `games`, y la tabla plana `standings` viene del endpoint /stats de la
# MLB por un camino que no toca ni una línea del mismo código. Si las dos
# coinciden al dígito en los seis equipos, es que las dos están bien.
for fila_plana in call("/standings?season=2025")["data"]:
    codigo = fila_plana["team_id"]
    reciente = call(f"/teams/{codigo}")["history"][0]
    check(f"{codigo}: G-P y carreras cuadran con la tabla plana",
          (reciente["wins"], reciente["losses"],
           reciente["runs_for"], reciente["runs_against"]),
          (fila_plana["wins"], fila_plana["losses"],
           fila_plana["runs_scored"], fila_plana["runs_allowed"]))

# Cuadre interno del historial, temporada por temporada. Un error de signo en
# el CASE del SQL —confundir local con visitante— pasaría las comprobaciones de
# arriba en un equipo y reventaría aquí.
for fila in agu["history"]:
    check(f"{fila['season_id']}: G + P == juegos", fila["wins"] + fila["losses"],
          fila["games_played"])
    check(f"{fila['season_id']}: PCT = G / (G+P)", fila["win_pct"],
          round(fila["wins"] / fila["games_played"], 3))
    check(f"{fila['season_id']}: diferencial = AF − EC", fila["run_diff"],
          fila["runs_for"] - fila["runs_against"])

# Y el cuadre de liga: en un torneo cerrado, cada victoria de alguien es la
# derrota de otro y cada carrera anotada es una permitida. Los totales de los
# seis equipos tienen que sumar cero en las dos cosas.
temporada = [call(f"/teams/{cod}")["history"][0]
             for cod in ("AGU", "TOR", "EST", "GIG", "ESC", "LIC")]
check("las victorias de la liga igualan las derrotas",
      sum(f["wins"] for f in temporada), sum(f["losses"] for f in temporada))
check("los diferenciales de carreras suman cero",
      sum(f["run_diff"] for f in temporada), 0)

print("\n━━━ Destacados del equipo ━━━")
d = agu["leaders"]
print(f"  Águilas 2025-26: {agu['team_games']} juegos → mínimos {agu['min_pa']} AP / {agu['min_ip']} IP")
for l in d["batting"] + d["pitching"]:
    print(f"    {l['label']:<12} {l['full_name']:<22} {l['value']}"
          + ("  (con mínimo)" if l["qualified"] else ""))

check("el mínimo sale de los juegos del equipo, no de un 50 fijo",
      (agu["team_games"], agu["min_pa"], agu["min_ip"]), (49, 152, 29.4))

# Regla 10 de CLAUDE.md, comprobada sobre la respuesta: el mínimo rige en las
# tasas y NO en las acumuladas. Si alguien se lo aplica a los jonrones, el
# líder cambia en silencio y esto se pone rojo.
tasas = {"avg", "ops", "era", "whip"}
for l in d["batting"] + d["pitching"]:
    check(f"{l['stat']}: el mínimo aplica solo si es tasa", l["qualified"],
          l["stat"] in tasas)

# Los líderes se calculan sobre la plantilla COMPLETA, no sobre la lista
# recortada que se muestra: `roster_limit` no puede mover un líder.
recortado = call("/teams/AGU?roster_limit=3")
# Se comparan los nombres y no el diccionario entero: si falla, la línea tiene
# que caber en la consola.
resumen = lambda x: [(l["stat"], l["full_name"], l["value"])
                     for l in x["batting"] + x["pitching"]]
check("roster_limit no cambia los destacados",
      resumen(recortado["leaders"]), resumen(d))
check("pero sí recorta lo que se muestra", len(recortado["batters"]), 3)

# El líder de una acumulada tiene que ser de verdad el máximo de la plantilla.
for campo, etiqueta in [("hr", "Jonrones"), ("rbi", "Impulsadas"), ("sb", "Robadas")]:
    lider = next(l for l in d["batting"] if l["stat"] == campo)
    check(f"líder de {etiqueta} es el máximo real",
          lider["value"], max(j[campo] for j in call("/teams/AGU?roster_limit=60")["batters"]))

# Y el de una tasa, el mejor ENTRE LOS CALIFICADOS. El truco de la
# comprobación: el mejor OPS sin calificar es mayor que el del líder, o el
# mínimo no estaría haciendo nada.
todos = call("/teams/AGU?roster_limit=60")["batters"]
lider_ops = next(l for l in d["batting"] if l["stat"] == "ops")
mejor_sin_filtrar = max(j["ops"] for j in todos if j["ops"] is not None)
check("el mínimo deja fuera a alguien con mejor OPS",
      mejor_sin_filtrar > lider_ops["value"], True)
print(f"    mejor OPS sin mínimo {mejor_sin_filtrar} contra {lider_ops['value']} del líder calificado")

check("los calificados son muchos menos que la plantilla",
      d["qualified_batters"] < len(todos), True)

# La plantilla es de ESE equipo y de ESA temporada, no del catálogo entero.
plantilla_2019 = call("/teams/LIC?season=2019")
check("la plantilla sigue a la temporada pedida", plantilla_2019["season_id"], "2019-20")
check("y trae jugadores", len(plantilla_2019["batters"]) > 0, True)
check("bateadores ordenados por apariciones al plato",
      agu["batters"][0]["pa"] >= agu["batters"][1]["pa"], True)
check("lanzadores ordenados por entradas",
      agu["pitchers"][0]["innings_pitched"] >= agu["pitchers"][1]["innings_pitched"], True)

print("\n━━━ /teams/{code}/h2h/{rival} ━━━")
h2h = call("/teams/LIC/h2h/AGU?season=2025")
s = h2h["summary"]
print(f"  Licey vs Águilas {h2h['season_id']}: {s['wins']}-{s['losses']} en {s['games_played']} juegos "
      f"| carreras {s['runs_for']}-{s['runs_against']}")
for side, d in h2h["split"].items():
    print(f"    de {side}: {d['wins']}-{d['games_played'] - d['wins']} en {d['games_played']}")
check("W + L == juegos disputados", s["wins"] + s["losses"], s["games_played"])
check("la lista de juegos coincide con el resumen", h2h["count"], s["games_played"])
inv = call("/teams/AGU/h2h/LIC?season=2025")["summary"]
check("el h2h inverso es simétrico", (inv["wins"], inv["losses"]), (s["losses"], s["wins"]))
check("carreras invertidas coinciden", inv["runs_for"], s["runs_against"])
check("mismo equipo → 400", c.get("/teams/LIC/h2h/LIC").status_code, 400)
check("equipo inválido → 400", c.get("/teams/LIC/h2h/XXX").status_code, 400)

print("\n━━━ Posiciones: GB calculado, no el de la API ━━━")
sr = call("/standings?season=2025")
st = sr["data"]
for i, r in enumerate(st, 1):
    print(f"    {i}. {r['team_id']} {r['short_name']:10} {r['wins']:2}-{r['losses']:2} "
          f"GB={r['games_back']:>5}  CLAS={r['playoff_games']:+5.1f}  "
          f"{'dentro' if r['playoff_spot'] else 'fuera '}  api_crudo={r['playoff_games_back']}")
check("el líder no tiene GB", st[0]["games_back"], "-")
check("GB del 2do calculado de G-P", st[1]["games_back"], "5.0")
check("GB del último", st[-1]["games_back"], "11.5")
# El dato crudo de la MLB API no es distancia al líder sino al 4to puesto, que
# en LIDOM es la línea de clasificación. Se conserva con nombre honesto.
check("conserva el dato original de la API", st[0]["playoff_games_back"], "-9.5")
check("el cero del dato original cae en el 4to", st[3]["playoff_games_back"], "-")

# El orden es por PCT: con juegos jugados distintos (49 vs 50) ordenar por
# victorias correría la línea de clasificación de equipo.
check("ordena por PCT descendente",
      [r["win_loss_pct"] for r in st] == sorted((r["win_loss_pct"] for r in st), reverse=True),
      True)
check("nombre corto del catálogo canónico", st[0]["short_name"], "Águilas")

print("\n━━━ Posiciones: línea de clasificación ━━━")
check("cupos de round robin", sr["playoff_spots"], 4)
check("los primeros cuatro clasifican",
      [r["playoff_spot"] for r in st], [True, True, True, True, False, False])
# Colchón del líder: se mide contra el 5to (22-28), no contra el 4to.
check("colchón del líder sobre el primero fuera", st[0]["playoff_games"], 10.5)
check("colchón del 4to sobre el 5to", st[3]["playoff_games"], 1.0)
check("atraso del 5to contra el 4to", st[4]["playoff_games"], -1.0)
check("atraso del último", st[5]["playoff_games"], -2.0)
# Contraprueba independiente: para los equipos FUERA, el gamesBack crudo de la
# MLB API ya mide contra el 4to puesto, así que debe ser exactamente lo nuestro
# con el signo cambiado. Si algún día dejan de cuadrar, uno de los dos cambió.
check("el atraso cuadra con el dato crudo de la MLB",
      [-r["playoff_games"] for r in st if not r["playoff_spot"]],
      [float(r["playoff_games_back"]) for r in st if not r["playoff_spot"]])

# La regla no depende de que la liga tenga seis equipos.
from src.playoffs import annotate_playoff_race  # noqa: E402

empatados = annotate_playoff_race([
    {"wins": 30, "losses": 20}, {"wins": 25, "losses": 25},
    {"wins": 25, "losses": 25}, {"wins": 24, "losses": 26},
    {"wins": 24, "losses": 26}, {"wins": 10, "losses": 40},
])
check("empate justo en la línea da colchón 0", empatados[3]["playoff_games"], 0.0)
check("y el 5to empatado da atraso 0", empatados[4]["playoff_games"], 0.0)

sin_linea = annotate_playoff_race([{"wins": 5, "losses": 1}, {"wins": 1, "losses": 5}])
check("con menos equipos que cupos no hay línea", sin_linea[0]["playoff_games"], None)
check("y todos figuran dentro", [r["playoff_spot"] for r in sin_linea], [True, True])

print("\n━━━ Endpoints planos: calificación ━━━")
bat = call("/batting?season=2025&sort_by=ops")
check("bateo aplica el mínimo por defecto", bat["qualification_applied"], True)
check("mínimo calculado 3.1 × 50", bat["min_pa"], 155)
check("ningún calificado por debajo del mínimo",
      min(r["plate_appearances"] for r in bat["data"]) >= 155, True)
print(f"    líder OPS: {bat['data'][0]['player']} "
      f"(PA {bat['data'][0]['plate_appearances']}, OPS {bat['data'][0]['ops']})")

hr = call("/batting?season=2025&sort_by=home_runs")
check("jonrones NO lleva mínimo", hr["qualification_applied"], False)
check("y min_pa queda en cero", hr["min_pa"], 0)

libre = call("/batting?season=2025&sort_by=ops&qualified=false")
check("qualified=false deja entrar al de 1 turno",
      libre["data"][0]["plate_appearances"], 1)
check("min_pa explícito manda sobre el cálculo",
      call("/batting?season=2025&sort_by=ops&min_pa=200")["min_pa"], 200)

pit = call("/pitching?season=2025&sort_by=era")
check("pitcheo aplica el mínimo por defecto", pit["qualification_applied"], True)
check("mínimo calculado 0.6 × 50", pit["min_ip"], 30.0)
check("el líder ya no es un 0.00 de una entrada", pit["data"][0]["era"] > 0, True)
print(f"    líder ERA: {pit['data'][0]['player']} "
      f"(IP {pit['data'][0]['innings_pitched']}, ERA {pit['data'][0]['era']})")
check("K/9 lleva mínimo por ser tasa",
      call("/pitching?season=2025&sort_by=strikeouts_per_nine")["qualification_applied"], True)
check("ponches NO lleva mínimo",
      call("/pitching?season=2025&sort_by=strikeouts")["qualification_applied"], False)

print("\n━━━ /leaderboards/pitching: K/9 y BB/9 ━━━")
lbp = call("/leaderboards/pitching?season=2025&sort_by=strikeouts_per_nine")
top = lbp["data"][0]
check("expone strikeouts_per_nine", "strikeouts_per_nine" in top, True)
check("expone walks_per_nine", "walks_per_nine" in top, True)
check("K/9 = SO*9/IP", round(top["so"] * 9 / top["innings_pitched"], 2),
      top["strikeouts_per_nine"])
print(f"    {top['full_name']}: IP={top['innings_pitched']} K={top['so']} "
      f"K/9={top['strikeouts_per_nine']} BB/9={top['walks_per_nine']}")
bb9 = call("/leaderboards/pitching?season=2025&sort_by=walks_per_nine")
check("BB/9 ordena ascendente (menos es mejor)",
      bb9["data"][0]["walks_per_nine"] <= bb9["data"][1]["walks_per_nine"], True)

print("\n━━━ los endpoints viejos siguen respondiendo ━━━")
for path, key in [("/standings?season=2025", "data"), ("/batting?season=2025", "data"),
                  ("/pitching?season=2025", "data"), ("/seasons", "seasons")]:
    r = call(path)
    print(f"  ✓ {path}: {len(r[key])} filas")

print()
if fails:
    print(f"❌ {len(fails)} fallaron:")
    for f in fails: print("   -", f)
    sys.exit(1)
print("✅ Todas las comprobaciones pasaron")
