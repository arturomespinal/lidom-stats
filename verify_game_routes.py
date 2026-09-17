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
check("temporada sin datos → 404", c.get("/games?season=2019").status_code, 404)

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
print(f"  {bio['full_name']} | nac. {bio['birth_date']} | batea {bio['bats']} lanza {bio['throws']} | {bio['nationality']}")
for b in p["batting"]:
    print(f"    {b['season_id']} {b['team_code']}: G={b['games']} GB={b['games_batted']} "
          f"AB={b['ab']} AVG={b['avg']} OBP={b['obp']} SLG={b['slg']} OPS={b['ops']}")
check("AVG coincide con lo ya validado", p["batting"][0]["avg"], 0.368)
check("no es lanzador", p["is_pitcher"], False)
check("player_id inexistente → 404", c.get("/players/no-existe-1990-01-01").status_code, 404)

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
