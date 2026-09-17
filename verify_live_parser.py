"""
verify_live_parser.py — Comprueba el parser de GUMBO contra instantáneas reales.

Corre sin red: usa los ficheros que deja capture_gumbo.py en fixtures/.
Si no están, córrelo primero:

    python capture_gumbo.py
    python verify_live_parser.py
"""

import glob
import json
import sys

from src.live.gumbo import parse_live_feed, LiveGameState

files = sorted(glob.glob("fixtures/826343_2025*.json"))
if not files:
    print("❌ No hay fixtures. Corre primero: python capture_gumbo.py")
    sys.exit(1)

states = [parse_live_feed(json.load(open(f, encoding="utf-8"))) for f in files]
fails = []


def check(label, got, want):
    ok = got == want
    if not ok:
        fails.append(label)
    print(f"  {'✓' if ok else '✗'} {label}: {got}" + ("" if ok else f"  (esperado {want})"))


print(f"━━━ {len(states)} instantáneas del juego 826343 ━━━\n")

pre, mid, final = states[0], states[5], states[-1]

print("━━━ Identidad y metadatos ━━━")
check("gamePk", final.game_pk, 826343)
check("temporada", final.season, "2025")
check("fecha oficial (local, no UTC)", final.game_date, "2025-10-15")
check("estadio", final.venue, "Estadio Tetelo Vargas")
check("intervalo de sondeo que recomienda la API", mid.poll_wait_seconds, 10)
check("cada instantánea trae su propia marca", all(s.timestamp for s in states), True)

print("\n━━━ Mapeo de equipos ━━━")
check("local → código LIDOM", final.home.team_code, "EST")
check("visitante → código LIDOM", final.away.team_code, "TOR")
check("nombre con tildes, no el de la API", final.home.team_name, "Estrellas Orientales")

print("\n━━━ Transiciones de estado ━━━")
check("pre-juego", pre.status, "preview")
check("en curso", mid.status, "live")
check("terminado", final.status, "final")
check("is_live solo durante el juego", [s.is_live for s in states].count(True), 8)
check("is_final solo al final", [s.is_final for s in states].count(True), 1)
check("detailedState del pre-juego", pre.detailed_status, "Pre-Game")

print("\n━━━ Marcador ━━━")
check("marcador final coincide con la base de datos", (final.away.runs, final.home.runs), (3, 7))
check("hits finales", (final.away.hits, final.home.hits), (10, 10))
check("errores finales", (final.away.errors, final.home.errors), (1, 1))
no_baja = all(states[i].home.runs <= states[i + 1].home.runs
              and states[i].away.runs <= states[i + 1].away.runs
              for i in range(len(states) - 1))
check("el marcador nunca retrocede", no_baja, True)

print("\n━━━ Línea por entradas ━━━")
print(f"  entradas registradas al final: {len(final.line_score)}")
suma_home = sum(i.home_runs or 0 for i in final.line_score)
suma_away = sum(i.away_runs or 0 for i in final.line_score)
check("las entradas suman el marcador local", suma_home, final.home.runs)
check("las entradas suman el marcador visitante", suma_away, final.away.runs)
media = [i for i in mid.line_score if i.inning == 5]
check("la mitad no jugada queda en None, no en 0", media[0].home_runs, None)

print("\n━━━ Situación de juego ━━━")
check("outs en el 5to", mid.outs, 0)
check("cuenta en el 5to", (mid.balls, mid.strikes), (3, 1))
check("mitad de entrada", mid.inning_half, "bottom")
check("entrada ordinal", mid.inning_ordinal, "5th")
check("bateador presente en vivo", mid.batter, "Magneuris Sierra")
check("lanzador presente en vivo", mid.pitcher, "Jarlín García")
check("última jugada narrada", mid.last_play_event, "Single")

print("\n━━━ Corredores ━━━")
for s in states:
    if s.runners.occupied:
        print(f"    {s.timestamp}: {s.runners.state_code} → {s.situation.split('·')[-1].strip()}")
check("corredor en 1ª en el 5to", mid.runners.state_code, "100")
check("primera ocupada", mid.runners.first, "Magneuris Sierra")
check("segunda vacía", mid.runners.second, None)
un_o_tres = [s for s in states if s.runners.state_code == "101"]
check("detecta corredores en 1ª y 3ª", len(un_o_tres), 1)
check("sin corredores al terminar", final.runners.occupied, 0)
check("bases_loaded es False sin bases llenas", mid.runners.bases_loaded, False)

print("\n━━━ Decisiones ━━━")
check("no hay decisiones mientras se juega", mid.decisions, None)
check("hay decisiones al final", final.decisions is not None, True)
check("ganador", final.decisions.winner, "Esmil Rogers")
check("perdedor", final.decisions.loser, "Matt Dermody")
check("sin salvado en este juego", final.decisions.save, None)

print("\n━━━ Robustez ━━━")
vacio = parse_live_feed({"gamePk": 1, "gameData": {}, "liveData": {}, "metaData": {}})
check("un feed vacío no revienta", vacio.status, "other")
check("y cae a valores neutros", (vacio.outs, vacio.balls, vacio.home.runs), (0, 0, 0))
check("pre-juego sin corredores", pre.runners.occupied, 0)
# El feed de pre-juego YA trae la alineación publicada: primer bateador y
# abridor. Sirve para la pantalla previa al juego, así que lo afirmamos.
check("pre-juego ya expone al primer bateador", pre.batter, "Francisco Urbaez")
check("pre-juego ya expone al abridor", pre.pitcher, "Esmil Rogers")
check("el abridor del pre-juego fue el ganador", pre.pitcher, final.decisions.winner)

print("\n━━━ Serialización (lo que viajará por SSE) ━━━")
payload = final.model_dump(mode="json")
raw = json.dumps(payload, ensure_ascii=False)
check("serializa a JSON", isinstance(raw, str), True)
check("y vuelve a cargar idéntico", LiveGameState.model_validate(json.loads(raw)), final)
orig = len(json.dumps(json.load(open(files[-1], encoding="utf-8"))))
print(f"  GUMBO original: {orig // 1024} KB → estado reducido: {len(raw)} bytes "
      f"({orig / len(raw):.0f}× más pequeño)")
check("el estado cabe holgado en un evento SSE", len(raw) < 8192, True)

print("\n━━━ Progresión completa ━━━")
for s in states:
    print(f"  {s.timestamp}  {s.status:8} {s.score_line:14} {s.situation}")

print()
if fails:
    print(f"❌ {len(fails)} fallaron: {fails}")
    sys.exit(1)
print("✅ Todas las comprobaciones pasaron")
